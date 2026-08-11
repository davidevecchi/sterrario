# Map tiles: possible future additions

Deferred from the basemap/overlay switcher in `js/map-layers.js` because
they're vector styles (MapLibre GL JSON), not plain raster XYZ tiles --
adding them means vendoring `maplibre-gl` (~250KB) plus a Leaflet bridge
plugin (e.g. `@maplibre/maplibre-gl-leaflet`), since the app currently
only knows how to render raster `L.tileLayer`s.

- **Liberty Topo** / **Liberty Satellite** -- OSM Liberty Topo style
  (fork of OSM Liberty, OpenMapTiles schema), see
  https://github.com/nst-guide/osm-liberty-topo. US-only data (NAIP/USFS/
  USGS contours), so not useful for Sterrario's Alps-based trips anyway
  unless a US trip gets added.
- **OpenMapTiles OSM** / **OpenMapTiles OSM Topo** -- the "OSM
  OpenMapTiles" family of styles listed at https://openmaptiles.org/styles/.
  Normally served via MapTiler Cloud, which needs an API key; a
  self-hosted `tileserver-gl` instance could serve these keylessly, but
  none is currently vendored/found.
- **OpenFreeMap** -- 4 styles (`liberty`, `bright`, `positron`, `dark`),
  style.json at `https://tiles.openfreemap.org/styles/{style}`. Verified
  working, genuinely free/keyless forever (not a trial), OpenMapTiles
  schema. **Strongest candidate if maplibre-gl support ever gets added** --
  no rate limits found, real production infra, actively maintained.
- **VersaTiles** -- 4 styles (`colorful`, `eclipse`, `neutrino`,
  `graybeard`), style.json at
  `https://tiles.versatiles.org/assets/styles/{style}/style.json`. Also
  verified working; CC0-licensed (more permissive than OpenFreeMap's
  attribution requirement), but a newer/smaller project with less of a
  track record.

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

Skipped outright (not deferred, just not worth adding):
- **Wikimedia Maps** (`maps.wikimedia.org`) -- keyless, but its tile
  usage policy restricts hotlinking to Wikimedia-family sites, and it
  intermittently 403s for outside requests. Not meant for third-party
  embedding.
- **NASA GIBS** (MODIS True Color / Blue Marble) -- keyless, but too
  low-res globally (~z8-9 max useful detail) to be practical for a
  hiking/cycling trip viewer.
- **OSM Germany** (`tile.openstreetmap.de`) / **OSM France "osmfr"**
  (`tile.openstreetmap.fr/osmfr`) -- both keyless and working, but
  visually near-identical to the standard OpenStreetMap style already in
  the switcher; not enough incremental value to add as separate entries.
- **Esri World_Physical_Map** / **World_Terrain_Base** -- keyless, but
  real imagery only renders to ~z8-9 over the Alps (blank placeholder
  tiles beyond that) -- too low-detail to be useful here.
- **Esri USA_Topo_Maps** -- keyless, but US-only coverage; returns a
  placeholder tile everywhere in the Alps.
