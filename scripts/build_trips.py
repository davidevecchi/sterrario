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
import concurrent.futures
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone

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

# --- Surface/highway lookup (OSM via Overpass, tile-cached) ----------------
# surface/highway are no longer read from whatever Komoot happened to embed
# in the GPX <extensions> (many exports don't have them at all); instead
# every point is matched against the real OSM road network. Rather than
# querying Overpass per route -- which re-fetches the same OSM ways again and
# again wherever different trips are nearby or overlap -- every trip in a
# single build is first covered by the *minimum* set of fixed-size tiles
# that touch any of their points; each tile is fetched from Overpass at most
# once and cached to disk (data/.osm_tiles/), so a later build that
# touches the same area doesn't hit the network for it again at all.
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TILE_DEG = 0.1           # tile size in degrees (~7-11 km/side at these latitudes) -- kept
                         # small so a single tile's Overpass query returns few enough ways
                         # to finish well under the server's timeout
QUERY_RADIUS_M = 30.0    # how far a way may be from a point to still count as its match
TILE_FETCH_WORKERS = 1   # concurrent Overpass requests for cache-miss tiles (the public
                         # instance rate-limits/bans concurrent clients, so stay serial)
GRID_DEG = 0.002         # spatial-index cell size (~200 m) for nearest-way lookup


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _grid_cell(lat, lon):
    return (math.floor(lat / GRID_DEG), math.floor(lon / GRID_DEG))


def tile_key(lat, lon):
    return (math.floor(lat / TILE_DEG), math.floor(lon / TILE_DEG))


def tile_bbox(tile):
    ty, tx = tile
    south, west = ty * TILE_DEG, tx * TILE_DEG
    return south, west, south + TILE_DEG, west + TILE_DEG


def fetch_tile_ways(tile):
    """Queries Overpass for every OSM highway way inside this tile's bbox."""
    south, west, north, east = tile_bbox(tile)
    query = f'[out:json][timeout:300];way({south:.6f},{west:.6f},{north:.6f},{east:.6f})[highway];out geom;'
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": "sterrario/1.0"})
    with urllib.request.urlopen(req, timeout=320) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    ways = []
    for el in result.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        ways.append({
            "id": el.get("id"),
            "tags": el.get("tags", {}),
            "geometry": [(n["lat"], n["lon"]) for n in el["geometry"]],
        })
    if not ways:
        raise ValueError("empty result (likely a truncated/errored response)")
    return ways


def _tile_cache_path(cache_dir, tile):
    return cache_dir / f"{tile[0]}_{tile[1]}.json"


def _fetch_tile_with_retry(tile):
    """Runs in a worker thread -- no cache/disk access here, just the
    network call, so cache writes stay single-threaded (in the caller)."""
    for attempt in range(4):
        try:
            ways = fetch_tile_ways(tile)
            return ways
        except Exception as e:
            remaining = ", retrying in 10s..." if attempt < 3 else ", giving up"
            print(f"    tile {tile} query failed ({e}){remaining}")
            if attempt < 3:
                time.sleep(10)
    return []


def fetch_ways_for_tiles(cache_dir, tiles):
    """Fetches (or loads from the on-disk cache) every tile in `tiles`,
    deduping ways by their OSM id -- a way straddling a tile boundary comes
    back from more than one tile's query. Cached tiles are loaded up front,
    sequentially (fast, no network); only genuine cache misses go out to
    Overpass, and those go out TILE_FETCH_WORKERS at a time -- with dozens or
    hundreds of tiles to fetch, network latency (not local CPU) is the
    bottleneck on a cold cache, so a modest amount of concurrency is a real
    speedup without hammering the shared instance much harder than the old
    sequential-with-retries approach did."""
    sorted_tiles = sorted(tiles)
    ways_by_id = {}
    to_fetch = []
    for tile in sorted_tiles:
        path = _tile_cache_path(cache_dir, tile)
        if path.exists():
            for way in json.loads(path.read_text(encoding="utf-8")):
                ways_by_id[way["id"]] = way
        else:
            to_fetch.append(tile)

    print(f"  {len(sorted_tiles) - len(to_fetch)}/{len(sorted_tiles)} tile(s) already cached; "
          f"fetching {len(to_fetch)} from Overpass ({TILE_FETCH_WORKERS} at a time)...")

    cache_dir.mkdir(parents=True, exist_ok=True)
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=TILE_FETCH_WORKERS) as pool:
        futures = {pool.submit(_fetch_tile_with_retry, tile): tile for tile in to_fetch}
        for future in concurrent.futures.as_completed(futures):
            tile = futures[future]
            ways = future.result()
            done += 1
            print(f"  tile {done}/{len(to_fetch)} {tile}: {len(ways)} way(s)")
            for way in ways:
                ways_by_id[way["id"]] = way

            path = _tile_cache_path(cache_dir, tile)
            tmp_path = path.with_suffix(".json.tmp")
            tmp_path.write_text(json.dumps(ways), encoding="utf-8")
            tmp_path.replace(path)  # atomic, same reasoning as the final trips.json write

    return list(ways_by_id.values())


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
    """Everything about a track except surface/highway, which needs the OSM
    tiles covering *every* trip in this build to have been fetched first
    (see collect_tiles/fetch_ways_for_tiles in main) -- see finish_track for
    the second pass that adds it and finishes the track."""
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
    print(f"Reading {gpx_path} ...")
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


def collect_tiles(trips_raw):
    """The minimum set of OSM tiles that together cover every point of
    every trip being built."""
    tiles = set()
    for trip_raw in trips_raw:
        for track_raw in trip_raw["tracks_raw"]:
            for p in track_raw["raw_points"]:
                tiles.add(tile_key(p["lat"], p["lon"]))
    return tiles


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

    trips_raw = [build_trip_raw(p, f"trip-{i + 1}") for i, p in enumerate(gpx_paths)]

    tiles = collect_tiles(trips_raw)
    cache_dir = project_dir / "data" / ".osm_tiles"
    print(f"\n{len(tiles)} OSM tile(s) cover every trip above (cached ones are instant, others query Overpass once each):")
    ways = fetch_ways_for_tiles(cache_dir, tiles)
    print(f"  {len(ways)} way(s) total; building spatial index...\n")
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
