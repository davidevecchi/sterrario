// ---- Map layer catalog: basemap/overlay data (name, icon, description, tiles, attribution) ----
//
// Every selectable basemap/overlay lives here as one entry keyed by its
// display name, bundling everything the layer switcher (js/map-layers.js's
// buildLayerSwitcher) needs to show and activate it: `icon` (a Material
// Symbols name from poi-icons.js's ICO_CODEPOINT), `description` (native
// browser tooltip text), and `factory`, a `(id) => descriptor |
// Promise<descriptor>` producing a small fragment of a MapLibre style
// (`{ sources, layers, sprite?, glyphs? }`) keyed by the caller's own `id`.
// Previously these three facets (icon/description/tiles+attribution) lived
// in three separate dicts (LAYER_ICON/LAYER_DESCRIPTIONS/BASEMAPS|OVERLAYS)
// that all had to be kept in sync by hand, one entry per real-world layer.

// Every selectable basemap, all free/keyless tile services -- shown to the
// user via the custom layer switcher's basemap panel (see
// buildLayerSwitcher, called from initMap), alphabetically (panel rows
// follow this dict's own key order). "Esri Satellite" no longer needs to
// stay first -- initMap looks it up by name for the default layer
// regardless of where it falls alphabetically.
export const BASEMAPS = {
    // "basemap.at": {icon: "fiber_new", description: "Mappa ufficiale austriaca, dettagliata ma solo per il territorio austriaco", factory: null},
    // "basemap.at Grayscale": {icon: "fiber_new", description: "Come basemap.at ma in scala di grigi, solo Austria", factory: null},
    // "basemap.at Orthophoto": {icon: "fiber_new", description: "Ortofoto aerea ufficiale a 30cm, solo Austria", factory: null},
    // "CartoDB Dark Matter": {
    //     icon: "fiber_new",
    //     description: "Stile vettoriale scuro e minimale, ottimo contrasto per le tracce colorate",
    //     // "CartoDB Voyager": vectorStyleBasemap("https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"),
    //     factory: null,
    // },
    "CartoDB Positron": {
        icon: "map",
        description: "Stile vettoriale chiaro e minimale, fa risaltare le tracce",
        factory: tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        }),
    },
    "CartoDB Voyager": {
        icon: "map",
        description: "Chiaro e tenue, con strade, edifici ed etichette",
        factory: tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        }),
    },
    "CyclOSM": {
        icon: "pedal_bike",
        description: "Pensato per il ciclismo, evidenzia piste e percorsi ciclabili",
        factory: tileLayer("https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; CyclOSM",
        }),
    },
    "EOX Sentinel-2 Cloudless": {
        icon: "satellite_alt",
        description: "Composito satellitare Sentinel-2 privo di nuvole",
        factory: tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", {
            maxZoom: 19,
            attribution: "Sentinel-2 cloudless by <a href=\"https://s2maps.eu\" target=\"_blank\">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data)",
        }),
    },
    "EOX Hillshade": {
        icon: "altitude",
        description: "Ombreggiatura rilievo scura su scala globale",
        factory: tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/terrain_3857/default/g/{z}/{y}/{x}.jpg", {
            maxZoom: 13,
            attribution: "&copy; EOX",
        }),
    },
    "EOX Terrain": {
        icon: "altitude",
        description: "Rilievo ombreggiato chiaro e uniforme su scala globale",
        factory: tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg", {
            maxZoom: 13,
            attribution: "Terrain Light { Data &copy; OpenStreetMap contributors and others, Rendering &copy; <a href=\"https://eox.at\" target=\"_blank\">EOX</a>",
        }),
    },
    // "Esri Canvas Dark": {icon: "fiber_new", description: "Base scura minimale con soli confini ed etichette essenziali", factory: layerPair(
    //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
    //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
    // )},
    // "Esri Canvas Light": {icon: "fiber_new", description: "Base chiara minimale con soli confini ed etichette essenziali", factory: layerPair(
    //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
    //   "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    //   { maxZoom: 19, attribution: "Tiles &copy; Esri &mdash; Source: Esri" },
    // )},
    "Esri NatGeo": {
        icon: "history_edu",
        description: "Stile cartografico in stile National Geographic",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 12,
            attribution: "Tiles &copy; Esri &mdash; Source: National Geographic, Esri, DeLorme, NAVTEQ",
        }),
    },
    "Esri Ocean": {
        icon: "water",
        description: "Pensata per la batimetria marina, poco dettaglio in montagna",
        factory: layerPair(
            "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
            {maxZoom: 10, attribution: "Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic"},
            "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
            {maxZoom: 10, attribution: "Tiles &copy; Esri &mdash; Source: Esri, GEBCO, NOAA, National Geographic"},
        ),
    },
    "Esri Satellite": {
        icon: "satellite_alt",
        description: "Immagini satellitari/aeree",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        }),
    },
    // "Esri Shaded Relief": {icon: "fiber_new", description: "Solo rilievo ombreggiato del terreno, senza strade o etichette", factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}", {
    //   maxZoom: 19,
    //   attribution: "Tiles &copy; Esri &mdash; Source: Esri",
    // })},
    // "Esri Shaded Relief Dark": {icon: "fiber_new", description: "Come Esri Shaded Relief ma in tono scuro", factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade_Dark/MapServer/tile/{z}/{y}/{x}", {
    //   maxZoom: 19,
    //   attribution: "Tiles &copy; Esri &mdash; Source: Esri",
    // })},
    "Esri USA Topo Maps": {
        icon: "explore",
        region: "us",
        description: "Stile topografico NPS/USGS con curve di livello, solo Stati Uniti",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/USA_Topo_Maps/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 15,
            attribution: "Tiles &copy; Esri &mdash; Source: USGS",
        }),
    },
    // "Esri World Hillshade": {icon: "fiber_new", description: "Ombreggiatura rilievo, leggera e uniforme su scala globale", factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
    //     maxZoom: 19,
    //     attribution: "Tiles &copy; Esri",
    // })},
    // "Esri World Physical Map": {icon: "fiber_new", description: "Mappa fisica con montagne e rilievi ombreggiati", factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}", {
    //     maxZoom: 12,
    //     attribution: "Tiles &copy; Esri",
    // })},
    // "Esri World Terrain Base": {icon: "fiber_new", description: "Base rilievo neutro con batimetria, dettaglio moderato", factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}", {
    //     maxZoom: 13,
    //     attribution: "Tiles &copy; Esri &mdash; Source: USGS",
    // })},
    "Esri World Street": {
        icon: "pin_road",
        description: "Stradale generico, simile a una mappa cartacea classica",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin",
        }),
    },
    "Esri World Topo": {
        icon: "explore",
        description: "Topografico con curve di livello e rilievo ombreggiato",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ",
        }),
    },
    "Freemap Outdoor": {
        icon: "hiking",
        region: "eu",
        description: "Sentieri escursionistici, ciclabili e per lo sci alpinismo con curve di livello",
        factory: tileLayer("https://outdoor.tiles.freemap.sk/{z}/{x}/{y}", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; freemap.sk",
        }, {viaProxy: true}),
    },
    "Humanitarian OSM": {
        icon: "map",
        description: "OpenStreetMap curato dalla comunità umanitaria (HOT)",
        factory: tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
            maxZoom: 16,
            attribution: "&copy; OpenStreetMap contributors &mdash; Tiles style by Humanitarian OpenStreetMap Team",
        }),
    },
    "IGN France": {
        region: "fr",
        icon: "explore",
        description: "Mappa stradale/topografica ufficiale francese, solo Francia",
        factory: tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png", {
            maxZoom: 19,
            attribution: "&copy; IGN",
        }),
    },
    "IGN France Ortho": {
        region: "fr",
        icon: "satellite_alt",
        description: "Ortofoto aerea ufficiale francese, solo Francia",
        factory: tileLayer("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", {
            maxZoom: 19,
            attribution: "&copy; IGN",
        }),
    },
    // Belgium's IGN/NGI equivalent (cartoweb.wmts.ngi.be) only publishes an
    // 11-level, non-standard tile matrix -- its TileMatrix identifiers don't
    // correspond 1:1 to normal {z} zoom levels, so it can't be dropped in as
    // a plain {z}/{x}/{y} raster source like the other IGN entries here.
    "IGN Spain": {
        icon: "explore",
        region: "es",
        description: "Mappa topografica ufficiale spagnola (MTN), solo Spagna",
        factory: tileLayer("https://www.ign.es/wmts/mapa-raster?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=MTN&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", {
            maxZoom: 19,
            attribution: "&copy; Instituto Geográfico Nacional de España",
        }),
    },
    "IGN Spain Ortho": {
        icon: "satellite_alt",
        region: "es",
        description: "Ortofoto aerea ufficiale spagnola (PNOA), solo Spagna",
        factory: tileLayer("https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=OI.OrthoimageCoverage&STYLE=default&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", {
            maxZoom: 19,
            attribution: "&copy; Instituto Geográfico Nacional de España",
        }),
    },
    "Kartverket": {
        icon: "explore",
        region: "no",
        description: "Mappa topografica ufficiale norvegese, solo Norvegia",
        factory: tileLayer("https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png", {
            maxZoom: 18,
            attribution: "&copy; Kartverket",
        }),
    },
    "Maps-For-Free Relief": {
        icon: "altitude",
        description: "Rilievo a basso dettaglio, utile solo per la vista d'insieme (zoom limitato)",
        factory: tileLayer("https://maps-for-free.com/layer/relief/z{z}/row{y}/{z}_{x}-{y}.jpg", {
            maxZoom: 11,
            attribution: "&copy; <a href=\"https://maps-for-free.com\" target=\"_blank\">maps-for-free.com</a>",
        }, {viaProxy: true}),
    },
    "NASA GIBS MODIS": {
        icon: "satellite_alt",
        description: "Composito satellitare giornaliero MODIS, basso dettaglio (250m/px)",
        // GIBS layers are date-stamped; there's no "latest"/"default" alias,
        // so a fixed recent date is hardcoded here (imagery for it is
        // permanently archived, unlike a rolling "today" that would 404
        // until GIBS finishes processing each day's pass).
        factory: tileLayer("https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-01-01/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg", {
            maxZoom: 9,
            attribution: "Imagery courtesy of NASA GIBS / MODIS",
        }),
    },
    // "NLS Finland": {
    //     icon: "explore",
    //     description: "Mappa topografica ufficiale finlandese, solo Finlandia",
    //     factory: tileLayer("https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{x}/{y}.png", {
    //         maxZoom: 18,
    //         attribution: "&copy; Maanmittauslaitos",
    //     }),
    // },
    "OpenFreeMap Bright": {
        icon: "map",
        description: "Stile vettoriale chiaro e colorato, gratuito e senza chiave API",
        factory: vectorStyleBasemap("https://tiles.openfreemap.org/styles/bright"),
    },
    // "OpenFreeMap Dark": {
    //     icon: "map",
    //     description: "Stile vettoriale scuro, gratuito e senza chiave API",
    //     factory: vectorStyleBasemap("https://tiles.openfreemap.org/styles/dark"),
    //     factory: null,
    // },
    // "OpenFreeMap Fiord": {
    //     icon: "fiber_new",
    //     description: "Stile vettoriale blu-grigio scuro, gratuito e senza chiave API",
    //     factory: vectorStyleBasemap("https://tiles.openfreemap.org/styles/fiord"),
    //     factory: null,
    // },
    "OpenFreeMap Liberty": {
        icon: "map",
        description: "Stile vettoriale in stile OSM Liberty, gratuito e senza chiave API",
        // factory: vectorStyleBasemap("https://tiles.openfreemap.org/styles/liberty"),
        factory: null,
    },
    "OpenFreeMap Positron": {
        icon: "map",
        description: "Stile vettoriale minimale e chiaro, gratuito e senza chiave API",
        // factory: vectorStyleBasemap("https://tiles.openfreemap.org/styles/positron"),
        factory: null,
    },
    "OPNVKarte": {
        icon: "directions_bus",
        description: "Pensato per il trasporto pubblico (linee e fermate)",
        factory: tileLayer("https://tileserver.memomaps.de/tilegen/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; MeMoMaps (CC-BY-SA)",
        }, {viaProxy: true}),
    },
    "OpenHikingMap": {
        icon: "hiking",
        description: "Pensato per l'escursionismo, evidenzia sentieri e rifugi",
        factory: tileLayer("https://tile.openmaps.fr/openhikingmap/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenHikingMap / openmaps.fr",
        }),
    },
    // tiles.openstreetmap.us/vector/openmaptiles.json is a bare TileJSON
    // (tiles/vector_layers), not a MapLibre style document -- vectorStyleBasemap
    // expects `sources`/`layers` and silently adds nothing when handed one, so
    // the basemap rendered blank. No provider publishes a real keyless
    // style.json for standard OSM-Carto, so back to the raster tiles.
    "OpenStreetMap": {
        icon: "map",
        description: "Lo stile standard di OpenStreetMap",
        factory: tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
        }),
    },
    "OpenTopoMap": {
        icon: "explore",
        description: "Topografico con curve di livello, ombreggiatura del rilievo",
        factory: tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            maxZoom: 17,
            attribution: "Map data: &copy; OpenStreetMap contributors, SRTM &mdash; Map style: &copy; OpenTopoMap (CC-BY-SA)",
        }),
    },
    // "OpenTopoMap-R": {
    //     icon: "fiber_new",
    //     description: "Clone indipendente di OpenTopoMap, re-renderizzato da openmaps.fr",
    //     factory: tileLayer("https://tile.openmaps.fr/opentopomap/{z}/{x}/{y}.png", {
    //         maxZoom: 17,
    //         attribution: "Map data: &copy; OpenStreetMap contributors, SRTM &mdash; Map style: &copy; OpenTopoMap (CC-BY-SA)",
    //     }),
    // },
    "OSMfr": {
        icon: "map",
        description: "OSM-Carto con etichette in francese e zoom fino a 20",
        factory: tileLayer("https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png", {
            maxZoom: 20,
            attribution: "&copy; OpenStreetMap contributors",
        }),
    },
    "Swisstopo": {
        icon: "explore",
        region: "ch",
        description: "Mappa topografica ufficiale svizzera, solo Svizzera",
        factory: tileLayer("https://wmts20.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg", {
            maxZoom: 19,
            attribution: "&copy; swisstopo",
        }),
    },
    "Swisstopo SwissImage": {
        icon: "satellite_alt",
        region: "ch",
        description: "Ortofoto aerea ufficiale svizzera, solo Svizzera",
        factory: tileLayer("https://wmts20.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg", {
            maxZoom: 19,
            attribution: "&copy; swisstopo",
        }),
    },
    "USGS Topo": {
        icon: "explore",
        region: "us",
        description: "Mappa topografica ufficiale statunitense (USGS), solo Stati Uniti",
        factory: tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 16,
            attribution: "Tiles courtesy of the U.S. Geological Survey",
        }),
    },
    "UtagawaMTB": {
        icon: "pedal_bike",
        description: "Pensato per la mountain bike, evidenzia sentieri e single-track",
        factory: tileLayer("https://maps.utagawavtt.com/styles/utagawavtt/{z}/{x}/{y}.png", {
            // Forum posts guessed 17-18, but direct tile checks over the Alps show
            // crisp contours/hillshade/elevation labels through z21 -- only goes
            // visually blank around z22, so 21 is the real usable max.
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &copy; OpenMapTiles &mdash; Map style: UtagawaVTT / www.UtagawaVTT.com",
        }),
    },
    "VersaTiles Colorful": {
        icon: "map",
        description: "Stile vettoriale colorato, licenza CC0",
        factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/colorful/style.json"),
    },
    "VersaTiles Eclipse": {
        icon: "map",
        description: "Stile vettoriale scuro, licenza CC0",
        // factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/eclipse/style.json"),
        factory: null,
    },
    "VersaTiles Graybeard": {
        icon: "map",
        description: "Stile vettoriale in scala di grigi, licenza CC0",
        // factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/graybeard/style.json"),
        factory: null,
    },
    "VersaTiles Neutrino": {
        icon: "map",
        description: "Stile vettoriale chiaro e minimale, licenza CC0",
        factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/neutrino/style.json"),
    },
    // "VersaTiles Satellite": {
    //     icon: "fiber_new",
    //     description: "Immagini satellitari con overlay vettoriale di strade e confini",
    //     factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/satellite/style.json"),
    // },
    // "VersaTiles Shadow": {
    //     icon: "fiber_new",
    //     description: "Stile vettoriale grigio scuro, licenza CC0",
    //     factory: vectorStyleBasemap("https://tiles.versatiles.org/assets/styles/shadow/style.json"),
    // },
    // Non-commercial license (CC-BY-NC-SA) -- fine for this project, but
    // can't be enabled if the app is ever monetized.
    // "Wanderreitkarte": {
    //     icon: "fiber_new",
    //     description: "Pensata per escursionismo ed equitazione, con curve di livello e condizione dei sentieri (uso non commerciale)",
    //     factory: tileLayer("https://topo.wanderreitkarte.de/topo/{z}/{x}/{y}.png", {
    //         maxZoom: 18,
    //         attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; wanderreitkarte.de (CC-BY-NC-SA)",
    //     }),
    // },
};

// Optional overlays, layered on top of whichever basemap is active --
// unlike BASEMAPS these are checkboxes (any combination on at once), so
// they're kept in a separate map/control list rather than mixed into the
// mutually-exclusive base layer radios above. Alphabetical, same as BASEMAPS.
export const OVERLAYS = {
    "CartoDB Labels": {
        icon: "edit_location_alt",
        description: "Solo le etichette di testo dello stile Voyager, trasparente",
        // "CartoDB Dark Matter (Labels Only)": "Solo le etichette di testo dello stile Dark Matter, trasparente",
        // "CartoDB Positron (Labels Only)": "Solo le etichette di testo dello stile Positron, trasparente",
        factory: tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
        }),
    },
    // "EOX Coastline": {
    //     icon: "water",
    //     description: "Linee costiere, trasparente da sovrapporre a immagini satellitari",
    //     factory: tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/coastline_3857/default/g/{z}/{y}/{x}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, EOX",
    //     }),
    // },
    "EOX Hydrography": {
        icon: "water",
        description: "Fiumi e laghi, trasparente per il contesto idrico",
        factory: tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/hydrography_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors, EOX",
        }),
    },
    "Esri Places": {
        icon: "edit_location_alt",
        description: "Confini amministrativi e nomi di località, trasparente",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri",
        }),
    },
    "Esri Transportation": {
        icon: "directions_bus",
        description: "Rete stradale, trasparente da sovrapporre a basi senza strade",
        factory: tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri",
        }),
    },
    // "Maps-For-Free Admin": {
    //     icon: "fiber_new",
    //     description: "Confini amministrativi VMap0, risoluzione bassa (max zoom 11)",
    //     factory: tileLayer("https://maps-for-free.com/layer/admin/z{z}/row{y}/{z}_{x}-{y}.gif", {
    //         maxZoom: 11,
    //         attribution: "&copy; maps-for-free.com",
    //     }, {viaProxy: true}),
    // },
    "Maps-For-Free Streets": {
        icon: "pin_road",
        description: "Strade VMap0, risoluzione bassa (max zoom 11)",
        factory: tileLayer("https://maps-for-free.com/layer/streets/z{z}/row{y}/{z}_{x}-{y}.gif", {
            maxZoom: 11,
            attribution: "&copy; maps-for-free.com",
        }, {viaProxy: true}),
    },
    "Maps-For-Free Water": {
        icon: "water",
        description: "Idrografia VMap0, risoluzione bassa (max zoom 11)",
        factory: tileLayer("https://maps-for-free.com/layer/water/z{z}/row{y}/{z}_{x}-{y}.gif", {
            maxZoom: 11,
            attribution: "&copy; maps-for-free.com",
        }, {viaProxy: true}),
    },
    "OpenRailwayMap": {
        icon: "directions_bus",
        description: "Linee e stazioni ferroviarie",
        factory: tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenRailwayMap (CC-BY-SA)",
        }),
    },
    // "OpenRailwayMap Electrification": {
    //     icon: "fiber_new",
    //     description: "Stato di elettrificazione ferroviaria (tensione e frequenza)",
    //     factory: tileLayer("https://{s}.tiles.openrailwaymap.org/electrification/{z}/{x}/{y}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, OpenRailwayMap",
    //     }),
    // },
    // "OpenRailwayMap Gauge": {
    //     icon: "fiber_new",
    //     description: "Scartamento dei binari",
    //     factory: tileLayer("https://{s}.tiles.openrailwaymap.org/gauge/{z}/{x}/{y}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, OpenRailwayMap",
    //     }),
    // },
    // "OpenRailwayMap Maxspeed": {
    //     icon: "fiber_new",
    //     description: "Velocità massima consentita per tratta ferroviaria",
    //     factory: tileLayer("https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, OpenRailwayMap",
    //     }),
    // },
    // "OpenRailwayMap Signals": {
    //     icon: "fiber_new",
    //     description: "Segnali ferroviari e sistemi di protezione del treno",
    //     factory: tileLayer("https://{s}.tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, OpenRailwayMap",
    //     }),
    // },
    // "OpenSeaMap": {
    //     icon: "water",
    //     description: "Segnali nautici e informazioni marittime",
    //     factory: tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
    //       maxZoom: 17,
    //       attribution: "&copy; OpenSeaMap contributors",
    //     }),
    // },
    "OpenSnowMap": {
        icon: "downhill_skiing",
        description: "Piste da sci e impianti di risalita",
        factory: tileLayer("https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png", {
            maxZoom: 16,
            attribution: "&copy; OpenStreetMap contributors &mdash; Map style: &copy; OpenSnowMap (CC-BY-SA)",
        }),
    },
    "OSM GPS Traces": {
        icon: "my_location",
        description: "Densità delle tracce GPS registrate dalla comunità OpenStreetMap",
        factory: tileLayer("https://gps.tile.openstreetmap.org/lines/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
        }),
    },
    // "UtagawaVTT Biodiv": {
    //     icon: "fiber_new",
    //     description: "Stile outdoor Biodiv Sports con sentieri ricreazionali",
    //     factory: tileLayer("https://maps.utagawavtt.com/styles/biodiv/{z}/{x}/{y}.png", {
    //         maxZoom: 19,
    //         attribution: "&copy; OpenStreetMap contributors, OpenMapTiles",
    //     }),
    // },
    "UtagawaVTT Hillshade": {
        icon: "altitude",
        description: "Ombreggiatura rilievo ad alta definizione",
        factory: tileLayer("https://maps.utagawavtt.com/styles/hillshade-HD/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors, OpenMapTiles",
        }),
    },
    "Waymarked Cycling": {
        icon: "pedal_bike",
        description: "Percorsi ciclabili segnalati",
        factory: tileLayer("https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
        }),
    },
    "Waymarked Hiking": {
        icon: "hiking",
        description: "Sentieri escursionistici segnalati",
        factory: tileLayer("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
        }),
    },
    "Waymarked MTB": {
        icon: "pedal_bike",
        description: "Percorsi per mountain bike segnalati",
        factory: tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
        }),
    },
    // "Waymarked Riding": {
    //     icon: "route",
    //     description: "Percorsi per equitazione segnalati",
    //     factory: tileLayer("https://tile.waymarkedtrails.org/riding/{z}/{x}/{y}.png", {
    //       maxZoom: 18,
    //       attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
    //     }),
    // },
    // "Waymarked Skating": {
    //     icon: "fiber_new",
    //     description: "Percorsi per pattinaggio in linea segnalati",
    //     factory: tileLayer("https://tile.waymarkedtrails.org/skating/{z}/{x}/{y}.png", {
    //       maxZoom: 18,
    //       attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
    //     }),
    // },
    "Waymarked Slopes": {
        icon: "downhill_skiing",
        description: "Piste sciistiche e sport invernali segnalati",
        factory: tileLayer("https://tile.waymarkedtrails.org/slopes/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors &mdash; Icons/rendering &copy; Waymarked Trails",
        }),
    },
};

// Leaflet's `{s}` subdomain-sharding placeholder has no MapLibre
// equivalent -- a raster source's own `tiles` array is round-robined the
// same way, so `{s}` is expanded into one explicit URL per subdomain
// letter instead. Every provider here that uses `{s}` relies on Leaflet's
// own default subdomains ('abc'); none pass an explicit `subdomains`
// option, so that default is hardcoded here too.
function subdomainTiles(url, subdomains = "abc") {
    return url.includes("{s}") ? [...subdomains].map(s => url.replace("{s}", s)) : [url];
}

// A handful of raster tile hosts (Freemap Outdoor, Maps-For-Free, OPNVKarte)
// never sent an Access-Control-Allow-Origin header -- invisible under
// Leaflet, which paints raster tiles as plain <img> tags with no CORS
// involved, but fatal under MapLibre: every raster tile is read into a
// WebGL texture, which the browser refuses for a cross-origin response with
// no CORS header (the fetch either errors outright or the image is
// "tainted" and texImage2D throws). There's no client-side workaround for a
// server that doesn't send the header -- routing the request through
// images.weserv.nl (a public image proxy that re-serves any image URL with
// `Access-Control-Allow-Origin: *` attached) is the only fix that doesn't
// mean dropping the layer. `{z}`/`{x}`/`{y}` placeholders are left
// untouched in the querystring; MapLibre's own template substitution runs
// on the final tile URL string regardless of what's wrapped around it.
function corsProxy(url) {
    return `https://images.weserv.nl/?url=${url}`;
}

// Every basemap/overlay raster entry goes through this instead of calling
// L.tileLayer directly. The `{r}` retina placeholder (CartoDB's `retina:
// true` entries) is simply blanked out -- MapLibre has no built-in
// `detectRetina` equivalent, and none of the other providers expose a real
// retina asset worth the effort of reimplementing Leaflet's zoom-level
// fallback for. Leaflet's own tileerror-retry-once behavior (transient
// 502s from small single-origin tile hosts) also has no direct MapLibre
// hook and isn't reimplemented here.
function tileLayer(url, options, {retina = false, viaProxy = false} = {}) {
    return (id) => ({
        sources: {
            [id]: {
                type: "raster",
                tiles: subdomainTiles(url).map(u => u.replace("{r}", retina ? "@2x" : "")).map(u => viaProxy ? corsProxy(u) : u),
                tileSize: 256,
                attribution: options.attribution,
                maxzoom: options.maxZoom,
            },
        },
        layers: [{id, type: "raster", source: id}],
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
                [baseId]: {
                    type: "raster",
                    tiles: subdomainTiles(baseUrl),
                    tileSize: 256,
                    attribution: baseOptions.attribution,
                    maxzoom: baseOptions.maxZoom
                },
                [refId]: {
                    type: "raster",
                    tiles: subdomainTiles(refUrl),
                    tileSize: 256,
                    attribution: refOptions.attribution,
                    maxzoom: refOptions.maxZoom
                },
            },
            layers: [
                {id: baseId, type: "raster", source: baseId},
                {id: refId, type: "raster", source: refId},
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
                const newLayer = {...layer, id: `${id}__${layer.id}`};
                if (newLayer.source) newLayer.source = sourceIdMap[newLayer.source] || newLayer.source;
                return newLayer;
            });
            return {sources, layers, sprite: style.sprite, glyphs: style.glyphs};
        });
    };
}

// The two group-toggle buttons' own icons (distinct from the per-row
// pictograms below): a folded map for basemaps, a stack of layers for
// overlays.
export const SWITCHER_BUTTON_ICONS = {base: "map", overlay: "layers"};

// Only keep entries with a real (non-null) factory -- commented-out
// providers above stay documented in place (icon/description preserved for
// whenever they're re-enabled) without cluttering the live switcher.
function activeEntries(catalog) {
    return Object.fromEntries(Object.entries(catalog).filter(([, entry]) => entry.factory));
}

export const ACTIVE_BASEMAPS = activeEntries(BASEMAPS);
export const ACTIVE_OVERLAYS = activeEntries(OVERLAYS);
