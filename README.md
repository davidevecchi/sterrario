# Trip Viewer

A self-contained web page that shows one or more GPX trips on a map: a
tree in the sidebar with each trip (one per GPX file) expandable into its
days/tracks, each day's track in its own color, an elevation profile (either
for a single day or the whole trip's stitched-together profile when you
click a trip's name), points of interest, the option to color tracks — and
the elevation chart — by surface, slope steepness, or road type instead of
by day, and a photo layer: geotagged trip photos shown as clustered pins on
the map (like Immich's map view), which spread apart as you zoom in.

It's a **static site** — just files, no server-side program needs to run. Any
web hosting that can serve plain files (your NAS, a shared host, etc.) works.

## Folder overview

```
sterrario/
  index.html            <- open this (or point your web server at this folder)
  css/, js/             <- the app itself, no need to touch
  data/*.gpx             <- drop your GPX file(s) in here
  data/.generated/trips.json   <- the trip data, generated from the GPX file(s)
  data/.generated/photos.json  <- the photo map data, generated from photos/originals/
  scripts/              <- the scripts that (re)generate the data/.generated/*.json files
  photos/originals/     <- drop your trip photos in here
  photos/thumbs/        <- generated automatically, don't touch
  photos/display/       <- generated automatically, don't touch
```

## Viewing it

- **Quickest way to try it locally:** open a terminal in this folder and run:
  ```
  python3 scripts/serve.py 8000
  ```
  then open http://localhost:8000 in a browser. This rebuilds `data/.generated/trips.json`
  from whatever's in `data/*.gpx` once, at startup, then serves the site — so
  restarting the server is how you pick up new/edited GPX files. (Opening
  `index.html` by double-clicking it usually won't work — browsers block
  loading the `data/.generated/trips.json` file that way. A tiny web server, like the one
  above, is required — that's also true once it's on your NAS.)

- **On your NAS/server:** copy the whole `sterrario` folder to wherever it
  serves web files from (e.g. Synology's "web" shared folder if you use Web
  Station, or your usual site folder), then visit its address in a browser.
  No special software is needed beyond a basic static file server.

## If the GPX files change (or you add a new trip)

Every `.gpx` file placed in `data/` becomes its own trip in the sidebar tree,
automatically. If you're running the site with `python3 scripts/serve.py`,
just restart it — it regenerates `data/.generated/trips.json` on startup. To regenerate
it without restarting the server (e.g. while it's already running elsewhere),
run:

```
python3 scripts/build_trips.py
```

(Or pass specific file paths to process only those: `python3
scripts/build_trips.py /path/to/a.gpx /path/to/b.gpx`.)

This needs only Python 3 (already included on macOS/Linux; on Windows,
install it from python.org) — no extra packages to install. It overwrites
`data/.generated/trips.json`. Refresh the page afterwards.

## Adding photos

1. Drop your trip photos into `photos/originals/` (subfolders are fine, e.g.
   one per day — the script scans recursively). Photos are normally matched
   to a trip by their capture time, but dropping them straight into a
   subfolder named after that trip's GPX file (e.g.
   `photos/originals/2026.07.18-29_Passi-Lenti/`) also attaches them to that
   trip even if their timestamp falls outside every track's time range.
2. Run:
   ```
   python3 scripts/build_photos.py
   ```
   This needs Python 3 plus Pillow, installed once with:
   ```
   pip install pillow
   ```
3. Refresh the page. A "Foto" section appears in the sidebar with a count and
   a checkbox to show the photos on the map.

Notes:
- Only photos with GPS location data (most phone photos have this
  automatically) get placed on the map — others are skipped and reported in
  the script's output.
- iPhone photos in HEIC format aren't read directly; convert them to JPEG
  first (e.g. on macOS, select them in Finder and use File > Export, or
  "Convert to JPEG").
- Re-running the script after adding a few more photos is fast — it only
  processes new files, it doesn't regenerate everything.
- Click a photo pin to see it full-size; click a cluster to zoom in and split
  it apart, the same way Immich's map view works.
