#!/usr/bin/env python3
"""Scan photos/originals/ for geotagged photos and generate the thumbnails,
display-size copies, and data/.generated/photos.json manifest the viewer's photo layer
reads.

Usage:
    python3 build_photos.py

Requires Pillow:
    pip install pillow

Only formats Pillow can read natively are supported (JPEG, PNG, TIFF, ...).
iPhone HEIC photos need to be converted to JPEG first (e.g. on macOS,
selecting them in Finder and using File > Export, or "Convert to JPEG").

Re-running this script is cheap: photos whose thumbnail/display files
already exist (matched by content hash) are skipped.

Before scanning, any *.zip dropped directly in photos/ (e.g. a Google
Photos album export named "<Trip name>-20260805_020624.zip") is matched by
name against a trip in data/.generated/trips.json and unpacked into
photos/originals/<gpx-basename>/, then deleted.
"""
import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from datetime import datetime, timedelta

try:
    from PIL import Image, ImageOps, ExifTags
except ImportError:
    print("This script needs Pillow. Install it once with:")
    print("  pip install pillow")
    sys.exit(1)

THUMB_SIZE = 240
DISPLAY_MAX_SIDE = 1600
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".webp"}

GPS_TAG = next((k for k, v in ExifTags.TAGS.items() if v == "GPSInfo"), 34853)
DATETIME_ORIGINAL_TAG = next((k for k, v in ExifTags.TAGS.items() if v == "DateTimeOriginal"), 36867)
DATETIME_TAG = next((k for k, v in ExifTags.TAGS.items() if v == "DateTime"), 306)

GPS_LAT_REF = 1
GPS_LAT = 2
GPS_LON_REF = 3
GPS_LON = 4


def dms_to_decimal(dms, ref):
    degrees, minutes, seconds = (float(v) for v in dms)
    value = degrees + minutes / 60.0 + seconds / 3600.0
    if ref in ("S", "W"):
        value = -value
    return value


def dms_string_to_decimal(s):
    """Parse exiftool-style GPS strings like '46,11.292N' or '11,34.302E'."""
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)([NSEW])\s*$", s)
    if not m:
        return None
    degrees, minutes, ref = float(m.group(1)), float(m.group(2)), m.group(3)
    value = degrees + minutes / 60.0
    if ref in ("S", "W"):
        value = -value
    return value


def read_xmp_sidecar(path):
    """Look for an exiftool-written .xmp sidecar (e.g. photo.jpg.xmp) next to
    path and return (lat, lon) or None, and dt or None, from it."""
    sidecar = path.with_name(path.name + ".xmp")
    if not sidecar.exists():
        return None, None

    try:
        text = sidecar.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None, None

    lat = lon = dt = None

    lat_m = re.search(r"exif:GPSLatitude>([^<]+)<", text)
    lon_m = re.search(r"exif:GPSLongitude>([^<]+)<", text)
    if lat_m and lon_m:
        lat = dms_string_to_decimal(lat_m.group(1))
        lon = dms_string_to_decimal(lon_m.group(1))

    dt_m = re.search(r"exif:DateTimeOriginal>([^<]+)<", text)
    if dt_m:
        try:
            dt = datetime.fromisoformat(dt_m.group(1)).replace(tzinfo=None)
        except ValueError:
            dt = None

    coords = (lat, lon) if lat is not None and lon is not None else None
    return coords, dt


def read_gps_and_time(path):
    try:
        img = Image.open(path)
        exif = img.getexif()
    except Exception:
        exif = {}

    lat = lon = dt = None

    gps_ifd = exif.get_ifd(GPS_TAG) if hasattr(exif, "get_ifd") else None
    if gps_ifd:
        try:
            lat = dms_to_decimal(gps_ifd[GPS_LAT], gps_ifd[GPS_LAT_REF])
            lon = dms_to_decimal(gps_ifd[GPS_LON], gps_ifd[GPS_LON_REF])
        except (KeyError, TypeError, ZeroDivisionError):
            lat = lon = None

    dt_str = exif.get(DATETIME_ORIGINAL_TAG) or exif.get(DATETIME_TAG)
    if dt_str:
        try:
            dt = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
        except ValueError:
            dt = None

    coords = (lat, lon) if lat is not None and lon is not None else None

    sidecar_coords, sidecar_dt = read_xmp_sidecar(path)
    coords = sidecar_coords or coords
    dt = sidecar_dt or dt

    if dt is None:
        dt = parse_filename_dt(path)

    return coords, dt


FILENAME_DT_RE = re.compile(r"(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})")


def parse_filename_dt(path):
    """Recover a capture timestamp from camera-style filenames, e.g.
    IMG_20260723_171600.jpg or PANO_20260727_110134.jpg. Used as a last
    resort for photos (e.g. crops) whose EXIF/XMP has no date at all."""
    m = FILENAME_DT_RE.search(path.stem)
    if not m:
        return None
    try:
        return datetime(*(int(g) for g in m.groups()))
    except ValueError:
        return None


def parse_iso(t):
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def find_day(trips, dt, folder_trip=None):
    """Return (trip_id, day_id) of the track whose time range contains dt,
    falling back to the closest track within a generous window, else None.

    If folder_trip is given (the photo sits in that trip's own subfolder
    under photos/originals/), it's used as a last-resort fallback even when
    dt falls far outside every track's time range - being filed under a
    trip's folder is treated as a stronger signal than the timestamp."""
    if dt is None:
        if folder_trip and folder_trip.get("tracks"):
            return folder_trip["id"], folder_trip["tracks"][0]["id"]
        return None, None
    best = None
    best_delta = None
    folder_best = None
    folder_best_delta = None
    for trip in trips:
        for track in trip["tracks"]:
            start = parse_iso(track.get("start_t"))
            end = parse_iso(track.get("end_t"))
            if not start or not end:
                continue
            if start <= dt <= end:
                return trip["id"], track["id"]
            delta = min(abs((dt - start).total_seconds()), abs((dt - end).total_seconds()))
            if best_delta is None or delta < best_delta:
                best_delta = delta
                best = (trip["id"], track["id"])
            if folder_trip and trip["id"] == folder_trip["id"]:
                if folder_best_delta is None or delta < folder_best_delta:
                    folder_best_delta = delta
                    folder_best = (trip["id"], track["id"])
    if best and best_delta is not None and best_delta <= timedelta(hours=6).total_seconds():
        return best
    if folder_best:
        return folder_best
    return None, None


def get_track(trips, trip_id, day_id):
    for trip in trips:
        if trip["id"] == trip_id:
            for track in trip["tracks"]:
                if track["id"] == day_id:
                    return track
    return None


def interpolate_position(track, dt):
    """Estimate where along a track's points the camera was at dt, for
    photos (e.g. crops) that lost their own GPS but still have a usable
    capture time. Linear-interpolates between the two bracketing points,
    clamping to an endpoint if dt falls outside the track's own range."""
    timed_points = []
    for p in track.get("points") or []:
        t = parse_iso(p.get("t"))
        if t is not None:
            timed_points.append((t, p))
    if not timed_points:
        return None
    timed_points.sort(key=lambda tp: tp[0])

    if dt <= timed_points[0][0]:
        p = timed_points[0][1]
        return p["lat"], p["lon"]
    if dt >= timed_points[-1][0]:
        p = timed_points[-1][1]
        return p["lat"], p["lon"]

    for (t0, p0), (t1, p1) in zip(timed_points, timed_points[1:]):
        if t0 <= dt <= t1:
            frac = 0.0 if t1 == t0 else (dt - t0).total_seconds() / (t1 - t0).total_seconds()
            return p0["lat"] + frac * (p1["lat"] - p0["lat"]), p0["lon"] + frac * (p1["lon"] - p0["lon"])
    return None


ZIP_TIMESTAMP_SUFFIX_RE = re.compile(r"-\d{8}_\d{6}$")


def zip_album_name(zip_path):
    """Recover the album name from an export filename like
    "Passi Lenti-20260805_020624.zip" (Google Photos / Immich style)."""
    return ZIP_TIMESTAMP_SUFFIX_RE.sub("", zip_path.stem).strip()


def top_level_folder(path, originals_dir):
    """Name of the immediate subfolder of originals_dir that path sits in,
    or None if path is directly in originals_dir."""
    rel = path.relative_to(originals_dir)
    return rel.parts[0] if len(rel.parts) > 1 else None


def find_trip_by_folder(folder_name, trips):
    """Match a photo's containing subfolder (e.g. originals/<gpx-basename>/)
    against a trip's gpx filename stem, the same scheme import_photo_zips
    uses when unpacking an album zip."""
    if not folder_name:
        return None
    needle = folder_name.casefold()
    for trip in trips:
        if Path(trip["file"]).stem.casefold() == needle:
            return trip
    return None


def match_trip_for_album(album_name, trips):
    """Match an album name against trip names, exact match first, then
    substring either way (album exports are sometimes abbreviated)."""
    needle = album_name.casefold()
    for trip in trips:
        if trip["name"].casefold() == needle:
            return trip
    for trip in trips:
        name = trip["name"].casefold()
        if needle in name or name in needle:
            return trip
    return None


def import_photo_zips(photos_dir, originals_dir, trips):
    """Unpack any *.zip dropped directly in photos/ into
    originals/<gpx-basename>/, matching each zip to a trip by name, then
    delete the zip. Zips that can't be matched are left in place."""
    for zip_path in sorted(photos_dir.glob("*.zip")):
        album_name = zip_album_name(zip_path)
        trip = match_trip_for_album(album_name, trips)
        if trip is None:
            print(f"Skipping {zip_path.name}: no trip matches album \"{album_name}\"")
            continue

        target_dir = originals_dir / Path(trip["file"]).stem
        target_dir.mkdir(parents=True, exist_ok=True)

        extracted = skipped = 0
        with zipfile.ZipFile(zip_path) as zf:
            for member in zf.namelist():
                member_path = Path(member)
                if member.endswith("/") or member_path.name == "":
                    continue
                dest = target_dir / member_path.name
                if dest.exists():
                    skipped += 1
                    continue
                with zf.open(member) as src, open(dest, "wb") as out:
                    shutil.copyfileobj(src, out)
                extracted += 1

        zip_path.unlink()
        print(f"Imported {zip_path.name} -> {target_dir.name}/ "
              f"({extracted} file(s), {skipped} already present)")


def process_photo(path, thumbs_dir, display_dir, trips, originals_dir):
    coords, dt = read_gps_and_time(path)
    folder_trip = find_trip_by_folder(top_level_folder(path, originals_dir), trips)
    trip_id, day_id = find_day(trips, dt, folder_trip)

    if coords is None and trip_id is not None:
        track = get_track(trips, trip_id, day_id)
        if track is not None:
            coords = interpolate_position(track, dt)

    if coords is None:
        return None, None, None

    content_hash = hashlib.sha1(path.read_bytes()).hexdigest()[:16]
    thumb_path = thumbs_dir / f"{content_hash}.jpg"
    display_path = display_dir / f"{content_hash}.jpg"

    if not thumb_path.exists() or not display_path.exists():
        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        if not thumb_path.exists():
            thumb = ImageOps.fit(img, (THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
            thumb.save(thumb_path, "JPEG", quality=80)

        if not display_path.exists():
            display = img.copy()
            display.thumbnail((DISPLAY_MAX_SIDE, DISPLAY_MAX_SIDE), Image.LANCZOS)
            display.save(display_path, "JPEG", quality=85)

    lat, lon = coords
    with Image.open(display_path) as disp:
        w, h = disp.size
    entry = {
        "lat": lat,
        "lon": lon,
        "t": dt.isoformat() if dt else None,
        "filename": path.name,
        "thumb": f"photos/thumbs/{content_hash}.jpg",
        "display": f"photos/display/{content_hash}.jpg",
        "original": f"photos/originals/{path.relative_to(originals_dir).as_posix()}",
        "w": w,
        "h": h,
    }
    return entry, trip_id, day_id


def main():
    script_dir = Path(__file__).resolve().parent
    project_dir = script_dir.parent
    originals_dir = project_dir / "photos" / "originals"
    thumbs_dir = project_dir / "photos" / "thumbs"
    display_dir = project_dir / "photos" / "display"
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    display_dir.mkdir(parents=True, exist_ok=True)

    if not originals_dir.exists():
        print(f"No {originals_dir} folder found. Create it and drop photos inside.")
        sys.exit(1)

    trips_path = project_dir / "data" / ".generated" / "trips.json"
    trips = []
    if trips_path.exists():
        with open(trips_path, encoding="utf-8") as f:
            trips = json.load(f)["trips"]

    if trips:
        import_photo_zips(project_dir / "photos", originals_dir, trips)

    photo_paths = sorted(
        p for p in originals_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and p.parent.name[0] != '.'
    )

    if not photo_paths:
        print(f"No photos found in {originals_dir} (supported: {', '.join(sorted(IMAGE_EXTS))}).")

    photos = []
    skipped_no_gps = []
    for path in photo_paths:
        entry, trip_id, day_id = process_photo(path, thumbs_dir, display_dir, trips, originals_dir)
        if entry is None:
            skipped_no_gps.append(path.relative_to(originals_dir))
            continue
        entry["trip_id"] = trip_id
        entry["day_id"] = day_id
        photos.append(entry)

    out_path = project_dir / "data" / ".generated" / "photos.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"photos": photos}, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {out_path}")
    print(f"  {len(photos)} geotagged photo(s) placed on the map")
    if skipped_no_gps:
        print(f"  {len(skipped_no_gps)} photo(s) skipped (no GPS EXIF data):\n")
        by_trip = {}
        for p in skipped_no_gps:
            trip_folder = p.parts[0]
            if trip_folder not in by_trip:
                by_trip[trip_folder] = []
            by_trip[trip_folder].append(p)
        for trip in sorted(by_trip.keys()):
            print(f"{trip}/")
            for p in by_trip[trip]:
                rel = str(p).removeprefix(trip + "/")
                print(f"  {rel}")


if __name__ == "__main__":
    main()
