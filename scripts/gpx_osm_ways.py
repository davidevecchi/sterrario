#!/usr/bin/env python3
"""Map a GPX track onto real OSM ways and report surface-tag coverage.

Side dev tool: given a GPX track, snap every trackpoint onto the OSM road/path
network (so the resulting way sequence has no gaps, unlike a buffer/`around:`
Overpass query which can miss connecting ways), then print stats on the
`surface` tag -- in particular which ways have none -- so they can be selected
and fixed in JOSM.

Reuses build_trips.py's local-extract machinery (data/.osm_extracts/, Geofabrik
region lookup, osmium corridor carving, pyrosm parsing) instead of hitting the
public Overpass API directly, so repeated runs over the same area are instant
and don't depend on Overpass's rate limits.

Requires: same deps as build_trips.py (pyrosm, shapely), plus gpxpy.
    pip install gpxpy

Usage:
    python3 gpx_osm_ways.py track.gpx
    python3 gpx_osm_ways.py track.gpx --no-surface-only
    python3 gpx_osm_ways.py track.gpx --push-josm      # requires JOSM running
                                                        # with Remote Control enabled
"""
import sys
import argparse
import urllib.parse
import urllib.request
from pathlib import Path
from collections import defaultdict

import gpxpy

import build_trips as bt


def load_gpx_points(path):
    with open(path, "r", encoding="utf-8") as f:
        gpx = gpxpy.parse(f)
    points = []
    for track in gpx.tracks:
        for segment in track.segments:
            for p in segment.points:
                points.append((p.latitude, p.longitude))
    if not points:
        for route in gpx.routes:
            for p in route.points:
                points.append((p.latitude, p.longitude))
    if not points:
        sys.exit(f"No trackpoints found in {path}")
    return points


def nearest_way(lat, lon, ways, index):
    """(way_idx, dist_m) of the closest indexed way within QUERY_RADIUS_M of
    (lat, lon), or (None, None). Same lookup as build_trips.nearest_way_tags,
    but returns the way index too so callers can dedupe/order by way id."""
    cy, cx = bt._grid_cell(lat, lon)
    best_dist, best_way = None, None
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            for wi, a, b in index.get((cy + dy, cx + dx), []):
                d = bt.perpendicular_distance((lat, lon), a, b)
                if best_dist is None or d < best_dist:
                    best_dist, best_way = d, wi
    if best_way is not None and best_dist <= bt.QUERY_RADIUS_M:
        return best_way, best_dist
    return None, None


def snap_track_to_ways(points, ways, index):
    """Ordered, deduplicated list of ways (dicts with id/tags) the track passes
    through, preserving path order. Points that match no way within
    QUERY_RADIUS_M (gaps in the local extract, off-road stretches, ...) are
    silently skipped and reported separately."""
    seen = set()
    ordered_ways = []
    unmatched = 0
    for lat, lon in points:
        wi, _ = nearest_way(lat, lon, ways, index)
        if wi is None:
            unmatched += 1
            continue
        way = ways[wi]
        if way["id"] in seen:
            continue
        seen.add(way["id"])
        ordered_ways.append(way)
    return ordered_ways, unmatched


def way_length_m(way):
    geom = way["geometry"]
    return sum(bt.haversine(*geom[i], *geom[i + 1]) for i in range(len(geom) - 1))


def print_stats(ways):
    by_surface = defaultdict(lambda: [0, 0.0])  # surface -> [count, length_m]
    for way in ways:
        surface = way["tags"].get("surface") or "(missing)"
        by_surface[surface][0] += 1
        by_surface[surface][1] += way_length_m(way)

    total_len = sum(v[1] for v in by_surface.values())
    print(f"\n{len(ways)} ways, {total_len / 1000:.2f} km total\n")
    print(f"{'surface':<20}{'ways':>6}{'km':>10}{'%':>7}")
    for surface, (count, length) in sorted(by_surface.items(), key=lambda kv: -kv[1][1]):
        pct = 100 * length / total_len if total_len else 0
        print(f"{surface:<20}{count:>6}{length / 1000:>10.2f}{pct:>6.1f}%")


def no_surface_ways(ways):
    return [way for way in ways if not way["tags"].get("surface")]


def push_to_josm(way_ids, points, josm_remote, margin_deg=0.002):
    """Downloads live OSM data (via JOSM's own /load_and_zoom, not our cached
    extract -- JOSM needs current upstream data to edit/upload against) for the
    track's bounding box, then selects way_ids within it. Loading only the
    no-surface ways in isolation (the old approach) left them as disconnected
    islands with no surrounding context -- selecting them within the full
    downloaded area shows them in place among the ways that do have a surface."""
    if not way_ids:
        print("\nNo surfaceless ways to push to JOSM.")
        return
    lats = [lat for lat, _ in points]
    lons = [lon for _, lon in points]
    params = {
        "left": min(lons) - margin_deg, "right": max(lons) + margin_deg,
        "bottom": min(lats) - margin_deg, "top": max(lats) + margin_deg,
        "select": ",".join(f"way{wid}" for wid in way_ids),
    }
    url = f"{josm_remote}/load_and_zoom?" + urllib.parse.urlencode(params)
    try:
        urllib.request.urlopen(url, timeout=60)
        print(f"\nLoaded track area into JOSM and selected {len(way_ids)} surfaceless way(s).")
    except Exception as e:
        sys.exit(f"Failed to reach JOSM Remote Control at {josm_remote}: {e}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("gpx", type=Path, help="GPX track file")
    parser.add_argument("--no-surface-only", action="store_true",
                         help="only list way IDs missing a surface tag")
    parser.add_argument("--push-josm", action="store_true",
                         help="send surfaceless ways to a running JOSM (Remote Control) for editing")
    parser.add_argument("--josm-remote", default="http://localhost:8111",
                         help="JOSM Remote Control base URL (default: http://localhost:8111)")
    args = parser.parse_args()

    project_dir = Path(__file__).resolve().parent.parent
    extract_cache_dir = project_dir / "data" / ".osm_extracts"

    points = load_gpx_points(args.gpx)
    print(f"Loaded {len(points)} trackpoints from {args.gpx}")

    catalog = bt.load_region_catalog(extract_cache_dir)
    strtree, polygon_by_geom_id, region_by_id = bt.build_leaf_region_index(catalog)

    region_points = {}
    unresolved = 0
    for lat, lon in points:
        region_id = bt.region_id_for_point(lat, lon, strtree, polygon_by_geom_id)
        if region_id is None:
            unresolved += 1
            continue
        region_points.setdefault(region_id, []).append((lat, lon))
    if unresolved:
        print(f"{unresolved} point(s) matched no Geofabrik region")
    print(f"{len(region_points)} region(s) cover this track: {', '.join(sorted(region_points))}")

    ways = bt.load_ways_for_regions(extract_cache_dir, region_by_id, region_points)
    print(f"\nFound {len(ways)} ways total in region(s); building spatial index:")
    index = bt.build_way_index(ways)

    matched_ways, unmatched = snap_track_to_ways(points, ways, index)
    if unmatched:
        print(f"{unmatched} trackpoint(s) matched no way within {bt.QUERY_RADIUS_M:.0f}m")

    if args.no_surface_only:
        for way in no_surface_ways(matched_ways):
            print(way["id"])
        return

    print_stats(matched_ways)

    missing = no_surface_ways(matched_ways)
    print(f"\n{len(missing)} way(s) with no surface tag:")
    for way in missing:
        print(f"  https://www.openstreetmap.org/way/{way['id']}")

    if args.push_josm:
        push_to_josm([way["id"] for way in missing], points, args.josm_remote)


if __name__ == "__main__":
    main()
