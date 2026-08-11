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
// MapLibre's WebGL hit-testing (unlike Leaflet's SVG picking) handles a
// literal `line-opacity: 0` line correctly, so no opaque-color-faded-by-
// element-opacity workaround is needed here.
const TRACK_HIT_WEIGHT = 40;

// The currently-charted track(s) -- the whole trip, or just one selected
// day -- get an extra-wide white halo, rendered on the "tracks-halo" layer,
// the bottom-most of our own layers, so it always sits below every
// track/casing regardless of add order. Hovering any other track reuses the
// exact same halo treatment, just for whichever track is under the cursor
// instead of the persistent selection.
const SELECTION_HIGHLIGHT_WEIGHT = TRACK_CASING_WEIGHT + 4;

// Once something is charted (a trip or a single day selected), every other
// track fades to this opacity so the selected one visually pops -- at the
// "all trips" level (nothing charted yet) everything stays at full opacity.
const DIMMED_TRACK_OPACITY = 0.4;
const FULL_TRACK_OPACITY = 1;

// ---- MapLibre basemap/overlay descriptors ----
//
// Every BASEMAPS/OVERLAYS entry is a factory `(id) => descriptor |
// Promise<descriptor>`, where `descriptor` is `{ sources, layers, sprite?,
// glyphs? }` -- a small fragment of a MapLibre style, keyed by the caller's
// own `id` so it can be added/removed as a unit without ever touching
// `map.setStyle()` (which would wipe every other source/layer -- tracks,
// halos, markers -- since it replaces the whole style document). See
// buildLayerSwitcher for how these get activated/torn down.

// Leaflet's `{s}` subdomain-sharding placeholder has no MapLibre
// equivalent -- a raster source's own `tiles` array is round-robined the
// same way, so `{s}` is expanded into one explicit URL per subdomain
// letter instead. Every provider here that uses `{s}` relies on Leaflet's
// own default subdomains ('abc'); none pass an explicit `subdomains`
// option, so that default is hardcoded here too.
function subdomainTiles(url, subdomains = "abc") {
  return url.includes("{s}") ? [...subdomains].map(s => url.replace("{s}", s)) : [url];
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

// Every basemap/overlay raster entry goes through this instead of calling
// L.tileLayer directly. The `{r}` retina placeholder (CartoDB's `retina:
// true` entries) is simply blanked out -- MapLibre has no built-in
// `detectRetina` equivalent, and none of the other providers expose a real
// retina asset worth the effort of reimplementing Leaflet's zoom-level
// fallback for. Leaflet's own tileerror-retry-once behavior (transient
// 502s from small single-origin tile hosts) also has no direct MapLibre
// hook and isn't reimplemented here.
function tileLayer(url, options, { retina = false } = {}) {
  return (id) => ({
    sources: {
      [id]: {
        type: "raster",
        tiles: subdomainTiles(url).map(u => u.replace("{r}", retina ? "@2x" : "")),
        tileSize: 256,
        attribution: options.attribution,
        maxzoom: options.maxZoom,
      },
    },
    layers: [{ id, type: "raster", source: id }],
  });
}

// A handful of Esri basemaps only ship as two separate tile services -- a
// plain "Base" and a transparent "Reference" carrying just labels/borders
// on top of it -- with no combined single-URL version. Becomes two raster
// sources + two raster layers (instead of one Leaflet L.layerGroup);
// MapLibre's AttributionControl dedupes attribution text per-source the
// same way Leaflet's did per-layer.
function layerPair(baseUrl, baseOptions, refUrl, refOptions) {
  return (id) => {
    const baseId = `${id}-base`, refId = `${id}-ref`;
    return {
      sources: {
        [baseId]: { type: "raster", tiles: subdomainTiles(baseUrl), tileSize: 256, attribution: baseOptions.attribution, maxzoom: baseOptions.maxZoom },
        [refId]: { type: "raster", tiles: subdomainTiles(refUrl), tileSize: 256, attribution: refOptions.attribution, maxzoom: refOptions.maxZoom },
      },
      layers: [
        { id: baseId, type: "raster", source: baseId },
        { id: refId, type: "raster", source: refId },
      ],
    };
  };
}

// A full vector basemap, given as a style.json URL (OpenFreeMap/VersaTiles
// -- see TODO-map-tiles.md) -- fetched once and cached, then its own
// `sources`/`layers` are taken verbatim, just with every source id and
// layer id prefixed with the caller's own `id` (and every layer's `source`
// reference rewritten to match) so two different vector styles can never
// collide even if they happen to reuse a generic source name like
// "openmaptiles" -- they're never actually active as basemaps at the same
// time (mutually exclusive radio pick), but this keeps add/remove
// bookkeeping unambiguous either way. `sprite`/`glyphs` are style-wide
// properties with no per-layer equivalent -- applied via MapLibre's
// setSprite()/setGlyphs() by the caller once this descriptor is returned.
function vectorStyleBasemap(styleUrl) {
  let cached = null;
  return (id) => {
    if (!cached) cached = fetch(styleUrl).then(r => r.json());
    return cached.then(style => {
      const sourceIdMap = {};
      const sources = {};
      for (const [srcId, srcDef] of Object.entries(style.sources || {})) {
        const newId = `${id}__${srcId}`;
        sourceIdMap[srcId] = newId;
        sources[newId] = srcDef;
      }
      const layers = (style.layers || []).map(layer => {
        const newLayer = { ...layer, id: `${id}__${layer.id}` };
        if (newLayer.source) newLayer.source = sourceIdMap[newLayer.source] || newLayer.source;
        return newLayer;
      });
      return { sources, layers, sprite: style.sprite, glyphs: style.glyphs };
    });
  };
}

// initTrackLayers() (below) calls setMapLayerFloor() with the id of the
// bottom-most of our own layers ("tracks-halo") once the track layers
// exist -- every basemap/overlay layer added after that point is inserted
// *below* it instead of on top of the whole stack, so switching basemaps
// after tracks are loaded can't bury them. Before that (nothing else on the
// map yet), undefined just means "add at the top", which is equivalent
// since basemaps are the only layers that exist.
export let mapLayerFloor = null;
export function setMapLayerFloor(layerId) { mapLayerFloor = layerId; }

async function addDescriptorToMap(map, desc) {
  for (const [srcId, srcDef] of Object.entries(desc.sources || {})) {
    if (!map.getSource(srcId)) map.addSource(srcId, srcDef);
  }
  for (const layerDef of desc.layers || []) {
    if (!map.getLayer(layerDef.id)) map.addLayer(layerDef, mapLayerFloor || undefined);
  }
  // Map-wide, not per-layer -- fine here since only one vector basemap is
  // ever active at a time (see vectorStyleBasemap's comment above).
  if (desc.sprite) map.setSprite(desc.sprite);
  if (desc.glyphs) map.setGlyphs(desc.glyphs);
}

function removeDescriptorFromMap(map, desc) {
  // Layers referencing a source must go before the source itself.
  for (const layerDef of desc.layers || []) {
    if (map.getLayer(layerDef.id)) map.removeLayer(layerDef.id);
  }
  for (const srcId of Object.keys(desc.sources || {})) {
    if (map.getSource(srcId)) map.removeSource(srcId);
  }
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
  "OpenFreeMap Bright": "Stile vettoriale chiaro e colorato, gratuito e senza chiave API",
  "OpenFreeMap Dark": "Stile vettoriale scuro, gratuito e senza chiave API",
  "OpenFreeMap Liberty": "Stile vettoriale in stile OSM Liberty, gratuito e senza chiave API",
  "OpenFreeMap Positron": "Stile vettoriale minimale e chiaro, gratuito e senza chiave API",
  "OPNVKarte": "Pensato per il trasporto pubblico (linee e fermate)",
  "OpenHikingMap": "Pensato per l'escursionismo, evidenzia sentieri e rifugi",
  "OpenStreetMap": "Lo stile standard di OpenStreetMap",
  "OpenTopoMap": "Topografico con curve di livello, ombreggiatura del rilievo",
  "Swisstopo": "Mappa topografica ufficiale svizzera, solo Svizzera",
  "Swisstopo SwissImage": "Ortofoto aerea ufficiale svizzera, solo Svizzera",
  "UtagawaMTB": "Pensato per la mountain bike, evidenzia sentieri e single-track",
  "VersaTiles Colorful": "Stile vettoriale colorato, licenza CC0",
  "VersaTiles Eclipse": "Stile vettoriale scuro, licenza CC0",
  "VersaTiles Graybeard": "Stile vettoriale in scala di grigi, licenza CC0",
  "VersaTiles Neutrino": "Stile vettoriale chiaro e minimale, licenza CC0",

  // "CartoDB Dark Matter (Labels Only)": "Solo le etichette di testo dello stile Dark Matter, trasparente",
  // "CartoDB Positron (Labels Only)": "Solo le etichette di testo dello stile Positron, trasparente",
  "CartoDB Labels": "Solo le etichette di testo dello stile Voyager, trasparente",
  "Esri Boundaries and Places": "Confini amministrativi e nomi di località, trasparente",
  "Esri Transportation": "Rete stradale, trasparente da sovrapporre a basi senza strade",
  "OpenRailwayMap": "Linee e stazioni ferroviarie",
  // "OpenSeaMap": "Segnali nautici e informazioni marittime",
  "OpenSnowMap": "Piste da sci e impianti di risalita",
  "OSM GPS Traces": "Densità delle tracce GPS registrate dalla comunità OpenStreetMap",
  "Waymarked Cycling": "Percorsi ciclabili segnalati",
  "Waymarked Hiking": "Sentieri escursionistici segnalati",
  "Waymarked MTB": "Percorsi per mountain bike segnalati",
  // "Waymarked Riding": "Percorsi per equitazione segnalati",
  // "Waymarked Skating": "Percorsi per pattinaggio in linea segnalati",
  "Waymarked Slopes": "Piste sciistiche e sport invernali segnalati",
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
  "OpenFreeMap Bright": vectorStyleBasemap("https://tiles.openfreemap.org/styles/bright"),
  "OpenFreeMap Dark": vectorStyleBasemap("https://tiles.openfreemap.org/styles/dark"),
  "OpenFreeMap Liberty": vectorStyleBasemap("https://tiles.openfreemap.org/styles/liberty"),
  "OpenFreeMap Positron": vectorStyleBasemap("https://tiles.openfreemap.org/styles/positron"),
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
  "VersaTiles Colorful": vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/colorful/style.json"),
  "VersaTiles Eclipse": vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/eclipse/style.json"),
  "VersaTiles Graybeard": vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/graybeard/style.json"),
  "VersaTiles Neutrino": vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/neutrino/style.json"),
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
  "Waymarked Cycling": tileLayer("https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  "Waymarked Hiking": tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  "Waymarked MTB": tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
  // "Waymarked Riding": tileLayer("https://tile.waymarkedtrails.org/riding/{z}/{x}/{y}.png", {
  //   maxZoom: 18,
  //   attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  // }),
  // "Waymarked Skating": tileLayer("https://tile.waymarkedtrails.org/skating/{z}/{x}/{y}.png", {
  //   maxZoom: 18,
  //   attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  // }),
  "Waymarked Slopes": tileLayer("https://tile.waymarkedtrails.org/slopes/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
  }),
};

export function initMap() {
  const map = new maplibregl.Map({
    container: "map",
    style: { version: 8, sources: {}, layers: [] },
    center: [11, 46],
    zoom: 10,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.AttributionControl({ compact: true }));
  buildLayerSwitcher(map, BASEMAPS, OVERLAYS, "Esri Satellite");
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
  "EOX Terrain": "altitude",
  "Esri NatGeo": "explore",
  "Esri Ocean": "water",
  "Esri Satellite": "satellite_alt",
  "Esri World Street": "pin_road",
  "Esri World Topo": "explore",
  "Freemap Outdoor": "hiking",
  "Humanitarian OSM": "map",
  "IGN France": "explore",
  "IGN France Ortho": "satellite_alt",
  "Maps-For-Free Relief": "altitude",
  "OpenFreeMap Bright": "map",
  "OpenFreeMap Dark": "map",
  "OpenFreeMap Liberty": "map",
  "OpenFreeMap Positron": "map",
  "OPNVKarte": "directions_bus",
  "OpenHikingMap": "hiking",
  "OpenStreetMap": "map",
  "OpenTopoMap": "explore",
  "Swisstopo": "explore",
  "Swisstopo SwissImage": "satellite_alt",
  "UtagawaMTB": "pedal_bike",
  "VersaTiles Colorful": "map",
  "VersaTiles Eclipse": "map",
  "VersaTiles Graybeard": "map",
  "VersaTiles Neutrino": "map",

  "CartoDB Labels": "edit_location_alt",
  "Esri Boundaries and Places": "edit_location_alt",
  "Esri Transportation": "directions_bus",
  "OpenRailwayMap": "directions_bus",
  "OpenSnowMap": "downhill_skiing",
  "OSM GPS Traces": "my_location",
  "Waymarked Cycling": "pedal_bike",
  "Waymarked Hiking": "hiking",
  "Waymarked MTB": "pedal_bike",
  "Waymarked Riding": "route",
  "Waymarked Slopes": "downhill_skiing",
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
function buildLayerSwitcher(map, basemapFactories, overlayFactories, defaultBase) {
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
      input.addEventListener("change", () => {
        Promise.resolve(onPick(name, input.checked)).catch(err => console.error(`layer switch failed (${name})`, err));
      });
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

  // Each basemap/overlay factory is called lazily, only once actually
  // picked (unlike the old eager `BASEMAPS[name]()` for all ~30 entries up
  // front) -- its returned/resolved descriptor is kept here just long
  // enough to remove exactly what was added, by id, on the next switch.
  let activeBaseName = null;
  let activeBaseDesc = null;
  const activateBasemap = async (name) => {
    const desc = await basemapFactories[name](slug(`bm-${name}`));
    if (activeBaseDesc) removeDescriptorFromMap(map, activeBaseDesc);
    await addDescriptorToMap(map, desc);
    activeBaseName = name;
    activeBaseDesc = desc;
  };

  const activeOverlayDescs = new Map();
  const activateOverlay = async (name) => {
    const desc = await overlayFactories[name](slug(`ov-${name}`));
    await addDescriptorToMap(map, desc);
    activeOverlayDescs.set(name, desc);
  };
  const deactivateOverlay = (name) => {
    const desc = activeOverlayDescs.get(name);
    if (desc) removeDescriptorFromMap(map, desc);
    activeOverlayDescs.delete(name);
  };

  const baseGroup = buildGroup("radio", SWITCHER_BUTTON_ICONS.base, "Mappa", basemapFactories, (name, checked) => {
    if (!checked || name === activeBaseName) return;
    return activateBasemap(name);
  });
  const overlayGroup = buildGroup("checkbox", SWITCHER_BUTTON_ICONS.overlay, "Overlay", overlayFactories, (name, checked) => {
    return checked ? activateOverlay(name) : deactivateOverlay(name);
  });
  root.append(baseGroup, overlayGroup);
  // Only clicking (not hovering) sets the "open" class -- so it needs its
  // own outside-click dismissal, matching how a click anywhere else in the
  // app closes other flyouts/menus.
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) closeAll(); });

  document.getElementById("mapWrap").appendChild(root);

  // addSource/addLayer throw if the map's own (initially empty) style
  // hasn't finished its own async setup yet.
  const activateDefault = () => activateBasemap(defaultBase).catch(err => console.error("initial basemap load failed", err));
  if (map.isStyleLoaded()) activateDefault();
  else map.once("load", activateDefault);
}

// ---- Map layers ----
//
// Every track (and each track's degenerate start-dot companion, see
// startDotId/buildStartDotLayers) is backed by plain data in
// state.dayLayers[trackId] -- points, trip color/activity, a precomputed
// bbox, and a lazily-built featuresByMode cache -- rendered through a
// small, fixed set of shared MapLibre sources/layers built once by
// initTrackLayers() rather than one Leaflet layer group per track. See
// initTrackLayers for the full source/layer stack and why it's shaped this
// way; the functions below are the render/update side of that model.

function pointsToLngLat(points) {
  return points.map(p => [p.lon, p.lat]);
}

function computeBounds(points) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  points.forEach(p => {
    if (p.lon < minLng) minLng = p.lon;
    if (p.lon > maxLng) maxLng = p.lon;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  });
  return [[minLng, minLat], [maxLng, maxLat]];
}

// Leaflet's dashArray is in raw pixels; MapLibre's line-dasharray is in
// units of the line's own width -- divide by TRACK_WEIGHT so the same
// pixel dash/gap length still results, at the weight every dashed line
// here actually renders at.
function toMapLibreDashArray(pxDash) {
  return pxDash.split(",").map(n => Number(n) / TRACK_WEIGHT);
}
// Activities with a real (non-solid) dash pattern -- each gets its own
// fixed-dasharray layer (see addCasingColorLayers) since line-dasharray
// isn't a data-driven style property in MapLibre. "touring" (and anything
// with no ACTIVITY_DASH entry, e.g. a start-dot's null activity) falls
// through to the plain solid layer instead.
const DASHED_ACTIVITIES = Object.entries(ACTIVITY_DASH).filter(([, dash]) => dash).map(([activity]) => activity);

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

// Adds a casing (optional) + solid-color + one-dash-per-activity set of
// line layers all reading `sourceId`, at the given weights -- shared by the
// dynamic "tracks-line" source (the normal per-mode coloring, no casing of
// its own since that's always the static "tracks-casing" source
// underneath) and the two "bring to front" overlay sources below (which DO
// need their own casing, since they have to repaint a track's full look on
// top of whatever it's crossing). Every feature on these sources carries a
// `role` ("casing" or "color") so a source that mixes both (the overlays)
// can't have its casing-styled layer accidentally paint a color feature
// solid white.
function addCasingColorLayers(map, sourceId, { casingWeight, colorWeight, includeCasing }) {
  if (includeCasing) {
    map.addLayer({
      id: `${sourceId}-casing`, type: "line", source: sourceId,
      filter: ["==", ["get", "role"], "casing"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f7f2e4", "line-width": casingWeight },
    });
  }
  map.addLayer({
    id: `${sourceId}-solid`, type: "line", source: sourceId,
    filter: ["all", ["==", ["get", "role"], "color"], ["!in", ["get", "activity"], ["literal", DASHED_ACTIVITIES]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": colorWeight },
  });
  DASHED_ACTIVITIES.forEach(activity => {
    map.addLayer({
      id: `${sourceId}-dash-${activity}`, type: "line", source: sourceId,
      filter: ["all", ["==", ["get", "role"], "color"], ["==", ["get", "activity"], activity]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": colorWeight, "line-dasharray": toMapLibreDashArray(ACTIVITY_DASH[activity]) },
    });
  });
}
// Layer ids that get dimmed (see updateTrackDimming) -- the base
// casing+color layers only, never the "always on top" overlay layers
// (which by construction only ever contain full-opacity, kept-visible
// tracks) and never the invisible hit layer.
const TRACKS_DIM_LAYER_IDS = ["tracks-casing", "tracks-line-solid", ...DASHED_ACTIVITIES.map(a => `tracks-line-dash-${a}`)];

// Builds and adds every MapLibre source/layer backing track rendering, in
// bottom-to-top order, from the now-fully-populated state.dayLayers (called
// once from app.js after both the real-track and start-dot build passes).
// Order, bottom to top:
//  1. tracks-halo -- persistent/hover selection glow, always fully behind
//     every track/casing (see renderSelectionHalo) -- the bottom-most of
//     our own layers, so setMapLayerFloor() locks basemap switches below it.
//  2. tracks-casing (+ tracks-hit reading the same source) -- one static
//     whole-track casing feature per track/start-dot, built once and never
//     rebuilt (casing color never varies by mode, so there's nothing to
//     rebuild): the old per-run casing was only ever needed to dodge a
//     Leaflet-SVG-specific stacking notch at run joints, which doesn't
//     exist here. tracks-hit reads the same geometry, invisible and wide,
//     filtered to exclude start-dots (non-interactive, matching the old
//     `interactive:false`).
//  3. tracks-line -- the actual per-mode coloring (trip/surface/highway/
//     gradient/altimetry), rebuilt via setData whenever any track's mode
//     changes (see rebuildColorSource/applyColorMode).
//  4. tracks-overlay-trip -- a duplicate casing+color repaint of just the
//     active trip's own tracks (dimmedTrackIds()), so the whole trip visibly
//     wins over whatever unrelated (now-dimmed) track it crosses.
//  5. tracks-overlay-selected -- same idea, for whichever track(s) are
//     actually selected/hovered right now (highlightedTrackIds()), at
//     SELECTED_TRACK_WEIGHT instead of the normal weight, stacked above
//     tracks-overlay-trip so it wins when both apply.
//  6. tracks-legend-select -- the Esplora-dati legend's click-to-highlight
//     overlay (see setLegendSelectSegments, called from chart.js).
//  7. tracks-hover-point -- the elevation-chart-synced hover dot (see
//     showHoverMarker), topmost of our own canvas layers.
// MapLibre can't addSource/addLayer until the map's own style has finished
// its (async, even for the empty inline style initMap starts with) load --
// returns a promise so app.js can await this before touching any of the
// sources built here (rebuildColorSource, applyColorMode, etc. all assume
// they already exist).
export function initTrackLayers() {
  const map = state.map;
  return new Promise((resolve) => {
    const build = () => { buildTrackLayers(map); resolve(); };
    if (map.isStyleLoaded()) build();
    else map.once("load", build);
  });
}

function buildTrackLayers(map) {
  const trackIds = Object.keys(state.dayLayers);

  map.addSource("tracks-halo", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "tracks-halo", type: "line", source: "tracks-halo",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": SELECTION_HIGHLIGHT_WEIGHT },
  });
  setMapLayerFloor("tracks-halo");

  const casingFeatures = trackIds.map(casingFeature).filter(Boolean);
  map.addSource("tracks-casing", { type: "geojson", data: { type: "FeatureCollection", features: casingFeatures } });
  map.addLayer({
    id: "tracks-casing", type: "line", source: "tracks-casing",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#f7f2e4", "line-width": TRACK_CASING_WEIGHT },
  });
  map.addLayer({
    id: "tracks-hit", type: "line", source: "tracks-casing",
    filter: ["!=", ["get", "isStartDot"], true],
    paint: { "line-color": "#000000", "line-opacity": 0, "line-width": TRACK_HIT_WEIGHT },
  });

  map.addSource("tracks-line", { type: "geojson", data: emptyFeatureCollection() });
  addCasingColorLayers(map, "tracks-line", { colorWeight: TRACK_WEIGHT, includeCasing: false });

  map.addSource("tracks-overlay-trip", { type: "geojson", data: emptyFeatureCollection() });
  addCasingColorLayers(map, "tracks-overlay-trip", { casingWeight: TRACK_CASING_WEIGHT, colorWeight: TRACK_WEIGHT, includeCasing: true });

  map.addSource("tracks-overlay-selected", { type: "geojson", data: emptyFeatureCollection() });
  addCasingColorLayers(map, "tracks-overlay-selected", { casingWeight: TRACK_CASING_WEIGHT, colorWeight: SELECTED_TRACK_WEIGHT, includeCasing: true });

  map.addSource("tracks-legend-select", { type: "geojson", data: emptyFeatureCollection() });
  map.addLayer({
    id: "tracks-legend-select-halo", type: "line", source: "tracks-legend-select",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#f7f2e4", "line-width": LEGEND_HIGHLIGHT_HALO_WIDTH },
  });
  map.addLayer({
    id: "tracks-legend-select-color", type: "line", source: "tracks-legend-select",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": LEGEND_HIGHLIGHT_WIDTH },
  });

  map.addSource("tracks-hover-point", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] } } });
  map.addLayer({
    id: "tracks-hover-point", type: "circle", source: "tracks-hover-point",
    layout: { visibility: "none" },
    paint: { "circle-radius": 6, "circle-color": "#d79a1e", "circle-stroke-color": "#fbf4e5", "circle-stroke-width": 2 },
  });

  rebuildColorSource();
  setupTrackEventHandlers(map);
  // The hover tooltip is a plain absolutely-positioned DOM div (see
  // showHoverTooltip), not a MapLibre Marker/Popup that repositions itself
  // automatically -- without this it would visually drift off its anchor
  // point during any pan/zoom/rotate that happens while it's shown (e.g.
  // scroll-zooming with the cursor still resting on a track).
  map.on("move", () => {
    if (state.hoverTooltipEl && state.hoverTooltipAnchor && !state.hoverTooltipFading) {
      positionHoverTooltip(state.hoverTooltipAnchor, state.hoverTooltipOpts || {});
    }
    if (state.poiSignTooltipEl && state.poiSignTooltipAnchor) {
      positionTooltipEl(state.poiSignTooltipEl, state.poiSignTooltipAnchor, state.poiSignTooltipOpts || {});
    }
  });
}

// Shared by the map (buildRunModeFeatures) and the elevation chart
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

// The single whole-track feature every track shows in "trip" mode --
// solid trip color, dashed by activity (start-dots get a null activity, so
// they always fall through to the plain solid layer, matching the old
// undashed start-dot rendering).
function buildTripModeFeatures(trackId) {
  const d = state.dayLayers[trackId];
  return [{
    type: "Feature",
    properties: { trackId, tripId: d.tripId, role: "color", color: d.tripColor, activity: d.isStartDot ? null : d.activity },
    geometry: { type: "LineString", coordinates: pointsToLngLat(d.points) },
  }];
}

// Consecutive point-to-point segments sharing the same color are merged
// into one multi-point run/feature instead of one per pair -- a trip-wide
// coloring can otherwise mean thousands of individual features, which gets
// laggish fast. Color only changes where surface/highway/grade-bucket
// actually changes, so this is normally a small fraction of the raw point
// count. Only ever called for real tracks (start-dots never leave "trip"
// mode, see chartedTrackIds), so state.trackById[trackId] is always
// populated here.
function buildRunModeFeatures(trackId, mode) {
  const d = state.dayLayers[trackId];
  const { track } = state.trackById[trackId];
  const points = track.points;
  const grades = mode === "gradient" ? trackGradeSeries(track) : null;
  const surfaces = mode === "surface" ? trackCategorySeries(track, "surface") : null;
  const highways = mode === "highway" ? trackCategorySeries(track, "highway") : null;
  const colorAt = (i) => segmentColorForMode(
    mode,
    surfaces ? surfaces[i] : undefined,
    highways ? highways[i] : undefined,
    grades ? grades[i] : undefined,
    mode === "altimetry" ? points[i].ele : undefined
  );
  const runs = [];
  for (let i = 1; i < points.length; i++) {
    const color = colorAt(i - 1);
    const run = runs[runs.length - 1];
    if (run && run.color === color) run.end = i;
    else runs.push({ color, start: i - 1, end: i });
  }
  return runs.map(run => ({
    type: "Feature",
    properties: { trackId, tripId: d.tripId, role: "color", color: run.color, activity: null },
    geometry: { type: "LineString", coordinates: pointsToLngLat(points.slice(run.start, run.end + 1)) },
  }));
}

// This track/start-dot's static casing feature -- same geometry backs both
// the always-on "tracks-casing" layer and (duplicated in) whichever
// overlay source currently needs to repaint this track on top.
function casingFeature(trackId) {
  const d = state.dayLayers[trackId];
  if (!d) return null;
  return {
    type: "Feature",
    properties: { trackId, role: "casing", isStartDot: !!d.isStartDot },
    geometry: { type: "LineString", coordinates: pointsToLngLat(d.points) },
  };
}

function haloFeature(trackId) {
  const d = state.dayLayers[trackId];
  if (!d) return null;
  return {
    type: "Feature",
    properties: { trackId },
    geometry: { type: "LineString", coordinates: pointsToLngLat(d.points) },
  };
}

// Lazily builds (and caches) the given mode's feature array for one track
// -- the direct replacement for the old per-mode Leaflet layer group.
export function groupForMode(trackId, mode) {
  const layers = state.dayLayers[trackId];
  if (!layers.featuresByMode[mode]) {
    layers.featuresByMode[mode] = mode === "trip" ? buildTripModeFeatures(trackId) : buildRunModeFeatures(trackId, mode);
  }
  return layers.featuresByMode[mode];
}

// Which color-mode a track is actually showing on the map right now.
// Defaults to "trip" -- the mode every track starts in at load -- since a
// track only ever gets switched to the surface/highway/gradient coloring
// while it's part of the current charted selection (see applyColorMode).
export function currentModeForTrack(trackId) {
  const layers = state.dayLayers[trackId];
  return (layers && layers._currentMode) || "trip";
}

// Rebuilds the shared "tracks-line" source from every track's current mode
// -- called once at initial load and every time applyColorMode changes any
// track's mode.
function rebuildColorSource() {
  const features = [];
  Object.keys(state.dayLayers).forEach(trackId => {
    features.push(...groupForMode(trackId, currentModeForTrack(trackId)));
  });
  state.map.getSource("tracks-line").setData({ type: "FeatureCollection", features });
}

// Casing + current-mode color features for the given track ids, in one
// array -- the content of whichever "bring to front" overlay source needs
// to repaint them (see tracks-overlay-trip/tracks-overlay-selected).
function overlayFeaturesFor(ids) {
  const features = [];
  ids.forEach(trackId => {
    const c = casingFeature(trackId);
    if (c) features.push(c);
    features.push(...groupForMode(trackId, currentModeForTrack(trackId)));
  });
  return features;
}
function renderOverlayTrip() {
  state.map.getSource("tracks-overlay-trip").setData({ type: "FeatureCollection", features: overlayFeaturesFor(dimmedTrackIds()) });
}
function renderOverlaySelected() {
  state.map.getSource("tracks-overlay-selected").setData({ type: "FeatureCollection", features: overlayFeaturesFor(highlightedTrackIds()) });
}

// Only the charted track(s) (see chartedTrackIds -- the selected day, or
// every day of the selected trip if no single day is picked) ever show the
// surface/highway/gradient coloring; every other track always stays in its
// own trip's identity color, no matter what "Colora tracce per" is set to.
export function applyColorMode() {
  const chartedIds = new Set(chartedTrackIds());
  Object.keys(state.dayLayers).forEach(trackId => {
    state.dayLayers[trackId]._currentMode = chartedIds.has(trackId) ? state.colorMode : "trip";
  });
  rebuildColorSource();
  // The persistent halo/weight-5 treatment only shows for a non-"Tracce"
  // coloring (see persistentHaloTrackIds) -- switching modes can turn it on
  // or off on its own, with no other selection change to trigger it.
  renderSelectionHalo(persistentHaloTrackIds());
  updateTrackDimming();
}

export function fitBoundsForTracks(tracks) {
  let bounds = null;
  tracks.forEach(track => {
    const layers = state.dayLayers[track.id];
    if (!layers) return;
    const b = new maplibregl.LngLatBounds(layers.bounds[0], layers.bounds[1]);
    bounds = bounds ? bounds.extend(b) : b;
  });
  if (!bounds) return;
  state.map.fitBounds(bounds, { padding: 30 });
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

// Rebuilds the "tracks-halo" source's content to exactly the given track
// ids -- shared by the persistent selection halo and every hover-highlight
// variant below.
function renderSelectionHalo(ids) {
  const features = ids.map(haloFeature).filter(Boolean);
  state.map.getSource("tracks-halo").setData({ type: "FeatureCollection", features });
}

export function updateSelectionHighlight() {
  renderSelectionHalo(persistentHaloTrackIds());
  // A click that changes the selection can fire while the cursor is still
  // sitting on the hit-line it just selected -- clear any stale hover
  // halo so it doesn't linger under/alongside the new selection halo.
  clearTrackHoverHighlight();
  updateTrackDimming();
}

// Which track id(s) currently get the "selected" weight-5/on-top treatment
// -- normally every charted track (see chartedTrackIds), but while
// hovering a track of the active trip, narrowed down to just the hovered
// one (see showTrackHoverHighlight); while hovering a different trip
// entirely, widened to every one of *its* tracks instead (see
// showTripHoverHighlight) -- either way the hovered thing always gets the
// same weight-5/on-top treatment the persistent selection itself would.
function highlightedTrackIds() {
  if (state.hoveredTrackId) return [state.hoveredTrackId];
  if (state.hoveredTripId) return state.tripById[state.hoveredTripId].tracks.map(t => t.id);
  return persistentHaloTrackIds();
}

// What the halo (tracks-halo source) should show right now: hovering one
// of the active trip's own tracks *narrows* the persistent halo down to
// just that track (matching highlightedTrackIds' own narrowing, since
// there's a real persistent selection to narrow from); hovering a
// *different* trip's track only ever *adds* a preview halo for that trip's
// tracks on top of whatever persistent halo already exists, since there's
// no persistent selection at that level to narrow -- see
// showTrackHoverHighlight/showTripHoverHighlight for which case is which.
function currentHaloIds() {
  if (state.hoveredTrackId) return [state.hoveredTrackId];
  if (state.hoveredTripId) return [...persistentHaloTrackIds(), ...state.tripById[state.hoveredTripId].tracks.map(t => t.id)];
  return persistentHaloTrackIds();
}

// Once a trip is active, every track outside it fades out so the active
// trip pops against the rest of the map -- applies to whichever
// color-mode is currently shown for each track, casing included, so
// dimming stays correct across "Colora tracce per" switches too. Picking a
// specific day within the trip only narrows the halo/color-mode (see
// chartedTrackIds), not the dimming: the rest of that trip's tracks stay
// at full opacity too.
export function updateTrackDimming() {
  const dimmedIds = dimmedTrackIds();
  const dimActive = dimmedIds.length > 0;
  const opacityExpr = dimActive
    ? ["case", ["in", ["get", "trackId"], ["literal", dimmedIds]], FULL_TRACK_OPACITY, DIMMED_TRACK_OPACITY]
    : FULL_TRACK_OPACITY;
  TRACKS_DIM_LAYER_IDS.forEach(id => state.map.setPaintProperty(id, "line-opacity", opacityExpr));
  // The whole active trip repaints on top of the (now-dimmed) rest of the
  // map via tracks-overlay-trip; whichever track is actually
  // selected/hovered repaints highest of all, at the thicker weight, via
  // tracks-overlay-selected -- together the direct replacement for the old
  // bringTrackToFront-based DOM reordering, since MapLibre has no
  // per-feature draw order within a single layer to reorder.
  renderOverlayTrip();
  renderOverlaySelected();
}

// A trip's tracks are always drawn oldest-day-on-top (so a later/further
// day's line never buries the earlier one where they overlap). Returns
// tracks in bottom-to-top drawing order (last element ends up on top).
// Still used by app.js to decide build/registration order; the tracks
// themselves no longer have any real draw-order to control beyond that
// (see updateTrackDimming) since MapLibre draws per-layer, not per-feature.
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

// Pure rank math -- callers apply the result themselves via
// `marker.getElement().style.zIndex = String(offset)` (there's no
// `zIndexOffset` marker option on `maplibregl.Marker`, unlike Leaflet's).
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

// Transient per-track halo shown only while hovering that track -- exactly
// the persistent selection's look, just cleared on mouseout instead of
// sticking around. Always the active trip's own track (see
// setupTrackEventHandlers/clusters.js's isActiveTrip() branch) -- narrows
// the persistent selection halo/weight down to just the hovered track,
// whether or not a specific day was already picked, so the rest of the
// trip visibly steps back and the hovered day gets the same weight-5
// treatment the real selection would.
export function showTrackHoverHighlight(trackId) {
  state.hoveredTrackId = trackId;
  renderSelectionHalo(currentHaloIds());
  updateTrackDimming();
}
// Same, but for every track of a whole trip at once -- used when hovering
// a track that isn't (yet) the active trip's own, so the halo *and*
// weight-5 line previews "clicking this selects the trip" rather than
// pretending to single out just the one day under the cursor. Unlike
// showTrackHoverHighlight, this never narrows/replaces the persistent
// selection halo (there's no "this trip's own selection" to narrow from at
// this level) -- see currentHaloIds.
export function showTripHoverHighlight(tripId) {
  state.hoveredTripId = tripId;
  renderSelectionHalo(currentHaloIds());
  updateTrackDimming();
}
export function clearTrackHoverHighlight() {
  state.hoveredTrackId = null;
  state.hoveredTripId = null;
  renderSelectionHalo(currentHaloIds());
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

// Builds the plain DOM element a MapLibre `maplibregl.Marker` needs,
// replacing Leaflet's `L.divIcon` -- `iconAnchor` (the point of the icon
// that lands on the marker's own lngLat, same convention Leaflet used) is
// applied as a Marker `offset` paired with `anchor:"top-left"` by every
// call site below and in clusters.js; `iconSize` is set as an explicit
// inline width/height since MapLibre, unlike `L.divIcon`, doesn't size the
// element for you.
export function buildMarkerIcon({ className, html, iconSize, iconAnchor }) {
  const element = document.createElement("div");
  element.className = className;
  element.innerHTML = html;
  element.style.width = `${iconSize[0]}px`;
  element.style.height = `${iconSize[1]}px`;
  return { element, offset: [-iconAnchor[0], -iconAnchor[1]] };
}

// One icon per POI, created once and never swapped: rebuilding a marker's
// element on every change can desync hover listeners from the new node and
// leave a pin stuck open. Instead both the resting dot and the full
// signpost pin are always in the DOM, and a "highlighted" CSS class on the
// (stable) icon element -- set when opened -- decides which one is visible.
export function poiMarkerIcon(poi, color) {
  const glyph = poiIconHtml(poi);
  return buildMarkerIcon({
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
  });
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
  return buildMarkerIcon({
    // Hover/click listeners live on this outer icon element (fixed at
    // iconSize, never transformed) rather than on the inner
    // `.trip-marker-triangle`/`.trip-marker-square`/`.trip-marker-ring`
    // div it wraps -- see the CSS ":hover" rules keyed off
    // "trip-marker-hit" for why that separation matters.
    className: "trip-marker-hit",
    html: `<div class="trip-marker ${shapeClass}" style="--marker-color:${color}">${inner}${poiBadge}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
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

// ---- Track hover -> tooltip + chart sync, and click -> drill down ----
//
// One delegated set of handlers on the shared "tracks-hit" layer, wired
// once from initTrackLayers, replaces the old per-track Leaflet listener
// bindings (attachTrackHandlers) -- MapLibre only fires one mousemove/click
// per *layer*, not per feature, so state.hoveredHitTrackId tracks "which
// feature is the cursor currently over" by hand, the same job Leaflet's
// per-object mouseover/mouseout used to do for free.
//
// Which level hover/click act on follows the trip that's currently active
// (if any), not just the track's own trip: for the active trip's own
// tracks, hovering/clicking always targets that specific track/day -- it's
// the one already drilled into, so there's nowhere shallower to go. For
// every other track -- including any/all of them at the "all trips" level,
// where no trip is active yet -- hovering/clicking targets the whole trip
// instead, since jumping straight to one of its days would skip the trip
// overview entirely.

// Shared by every hoverable track surface -- the map hit-line (below) and
// the start/end trip markers (clusters.js) -- so "hovering this track
// previews/confirms its selection halo and shows its day tooltip" is
// implemented exactly once. Either `trackId` (narrows the halo to just
// this track) or `tripId` (previews the whole trip) is given, matching
// showTrackHoverHighlight/showTripHoverHighlight's own split.
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

function setupTrackEventHandlers(map) {
  const isActiveTrip = (tripId) => state.activeTripId === tripId;
  // mousemove fires far more often than the screen can repaint, and the
  // handler's own work (re-syncing the elevation chart's active point,
  // which triggers a full Chart.js redraw) is too heavy to redo on every
  // single event -- doing so made the tooltip visibly lag behind the
  // cursor. Coalescing to one flush per animation frame keeps only the
  // latest position and matches the actual paint rate.
  let pendingLngLat = null, pendingCtx = null, rafScheduled = false;
  const flushMouseMove = () => {
    rafScheduled = false;
    if (!pendingLngLat) return;
    const lngLat = pendingLngLat, ctx = pendingCtx;
    pendingLngLat = null;
    perfMark("map.hitline.tooltip", () => moveHoverTooltip(closestPointOnPolyline(lngLat, ctx.track.points)));
    perfMark("map.hitline.onTrackHover", () => onTrackHover(ctx.trip, ctx.track, lngLat));
  };
  map.on("mouseenter", "tracks-hit", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "tracks-hit", () => {
    map.getCanvas().style.cursor = "";
    pendingLngLat = null;
    if (state.hoveredHitTrackId) {
      state.hoveredHitTrackId = null;
      endTrackHover();
      clearChartHover();
    }
  });
  map.on("mousemove", "tracks-hit", (e) => {
    const trackId = e.features[0].properties.trackId;
    const entry = state.trackById[trackId];
    if (!entry) return;
    const { trip, track } = entry;
    const lngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    if (state.hoveredHitTrackId !== trackId) {
      if (state.hoveredHitTrackId) { endTrackHover(); clearChartHover(); }
      state.hoveredHitTrackId = trackId;
      const tooltipHtml = tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity);
      const tooltipOpts = trackTooltipOpts(-10, true);
      beginTrackHover(closestPointOnPolyline(lngLat, track.points), tooltipHtml, tooltipOpts, isActiveTrip(trip.id) ? { trackId } : { tripId: trip.id });
    }
    pendingLngLat = lngLat;
    pendingCtx = { trip, track };
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushMouseMove);
    }
  });
  map.on("click", "tracks-hit", (e) => {
    const trackId = e.features[0].properties.trackId;
    const entry = state.trackById[trackId];
    if (!entry) return;
    const { trip, track } = entry;
    if (isActiveTrip(trip.id)) selectDay(trip.id, track.id, { recenter: false });
    else selectTrip(trip.id, { recenter: false });
  });
}

export function buildDayLayers(trip, track) {
  return {
    points: track.points,
    tripId: trip.id,
    tripColor: trip._color,
    activity: track.activity,
    isStartDot: false,
    bounds: computeBounds(track.points),
    featuresByMode: {},
    _currentMode: "trip",
  };
}

// Virtual track id for a track's start-dot companion (see buildStartDotLayers).
export function startDotId(trackId) {
  return trackId + "-start";
}

// A plain dot at every track's own start (including day 1's, unlike the
// per-day activity-start cluster markers above, which skip day 1) -- built
// as a degenerate one-point "track" (both endpoints the same point) fed
// through the exact same casing+colored-line styling as any real track, so
// a round line cap renders it as a dot with no dot-specific styling code.
// Registered in state.dayLayers like any other track so dimming picks it up
// for free (see dimmedTrackIds); isStartDot keeps it out of the hit layer
// (non-interactive, purely a visual anchor) and out of the dashed layers
// (always plain solid, see buildTripModeFeatures).
export function buildStartDotLayers(trip, track) {
  const p = track.points[0];
  const points = [p, p];
  return {
    points,
    tripId: trip.id,
    tripColor: trip._color,
    activity: track.activity,
    isStartDot: true,
    bounds: [[p.lon, p.lat], [p.lon, p.lat]],
    featuresByMode: {},
    _currentMode: "trip",
  };
}

// Every trip/track/marker hover tooltip on the map shares this single
// absolutely-positioned DOM div instead of each layer binding its own --
// with dozens of colored track segments all bound separately, moving the
// mouse across segment boundaries could leave the previous segment's
// tooltip fading out while the next one fades in, showing a visible
// ghost/trace. Reusing one instance and just repositioning + rewriting its
// content sidesteps that. Positioned via map.project() rather than a
// MapLibre Popup, which isn't designed for this high-frequency a
// reposition; kept deliberately minimal here (basic box styling inline,
// via .map-hover-tooltip in css/map-markers.css) -- the compound
// `.leaflet-tooltip.trip-marker-tooltip-wrap` rule still targets Leaflet's
// own tooltip DOM and needs retargeting/removing once Leaflet itself is
// gone (see the CSS-update phase of the migration plan).
const HOVER_TOOLTIP_CLOSE_DELAY_MS = 100;
const HOVER_TOOLTIP_FADE_MS = 100;

function clearHoverTooltipTimers() {
  if (state.hoverTooltipCloseTimer) { clearTimeout(state.hoverTooltipCloseTimer); state.hoverTooltipCloseTimer = null; }
  if (state.hoverTooltipRemoveTimer) { clearTimeout(state.hoverTooltipRemoveTimer); state.hoverTooltipRemoveTimer = null; }
}
function ensureHoverTooltipEl() {
  if (!state.hoverTooltipEl) {
    const el = document.createElement("div");
    el.className = "map-hover-tooltip";
    document.getElementById("mapWrap").appendChild(el);
    state.hoverTooltipEl = el;
  }
  return state.hoverTooltipEl;
}
// Shared by the transient hover tooltip above and the pinned POI-signpost
// tooltip below (see showPinnedTooltip) -- both are plain absolutely
// positioned divs anchored to a map lngLat via the same math, just with
// different show/hide lifecycles, so this is the one place that math lives.
function positionTooltipEl(el, latlng, opts) {
  if (!state.map) return;
  const p = state.map.project([latlng.lng, latlng.lat]);
  const offset = (opts && opts.offset) || [0, 0];
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  // Approximates Leaflet's direction:"top" (every call site in this app
  // uses "top") -- anchors the box's bottom-center at the point, nudged by
  // the caller's own offset.
  el.style.transform = `translate(calc(-50% + ${offset[0]}px), calc(-100% + ${offset[1]}px))`;
}
function positionHoverTooltip(latlng, opts) {
  if (state.hoverTooltipEl) positionTooltipEl(state.hoverTooltipEl, latlng, opts);
}
export function showHoverTooltip(latlng, html, opts) {
  // Cancel any pending close/fade from a moment ago -- e.g. crossing straight
  // from one track segment into the next shouldn't restart the tooltip.
  clearHoverTooltipTimers();
  state.hoverTooltipAnchor = latlng;
  state.hoverTooltipOpts = opts;
  const el = ensureHoverTooltipEl();
  el.className = `map-hover-tooltip ${opts.className || ""}`;
  el.innerHTML = html;
  el.style.display = "block";
  el.style.opacity = "1";
  positionHoverTooltip(latlng, opts);
  state.hoverTooltipFading = false;
}
export function moveHoverTooltip(latlng) {
  // Once the fade-out has started the tooltip is on its way out, so it
  // should hold still rather than hop to wherever the mouse ends up next.
  // Reuses the offset/direction from the last showHoverTooltip() call --
  // otherwise every mousemove would snap the box back to a zero offset,
  // only ever showing the real -10px-above-cursor placement on the very
  // first mouseover.
  if (state.hoverTooltipEl && !state.hoverTooltipFading) {
    state.hoverTooltipAnchor = latlng;
    positionHoverTooltip(latlng, state.hoverTooltipOpts || {});
  }
}
export function hideHoverTooltip() {
  if (!state.hoverTooltipEl) return;
  clearHoverTooltipTimers();
  state.hoverTooltipCloseTimer = setTimeout(() => {
    state.hoverTooltipFading = true;
    state.hoverTooltipEl.style.opacity = "0";
    state.hoverTooltipRemoveTimer = setTimeout(() => {
      state.hoverTooltipEl.style.display = "none";
    }, HOVER_TOOLTIP_FADE_MS);
  }, HOVER_TOOLTIP_CLOSE_DELAY_MS);
}

// The pinned POI-signpost tooltip (see showPoiSignTooltip in poi.js) --
// same absolutely-positioned-div mechanism as the transient hover tooltip
// above, but its own separate element/state so both can be shown at once
// (e.g. a signpost pinned open while hovering an unrelated track
// elsewhere) and with no fade/auto-hide lifecycle: it only ever closes via
// an explicit hidePinnedTooltip() call (showMilestone/closePoi), matching
// the old Leaflet tooltip's `permanent: true`.
function ensurePinnedTooltipEl() {
  if (!state.poiSignTooltipEl) {
    const el = document.createElement("div");
    el.className = "map-hover-tooltip";
    document.getElementById("mapWrap").appendChild(el);
    state.poiSignTooltipEl = el;
  }
  return state.poiSignTooltipEl;
}
export function showPinnedTooltip(latlng, html, opts) {
  state.poiSignTooltipAnchor = latlng;
  state.poiSignTooltipOpts = opts;
  const el = ensurePinnedTooltipEl();
  el.className = `map-hover-tooltip ${opts.className || ""}`;
  el.innerHTML = html;
  el.style.display = "block";
  el.style.opacity = "1";
  positionTooltipEl(el, latlng, opts);
}
export function hidePinnedTooltip() {
  if (!state.poiSignTooltipEl) return;
  state.poiSignTooltipEl.style.display = "none";
  state.poiSignTooltipAnchor = null;
}

export function showHoverMarker(lat, lon) {
  state.map.getSource("tracks-hover-point").setData({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] } });
  state.map.setLayoutProperty("tracks-hover-point", "visibility", "visible");
}
export function clearMapHover() {
  if (state.map.getLayer("tracks-hover-point")) state.map.setLayoutProperty("tracks-hover-point", "visibility", "none");
}

// The map-side half of the Esplora-dati legend's click-to-highlight (see
// setLegendSelect/clearLegendSelect in chart.js): a white halo + colored
// overlay over just the segments matching the selected category.
export function setLegendSelectSegments(segments, color) {
  const features = segments.map(([a, b]) => ({
    type: "Feature",
    properties: { color },
    geometry: { type: "LineString", coordinates: [[a[1], a[0]], [b[1], b[0]]] },
  }));
  state.map.getSource("tracks-legend-select").setData({ type: "FeatureCollection", features });
}
export function clearLegendSelectSegments() {
  state.map.getSource("tracks-legend-select").setData(emptyFeatureCollection());
}
