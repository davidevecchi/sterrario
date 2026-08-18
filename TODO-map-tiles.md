# Map tiles: possible future additions

The app migrated from Leaflet to MapLibre GL JS (see git history), so
vector styles are no longer blocked on vendoring `maplibre-gl` -- both
OpenFreeMap (`liberty`/`bright`/`positron`) and VersaTiles
(`colorful`/`eclipse`/`graybeard`/`neutrino`) are now live in
`js/map-layers-data.js`.

Still missing -- would need an API key or self-hosted infra we don't have:

- **Liberty Topo** / **Liberty Satellite** -- OSM Liberty Topo style
  (fork of OSM Liberty, OpenMapTiles schema), see
  https://github.com/nst-guide/osm-liberty-topo. A keyless style.json
  does exist (`raw.githubusercontent.com/nst-guide/osm-liberty-topo/gh-pages/style.json`)
  but it's US-only data (NAIP/USFS/USGS contours, not useful for
  Sterrario's Alps-based trips) served from a single-maintainer hobby
  host with no uptime guarantee; no hosted style.json exists at all for
  a satellite variant.
- **OpenMapTiles OSM** / **OpenMapTiles OSM Topo** -- the "OSM
  OpenMapTiles" family of styles listed at https://openmaptiles.org/styles/.
  Normally served via MapTiler Cloud, which needs an API key; a
  self-hosted `tileserver-gl` instance could serve these keylessly, but
  none is currently vendored/found.

Satellite/aerial imagery requiring an API key (deferred -- app currently
only uses keyless tile services, so none of these are vendored):
- **Sentinel Hub** (`services.sentinel-hub.com`) -- Sentinel-2 imagery,
  free tier available but requires account signup + API key/OAuth.
- **Copernicus Data Space Ecosystem** -- successor to the old Copernicus
  Open Access Hub, free but requires account registration + API
  credentials.
- **MapTiler Satellite** (`api.maptiler.com/tiles/satellite`) -- global
  high-res satellite mosaic, free tier exists but needs an API key.
- **Bing Maps Aerial** (`ecn.t{s}.tiles.virtualearth.net`) -- global
  satellite/aerial imagery, requires a Bing Maps API key (and a
  commercial-use ToS review).
- **Mapbox Satellite** (`api.mapbox.com/styles/v1/mapbox/satellite-v9`)
  -- global, high-res, needs a Mapbox access token (free tier has usage
  limits).
- **Google Maps Satellite** -- global, but requires a Google Maps
  Platform API key/billing account, and its ToS restricts tile caching
  and use outside Google Maps JS/native SDKs -- likely not embeddable
  here even with a key.

Alps-region providers investigated but not usable as-is:
- **BayernAtlas** (Bavaria topo/street, `geoservices.bayern.de`) -- has a
  spherical-mercator (`smerc`) TileMatrixSet that looks XYZ-compatible,
  but tiles requested on it (tested at Zugspitze and Munich) come back
  as fully-transparent 736-byte placeholder PNGs -- only the native
  Gauss-Kruger grids (`bvv_gk4`/`adv_utm32`) have real data, which would
  need a proper WMTS tile-matrix adapter rather than a plain
  `{z}/{x}/{y}` URL.
- **South Tyrol/Alto Adige geoportal WMTS**
  (`geoservices.buergernetz.bz.it`) -- a real service exists per its
  docs, but the GetCapabilities URL tried (`/geoserver/gwc/service/wmts`)
  404'd; the correct current endpoint wasn't found. Worth another look
  if a valid capabilities URL turns up later.
- **Alpenvereinskarte** / **OpenAndroMaps** -- these are Mapsforge
  vector map files distributed for offline mobile apps (e.g. Locus,
  OsmAnd), not a public keyless raster/WMTS web tile service. No XYZ
  endpoint exists to vendor here.
- **Trentino Geocatalogo** -- only WebGIS portal pages found; no
  concrete keyless WMTS/XYZ tile endpoint surfaced.

Speleology/caving overlay investigated, no keyless tile source found:
- **"OpenCaveMap"** -- no such service exists; `opencavemap.org` /
  `www.opencavemap.org` don't resolve (DNS failure). Do not re-add.
- **grottomap.org** ("Carte Cavités") -- a Leaflet front-end over
  standard OSM/OpenTopoMap/Esri base tiles with cave-entrance points
  overlaid client-side from `grottomap.org/entrances.json` (a single
  ~2.4MB unpaginated array of `[lat, lon, ...]` pairs, no documented
  license) plus small `/api/searchByName` and `/api/searchByCoordinate`
  endpoints. No raster/vector tile pyramid -- `/tiles` 404s.
- **grottocenter.org** -- the real underlying open-source cave database
  (GitHub org `GrottoCenter`, AGPL-3.0 code) behind grottomap.org, with
  a documented REST API at `api.grottocenter.org/api/v1` (Swagger spec,
  data CC BY-SA 3.0) exposing `entrances`/`caves`/`geoloc`/etc. as JSON
  records via search endpoints -- no tile server component at all.
- Adding cave data would require a custom GeoJSON-source integration
  (fetch from `api.grottocenter.org`'s search endpoint, paginate,
  convert to a MapLibre GeoJSON source, add CC BY-SA attribution), not
  a `tileLayer()` one-liner like the rest of `OVERLAYS`.

Skipped outright (not deferred, just not worth adding):
- **Wikimedia Maps** (`maps.wikimedia.org`) -- keyless, but its tile
  usage policy restricts hotlinking to Wikimedia-family sites, and it
  intermittently 403s for outside requests. Not meant for third-party
  embedding.
- **OSM Germany** (`tile.openstreetmap.de`) / **OSM France "osmfr"**
  (`tile.openstreetmap.fr/osmfr`) -- both keyless and working, but
  visually near-identical to the standard OpenStreetMap style already in
  the switcher; not enough incremental value to add as separate entries.
- **Esri World_Physical_Map** / **World_Terrain_Base** -- keyless, but
  real imagery only renders to ~z8-9 over the Alps (blank placeholder
  tiles beyond that) -- too low-detail to be useful here.
- **Esri USA_Topo_Maps** -- keyless, but US-only coverage; returns a
  placeholder tile everywhere in the Alps.
