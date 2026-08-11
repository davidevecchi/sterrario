// ---- Map layers: track rendering, halos/dimming, markers, hover tooltip ----

import { state } from "./state.js";
import { closestPointOnPolyline, trackSidebarDayNumber, trackGradeSeries, trackCategorySeries } from "./geo.js";
import { SURFACE_COLORS, SURFACE_FALLBACK, HIGHWAY_COLORS, HIGHWAY_FALLBACK, gradeColor, altitudeBucket, ACTIVITY_DASH, ACTIVITY_ICON, ACTIVITY_LABELS } from "./colors.js";
import { poiIconHtml, icoHtml } from "./poi-icons.js";
import { realDayNumber, fmtDate } from "./format.js";
import { toRoman } from "./format.js";
import { selectDay, selectTrip } from "./selection.js";
import { clearChartHover, onTrackHover } from "./chart.js";
import { perfMark } from "./perf-debug.js";

// Stroke width for the legend-hover highlight only -- the base map/chart
// lines stay their normal thickness; just the hovered category's segments
// get thickened, both on the map and directly on the elevation line.
export const LEGEND_HIGHLIGHT_WIDTH = 5;
export const LEGEND_HIGHLIGHT_HALO_WIDTH = LEGEND_HIGHLIGHT_WIDTH + 3;

// Every map track always gets a thin white casing underneath it (a wider
// white line added to the map first, so the colored line renders on top),
// +2px visible on each side -- doesn't apply to the elevation graph.
const TRACK_WEIGHT = 3;
const TRACK_CASING_WEIGHT = TRACK_WEIGHT + 3;
// The colored line itself (not its casing) draws a bit thicker for the
// currently-charted trip/day, on top of the white halo, so the selected
// track pops even where the halo alone wouldn't stand out (e.g. thin
// shared-lane runs).
const SELECTED_TRACK_WEIGHT = 5;

// Actual visible track/casing strokes are only a few px wide, too thin to
// reliably hover/click -- every track segment also gets an invisible line
// drawn this wide purely to widen the mouseover/mousemove/click hit area.
// Made invisible via opacity: 0, not a transparent stroke color -- Chrome
// and Firefox both skip hit-testing an SVG stroke/fill painted with a
// literal transparent (zero-alpha) color, which would silently kill the
// wider hit area this exists for; a fully opaque color faded out via the
// element's own opacity keeps the hit area while staying invisible.
const TRACK_HIT_WEIGHT = 40;

// The currently-charted track(s) -- the whole trip, or just one selected
// day -- get an extra-wide white halo, rendered in trackHighlightPane so it
// always sits below every track/casing regardless of add order. Hovering
// any other track reuses the exact same halo treatment, just for whichever
// track is under the cursor instead of the persistent selection.
const SELECTION_HIGHLIGHT_WEIGHT = TRACK_CASING_WEIGHT + 4;

// Once something is charted (a trip or a single day selected), every other
// track fades to this opacity so the selected one visually pops -- at the
// "all trips" level (nothing charted yet) everything stays at full opacity.
const DIMMED_TRACK_OPACITY = 0.4;
const FULL_TRACK_OPACITY = 1;

// Every basemap/overlay tile layer goes through this instead of calling
// L.tileLayer directly. `detectRetina` is deliberately NOT set here by
// default: for a URL template with its own `{r}` placeholder (the CartoDB
// layers below, passed retina: true) it correctly fetches that provider's
// real "@2x" tile at the *same* zoom level -- sharper pixels, same map
// content/label size. For every other provider, none of which expose a
// retina asset, Leaflet's only fallback is to fetch one zoom level
// *deeper* and shrink it to fit -- which does sharpen raw pixels, but
// every label/road-name on the tile shrinks right along with it, making
// text on the map noticeably harder to read. Not worth that trade for
// providers with no real retina tile to fetch.
function tileLayer(url, options, { retina = false } = {}) {
  return () => {
    const layer = L.tileLayer(url, { ...(retina ? { detectRetina: true } : {}), ...options });
    // Small single-origin tile hosts (no {s} subdomain sharding) occasionally
    // 502 under the request bursts Leaflet fires while panning/zooming --
    // a transient failure, not a missing tile, so just retry once.
    layer.on("tileerror", ({ tile }) => setTimeout(() => {
      const src = tile.src;
      tile.src = "";
      tile.src = src;
    }, 1000));
    return layer;
  };
}

// A handful of Esri basemaps only ship as two separate tile services -- a
// plain "Base" and a transparent "Reference" carrying just labels/borders
// on top of it -- with no combined single-URL version. The layer switcher's
// basemap radio (see buildLayerSwitcher) only ever swaps in one layer per
// pick, so both tile layers are wrapped in one L.layerGroup here to make
// the pair act like a single basemap; duplicate attribution text from the
// two layers is deduped automatically by Leaflet's own AttributionControl
// refcounting.
function layerPair(baseUrl, baseOptions, refUrl, refOptions) {
  return () => L.layerGroup([L.tileLayer(baseUrl, baseOptions), L.tileLayer(refUrl, refOptions)]);
}

// Every selectable basemap, all free/keyless tile services -- shown to the
// user via the custom layer switcher's basemap panel (see
// buildLayerSwitcher, called from initMap), alphabetically (panel rows
// follow this dict's own key order). "Esri Satellite" no longer needs to
// stay first -- initMap looks it up by name for the default layer
// regardless of where it falls alphabetically.
// Brief hover description for each BASEMAPS/OVERLAYS entry, shown as a
// native browser tooltip on its row in the layer switcher (see
// buildLayerSwitcher) -- keyed by the exact same name string used as that
// entry's own object key.
const LAYER_DESCRIPTIONS = {
  // "basemap.at": "Mappa ufficiale austriaca, dettagliata ma solo per il territorio austriaco",
  // "basemap.at Grayscale": "Come basemap.at ma in scala di grigi, solo Austria",
  // "basemap.at Orthophoto": "Ortofoto aerea ufficiale a 30cm, solo Austria",
  // "CartoDB Dark Matter": "Grigio scuro e minimale, ottimo contrasto per le tracce colorate",
  // "CartoDB Positron": "Grigio chiaro e minimale, fa risaltare le tracce",
  "CartoDB Voyager": "Chiaro e tenue, con strade, edifici ed etichette",
  "CyclOSM": "Pensato per il ciclismo, evidenzia piste e percorsi ciclabili",
  // "EOX Sentinel-2 Cloudless": "Composito satellitare Sentinel-2 privo di nuvole",
  "EOX Terrain": "Rilievo ombreggiato chiaro e uniforme su scala globale",
  // "Esri Canvas Dark": "Base scura minimale con soli confini ed etichette essenziali",
  // "Esri Canvas Light": "Base chiara minimale con soli confini ed etichette essenziali",
  "Esri NatGeo": "Stile cartografico in stile National Geographic",
  "Esri Ocean": "Pensata per la batimetria marina, poco dettaglio in montagna",
  "Esri Satellite": "Immagini satellitari/aeree",
  "Freemap Outdoor": "Sentieri escursionistici, ciclabili e per lo sci alpinismo con curve di livello",
  // "Esri Shaded Relief": "Solo rilievo ombreggiato del terreno, senza strade o etichette",
  // "Esri Shaded Relief Dark": "Come Esri Shaded Relief ma in tono scuro",
  "Esri World Street": "Stradale generico, simile a una mappa cartacea classica",
  "Esri World Topo": "Topografico con curve di livello e rilievo ombreggiato",
  "Humanitarian OSM": "OpenStreetMap curato dalla comunità umanitaria (HOT)",
  "IGN France": "Mappa stradale/topografica ufficiale francese, solo Francia",
  "IGN France Ortho": "Ortofoto aerea ufficiale francese, solo Francia",
  "Maps-For-Free Relief": "Rilievo a basso dettaglio, utile solo per la vista d'insieme (zoom limitato)",
  "OPNVKarte": "Pensato per il trasporto pubblico (linee e fermate)",
  "OpenHikingMap": "Pensato per l'escursionismo, evidenzia sentieri e rifugi",
  "OpenStreetMap": "Lo stile standard di OpenStreetMap",
  "OpenTopoMap": "Topografico con curve di livello, ombreggiatura del rilievo",
  "Swisstopo": "Mappa topografica ufficiale svizzera, solo Svizzera",
  "Swisstopo SwissImage": "Ortofoto aerea ufficiale svizzera, solo Svizzera",
  "UtagawaMTB": "Pensato per la mountain bike, evidenzia sentieri e single-track",

  // "CartoDB Dark Matter (Labels Only)": "Solo le etichette di testo dello stile Dark Matter, trasparente",
  // "CartoDB Positron (Labels Only)": "Solo le etichette di testo dello stile Positron, trasparente",
  "CartoDB Labels": "Solo le etichette di testo dello stile Voyager, trasparente",
  "Esri Boundaries and Places": "Confini amministrativi e nomi di località, trasparente",
  "Esri Transportation": "Rete stradale, trasparente da sovrapporre a basi senza strade",
  "OpenRailwayMap": "Linee e stazioni ferroviarie",
  // "OpenSeaMap": "Segnali nautici e informazioni marittime",
  "OpenSnowMap": "Piste da sci e impianti di risalita",
  "OSM GPS Traces": "Densità delle tracce GPS registrate dalla comunità OpenStreetMap",
  "Waymarked: Cycling": "Percorsi ciclabili segnalati",
  "Waymarked: Hiking": "Sentieri escursionistici segnalati",
  "Waymarked: MTB": "Percorsi per mountain bike segnalati",
  // "Waymarked: Riding": "Percorsi per equitazione segnalati",
  // "Waymarked: Skating": "Percorsi per pattinaggio in linea segnalati",
  "Waymarked: Slopes": "Piste sciistiche e sport invernali segnalati",
};

const BASEMAPS = {
  // "basemap.at": tileLayer("https://maps.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png", {
  //   maxZoom: 19,
  //   attribution: "Datenquelle: <a href=\"https://basemap.at\" target=\"_blank\">basemap.at</a>",
  // }),
  // "basemap.at Grayscale": tileLayer("https://maps.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png", {
  //   maxZoom: 19,
  //   attribution: "Datenquelle: <a href=\"https://basemap.at\" target=\"_blank\">basemap.at</a>",
  // }),
  // "basemap.at Orthophoto": tileLayer("https://maps.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg", {
  //   maxZoom: 19,
  //   attribution: "Datenquelle: <a href=\"https://basemap.at\" target=\"_blank\">basemap.at</a>",
  // }),
  // "CartoDB Dark Matter (No Labels)": tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
  //   maxZoom: 19,
  //   attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  // }, { retina: true }),
  // "CartoDB Positron (No Labels)": tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
  //   maxZoom: 19,
  //   attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  // }, { retina: true }),
  "CartoDB Voyager": tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }),
  "CyclOSM": tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; CyclOSM",
  }),
  // "EOX Sentinel-2 Cloudless": tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", {
  //   maxZoom: 19,
  //   attribution: "Sentinel-2 cloudless by <a href=\"https://s2maps.eu\" target=\"_blank\">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data)",
  // }),
  "EOX Terrain": tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", {
    maxZoom: 13,
    attribution: "Terrain Light { Data &copy; OpenStreetMap contributors and others, Rendering &copy; <a href=\"https://eox.at\" target=\"_blank\">EOX</a>",
  }),
  // "Esri Canvas Dark": layerPair(
  //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
  //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
  // ),
  // "Esri Canvas Light": layerPair(
  //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
  //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
  // ),
  "Esri NatGeo": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 12,
    attribution: "Tiles &copy; Esri &mdash; Source: National Geographic, Esri, DeLorme, NAVTEQ",
  }),
  "Esri Ocean": layerPair(
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 10, attribution: "Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic" },
    "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 10, attribution: "Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic" },
  ),
  "Esri Satellite": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  }),
  // "Esri Shaded Relief": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}", {
  //   maxZoom: 19,
  //   attribution: "Tiles &copy; Esri &mdash; Source: Esri",
  // }),
  // "Esri Shaded Relief Dark": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}", {
  //   maxZoom: 19,
  //   attribution: "Tiles &copy; Esri &mdash; Source: Esri",
  // }),
  "Esri World Street": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin",
  }),
  "Esri World Topo": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ",
  }),
  "Freemap Outdoor": tileLayer("https://outdoor.tiles.freemap.sk/{z}/{x}/{y}", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; freemap.sk",
  }),
  "Humanitarian OSM": tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
    maxZoom: 16,
    attribution: "&copy; OpenStreetMap contributors &mdash; Tiles style by Humanitarian OpenStreetMap Team",
  }),
  "IGN France": tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png", {
    maxZoom: 19,
    attribution: "&copy; IGN",
  }),
  "IGN France Ortho": tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", {
    maxZoom: 19,
    attribution: "&copy; IGN",
  }),
  "Maps-For-Free Relief": tileLayer("https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg", {
    maxZoom: 11,
    attribution: "&copy; <a href=\"https://maps-for-free.com\" target=\"_blank\">maps-for-free.com</a>",
  }),
  "OPNVKarte": tileLayer("https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; MeMoMaps (CC-BY-SA)",
  }),
  "OpenHikingMap": tileLayer("https://tile.openmaps.fr/openhikingmap/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenHikingMap / openmaps.fr",
  }),
  "OpenStreetMap": tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }),
  "OpenTopoMap": tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM &mdash; Map style: &copy; OpenTopoMap (CC-BY-SA)",
  }),
  "Swisstopo": tileLayer("https://wmts20.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg", {
    maxZoom: 19,
    attribution: "&copy; swisstopo",
  }),
  "Swisstopo SwissImage": tileLayer("https://wmts20.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", {
    maxZoom: 19,
    attribution: "&copy; swisstopo",
  }),
  "UtagawaMTB": tileLayer("https://maps.utagawavtt.com/styles/utagawavtt/{z}/{x}/{y}.png", {
    // Forum posts guessed 17-18, but direct tile checks over the Alps show
    // crisp contours/hillshade/elevation labels through z21 -- only goes
    // visually blank around z22, so 21 is the real usable max.
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; OpenMapTiles &mdash; Map style: UtagawaVTT / www.UtagawaVTT.com",
  }),
};

// Optional overlays, layered on top of whichever basemap is active --
// unlike BASEMAPS these are checkboxes (any combination on at once), so
// they're kept in a separate map/control list rather than mixed into the
// mutually-exclusive base layer radios above. Alphabetical, same as BASEMAPS.
const OVERLAYS = {
  "CartoDB Labels": tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
  }),
  "Esri Boundaries and Places": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri",
  }),
  "Esri Transportation": tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri",
  }),
  "OpenRailwayMap": tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenRailwayMap (CC-BY-SA)",
  }),
  // "OpenSeaMap": tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
  //   maxZoom: 17,
  //   attribution: "&copy; OpenSeaMap contributors",
  // }),
  "OpenSnowMap": tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", {
    maxZoom: 16,
    attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenSnowMap (CC-BY-SA)",
  }),
  "OSM GPS Traces": tileLayer("https://gps.tile.openstreetmap.org/lines/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }),
  "Waymarked: Cycling": tileLayer("https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  "Waymarked: Hiking": tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  "Waymarked: MTB": tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  // "Waymarked: Riding": tileLayer("https://tile.waymarkedtrails.org/riding/{z}/{x}/{y}.png", {
  //   maxZoom: 18,
  //   attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  // }),
  // "Waymarked: Skating": tileLayer("https://tile.waymarkedtrails.org/skating/{z}/{x}/{y}.png", {
  //   maxZoom: 18,
  //   attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  // }),
  "Waymarked: Slopes": tileLayer("https://tile.waymarkedtrails.org/slopes/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
};

export function initMap() {
  const map = L.map("map", { zoomControl: true });
  map.on("zoomend", () => console.log("zoom", map.getZoom()));
  const baseLayers = {};
  for (const name in BASEMAPS) baseLayers[name] = BASEMAPS[name]();
  baseLayers["Esri Satellite"].addTo(map);
  const overlays = {};
  for (const name in OVERLAYS) overlays[name] = OVERLAYS[name]();
  buildLayerSwitcher(map, baseLayers, overlays, "Esri Satellite");
  // A pane sandwiched between the tiles (z-index 200) and Leaflet's default
  // overlayPane (z-index 400, where every track/casing/marker lives) --
  // guarantees the selection halo always renders below every track, no
  // matter what order layers are added/rebuilt in.
  map.createPane("trackHighlightPane");
  map.getPane("trackHighlightPane").style.zIndex = 350;
  map.getPane("trackHighlightPane").style.pointerEvents = "none";
  // The moving hover-point marker (see showHoverMarker) needs to always sit
  // above every track/casing/halo -- those get reordered via bringToFront
  // as selection/dimming changes, which would otherwise bury a marker
  // that was added to the map earlier. A dedicated pane above Leaflet's
  // own markerPane (600)/tooltipPane (650) sidesteps DOM order entirely.
  // pointerEvents: none keeps the marker from stealing mousemove/mouseout
  // from whatever track hit-line is under the cursor.
  map.createPane("hoverPointPane");
  map.getPane("hoverPointPane").style.zIndex = 675;
  map.getPane("hoverPointPane").style.pointerEvents = "none";
  // Sits just above Leaflet's overlayPane (400), where every track/casing
  // lives -- so the persistent legend-category highlight always stays
  // visible on top, even when hovering a track brings its casing/line to
  // the front of overlayPane's own DOM order (see bringTrackToFront).
  map.createPane("legendHighlightPane");
  map.getPane("legendHighlightPane").style.zIndex = 410;
  map.getPane("legendHighlightPane").style.pointerEvents = "none";
  state.map = map;
  return map;
}

// Which Material Symbols icon (see poi-icons.js's ICO_CODEPOINT/icoHtml)
// each basemap/overlay row gets in the layer switcher (buildLayerSwitcher)
// -- ~30 entries share about a dozen icon names, grouped by what a layer
// actually shows rather than one bespoke glyph per layer. Keyed by the
// exact same name string used as BASEMAPS'/OVERLAYS' own object key.
const LAYER_ICON = {
  "CartoDB Voyager": "map",
  "CyclOSM": "pedal_bike",
  "EOX Terrain": "landscape_2",
  "Esri NatGeo": "terrain",
  "Esri Ocean": "water",
  "Esri Satellite": "satellite_alt",
  "Esri World Street": "map",
  "Esri World Topo": "terrain",
  "Freemap Outdoor": "hiking",
  "Humanitarian OSM": "map",
  "IGN France": "terrain",
  "IGN France Ortho": "satellite_alt",
  "Maps-For-Free Relief": "landscape_2",
  "OPNVKarte": "directions_bus",
  "OpenHikingMap": "hiking",
  "OpenStreetMap": "map",
  "OpenTopoMap": "terrain",
  "Swisstopo": "terrain",
  "Swisstopo SwissImage": "satellite_alt",
  "UtagawaMTB": "pedal_bike",

  "CartoDB Labels": "sell",
  "Esri Boundaries and Places": "border_all",
  "Esri Transportation": "directions_bus",
  "OpenRailwayMap": "directions_bus",
  "OpenSnowMap": "downhill_skiing",
  "OSM GPS Traces": "route",
  "Waymarked: Cycling": "pedal_bike",
  "Waymarked: Hiking": "hiking",
  "Waymarked: MTB": "pedal_bike",
  "Waymarked: Riding": "route",
  "Waymarked: Slopes": "downhill_skiing",
};
// The two group-toggle buttons' own icons (distinct from the per-row
// pictograms above): a folded map for basemaps, a stack of layers for
// overlays.
const SWITCHER_BUTTON_ICONS = { base: "map", overlay: "layers" };

// Custom two-button layer switcher, replacing Leaflet's own L.control.layers
// -- one stamp-style button for basemaps (mutually exclusive) and one for
// overlays (independent checkboxes), each revealing its own flyout panel on
// hover (desktop) or a tap-to-toggle (touch, via the "open" class, since
// touch has no hover state to rely on). Built as a plain DOM node appended
// to #mapWrap rather than a Leaflet control -- same approach as
// .map-recenter-btn (see css/map-markers.css), which already sits outside
// Leaflet's own control container with no z-index/positioning conflict
// against the zoom control that stays top-left.
function buildLayerSwitcher(map, baseLayers, overlays, defaultBase) {
  const root = document.createElement("div");
  root.className = "layer-switcher";

  const closeAll = () => root.querySelectorAll(".layer-switcher-group.open").forEach(g => g.classList.remove("open"));

  const buildGroup = (kind, icon, title, entries, onPick) => {
    const group = document.createElement("div");
    group.className = "layer-switcher-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "layer-switcher-btn";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML = icoHtml(icon);
    const panel = document.createElement("div");
    panel.className = "layer-switcher-panel";
    const heading = document.createElement("div");
    heading.className = "layer-switcher-title";
    heading.textContent = title;
    panel.appendChild(heading);
    for (const name in entries) {
      const row = document.createElement("label");
      row.className = "layer-switcher-row";
      const description = LAYER_DESCRIPTIONS[name];
      if (description) row.title = description;
      const input = document.createElement("input");
      input.type = kind;
      if (kind === "radio") {
        input.name = "layer-switcher-base";
        input.checked = name === defaultBase;
      }
      input.addEventListener("change", () => onPick(name, input.checked));
      const iconSpan = document.createElement("span");
      iconSpan.className = "layer-switcher-row-icon";
      iconSpan.innerHTML = icoHtml(LAYER_ICON[name]);
      const label = document.createElement("span");
      label.className = "layer-switcher-row-label";
      label.textContent = name;
      row.append(input, iconSpan, label);
      panel.appendChild(row);
    }
    btn.addEventListener("click", () => {
      const wasOpen = group.classList.contains("open");
      closeAll();
      if (!wasOpen) group.classList.add("open");
    });
    group.append(btn, panel);
    return group;
  };

  let currentBase = defaultBase;
  const baseGroup = buildGroup("radio", SWITCHER_BUTTON_ICONS.base, "Mappa base", baseLayers, (name, checked) => {
    if (!checked || name === currentBase) return;
    map.removeLayer(baseLayers[currentBase]);
    map.addLayer(baseLayers[name]);
    currentBase = name;
  });
  const overlayGroup = buildGroup("checkbox", SWITCHER_BUTTON_ICONS.overlay, "Overlay", overlays, (name, checked) => {
    if (checked) map.addLayer(overlays[name]);
    else map.removeLayer(overlays[name]);
  });
  root.append(baseGroup, overlayGroup);
  // Only clicking (not hovering) sets the "open" class -- so it needs its
  // own outside-click dismissal, matching how a click anywhere else in the
  // app closes other flyouts/menus.
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) closeAll(); });

  document.getElementById("mapWrap").appendChild(root);
}

// ---- Map layers ----

// Shared by the map (buildSegmentGroup) and the elevation chart
// (chart.js's segmentColorFn) so a segment's mode-coloring is computed in
// exactly one place -- returns undefined for anything the given mode
// doesn't cover (including mode "trip", which has no segment coloring of
// its own), leaving the caller to decide its own fallback (the map has
// none to fall back to; the chart falls back to the trip's identity color).
export function segmentColorForMode(mode, surface, highway, grade, ele) {
  if (mode === "surface") return SURFACE_COLORS[surface] || SURFACE_FALLBACK;
  if (mode === "highway") return HIGHWAY_COLORS[highway] || HIGHWAY_FALLBACK;
  if (mode === "gradient") return gradeColor(grade);
  if (mode === "altimetry") return altitudeBucket(ele, state.altitudeBuckets)?.color;
  return null;
}

// Every segment's casing is added first, in one pass, so it forms a solid
// base the whole track sits on; the colored segments are then layered on
// top in a second pass, newest-first-in-time so the oldest segment ends up
// front-most (same "oldest on top" convention as tripTrackDrawOrder) --
// otherwise each segment's own casing would land on top of the *previous*
// segment's colored line at every joint, leaving a visible white notch at
// every cap along the track.
export function buildSegmentGroup(trip, track, mode) {
  const grades = mode === "gradient" ? trackGradeSeries(track) : null;
  const surfaces = mode === "surface" ? trackCategorySeries(track, "surface") : null;
  const highways = mode === "highway" ? trackCategorySeries(track, "highway") : null;
  const group = L.layerGroup();
  const points = track.points;
  const colorAt = (i) => segmentColorForMode(
    mode,
    surfaces ? surfaces[i] : undefined,
    highways ? highways[i] : undefined,
    grades ? grades[i] : undefined,
    mode === "altimetry" ? points[i].ele : undefined
  );
  // Consecutive point-to-point segments sharing the same color are merged
  // into one multi-point polyline instead of one polyline per pair -- a
  // trip-wide coloring can otherwise mean thousands of individual Leaflet
  // layers (casing+colored+hit-line each), which gets laggish fast. Color
  // only changes where surface/highway/grade-bucket actually changes, so
  // this is normally a small fraction of the raw point count.
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    const color = colorAt(i - 1);
    const run = runs[runs.length - 1];
    if (run && run.color === color) run.end = i;
    else runs.push({ color, start: i - 1, end: i });
  }
  const runLatLngs = (run) => points.slice(run.start, run.end + 1).map(p => [p.lat, p.lon]);
  runs.forEach(run => {
    group.addLayer(L.polyline(runLatLngs(run), { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 1, lineCap: "butt" }));
  });
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    const seg = L.polyline(runLatLngs(run), { color: run.color, weight: TRACK_WEIGHT, opacity: 1, lineCap: "round" });
    seg._trackLineWeight = TRACK_WEIGHT;
    group.addLayer(seg);
  }
  // One hit-line for the whole track (matching buildDayLayers' per-run
  // approach) rather than one per point-pair -- hover/click granularity
  // comes from the mousemove handler's closest-point lookup, not from the
  // hit-line being split, so this loses nothing there.
  const hitLine = L.polyline(points.map(p => [p.lat, p.lon]), { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
  hitLine._isHitLine = true;
  attachTrackHandlers(hitLine, trip, track, points);
  group.addLayer(hitLine);
  return group;
}

// Wires up a track's mouseover/mousemove/click handling on its invisible
// wide hit-line (see TRACK_HIT_WEIGHT) -- the visible casing+colored line
// are only a few px wide and too thin to reliably hover/click, so hovering
// and clicking are always driven by the dedicated hit-line instead: it
// shows the day's tooltip and drops a halo under it as either the
// persistent selection highlight or a preview of it, keeps the elevation
// chart's crosshair in sync, and drills down a level on click.
//
// Which level hover/click act on follows the trip that's currently active
// (if any), not just the track's own trip: for the active trip's own
// tracks, hovering/clicking always targets that specific track/day -- it's
// the one already drilled into, so there's nowhere shallower to go. For
// every other track -- including any/all of them at the "all trips" level,
// where no trip is active yet -- hovering/clicking targets the whole trip
// instead, since jumping straight to one of its days would skip the trip
// overview entirely.

// Shared by every hoverable track surface -- the map hit-line
// (attachTrackHandlers below) and the start/end trip markers
// (clusters.js) -- so "hovering this track previews/confirms its
// selection halo and shows its day tooltip" is implemented exactly once.
// Either `trackId` (narrows the halo to just this track) or `tripId`
// (previews the whole trip) is given, matching showTrackHoverHighlight/
// showTripHoverHighlight's own split.
export function beginTrackHover(latlng, tooltipHtml, tooltipOpts, { trackId, tripId } = {}) {
  if (trackId) showTrackHoverHighlight(trackId);
  else if (tripId) showTripHoverHighlight(tripId);
  state.hoverTooltipOnLayer = true;
  showHoverTooltip(latlng, tooltipHtml, tooltipOpts);
}
export function endTrackHover() {
  clearTrackHoverHighlight();
  state.hoverTooltipOnLayer = false;
  hideHoverTooltip();
}

export function attachTrackHandlers(hitLine, trip, track, points) {
  const tooltipHtml = tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity);
  const tooltipOpts = trackTooltipOpts(-10, true);
  const isActiveTrip = () => state.activeTripId === trip.id;
  // Anchors the tooltip to the closest point on this hit-line's own run of
  // points rather than the raw cursor position, so it sticks to the track
  // itself instead of hovering wherever the (wide, invisible) hit-line
  // happens to be under the mouse.
  const closestOnSeg = (latlng) => closestPointOnPolyline(latlng, points);
  // mousemove fires far more often than the screen can repaint, and the
  // handler's own work (re-syncing the elevation chart's active point,
  // which triggers a full Chart.js redraw) is too heavy to redo on every
  // single event -- doing so made the tooltip visibly lag behind the
  // cursor. Coalescing to one flush per animation frame keeps only the
  // latest position and matches the actual paint rate.
  let pendingLatLng = null, rafScheduled = false;
  const flushMouseMove = () => {
    rafScheduled = false;
    if (!pendingLatLng) return;
    const latlng = pendingLatLng;
    pendingLatLng = null;
    perfMark("map.hitline.tooltip", () => moveHoverTooltip(closestOnSeg(latlng)));
    perfMark("map.hitline.onTrackHover", () => onTrackHover(trip, track, latlng));
  };
  hitLine.on("mouseover", (e) => {
    beginTrackHover(closestOnSeg(e.latlng), tooltipHtml, tooltipOpts, isActiveTrip() ? { trackId: track.id } : { tripId: trip.id });
  });
  hitLine.on("mouseout", () => {
    pendingLatLng = null;
    endTrackHover();
    clearChartHover();
  });
  hitLine.on("mousemove", (e) => {
    pendingLatLng = e.latlng;
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushMouseMove);
    }
  });
  hitLine.on("click", () => {
    if (isActiveTrip()) selectDay(trip.id, track.id, { recenter: false });
    else selectTrip(trip.id, { recenter: false });
  });
}

export function buildDayLayers(trip, track) {
  const dayLatLngs = track.points.map(p => [p.lat, p.lon]);
  // Kept detached from the map, purely so fitBounds/highlight code
  // elsewhere can still call .getBounds()/.getLatLngs() on one object for
  // the whole track, regardless of how many run-pieces it's split into
  // below for rendering.
  const mainLine = L.polyline(dayLatLngs);

  const group = L.layerGroup();
  const latlngs = dayLatLngs;
  // Casing stays solid even though the line above it is dashed by
  // activity -- it reads as a continuous colored-dash "tube" rather than
  // a broken line, so the track is always easy to follow at a glance.
  const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 1 });
  const line = L.polyline(latlngs, {
    color: trip._color, weight: TRACK_WEIGHT, opacity: 1,
    dashArray: ACTIVITY_DASH[track.activity] || null,
  });
  line._trackLineWeight = TRACK_WEIGHT;
  const hitLine = L.polyline(latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
  hitLine._isHitLine = true;
  attachTrackHandlers(hitLine, trip, track, track.points);
  group.addLayer(casing);
  group.addLayer(line);
  group.addLayer(hitLine);

  return { day: group, mainLine, segmentGroups: {} };
}

// One icon per POI, created once and never swapped: `setIcon()` replaces
// the marker's DOM node, which can desync Leaflet's hover listeners from
// the new element and leave a pin stuck open. Instead both the resting dot
// and the full signpost pin are always in the DOM, and a "highlighted" CSS
// class on the (stable) icon element -- set when opened -- decides which
// one is visible.
export function poiMarkerIcon(poi, color) {
  const glyph = poiIconHtml(poi);
  return L.divIcon({
    className: "poi-marker",
    html: `
      <div style="--poi-color: ${color}">
        <div class="poi-marker-dot"><span class="poi-dot-glyph">${glyph}</span></div>
        <div class="poi-divicon">
          <div class="poi-divicon-outer"></div>
          <div class="poi-divicon-inner"></div>
          <span class="poi-glyph">${glyph}</span>
        </div>
      </div>
    `,
    iconSize: [42, 48],
    iconAnchor: [21, 48],
    popupAnchor: [0, -48],
  });
}

export function groupForMode(trackId, mode) {
  const layers = state.dayLayers[trackId];
  if (mode === "trip") return layers.day;
  if (!layers.segmentGroups[mode]) {
    const { trip, track } = state.trackById[trackId];
    layers.segmentGroups[mode] = buildSegmentGroup(trip, track, mode);
  }
  return layers.segmentGroups[mode];
}

// Which color-mode group a track is actually showing on the map right now.
// Defaults to "trip" -- the group every track starts in at load -- since a
// track only ever gets switched to the surface/highway/gradient coloring
// while it's part of the current charted selection (see applyColorMode).
export function currentModeForTrack(trackId) {
  const layers = state.dayLayers[trackId];
  return (layers && layers._currentMode) || "trip";
}

// Only the charted track(s) (see chartedTrackIds -- the selected day, or
// every day of the selected trip if no single day is picked) ever show the
// surface/highway/gradient coloring; every other track always stays in its
// own trip's identity color, no matter what "Colora tracce per" is set to.
export function applyColorMode() {
  const chartedIds = chartedTrackIds();
  const charted = new Set(chartedIds);
  // Only tracks that are charted now, or were charted before this call (and
  // so may need resetting back to "trip" mode), can possibly need a mode
  // change -- every other track is already sitting in "trip" mode and stays
  // there, so there's no need to walk the whole dataset's worth of tracks.
  const affected = new Set([...chartedIds, ...state.prevChartedTrackIds]);
  affected.forEach(trackId => {
    const layers = state.dayLayers[trackId];
    if (!layers) return;
    const targetMode = charted.has(trackId) ? state.colorMode : "trip";
    const current = currentModeForTrack(trackId);
    if (current === targetMode) return;
    const oldGroup = groupForMode(trackId, current);
    const newGroup = groupForMode(trackId, targetMode);
    if (state.map.hasLayer(oldGroup)) state.map.removeLayer(oldGroup);
    newGroup.addTo(state.map);
    layers._currentMode = targetMode;
  });
  state.prevChartedTrackIds = chartedIds;
  // The persistent halo/weight-5 treatment only shows for a non-"Tracce"
  // coloring (see persistentHaloTrackIds) -- switching modes can turn it on
  // or off on its own, with no other selection change to trigger it.
  renderSelectionHalo(persistentHaloTrackIds());
  updateTrackDimming();
}

export function fitBoundsForTracks(tracks) {
  const bounds = [];
  tracks.forEach(track => {
    const layers = state.dayLayers[track.id];
    if (layers && layers.mainLine.getBounds().isValid()) bounds.push(layers.mainLine.getBounds());
  });
  if (!bounds.length) return;
  let b = bounds[0];
  bounds.slice(1).forEach(x => { b = b.extend(x); });
  state.map.fitBounds(b, { padding: [30, 30] });
}

// Backs the map's own recenter button -- refits to whatever's currently
// selected (day, trip, or everything at the "all trips" level), the same
// framing selectDay/selectTrip/selectAll would apply themselves, just
// triggered on demand instead of automatically.
export function recenterMap() {
  if (state.activeDayId) {
    const trip = state.tripById[state.activeTripId];
    const track = trip.tracks.find(t => t.id === state.activeDayId);
    fitBoundsForTracks([track]);
  } else if (state.activeTripId) {
    fitBoundsForTracks(state.tripById[state.activeTripId].tracks);
  } else {
    fitBoundsForTracks(visibleTracks());
  }
}

// The track(s) backing the color-mode scoping (see applyColorMode) and,
// unless "Tracce" is active, the persistent halo (see
// persistentHaloTrackIds) -- just the one selected day, or every day of the
// selected trip if no single day is picked.
export function chartedTrackIds() {
  if (state.activeDayId) return [state.activeDayId];
  if (state.activeTripId) {
    const trip = state.tripById[state.activeTripId];
    return trip ? trip.tracks.map(t => t.id) : [];
  }
  return [];
}

// The track(s) that get the persistent halo/weight-5 treatment outside of
// any hover. A single selected day always gets it, in every coloring mode
// -- it's a real, specific selection, not just the trip-level default. But
// selecting a trip alone (no day picked) only gets it while a non-"trip"
// coloring is applied (surface/highway/gradient/altimetry): with "Tracce"
// (colorMode "trip") active, that looks exactly like the "all trips" view
// -- no halo, no thicker line -- until a hover (see highlightedTrackIds)
// previews it instead.
function persistentHaloTrackIds() {
  if (state.activeDayId) return chartedTrackIds();
  return state.colorMode === "trip" ? [] : chartedTrackIds();
}

// The track(s) that stay full-opacity (everything else dims): the whole
// active trip, whether or not a specific day within it is picked.
export function dimmedTrackIds() {
  if (!state.activeTripId) return [];
  const trip = state.tripById[state.activeTripId];
  return trip ? [].concat(...trip.tracks.map(t => [t.id, startDotId(t.id)])) : [];
}

// Shared white halo builder for both the persistent selection highlight
// and the transient per-track hover highlight below -- same look, just
// different lifetimes and (in the hover case) a slightly narrower weight
// so it doesn't read as "this is now selected".
function trackHaloLayer(trackId, weight) {
  const layers = state.dayLayers[trackId];
  if (!layers) return null;
  return L.polyline(layers.mainLine.getLatLngs(), {
    pane: "trackHighlightPane",
    color: "#ffffff",
    weight,
    opacity: 1,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
  });
}

// Shared by the persistent selection halo and the transient hover-narrowed
// halo below -- draws exactly one halo per given track id.
function renderSelectionHalo(ids) {
  if (!state.selectionHighlight) state.selectionHighlight = L.layerGroup().addTo(state.map);
  state.selectionHighlight.clearLayers();
  ids.forEach(trackId => {
    const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
    if (halo) halo.addTo(state.selectionHighlight);
  });
}

export function updateSelectionHighlight() {
  renderSelectionHalo(persistentHaloTrackIds());
  // A click that changes the selection can fire while the cursor is still
  // sitting on the hit-line it just selected -- clear any stale hover
  // halo so it doesn't linger under/alongside the new selection halo.
  clearTrackHoverHighlight();
  updateTrackDimming();
}

// Which track id(s) currently get the "selected" halo/weight treatment --
// normally every charted track (see chartedTrackIds), but while hovering a
// track of the active trip, narrowed down to just the hovered one (see
// showTrackHoverHighlight); while hovering a different trip entirely,
// widened to every one of *its* tracks instead (see showTripHoverHighlight)
// -- either way the hovered thing always gets the same weight-5 treatment
// the persistent selection itself would.
function highlightedTrackIds() {
  if (state.hoveredTrackId) return [state.hoveredTrackId];
  if (state.hoveredTripId) return state.tripById[state.hoveredTripId].tracks.map(t => t.id);
  return persistentHaloTrackIds();
}

// Once a trip is active, every track outside it fades out so the active
// trip pops against the rest of the map -- applies to whichever
// color-mode group is currently shown for each track, casing included, so
// dimming stays correct across "Colora tracce per" switches too. Picking a
// specific day within the trip only narrows the halo/color-mode (see
// chartedTrackIds), not the dimming: the rest of that trip's tracks stay
// at full opacity too.
export function updateTrackDimming() {
  const dimmedIds = dimmedTrackIds();
  const selectedIds = highlightedTrackIds();
  const charted = new Set(dimmedIds);
  const dimActive = charted.size > 0;
  const selected = new Set(selectedIds);
  // Every track's opacity/weight only actually changes if it's charted or
  // selected now, or was charted/selected just before this call -- anything
  // outside that union is already in the right state and doesn't need its
  // layer group walked again.
  // When dimming just switched on or off, every track's opacity needs to be
  // re-evaluated, not just the (dimmed ∪ selected) sets -- otherwise tracks
  // that are neither now (or weren't previously) keep whatever opacity they
  // happened to have until something else touches them, e.g. a hover.
  const affected = dimActive !== state.prevDimActive
    ? new Set(Object.keys(state.dayLayers))
    : new Set([...dimmedIds, ...selectedIds, ...state.prevDimmingTrackIds]);
  affected.forEach(trackId => {
    if (!state.dayLayers[trackId]) return;
    const isCharted = !dimActive || charted.has(trackId);
    const opacity = isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY;
    const isSelectedTrack = selected.has(trackId);
    const group = groupForMode(trackId, currentModeForTrack(trackId));
    group.eachLayer(layer => {
      if (!layer.setStyle || layer._isHitLine) return;
      const weight = layer._trackLineWeight !== undefined
        ? (isSelectedTrack ? SELECTED_TRACK_WEIGHT : layer._trackLineWeight)
        : undefined;
      layer.setStyle(weight !== undefined ? { opacity, weight } : { opacity });
    });
  });
  // Charted tracks draw above every dimmed one, oldest-day-last (see
  // tripTrackDrawOrder) so day 1 ends up front-most among them, same as the
  // initial add order -- then whichever track/trip is actually
  // hovered/selected is brought above that, so hovering always wins
  // regardless of day order. Bringing every layer (casing, line, and the
  // invisible hit-line alike) to front keeps the click/hover area aligned
  // with what's visibly on top instead of buried under it.
  if (dimActive) {
    [...dimmedIds].reverse().forEach(trackId => bringTrackToFront(trackId));
  }
  [...selectedIds].reverse().forEach(trackId => bringTrackToFront(trackId));
  state.prevDimmingTrackIds = [...new Set([...dimmedIds, ...selectedIds])];
  state.prevDimActive = dimActive;
}

// Brings a track's casing+line (in whichever color mode is currently
// shown) to the top of the map's drawing order, so it isn't hidden under
// some other track it happens to cross.
function bringTrackToFront(trackId) {
  const group = groupForMode(trackId, currentModeForTrack(trackId));
  group.eachLayer(layer => { if (layer.bringToFront) layer.bringToFront(); });
  const dotLayers = state.dayLayers[startDotId(trackId)];
  if (dotLayers) dotLayers.day.eachLayer(layer => { if (layer.bringToFront) layer.bringToFront(); });
}

// A trip's tracks are always drawn oldest-day-on-top (so a later/further
// day's line never buries the earlier one where they overlap). Returns
// tracks in bottom-to-top drawing order (last element ends up on top).
export function tripTrackDrawOrder(trip) {
  return [...trip.tracks].reverse();
}

// Markers (POI dots, trip start/end, per-day activity signs) don't respect
// DOM/add order for stacking the way SVG paths do -- bringToFront doesn't
// work on them -- so their relative order is instead forced with a big
// enough zIndexOffset per rank, overriding Leaflet's own latitude-based
// auto z-index. `rank` follows the same "oldest wins" convention as
// tripTrackDrawOrder: 0 = bottom-most, higher = further to the front.
// Every trip's markers additionally sit in their own reserved band of the
// range, ordered by trip._buildIndex, so newer trips' markers always beat
// older trips' -- the same "newest trip on top" rule tracks/casings get
// for free from their add order.
const MARKER_TRIP_RANK_UNIT = 1e8;
const MARKER_TIER_RANK_UNIT = 1e6;
const MARKER_ITEM_RANK_UNIT = 1;

// Marker tiers, highest-first: day-start/end signs always sit above POI
// signs, which always sit above photo thumbnails/flags, regardless of any
// of their own dayRank/poiRank/photo-rank -- this ordering wins independent
// of (and on top of) each item's own rank within the per-trip band below.
export const MARKER_TIER_PHOTO = 0;
export const MARKER_TIER_POI = 1;
export const MARKER_TIER_START = 2;

export function markerZIndexOffset(trip, rank, tier) {
  return trip._buildIndex * MARKER_TRIP_RANK_UNIT + tier * MARKER_TIER_RANK_UNIT + rank * MARKER_ITEM_RANK_UNIT;
}

// A track's rank among its own trip's days -- day 1 (oldest) ranks highest
// (front-most).
export function dayRank(trip, trackIndex) {
  return trip.tracks.length - 1 - trackIndex;
}

// Same idea as dayRank, but for a trip's POIs (which aren't tied to one
// particular day) -- ranked by their own order in trip.pois, assumed
// chronological like everything else here.
export function poiRank(trip, poiIndex) {
  return trip.pois.length - 1 - poiIndex;
}

// Transient per-track halo shown only while hovering that track (any run
// of it, or its casing) -- exactly the persistent selection's look, just
// cleared on mouseout instead of sticking around.
export function showTrackHoverHighlight(trackId) {
  if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
  state.hoverHighlight.clearLayers();
  const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
  if (halo) halo.addTo(state.hoverHighlight);
  bringTrackToFront(trackId);
  // This is always the active trip's own track (see attachTrackHandlers/
  // clusters.js's isActiveTrip() branch) -- narrows the persistent
  // selection halo/weight down to just the hovered track, whether or not
  // a specific day was already picked, so the rest of the trip visibly
  // steps back and the hovered day gets the same weight-5 treatment the
  // real selection would.
  state.hoveredTrackId = trackId;
  renderSelectionHalo([trackId]);
  updateTrackDimming();
}
// Same, but for every track of a whole trip at once -- used when hovering
// a track that isn't (yet) the active trip's own, so the halo *and*
// weight-5 line previews "clicking this selects the trip" rather than
// pretending to single out just the one day under the cursor.
export function showTripHoverHighlight(tripId) {
  if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
  state.hoverHighlight.clearLayers();
  const trip = state.tripById[tripId];
  trip.tracks.forEach(track => {
    const halo = trackHaloLayer(track.id, SELECTION_HIGHLIGHT_WEIGHT);
    if (halo) halo.addTo(state.hoverHighlight);
  });
  // Bring to front oldest-day-last (see tripTrackDrawOrder), so day 1 ends
  // up on top of the rest of this trip's own tracks, same as everywhere else.
  tripTrackDrawOrder(trip).forEach(track => bringTrackToFront(track.id));
  state.hoveredTripId = tripId;
  updateTrackDimming();
}
export function clearTrackHoverHighlight() {
  if (state.hoverHighlight) state.hoverHighlight.clearLayers();
  // Restore the full-trip halo narrowed by showTrackHoverHighlight, if any.
  if (state.hoveredTrackId) {
    state.hoveredTrackId = null;
    renderSelectionHalo(persistentHaloTrackIds());
  }
  state.hoveredTripId = null;
  // Hovering briefly raised some other track above the current
  // selection -- once the hover ends, restore the selected trip/day back
  // on top.
  updateTrackDimming();
}

// Every track on the map -- the legend's percentages are a breakdown of
// these, matching what's actually shown (every trip/day is always visible).
export function visibleTracks() {
  return [].concat(...state.trips.map(trip => trip.tracks));
}

// Distance-weighted percent breakdown of `keyFn(track, pointIndex)` across
// every segment of the given tracks (each segment counted by its own length,
// so it's a true share of distance, not of point count).
export function categoryPercents(tracks, keyFn) {
  const totals = {};
  let total = 0;
  tracks.forEach(track => {
    for (let i = 1; i < track.points.length; i++) {
      const distM = track.points[i].dist - track.points[i - 1].dist;
      const key = keyFn(track, i - 1);
      totals[key] = (totals[key] || 0) + distM;
      total += distM;
    }
  });
  const percents = {};
  for (const key in totals) percents[key] = total > 0 ? (totals[key] / total) * 100 : 0;
  return percents;
}

// Builds the divIcon for a trip/day marker, shown (like POIs) only while
// its trip is the selected one, with the full light-fill/colored-stroke
// treatment. `shape` is "triangle" (the trip's own first day only -- an
// equilateral triangle, apex pointing at that day's destination), "square"
// (every other day's start, with the day's cardinal number inside -- a
// rounded square with one sharp corner pointing the same way), or "ring"
// (trip end -- a double-stroke orienteering-style control circle, no
// number/direction). Hovering a triangle/square further turns it into a
// compass -- "N" mark plus a needle -- pointing the same direction as its
// own permanent shape, see .trip-marker-needle/-compass-n in CSS.
// The hover compass's needle is a classic double-ended "lancetta", after
// res/original/compass_needle.svg: a bowtie of two triangles sharing a
// full-width waist at the pivot -- solid front/north half, and a back/
// south half that's the same solid triangle with a smaller white triangle
// inset on top, so it reads as an outlined/hollow tail instead of a solid
// one. `bearing` sets the fixed heading
// via a plain rotate; the wobble on hover (.trip-marker-needle-wobble in
// CSS, a damped-oscillation keyframe animation) is a separate nested
// rotation so it adds on top of that heading instead of overriding it.
// `roundTrip` swaps the fixed heading for a slow, indefinite spin (see
// .trip-marker-needle-spin in CSS) -- there's no destination bearing to
// point at, so the needle keeps turning instead of pointing anywhere.
function compassNeedleHtml(bearing, roundTrip) {
  const rotateClass = roundTrip ? " trip-marker-needle-spin" : "";
  const rotateStyle = roundTrip ? "" : ` style="transform: rotate(${bearing}deg);"`;
  return `<div class="trip-marker-needle-rotate${rotateClass}"${rotateStyle}>
    <div class="trip-marker-needle-wobble">
      <svg class="trip-marker-needle-svg" viewBox="-3 -11 6 22">
        <path class="trip-marker-needle-north" d="M -3,0 L 3,0 L 0,-11 Z"></path>
        <path class="trip-marker-needle-south" d="M 3,0 L -3,0 L 0,11 Z"></path>
        <path class="trip-marker-needle-south-inset" d="M 2,0 L -2,0 L 0,7.3 Z"></path>
      </svg>
    </div>
    </div>`;
}

export function tripMarkerIcon(shape, color, { dayNumber, bearing, roundTrip, poi } = {}) {
  const size = 36;
  const half = size / 2;
  const shapeClass = shape === "ring" ? "trip-marker-ring"
    : shape === "triangle" ? "trip-marker-triangle" : "trip-marker-square";
  let inner;
  if (shape === "ring") {
    inner = `<div class="trip-marker-ring-core"></div>`;
  } else if (shape === "triangle") {
    // No day-number label -- the trip start is always day 1, so instead
    // its apex (the direction point) gets a small colored triangle of its
    // own to draw the eye there -- unless it's a round trip, where there's
    // no destination for the apex to point at, so that dot is dropped and
    // the shape is left unrotated.
    const triangleStyle = roundTrip ? "" : ` style="transform: rotate(${bearing}deg);"`;
    const tip = roundTrip ? "" : `<div class="trip-marker-triangle-tip"></div>`;
    inner = `<div class="trip-marker-triangle-rotate"${triangleStyle}>
      <div class="trip-marker-triangle-shape trip-marker-triangle-outer"></div>
      <div class="trip-marker-triangle-shape trip-marker-triangle-inner"></div>
      ${tip}
      </div>
      <div class="trip-marker-compass-dial"></div>
      <div class="trip-marker-compass-n">N</div>
      ${compassNeedleHtml(bearing, roundTrip)}`;
  } else {
    // Sharp corner sits at 225deg (down-left) before any rotation, so
    // +135deg brings it to due north -- the extra +bearing then swings it
    // to point at the day's destination, same convention as the triangle.
    // A round trip has no destination to point the corner at, so it's
    // rendered as a plain, unrotated rounded square instead (no notch).
    const squareStyle = roundTrip ? "" : ` style="transform: rotate(${bearing + 135}deg);"`;
    const squareOuterStyle = roundTrip ? ` style="border-radius: 50%;"` : "";
    const squareInnerStyle = roundTrip ? ` style="border-radius: 50%;"` : "";
    inner = `<div class="trip-marker-square-rotate"${squareStyle}>
      <div class="trip-marker-square-shape trip-marker-square-outer"${squareOuterStyle}></div>
      <div class="trip-marker-square-shape trip-marker-square-inner"${squareInnerStyle}></div>
      </div>
      <div class="trip-marker-compass-dial"></div>
      <div class="trip-marker-compass-n">N</div>
      ${compassNeedleHtml(bearing, roundTrip)}
      <div class="trip-marker-label">${dayNumber}</div>`;
  }
  // A start/day marker that also absorbed a POI (see clusterIcon in
  // clusters.js) gets a small solid-fill badge on its corner, in the same
  // filled style as the plain POI dot, so the POI doesn't just vanish once
  // it's sharing a slot with a day-start shape.
  const poiBadge = poi ? `<div class="trip-marker-poi-badge">${poiIconHtml(poi)}</div>` : "";
  return L.divIcon({
    // Leaflet's own hover/click listeners live on this outer icon element
    // (fixed at iconSize, never transformed) rather than on the inner
    // `.trip-marker-triangle`/`.trip-marker-square`/`.trip-marker-ring`
    // div it wraps -- see the CSS ":hover" rules keyed off
    // "trip-marker-hit" for why that separation matters.
    className: "trip-marker-hit",
    html: `<div class="trip-marker ${shapeClass}" style="--marker-color:${color}">${inner}${poiBadge}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

// Hover content for a trip/day sign: which trip and day it is, its date,
// and the activity (with icon) for that day -- moved off the marker
// itself and into this tooltip so the map only shows the plain sign
// shapes. Accented in the trip's own color so it reads as "belonging" to
// that trip's markers even before you notice which sign you're hovering.
// (Which way a day heads is shown by the marker's own triangle shape on
// the map instead of duplicated here.)
//
// `poiList`, when given (only for the fixed tooltip pinned over a
// selected POI, see showMilestone -- never on plain hover), is the
// day's own POIs as `{ poi, index }` pairs, appended below a rule so the
// signpost also reads as "here's everything else this day passes".
// Shared option shape for every plain-hover trip/track tooltip (see
// showHoverTooltip call sites here and in clusters.js) -- only the vertical
// offset and stickiness actually differ per marker/line shape.
export function trackTooltipOpts(offsetY, sticky) {
  const opts = { direction: "top", offset: [0, offsetY], className: "trip-marker-tooltip-wrap" };
  if (sticky) opts.sticky = true;
  return opts;
}

export function tripMarkerTooltipHtml(trip, dayNumber, dateIso, activity, poiList) {
  const iconSrc = ACTIVITY_ICON[activity];
  const label = ACTIVITY_LABELS[activity] || activity;
  const realDay = realDayNumber(trip.summary.start_t, dateIso);
  const poiListHtml = poiList && poiList.length ? `
    <div class="tmt-poi-list">
      ${poiList.map(({ poi, index }) => `
        <div class="tmt-poi${index === state.selectedPoiIndex ? " tmt-poi-selected" : ""}">
          <span class="tmt-poi-icon">${poiIconHtml(poi)}</span><span class="tmt-poi-name">${poi.name || "(senza nome)"}</span>
        </div>`).join("")}
    </div>` : "";
  return `<div class="trip-marker-tooltip" style="--marker-color:${trip._color}">
    <div class="tmt-trip">${trip.name}</div>
    <div class="tmt-day">Giorno ${toRoman(realDay != null ? realDay : dayNumber)}</div>
    <div class="tmt-date">${fmtDate(dateIso)}</div>
    <div class="tmt-activity">${iconSrc ? `<img class="tmt-icon" src="${iconSrc}">` : ""}<span>${label}</span></div>
    ${poiListHtml}
  </div>`;
}

// Every trip/track/marker hover tooltip on the map shares this single
// L.tooltip instance instead of each layer binding its own -- with dozens
// of colored track segments all bound separately, moving the mouse across
// segment boundaries could leave the previous segment's tooltip fading out
// while the next one fades in, showing a visible ghost/trace. Reusing one
// instance and just repositioning + rewriting its content sidesteps that.
const HOVER_TOOLTIP_CLOSE_DELAY_MS = 100;
const HOVER_TOOLTIP_FADE_MS = 100;

function clearHoverTooltipTimers() {
  if (state.hoverTooltipCloseTimer) { clearTimeout(state.hoverTooltipCloseTimer); state.hoverTooltipCloseTimer = null; }
  if (state.hoverTooltipRemoveTimer) { clearTimeout(state.hoverTooltipRemoveTimer); state.hoverTooltipRemoveTimer = null; }
}
export function showHoverTooltip(latlng, html, opts) {
  // Cancel any pending close/fade from a moment ago -- e.g. crossing straight
  // from one track segment into the next shouldn't restart the tooltip.
  clearHoverTooltipTimers();
  state.hoverTooltipAnchor = latlng;
  if (!state.hoverTooltip) {
    state.hoverTooltip = L.tooltip(opts).setLatLng(latlng).setContent(html);
    state.hoverTooltip.addTo(state.map);
  } else {
    state.hoverTooltip.options.direction = opts.direction;
    state.hoverTooltip.options.offset = opts.offset;
    state.hoverTooltip.options.sticky = !!opts.sticky;
    state.hoverTooltip.setContent(html);
    state.hoverTooltip.setLatLng(latlng);
    if (!state.map.hasLayer(state.hoverTooltip)) state.hoverTooltip.addTo(state.map);
  }
  state.hoverTooltipFading = false;
  // Leaflet's own tooltip default (0.9) gets reasserted on every addTo(),
  // so force it back to fully opaque rather than relying on CSS to win
  // against that inline style.
  state.hoverTooltip.setOpacity(1);
}
export function moveHoverTooltip(latlng) {
  // Once the fade-out has started the tooltip is on its way out, so it
  // should hold still rather than hop to wherever the mouse ends up next.
  if (state.hoverTooltip && !state.hoverTooltipFading) {
    state.hoverTooltip.setLatLng(latlng);
  }
}
export function hideHoverTooltip() {
  if (!state.hoverTooltip) return;
  clearHoverTooltipTimers();
  state.hoverTooltipCloseTimer = setTimeout(() => {
    state.hoverTooltipFading = true;
    state.hoverTooltip.setOpacity(0);
    state.hoverTooltipRemoveTimer = setTimeout(() => {
      state.map.removeLayer(state.hoverTooltip);
    }, HOVER_TOOLTIP_FADE_MS);
  }, HOVER_TOOLTIP_CLOSE_DELAY_MS);
}

// Virtual track id for a track's start-dot companion (see buildStartDotLayers).
export function startDotId(trackId) {
  return trackId + "-start";
}

// A plain dot at every track's own start (including day 1's, unlike the
// per-day activity-start cluster markers above, which skip day 1) -- built
// as a degenerate one-point "track" (both endpoints the same latlng) fed
// through the exact same casing+colored-line styling as any real track, so
// a round line cap renders it as a dot with no dot-specific styling code.
// Registered in state.dayLayers like any other track so dimming picks it up
// for free (see dimmedTrackIds); non-interactive since it's purely a visual
// anchor, not a hoverable/clickable day.
export function buildStartDotLayers(trip, track) {
  const p = track.points[0];
  const latlngs = [[p.lat, p.lon], [p.lat, p.lon]];
  const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 1, interactive: false });
  const line = L.polyline(latlngs, { color: trip._color, weight: TRACK_WEIGHT, opacity: 1, interactive: false });
  line._trackLineWeight = TRACK_WEIGHT;
  return { day: L.layerGroup([casing, line]), mainLine: line, segmentGroups: {} };
}

export function showHoverMarker(lat, lon) {
  if (!state.hoverMarker) {
    state.hoverMarker = L.circleMarker([lat, lon], {
      pane: "hoverPointPane", interactive: false,
      radius: 6, color: "#fbf4e5", weight: 2, fillColor: "#d79a1e", fillOpacity: 1,
    }).addTo(state.map);
  } else {
    state.hoverMarker.setLatLng([lat, lon]);
    if (!state.map.hasLayer(state.hoverMarker)) state.hoverMarker.addTo(state.map);
  }
}
export function clearMapHover() {
  if (state.hoverMarker) state.map.removeLayer(state.hoverMarker);
}
