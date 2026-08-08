#!/usr/bin/env python3
"""Convert one or more GPX files into data/.generated/trips.json for the viewer.

Each GPX file becomes one "trip" (parent node); each <trk> inside it becomes
one "day"/track (child node). This lets the viewer show a tree: trips, each
expandable into its days.

Usage:
    python3 build_trips.py [path/to/file1.gpx path/to/file2.gpx ...]

If no paths are given, it processes every .gpx file found in data/ (relative
to the project root, i.e. ../data relative to scripts/).
"""
import re
import sys
import math
import json
import time
import shutil
import hashlib
import itertools
import threading
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

import pyrosm
from shapely.geometry import Point, MultiPoint, mapping as shapely_mapping, shape as shapely_shape
from shapely.strtree import STRtree
from shapely.prepared import prep

NS = {
    "gpx": "http://www.topografix.com/GPX/1/1",
    "gpx_style": "http://www.topografix.com/GPX/gpx_style/0/2",
}

ROMAN_NUMERALS = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
]


def to_roman(n):
    out = []
    for value, symbol in ROMAN_NUMERALS:
        while n >= value:
            out.append(symbol)
            n -= value
    return "".join(out)

SIMPLIFY_TOLERANCE_M = 2.0  # Douglas-Peucker tolerance in meters

# --- Surface/highway lookup (local OSM extracts via Geofabrik + pyrosm) ----
# surface/highway are no longer read from whatever Komoot happened to embed
# in the GPX <extensions> (many exports don't have them at all); instead
# every point is matched against the real OSM road network. This used to
# query the public Overpass API per corridor point, but that instance isn't
# meant for this volume of use (frequent 429s/connection-refused). Instead,
# every point is resolved to the smallest Geofabrik region (country or
# country-subdivision) containing it; each region's .osm.pbf is downloaded
# once and cached forever under data/.osm_extracts/ (a personal archive of
# already-completed trips doesn't need "live" OSM data), then read locally
# with pyrosm -- no network access at all once every region a trip touches
# has already been downloaded.
GEOFABRIK_INDEX_URL = "https://download.geofabrik.de/index-v1.json"
GEOFABRIK_INDEX_MAX_AGE_DAYS = 30  # re-fetch the region catalog once it's this stale
REGION_CONTAINMENT_BUFFER_DEG = 0.02  # ~2km slack for a point landing in a small gap/
                                       # overlap between neighboring regions' polygons
REGION_BBOX_MARGIN_DEG = 0.02  # ~2km margin around a trip's points within a region,
                                # passed to pyrosm as a bounding_box so a whole,
                                # undivided-country extract (e.g. Austria) isn't fully
                                # parsed into memory just because a trip clips a corner of it
CORRIDOR_BUFFER_DEG = 0.003    # ~300m buffer around a trip's points within a region, used
                                # to carve a narrow route corridor out of a whole-country
                                # .osm.pbf with osmium -- a trip through the Alps can cross
                                # Austria's whole bbox without ever needing that bbox's ~2M
                                # highway ways, only the ones within QUERY_RADIUS_M of it
CORRIDOR_SIMPLIFY_DEG = 0.0005  # simplify tolerance for the corridor polygon (much smaller
                                 # than CORRIDOR_BUFFER_DEG so the route shape is preserved) --
                                 # keeps osmium's per-node point-in-polygon test cheap by
                                 # capping vertex count instead of leaving every buffered
                                 # point's full circle in the (multi)polygon
# Geofabrik "special" regions (alps, dach, britain-and-ireland, ...) sit in the catalog
# at the same tree depth as real countries and have no children either, so a plain
# "leaf = nobody's parent" rule would wrongly admit them as candidates even though their
# polygons overlap several real countries'. Filled in by hand after inspecting the
# fetched index-v1.json for such cross-cutting ids.
GEOFABRIK_EXCLUDED_REGION_IDS = frozenset({
    "alps", "dach", "britain-and-ireland",
})
QUERY_RADIUS_M = 30.0  # how far a way may be from a point to still count as its match
GRID_DEG = 0.002       # spatial-index cell size (~200 m) for nearest-way lookup


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _grid_cell(lat, lon):
    return (math.floor(lat / GRID_DEG), math.floor(lon / GRID_DEG))


def _retry_after_s(exc):
    """Seconds to wait before retrying, from a 429 response's Retry-After
    header, or None if there isn't one/it isn't an HTTPError."""
    headers = getattr(exc, "headers", None)
    if headers is None:
        return None
    value = headers.get("Retry-After")
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _remote_content_length_mb(url):
    """Size in MB of `url`'s response, via a HEAD request, or None if unavailable
    (e.g. no Content-Length header, or the request fails -- purely informational,
    so any failure here should never block the actual download)."""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "sterrario/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            total = resp.headers.get("Content-Length")
            return int(total) / (1024 * 1024) if total else None
    except Exception:
        return None


def _download_with_retry(url, dest_tmp_path, on_progress=None):
    """Downloads `url` to `dest_tmp_path` (streamed, chunked -- .pbf files can be
    tens/hundreds of MB), retrying on failure with backoff (honoring a 429's
    Retry-After header when present). Raises on exhausted retries; the caller
    must not treat dest_tmp_path as complete/rename it into place in that case.
    on_progress(str), if given, is called with a short human-readable status
    (e.g. a Spinner's update()) instead of this printing anything itself."""
    wait_s = 15.0
    last_exc = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sterrario/1.0"})
            with urllib.request.urlopen(req, timeout=320) as resp, open(dest_tmp_path, "wb") as f:
                total = resp.headers.get("Content-Length")
                total_mb = int(total) / (1024 * 1024) if total else None
                downloaded = 0
                last_update = 0.0
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.monotonic()
                    if on_progress and now - last_update >= 0.2:
                        done_mb = downloaded / (1024 * 1024)
                        if total_mb:
                            on_progress(f"{done_mb:.0f}/{total_mb:.0f} MB ({100 * done_mb / total_mb:.0f}%)")
                        else:
                            on_progress(f"{done_mb:.0f} MB")
                        last_update = now
            return
        except Exception as e:
            last_exc = e
            if attempt == 4:
                break
            wait_s = _retry_after_s(e) or wait_s
            print(f"\n  download failed ({e}), retrying in {wait_s:.0f}s...")
            time.sleep(wait_s)
            wait_s = min(wait_s * 2, 120.0)
    raise last_exc


def load_region_catalog(cache_dir):
    """Returns the Geofabrik region catalog as a list of {id, parent, name, pbf_url,
    geometry} dicts, downloading/caching it at cache_dir/geofabrik-index.json if
    missing or older than GEOFABRIK_INDEX_MAX_AGE_DAYS."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / "geofabrik-index.json"
    if path.exists():
        age_days = (time.time() - path.stat().st_mtime) / 86400
        if age_days <= GEOFABRIK_INDEX_MAX_AGE_DAYS:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return _parse_region_catalog(raw)
        print("  Geofabrik region catalog is stale, re-fetching...")
    else:
        print("  Fetching Geofabrik region catalog (first run)...")

    tmp_path = path.with_suffix(".json.tmp")
    _download_with_retry(GEOFABRIK_INDEX_URL, tmp_path)
    tmp_path.replace(path)
    raw = json.loads(path.read_text(encoding="utf-8"))
    return _parse_region_catalog(raw)


def _parse_region_catalog(raw):
    regions = []
    for feature in raw["features"]:
        props = feature["properties"]
        regions.append({
            "id": props["id"],
            "parent": props.get("parent"),
            "name": props["name"],
            "pbf_url": props["urls"]["pbf"],
            "geometry": feature["geometry"],
        })
    return regions


def build_leaf_region_index(catalog):
    """Leaf regions are catalog entries nobody else lists as `parent`, minus the
    hand-curated GEOFABRIK_EXCLUDED_REGION_IDS (cross-cutting special regions like
    "alps" that would otherwise slip into the leaf set). Returns (strtree,
    polygon_by_geom_id, region_by_id) for fast point -> region lookups."""
    parents = {r["parent"] for r in catalog if r["parent"]}
    region_by_id = {r["id"]: r for r in catalog}
    leaves = [r for r in catalog if r["id"] not in parents and r["id"] not in GEOFABRIK_EXCLUDED_REGION_IDS]

    polygons = []
    polygon_by_geom_id = {}
    for r in leaves:
        poly = shapely_shape(r["geometry"])
        polygon_by_geom_id[id(poly)] = (r["id"], poly, prep(poly), poly.buffer(REGION_CONTAINMENT_BUFFER_DEG))
        polygons.append(poly)
    strtree = STRtree(polygons)
    return strtree, polygon_by_geom_id, region_by_id


def region_id_for_point(lat, lon, strtree, polygon_by_geom_id):
    """Leaf region id containing (lat, lon), or None if it falls outside every
    (buffered) leaf polygon."""
    point = Point(lon, lat)
    candidate_idxs = strtree.query(point.buffer(REGION_CONTAINMENT_BUFFER_DEG))
    candidates = [polygon_by_geom_id[id(strtree.geometries[i])] for i in candidate_idxs]
    for region_id, _, prepared, _ in candidates:
        if prepared.contains(point):
            return region_id
    for region_id, _, _, buffered in candidates:
        if buffered.contains(point):
            return region_id
    return None


def collect_region_points(trips_raw, strtree, polygon_by_geom_id):
    """Resolves every point of every track in trips_raw to a leaf region id and
    returns {region_id: [(lat, lon), ...]}, the points actually assigned to that
    region -- NOT the whole region's own polygon. Feeds both region_bbox_from_points
    (pyrosm's out_of_core fallback bounding_box) and region_corridor_from_points
    (osmium's tight route-corridor extract)."""
    points = {}
    unresolved = 0
    for trip_raw in trips_raw:
        for track_raw in trip_raw["tracks_raw"]:
            for p in track_raw["raw_points"]:
                lat, lon = p["lat"], p["lon"]
                region_id = region_id_for_point(lat, lon, strtree, polygon_by_geom_id)
                if region_id is None:
                    unresolved += 1
                    continue
                points.setdefault(region_id, []).append((lat, lon))
    if unresolved:
        print(f"  {unresolved} point(s) matched no Geofabrik region (will have no surface/highway)")
    return points


def region_bbox_from_points(points):
    """(min_lon, min_lat, max_lon, max_lat) covering `points`, plus REGION_BBOX_MARGIN_DEG
    of margin. Many Geofabrik regions are whole, undivided countries (e.g. Austria), and
    parsing a country-sized .osm.pbf without restricting pyrosm to the small area a trip
    actually touches can use tens of GB of RAM; this bbox is passed to pyrosm.OSM's
    bounding_box so it only loads the relevant slice."""
    lats = [lat for lat, _ in points]
    lons = [lon for _, lon in points]
    m = REGION_BBOX_MARGIN_DEG
    return (min(lons) - m, min(lats) - m, max(lons) + m, max(lats) + m)


def region_corridor_from_points(points):
    """A (Multi)Polygon tracing a CORRIDOR_BUFFER_DEG-wide corridor around `points`,
    simplified to keep osmium's per-node point-in-polygon test cheap (see
    CORRIDOR_BUFFER_DEG/CORRIDOR_SIMPLIFY_DEG). Bounding a whole-country region by its
    trip points' bbox (region_bbox_from_points) still leaves the bbox itself
    country-sized whenever a trip crosses most of that country (e.g. the Alps) --
    the actual roads that matter are only ever within QUERY_RADIUS_M of a point, so a
    narrow corridor around the points themselves is a much tighter osmium extract."""
    geom = MultiPoint([(lon, lat) for lat, lon in points]).buffer(CORRIDOR_BUFFER_DEG, quad_segs=4)
    return geom.simplify(CORRIDOR_SIMPLIFY_DEG, preserve_topology=True)


def ensure_region_extract(cache_dir, region, on_progress=None):
    """Returns the local path to region['id']'s .osm.pbf under cache_dir,
    downloading it from region['pbf_url'] first if not already present. Never
    re-downloaded once cached -- a personal archive of already-completed trips
    doesn't need the road network under them to stay "live". on_progress is
    passed through to _download_with_retry (see there)."""
    path = cache_dir / f"{region['id']}.osm.pbf"
    if path.exists():
        return path
    tmp_path = path.with_name(path.name + ".tmp")
    _download_with_retry(region["pbf_url"], tmp_path, on_progress=on_progress)
    tmp_path.replace(path)
    return path


def pyrosm_gdf_to_ways(gdf):
    """Converts a pyrosm GeoDataFrame (from get_data_by_custom_criteria with the
    highway filter) into the same [{"id", "tags", "geometry": [(lat, lon), ...]}]
    shape the old Overpass fetch produced. A way's geometry can come back as a
    LineString, a MultiLineString, or (for closed ways like a highway=pedestrian
    plaza) a Polygon -- each part becomes its own ways-entry sharing the row's
    id/tags; build_way_index doesn't care about duplicate ids."""
    ways = []
    for row in gdf.itertuples():
        tags = {"surface": None if row.surface != row.surface else row.surface,
                "highway": None if row.highway != row.highway else row.highway}
        geom = row.geometry
        if geom.geom_type == "LineString":
            lines = [geom]
        elif geom.geom_type == "MultiLineString":
            lines = list(geom.geoms)
        elif geom.geom_type == "Polygon":
            lines = [geom.exterior]
        else:
            continue
        for line in lines:
            ways.append({
                "id": row.id,
                "tags": tags,
                "geometry": [(lat, lon) for lon, lat in line.coords],
            })
    return ways


class Spinner:
    """One indented row: "  {spinner} {label} {progress}" while running, redrawn
    in place as progress (set via update()) changes; on __exit__ the spinner is
    replaced with a checkmark and the row is finalized, e.g. "  ✓ {label} {progress}"
    (or done()'s final_text instead of label/progress, if given)."""

    _FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    _MAX_WIDTH = 0  # widest row drawn so far this process, so later \r redraws fully erase it

    def __init__(self, label):
        self.label = label
        self.progress = ""
        self.final = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._spin, daemon=True)

    def __enter__(self):
        self._draw(self._FRAMES[0])
        self._thread.start()
        return self

    def update(self, progress):
        self.progress = progress

    def done(self, final_text):
        self.final = final_text

    def _row(self, marker):
        text = self.final if self.final is not None else self.label
        progress = "" if self.final is not None else self.progress
        return f"  {marker} {text}" + (f" {progress}" if progress else "")

    def _draw(self, marker):
        row = self._row(marker)
        Spinner._MAX_WIDTH = max(Spinner._MAX_WIDTH, len(row))
        sys.stdout.write("\r" + row.ljust(Spinner._MAX_WIDTH))
        sys.stdout.flush()

    def __exit__(self, *exc_info):
        self._stop.set()
        self._thread.join()
        self._draw("✓")
        sys.stdout.write("\n")
        sys.stdout.flush()

    def _spin(self):
        for ch in itertools.cycle(self._FRAMES):
            if self._stop.is_set():
                break
            self._draw(ch)
            time.sleep(0.1)


def _geom_hash(geom):
    """Short, stable id for a (Multi)Polygon, used to key cached corridor-extracts/
    way-lists so a trip's cache is invalidated automatically if its region's
    corridor ever changes."""
    return hashlib.sha1(geom.wkb).hexdigest()[:10]


def extract_corridor_with_osmium(cache_dir, region_id, src_path, corridor):
    """Carves src_path down to just the `corridor` (Multi)Polygon using the `osmium`
    CLI (osmium-tool), caching the result at cache_dir/{region_id}-{geom_hash}.osm.pbf.
    `osmium extract` streams the file in a couple of passes with a small constant
    memory footprint and only writes out matching ways (plus every node/relation they
    need), so the later pyrosm parse runs against a few-MB file instead of the whole
    country -- much faster and lower peak memory than pyrosm's out_of_core engine
    scanning the original file itself, and (unlike a plain bbox) small even for a trip
    that crosses most of a country's bbox, since only a narrow route corridor is kept.
    Returns None (caller should fall back to src_path/bbox) if the `osmium` binary
    isn't installed."""
    if shutil.which("osmium") is None:
        return None
    geom_hash = _geom_hash(corridor)
    out_path = cache_dir / f"{region_id}-{geom_hash}.osm.pbf"
    if out_path.exists():
        return out_path
    geojson_path = cache_dir / f"{region_id}-{geom_hash}.geojson"
    if not geojson_path.exists():
        feature = {"type": "Feature", "properties": {}, "geometry": shapely_mapping(corridor)}
        geojson_path.write_text(json.dumps(feature), encoding="utf-8")
    tmp_path = out_path.with_name(out_path.name + ".tmp")
    subprocess.run(
        ["osmium", "extract", "--overwrite", "--strategy", "smart",
         "--polygon", str(geojson_path),
         "-f", "pbf", "-o", str(tmp_path), str(src_path)],
        check=True, capture_output=True,
    )
    tmp_path.replace(out_path)
    return out_path


def load_ways_for_regions(cache_dir, region_by_id, region_points):
    """Downloads (if needed) and reads every highway=* way from each region in
    region_points, merging them into one flat list. Each region is restricted to a
    narrow corridor around its trip points (see region_corridor_from_points) --
    required for whole-country regions like Austria, where even a bbox around the
    trip's points can span nearly the whole country (e.g. a trip through the Alps)
    and parsing/extracting that whole area can exhaust RAM even though the roads
    that matter are only ever within QUERY_RADIUS_M of a point. Cross-region
    duplicate way ids near a shared border are harmless for build_way_index/
    nearest_way_tags.

    Two cache layers avoid repeating that work on reruns with the same trips:
    - a small corridor-carved .osm.pbf per region (see extract_corridor_with_osmium)
    - the fully-extracted way list itself, as JSON, keyed by region+corridor"""
    ways = []
    for region_id in sorted(region_points):
        region = region_by_id[region_id]
        points = region_points[region_id]
        corridor = region_corridor_from_points(points)
        pbf_name = f"{region_id}.osm.pbf"
        print(pbf_name)

        ways_cache_path = cache_dir / f"{region_id}-{_geom_hash(corridor)}-ways.json"
        if ways_cache_path.exists():
            region_ways = json.loads(ways_cache_path.read_text(encoding="utf-8"))
            print(f"  ✓ found {len(region_ways)} ways (cached)")
            ways.extend(region_ways)
            continue

        with Spinner("downloading") as sp:
            path = ensure_region_extract(cache_dir, region, on_progress=sp.update)
            size_mb = path.stat().st_size / (1024 * 1024)
            sp.done(f"downloaded {size_mb:.0f} MB")

        with Spinner("restricting to route corridor") as sp:
            corridor_path = extract_corridor_with_osmium(cache_dir, region_id, path, corridor)
            if corridor_path is not None:
                corridor_mb = corridor_path.stat().st_size / (1024 * 1024)
                sp.done(f"carved corridor ({corridor_mb:.0f} MB)")
            else:
                sp.done("osmium not found, will restrict via pyrosm bbox instead")

        if corridor_path is not None:
            # already carved down to the corridor -- no need to make pyrosm redo it,
            # and the small file lets us use the faster "in_memory" engine.
            osm = pyrosm.OSM(str(corridor_path))
        else:
            # out_of_core: decodes blobs in parallel across CPU cores and spills to disk
            # per worker instead of holding the whole file in memory -- faster and lower
            # peak memory than the default "in_memory" engine for a country-sized .osm.pbf.
            # workers="auto" spawns one decoder per CPU core, each holding its decoded
            # chunk of the whole-country file in RAM at once -- on many-core machines
            # that multiplies peak memory past what out_of_core is meant to save and
            # can OOM the box, so cap it instead of trusting "auto". This fallback still
            # only narrows to the trip's bbox, not the corridor, so it can still be much
            # larger (and OOM) for a trip that crosses most of a whole-country region.
            bbox = region_bbox_from_points(points)
            osm = pyrosm.OSM(str(path), bounding_box=list(bbox), engine="out_of_core", workers=4)

        with Spinner("extracting highway ways") as sp:
            gdf = osm.get_data_by_custom_criteria(
                custom_filter={"highway": True}, filter_type="keep",
                keep_nodes=False, keep_ways=True, keep_relations=False,
                extra_attributes=["surface"],
            )
            row_count = 0 if gdf is None else len(gdf)
            sp.done(f"extracted {row_count} rows")

        with Spinner("converting to way list") as sp:
            region_ways = pyrosm_gdf_to_ways(gdf) if gdf is not None else []
            sp.done(f"found {len(region_ways)} ways")
        ways_cache_path.write_text(json.dumps(region_ways), encoding="utf-8")
        ways.extend(region_ways)
    return ways


def build_way_index(ways):
    """Grid index: cell -> list of (way_idx, seg_start, seg_end) for nearest-way lookups."""
    index = {}
    for wi, way in enumerate(ways):
        geom = way["geometry"]
        for i in range(len(geom) - 1):
            a, b = geom[i], geom[i + 1]
            for c in {_grid_cell(*a), _grid_cell(*b)}:
                index.setdefault(c, []).append((wi, a, b))
    return index


def nearest_way_tags(lat, lon, ways, index):
    """Tags of the closest indexed way within QUERY_RADIUS_M of (lat, lon), or {}."""
    cy, cx = _grid_cell(lat, lon)
    best_dist, best_way = None, None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for wi, a, b in index.get((cy + dy, cx + dx), []):
                d = perpendicular_distance((lat, lon), a, b)
                if best_dist is None or d < best_dist:
                    best_dist, best_way = d, wi
    if best_way is not None and best_dist <= QUERY_RADIUS_M:
        return ways[best_way]["tags"]
    return {}


# --- Cross-trip shared-route detection --------------------------------------
# Two different trips visiting the same road/path (e.g. the same Dolomites
# pass in different years) should both stay visible on the map instead of one
# trip's line simply painting over the other. Detected purely from geometry
# (a coarse grid presence-index over every trip's raw points) -- independent
# of the OSM way lookup above, since two GPS traces of "the same road" often
# snap to different, adjacent OSM way objects (split at intersections, dual
# carriageways, etc.) and so rarely share a way id even when they visibly
# overlap on the map.
SHARE_RADIUS_M = 20.0
SHARE_GRID_DEG = 0.00018  # ~20m, matched to SHARE_RADIUS_M


def _share_cell(lat, lon):
    return (math.floor(lat / SHARE_GRID_DEG), math.floor(lon / SHARE_GRID_DEG))


def build_trip_presence_index(all_raw_points_by_trip):
    """cell -> set of trip indices with at least one (raw) point in that cell."""
    index = {}
    for ti, points in enumerate(all_raw_points_by_trip):
        for p in points:
            c = _share_cell(p["lat"], p["lon"])
            index.setdefault(c, set()).add(ti)
    return index


def nearby_trip_indices(lat, lon, self_trip_idx, presence_index):
    """Other trip indices (sorted) with a point within ~SHARE_RADIUS_M of
    (lat, lon), i.e. trips this point's location is shared with."""
    cy, cx = _share_cell(lat, lon)
    found = set()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            found |= presence_index.get((cy + dy, cx + dx), set())
    found.discard(self_trip_idx)
    return sorted(found)


def perpendicular_distance(pt, start, end):
    """Approximate perpendicular distance (meters) from pt to the segment start-end,
    treating lat/lon as locally planar (fine at this tolerance/scale)."""
    lat0 = start[0]
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(lat0))

    def to_xy(p):
        return (p[1] * m_per_deg_lon, p[0] * m_per_deg_lat)

    x, y = to_xy(pt)
    x1, y1 = to_xy(start)
    x2, y2 = to_xy(end)

    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)

    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    proj_x, proj_y = x1 + t * dx, y1 + t * dy
    return math.hypot(x - proj_x, y - proj_y)


def rdp(points, tolerance, keep_indices):
    """Douglas-Peucker simplification. `points` is a list of (lat, lon) tuples.
    `keep_indices` is a set of indices that must always be kept (e.g. where
    surface/highway changes) in addition to the standard algorithm's picks."""
    if len(points) < 3:
        return set(range(len(points)))

    keep = set([0, len(points) - 1]) | keep_indices

    def _rdp(lo, hi):
        if hi - lo < 2:
            return
        max_dist = 0.0
        max_idx = None
        for i in range(lo + 1, hi):
            d = perpendicular_distance(points[i], points[lo], points[hi])
            if d > max_dist:
                max_dist = d
                max_idx = i
        if max_dist > tolerance and max_idx is not None:
            keep.add(max_idx)
            _rdp(lo, max_idx)
            _rdp(max_idx, hi)

    _rdp(0, len(points) - 1)
    return keep


def parse_time(t):
    if not t:
        return None
    t = t.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(t)
    except ValueError:
        return None


def tag(elem, name):
    child = elem.find(f"gpx:{name}", NS)
    return child.text if child is not None else None


# The known activities -- one per icon in res/ (res/<activity>.png) -- plus
# "other" for anything unrecognized/untagged, which gets its own dash style
# but no icon pin on the map.
ACTIVITIES = {"alpine", "bike", "gravel", "hike", "mtb", "road", "run", "touring", "walk"}

ACTIVITY_TAG_RE = re.compile(r"^\s*#activity=([A-Za-z_]+)\s*$", re.MULTILINE)


def extract_activity_tag(desc_raw):
    """Pulls a "#activity=xxx" line out of desc_raw (as written by
    gpx.studio or komootgpx-js-server), returning (activity_or_None,
    desc_with_the_tag_line_removed)."""
    m = ACTIVITY_TAG_RE.search(desc_raw)
    if not m:
        return None, desc_raw
    candidate = m.group(1).lower()
    activity = candidate if candidate in ACTIVITIES else None
    return activity, ACTIVITY_TAG_RE.sub("", desc_raw)


def parse_activity_and_desc(desc_raw, emoji, trip_default_activity=None):
    """Reads a track's activity from a "#activity=xxx" line in its own
    <desc>, stripping that line out of the note text shown to the user.
    Falls back, in order, to the trip's own root-level "#activity=xxx" (its
    <metadata><desc>, when the file sets one -- a trip-wide default that any
    per-track tag overrides) and then to the emoji in the track's name."""
    activity, desc_raw = extract_activity_tag(desc_raw)
    if activity is None:
        activity = trip_default_activity or (
            "hike" if "🥾" in emoji else ("touring" if "🚲" in emoji else "other")
        )
    return activity, desc_raw.strip()


def parse_track_raw(trk, trip_default_activity=None):
    """Everything about a track except surface/highway, which needs the Geofabrik
    region extracts covering *every* trip in this build to have been fetched first
    (see collect_region_points/load_ways_for_regions in main) -- see
    finish_track for the second pass that adds it and finishes the track."""
    name_raw = tag(trk, "name") or "Untitled"
    parts = name_raw.split(" ", 1)
    if len(parts) == 2 and not parts[0].isalnum():
        emoji, label = parts[0], parts[1]
    else:
        emoji, label = "", name_raw

    activity, desc = parse_activity_and_desc(tag(trk, "desc") or "", emoji, trip_default_activity)

    color = "#e01b24"
    line_style = trk.find("gpx:extensions/gpx_style:line", NS)
    if line_style is not None:
        c = line_style.find("gpx_style:color", NS)
        if c is not None and c.text:
            color = "#" + c.text.lstrip("#")

    raw_points = []
    for trkpt in trk.findall("gpx:trkseg/gpx:trkpt", NS):
        lat = float(trkpt.get("lat"))
        lon = float(trkpt.get("lon"))
        ele_el = trkpt.find("gpx:ele", NS)
        ele = float(ele_el.text) if ele_el is not None and ele_el.text else None
        time_el = trkpt.find("gpx:time", NS)
        t = time_el.text if time_el is not None else None

        raw_points.append({"lat": lat, "lon": lon, "ele": ele, "t": t, "surface": None, "highway": None, "near": []})

    if not raw_points:
        return None

    return {"name": label, "emoji": emoji, "activity": activity, "color": color, "desc": desc, "raw_points": raw_points}


def finish_track(track_raw, ways, index, trip_idx, presence_index):
    """Second pass, once the global tile index is ready: annotates every
    point with its nearest OSM way's surface/highway and which other trips
    pass through the same spot, then simplifies and computes stats -- the
    rest of what a single parse_track used to do."""
    raw_points = track_raw["raw_points"]
    for p in raw_points:
        tags = nearest_way_tags(p["lat"], p["lon"], ways, index)
        p["surface"] = tags.get("surface")
        p["highway"] = tags.get("highway")
        p["near"] = nearby_trip_indices(p["lat"], p["lon"], trip_idx, presence_index)

    # Determine indices where surface/highway/near changes -- always keep
    # these (near, so a shared-route stretch's start/end survives
    # simplification too).
    keep_indices = set()
    prev_key = None
    for i, p in enumerate(raw_points):
        key = (p["surface"], p["highway"], tuple(p["near"]))
        if key != prev_key:
            keep_indices.add(i)
            prev_key = key

    latlon = [(p["lat"], p["lon"]) for p in raw_points]
    keep = rdp(latlon, SIMPLIFY_TOLERANCE_M, keep_indices)
    kept_indices = sorted(keep)
    points = [raw_points[i] for i in kept_indices]

    # Cumulative distance + elevation gain/loss computed over the FULL
    # (unsimplified) point set for accuracy, then distance re-attached to kept points.
    cum_dist = [0.0] * len(raw_points)
    ele_gain, ele_loss = 0.0, 0.0
    for i in range(1, len(raw_points)):
        d = haversine(raw_points[i - 1]["lat"], raw_points[i - 1]["lon"], raw_points[i]["lat"], raw_points[i]["lon"])
        cum_dist[i] = cum_dist[i - 1] + d
        e0, e1 = raw_points[i - 1]["ele"], raw_points[i]["ele"]
        if e0 is not None and e1 is not None:
            diff = e1 - e0
            if diff > 0:
                ele_gain += diff
            else:
                ele_loss += -diff

    for idx, p in zip(kept_indices, points):
        p["dist"] = round(cum_dist[idx], 1)

    times = [parse_time(p["t"]) for p in raw_points if p["t"]]
    start_t = min(times).isoformat() if times else None
    end_t = max(times).isoformat() if times else None
    duration_s = (max(times) - min(times)).total_seconds() if times else None

    eles = [p["ele"] for p in raw_points if p["ele"] is not None]

    return {
        "id": track_raw.get("id"),
        "name": track_raw["name"],
        "emoji": track_raw["emoji"],
        "activity": track_raw["activity"],
        "color": track_raw["color"],
        "desc": track_raw["desc"],
        "points": points,
        "distance_m": round(cum_dist[-1], 1),
        "ele_gain": round(ele_gain, 1),
        "ele_loss": round(ele_loss, 1),
        "ele_min": round(min(eles), 1) if eles else None,
        "ele_max": round(max(eles), 1) if eles else None,
        "start_t": start_t,
        "end_t": end_t,
        "duration_s": duration_s,
        "point_count_full": len(raw_points),
        "point_count_simplified": len(points),
    }


def parse_wpt(wpt):
    lat = float(wpt.get("lat"))
    lon = float(wpt.get("lon"))
    ele_el = wpt.find("gpx:ele", NS)
    ele = float(ele_el.text) if ele_el is not None and ele_el.text else None
    name = tag(wpt, "name") or ""
    cmt = tag(wpt, "cmt") or ""
    desc = tag(wpt, "desc") or ""
    sym = tag(wpt, "sym") or "Information"
    return {"lat": lat, "lon": lon, "ele": ele, "name": name, "cmt": cmt, "desc": desc, "sym": sym}


def build_trip_raw(gpx_path, trip_id):
    """First pass: everything about a trip except surface/highway -- see
    finish_trip for the second pass, once the global tile index is ready."""
    print(f"  {gpx_path.name}")
    tree = ET.parse(gpx_path)
    root = tree.getroot()

    metadata_el = root.find("gpx:metadata", NS)
    metadata_desc = tag(metadata_el, "desc") if metadata_el is not None else None
    trip_default_activity, _ = extract_activity_tag(metadata_desc or "")

    tracks_raw = []
    for trk in root.findall("gpx:trk", NS):
        parsed = parse_track_raw(trk, trip_default_activity)
        if parsed:
            day_num = len(tracks_raw) + 1
            parsed["id"] = f"{trip_id}-day-{day_num}"
            parsed["name"] = f"Giorno {to_roman(day_num)}"
            tracks_raw.append(parsed)

    pois = [parse_wpt(wpt) for wpt in root.findall("gpx:wpt", NS)]

    # Prefer the file-level metadata name (track names are now just
    # "Giorno <N>" placeholders, never a meaningful trip title), else the
    # filename itself.
    trip_name_el = root.find("gpx:metadata/gpx:name", NS)
    if trip_name_el is not None and trip_name_el.text:
        trip_name = trip_name_el.text
    else:
        trip_name = gpx_path.stem

    return {
        "id": trip_id, "name": trip_name, "gpx_path": gpx_path,
        "tracks_raw": tracks_raw, "pois": pois,
    }


def finish_trip(trip_raw, ways, index, trip_idx, presence_index):
    tracks = [finish_track(track_raw, ways, index, trip_idx, presence_index) for track_raw in trip_raw["tracks_raw"]]
    pois = trip_raw["pois"]

    total_distance = sum(t["distance_m"] for t in tracks)
    total_gain = sum(t["ele_gain"] for t in tracks)
    total_loss = sum(t["ele_loss"] for t in tracks)
    all_starts = [parse_time(t["start_t"]) for t in tracks if t["start_t"]]
    all_ends = [parse_time(t["end_t"]) for t in tracks if t["end_t"]]

    start_t = min(all_starts).isoformat() if all_starts else None
    end_dt = max(all_ends) if all_ends else None
    # The real calendar span (last day's date minus first day's date,
    # inclusive), not how many GPX track segments there are -- a single
    # calendar day can have more than one track (e.g. a hike and a bike leg
    # the same day), which would otherwise overcount "giorni".
    num_days = (end_dt.date() - min(all_starts).date()).days + 1 if all_starts and end_dt else len(tracks)
    # Sort order and trip-color seed both need *some* date for every trip,
    # even the ones with no GPX timestamps at all (older exports). Falling
    # back to the GPX file's own mtime keeps that seed fully deterministic
    # (same file -> same date -> same color) without inventing a start_t
    # that would misleadingly get displayed as if it were real trip data.
    seed_date = start_t or datetime.fromtimestamp(trip_raw["gpx_path"].stat().st_mtime, tz=timezone.utc).isoformat()

    summary = {
        "name": trip_raw["name"],
        "num_days": num_days,
        "total_distance_m": round(total_distance, 1),
        "total_ele_gain": round(total_gain, 1),
        "total_ele_loss": round(total_loss, 1),
        "start_t": start_t,
        "end_t": end_dt.isoformat() if end_dt else None,
        "seed_date": seed_date,
        "num_pois": len(pois),
    }

    total_pts_full = sum(t["point_count_full"] for t in tracks)
    total_pts_simplified = sum(t["point_count_simplified"] for t in tracks)
    print(f"{trip_raw['name']}: {len(tracks)} track(s), {len(pois)} POIs")
    print(f"  trackpoints: {total_pts_full} -> {total_pts_simplified} after simplification")
    print(f"  distance: {total_distance/1000:.1f} km, gain: {total_gain:.0f} m")

    return {
        "id": trip_raw["id"],
        "name": trip_raw["name"],
        "file": trip_raw["gpx_path"].name,
        "summary": summary,
        "tracks": tracks,
        "pois": pois,
    }


def main():
    script_dir = Path(__file__).resolve().parent
    project_dir = script_dir.parent

    if len(sys.argv) > 1:
        gpx_paths = [Path(p).resolve() for p in sys.argv[1:]]
    else:
        gpx_paths = sorted((project_dir / "data").glob("*.gpx"))
        if not gpx_paths:
            print(f"No .gpx files found in {project_dir / 'data'}.")
            sys.exit(1)

    print(f"Reading files in {project_dir / 'data'}")
    trips_raw = [build_trip_raw(p, f"trip-{i + 1}") for i, p in enumerate(gpx_paths)]

    extract_cache_dir = project_dir / "data" / ".osm_extracts"
    catalog = load_region_catalog(extract_cache_dir)
    strtree, polygon_by_geom_id, region_by_id = build_leaf_region_index(catalog)
    region_points = collect_region_points(trips_raw, strtree, polygon_by_geom_id)
    print(f"\n{len(region_points)} Geofabrik region(s) cover every trip above "
          f"(cached extracts are instant, only new ones are downloaded):")
    for region_id in sorted(region_points):
        extract_path = extract_cache_dir / f"{region_id}.osm.pbf"
        if extract_path.exists():
            size = f"{extract_path.stat().st_size / (1024 * 1024):.0f} MB cached"
        else:
            expected_mb = _remote_content_length_mb(region_by_id[region_id]["pbf_url"])
            size = f"not yet downloaded, ~{expected_mb:.0f} MB" if expected_mb else "not yet downloaded"
        print(f"  {extract_path.name} ({size})")
    print()
    ways = load_ways_for_regions(extract_cache_dir, region_by_id, region_points)
    print(f"\nFound {len(ways)} ways total; building spatial index:\n")
    index = build_way_index(ways)

    presence_index = build_trip_presence_index([
        [p for track_raw in trip_raw["tracks_raw"] for p in track_raw["raw_points"]]
        for trip_raw in trips_raw
    ])
    trips = [finish_trip(trip_raw, ways, index, i, presence_index) for i, trip_raw in enumerate(trips_raw)]

    out_path = project_dir / "data" / ".generated" / "trips.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump({"trips": trips}, f, ensure_ascii=False, separators=(",", ":"))
    tmp_path.replace(out_path)  # atomic: out_path is never left truncated/partial

    print(f"\nWrote {out_path}")
    print(f"  {len(trips)} trip(s): " + ", ".join(t["name"] for t in trips))


if __name__ == "__main__":
    main()
