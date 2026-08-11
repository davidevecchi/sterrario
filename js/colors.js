export const SURFACE_COLORS = {
  asphalt: "#3f3f46",
  paved: "#52525b",
  concrete: "#71717a",
  "concrete:lanes": "#71717a",
  "concrete:plates": "#71717a",
  metal: "#64748b",
  metal_grid: "#64748b",
  paving_stones: "#a1a1aa",
  sett: "#a8a29e",
  cobblestone: "#b45309",
  unhewn_cobblestone: "#92400e",
  porfido: "#9f1239",
  wood: "#92400e",
  gravel: "#ca8a04",
  fine_gravel: "#eab308",
  pebblestone: "#d6d3d1",
  compacted: "#65a30d",
  unpaved: "#16a34a",
  dirt: "#166534",
  earth: "#166534",
  ground: "#166534",
  grass: "#22c55e",
  grass_paver: "#4d7c0f",
  rock: "#78716c",
  stone: "#78716c",
  sand: "#fde68a",
};
export const SURFACE_FALLBACK = "#9ca3af";
export const SURFACE_LABELS = {
  asphalt: "Asfalto", paved: "Pavimentato", concrete: "Cemento",
  "concrete:lanes": "Cemento a strisce", "concrete:plates": "Lastre di cemento",
  metal: "Metallo", metal_grid: "Grigliato metallico",
  paving_stones: "Pietre", sett: "Sampietrini",
  cobblestone: "Ciottoli", unhewn_cobblestone: "Ciottoli grezzi",
  porfido: "Porfido", wood: "Legno",
  gravel: "Ghiaia", fine_gravel: "Ghiaia fine", pebblestone: "Ghiaino",
  compacted: "Sterrato compatto",
  unpaved: "Sterrato", dirt: "Terra battuta", earth: "Terra", ground: "Terreno",
  grass: "Erba", grass_paver: "Grigliato erboso",
  rock: "Roccia", stone: "Pietrame", sand: "Sabbia",
};

export const HIGHWAY_COLORS = {
  motorway_link: "#7f1d1d",
  trunk: "#991b1b",
  trunk_link: "#991b1b",
  primary: "#b91c1c",
  primary_link: "#b91c1c",
  secondary: "#c2410c",
  secondary_link: "#c2410c",
  tertiary: "#d97706",
  tertiary_link: "#d97706",
  unclassified: "#a16207",
  residential: "#78716c",
  living_street: "#57534e",
  service: "#57534e",
  busway: "#57534e",
  track: "#15803d",
  path: "#0d9488",
  bridleway: "#0f766e",
  footway: "#0e7490",
  steps: "#0e7490",
  pedestrian: "#0369a1",
  platform: "#0369a1",
  rest_area: "#0369a1",
  cycleway: "#2563eb",
  construction: "#7c2d12",
  proposed: "#7c2d12",
};
export const HIGHWAY_FALLBACK = "#9ca3af";
export const HIGHWAY_LABELS = {
  motorway_link: "Rampa autostradale", trunk: "Superstrada", trunk_link: "Rampa di superstrada",
  primary: "Strada primaria", primary_link: "Rampa di strada primaria",
  secondary: "Strada secondaria", secondary_link: "Rampa di strada secondaria",
  tertiary: "Strada terziaria", tertiary_link: "Rampa di strada terziaria",
  unclassified: "Strada non classificata", residential: "Strada residenziale",
  living_street: "Zona residenziale", service: "Strada di servizio", busway: "Corsia bus",
  track: "Sterrato/carrareccia", path: "Sentiero", bridleway: "Pista per cavalli",
  footway: "Marciapiede", steps: "Scalinata",
  pedestrian: "Area pedonale", platform: "Banchina/marciapiede stazione", rest_area: "Area di sosta",
  cycleway: "Pista ciclabile", construction: "In costruzione", proposed: "Progetto",
};

// Gradient (% slope) buckets, mirrored around 0 into the five categories a
// cyclist actually feels: flat, easy, moderate, hard, extreme. Flat stays
// tight (-2/2%, barely perceptible while pedaling); extreme only kicks in
// past 15% (genuinely brutal); easy/moderate/hard split the wide 2-15%
// middle at 4% and 8%. Colors are a single OKLCH ramp anchored at three
// fixed hues (green -> yellow -> red) with every in-between color linearly
// interpolated in L/C/h, one segment per side of flat, evenly by bucket
// rank rather than by raw % (the categories, not the numeric midpoints,
// are what should look evenly spaced). Chroma is pushed high enough that
// most of these sit right at the sRGB gamut edge -- as saturated as each
// hue/lightness can get without distorting hue -- so the ramp reads as
// vivid and contrasty rather than muddy.
export const GRADE_BUCKETS = [
  { max: -16, color: "#007e11", label: "Discesa estrema (< -16%)" },
  { max: -8, color: "#429400", label: "Discesa dura (-16 / -8%)" },
  { max: -4, color: "#86a800", label: "Discesa moderata (-8 / -4%)" },
  { max: -2, color: "#c0bb00", label: "Discesa leggera (-4 / -2%)" },
  { max: 2, color: "#f8cd00", label: "Pianeggiante (-2 / 2%)" },
  { max: 4, color: "#f49c00", label: "Salita leggera (2 / 4%)" },
  { max: 8, color: "#e76a00", label: "Salita moderata (4 / 8%)" },
  { max: 16, color: "#d13100", label: "Salita dura (8 / 16%)" },
  { max: Infinity, color: "#b30000", label: "Salita estrema (> 16%)" },
]
export function gradeColor(grade) {
  for (const b of GRADE_BUCKETS) if (grade <= b.max) return b.color;
  return GRADE_BUCKETS[GRADE_BUCKETS.length - 1].color;
}

// Classic cartographic hypsometric tint: blue-green (valleys) -> green ->
// yellow-green -> tan -> brown -> gray-brown -> white (peaks). This is the
// standard elevation scale used on topo/hiking maps -- unlike a general
// terrain colormap it has no ocean/bathymetry segment, which fits this app
// since trail elevations never go below sea level; the lowest band just
// leans bluish rather than starting from a full ocean blue.
const TERRAIN_STOPS = [
  [0.00, 0.10, 0.32, 0.62],
  [0.15, 0.08, 0.46, 0.52],
  [0.25, 0.16, 0.52, 0.20],
  [0.40, 0.64, 0.70, 0.10],
  [0.60, 0.82, 0.55, 0.10],
  [0.80, 0.55, 0.33, 0.16],
  [0.88, 0.60, 0.44, 0.36],
  [0.94, 0.75, 0.65, 0.58],
  [0.98, 0.87, 0.83, 0.79],
  [1.00, 0.93, 0.91, 0.87],
];
function rgbToHex(r, g, b) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function terrainColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < TERRAIN_STOPS.length; i++) {
    const [p0, r0, g0, b0] = TERRAIN_STOPS[i - 1];
    const [p1, r1, g1, b1] = TERRAIN_STOPS[i];
    if (t <= p1) {
      const f = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return rgbToHex(r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f);
    }
  }
  const last = TERRAIN_STOPS[TERRAIN_STOPS.length - 1];
  return rgbToHex(last[1], last[2], last[3]);
}

// Altitude (elevation) coloring: unlike slope, elevation has no universal
// fixed scale, so the colormap spans 0 (never the *global* min, which can be
// negative or just an arbitrary trip's valley) to the 99.5th-percentile
// elevation across every trip (computed build-time, see global_ele_stats in
// build_trips.py and main() in app.js) -- fixed at startup so the same altitude never reads
// as a different color depending on what's currently selected. Using the
// 99.5th percentile rather than the raw max keeps a single brief high peak
// from stretching the whole ramp and squashing every normal trip into its
// low end. Below 0 still hard-clamps to the color of 0 (negative elevations
// don't happen on real trails, so there's nothing to distinguish). Above the
// 99.5th-percentile ceiling, though, softly eases towards (never quite
// reaching) the ramp's terminal color instead of hard-clamping flat: a hard
// clamp would make every point/band past the ceiling render pixel-identical,
// which reads as a visual glitch/flat block rather than "very high" -- and,
// for the legend, would force collapsing multiple bands into one
// mismatched-width row just to avoid showing several identical swatches.
// Easing keeps every altitude visually distinct (data coherence) while still
// achieving the percentile clamp's actual goal (no single peak stretching
// the ramp for every other trip), so one bucket-building path now works
// unmodified for both the legend and the map/chart render bands.
// The linear 0..colorMax range only ever fills the ramp up to T_CAP, not all
// the way to 1 -- reserving that last sliver of the ramp is what gives the
// easing above colorMax somewhere to go. Without it, the linear part would
// already sit at the ramp's exact terminal color at colorMax, so anything
// beyond would have to jump backwards before it could "ease forward" again
// -- a visible reverse color jump right at the ceiling, worse than a flat
// clamp.
const ALTITUDE_EASE_T_CAP = 0.94;
function altitudeColor(ele, max) {
  if (ele == null || !max) return SURFACE_FALLBACK;
  const raw = Math.max(0, ele) / max;
  const t = raw <= 1
    ? raw * ALTITUDE_EASE_T_CAP
    : ALTITUDE_EASE_T_CAP + (1 - ALTITUDE_EASE_T_CAP) * (1 - 1 / (1 + (raw - 1) * 2));
  return terrainColor(t);
}

// Bands of fixed `step`-wide steps starting at 0 (not a division of the
// min/max span), so a given band always covers the same altitude range
// regardless of what's selected. The first band's lower edge is the exact
// `min` passed in and the last band's upper edge is the exact `max`,
// instead of overflowing past it to the next round step.
//
// `colorMax` is deliberately a separate parameter from `max`: `max` controls
// which range gets binned (the whole trip set, or just the selected
// trip/track, so a legend scoped to a flat day doesn't drag in a dozen
// irrelevant high-altitude rows); `colorMax` is always the *global*
// 99.5th-percentile elevation across every trip, so a given altitude always
// maps to the same color band regardless of what's selected/scoped --
// otherwise the same 800m would tint differently in a legend scoped to an
// 1800m day than one scoped to a 900m day.
function buildBands(min, max, step, colorMax = max) {
  const edges = [];
  // Fixed multiples of `step` (…, 200, 300, 400, …), not `min`-relative --
  // that's what keeps a given band's range stable regardless of what's
  // selected/scoped. But when `min` is scoped to a selection that starts
  // well above 0 (e.g. a day from 235m to 721m), most of those low
  // multiples fall below `min` and would produce an invalid edge (upper <
  // the first band's lower); skipping them makes the first real band start
  // at whichever multiple is the first one actually above `min`.
  for (let e = step; e < max; e += step) if (e > min) edges.push(e);
  edges.push(max);
  return edges.map((upper, i) => {
    const lower = i === 0 ? min : edges[i - 1];
    const color = altitudeColor((lower + upper) / 2, colorMax);
    const label = `${Math.round(lower)} / ${Math.round(upper)} m`;
    return { min: lower, max: upper, color, label };
  });
}
// Fine 100m-wide bands used for actual map/chart rendering: narrow enough
// that the colored line reads as smoothly shaded rather than a handful of
// visibly flat stripes, while still being a small, fixed set of flat colors
// -- cheap to compare and, on the map, mergeable into a handful of
// polylines per track (unlike a genuinely continuous per-point color,
// which defeats both). Always spans the full global range -- see
// `colorMax` above for why the color scale itself is never scoped.
const ALTITUDE_RENDER_STEP = 100;
export function buildAltitudeBuckets(min, max, colorMax = max) {
  return buildBands(min, max, ALTITUDE_RENDER_STEP, colorMax);
}
// Coarser bands purely for the sidebar legend: reading off 29 rows for a
// ~3000m trip is worse than reading off 6, so the legend clusters the same
// span into whichever of 50/100/200/500m keeps it to at most 10 rows,
// picking the finest (most readable range labels) that fits. `min`/`max`
// here are meant to be the *scoped* selection's own elevation range (so the
// legend only lists rows that selection actually reaches), while
// `colorMax` stays the global 99.5th-percentile elevation so swatches still
// match the colors actually drawn on the map/chart.
const ALTITUDE_LEGEND_STEPS = [50, 100, 200, 500];
const ALTITUDE_LEGEND_MAX_BINS = 10;
export function buildAltitudeLegendBuckets(min, max, colorMax = max) {
  for (const step of ALTITUDE_LEGEND_STEPS) {
    const bands = buildBands(min, max, step, colorMax);
    if (bands.length <= ALTITUDE_LEGEND_MAX_BINS) return bands;
  }
  return buildBands(min, max, ALTITUDE_LEGEND_STEPS[ALTITUDE_LEGEND_STEPS.length - 1], colorMax);
}
// Which band a given elevation falls into, against whichever band set is
// passed in (the fine render bands or the coarser legend bands) -- so a
// track's rendered color is always one of a handful of flat band colors
// (mergeable, cheap to compare) rather than a fresh computed shade per
// point.
export function altitudeBucket(ele, buckets) {
  if (ele == null || !buckets || !buckets.length) return null;
  for (const b of buckets) if (ele <= b.max) return b;
  return buckets[buckets.length - 1];
}

// One dash pattern per activity (matching the icons in res/) so days
// within a trip stay legible on the map even though they all now share
// the same trip color -- the color says "which trip", the dash says
// "which kind of day". "other" (no #activity= tag, no matching emoji)
// gets its own pattern but no icon (see ACTIVITY_ICON).
export const ACTIVITY_DASH = {
  touring: null,            // solid -- the default/most common activity
  road: "18,5",
  gravel: "4,4",
  bike: "11,5",
  mtb: "7,3,1,3",
  hike: "1,7",
  walk: "1,4",
  run: "2,3",
  alpine: "9,3,2,3",
  other: "5,5",
};
// Prefer the vector res/<activity>.svg where one exists (crisper at the
// small sizes markers render at); falls back to the .png for activities
// that only have a raster icon.
export const ACTIVITY_ICON = {
  touring: "res/touring.svg", road: "res/road.svg", gravel: "res/gravel.svg",
  bike: "res/bike.svg", mtb: "res/mtb.svg", hike: "res/hike.png",
  walk: "res/walk.png", run: "res/run.png", alpine: "res/alpine.png",
};
export function dayIconHtml(track) {
  const src = ACTIVITY_ICON[track.activity];
  if (!src) return "";
  const alt = ACTIVITY_LABELS[track.activity] || track.activity;
  return `<img class="day-icon" src="${src}" alt="${alt}">`;
}
export const ACTIVITY_LABELS = {
  touring: "Touring", road: "Bici da strada", gravel: "Gravel", bike: "Bici",
  mtb: "MTB", hike: "Trekking", walk: "Camminata", run: "Corsa", alpine: "Alpinismo",
  other: "Altro",
};
// Swatch colors for the "Tracce" legend's per-activity km breakdown --
// its own small palette, same pattern as SURFACE_COLORS/HIGHWAY_COLORS
// above (an independent hex set, not the parchment theme's CSS vars).
export const ACTIVITY_COLORS = {
  touring: "#2563eb", road: "#dc2626", gravel: "#ca8a04", bike: "#0d9488",
  mtb: "#7c3aed", hike: "#16a34a", walk: "#65a30d", run: "#ea580c",
  alpine: "#57534e", other: "#9ca3af",
};
// Every distinct activity among the given tracks, most-common first --
// used both for the All Trips summary and each trip's picker row.
export function activityTallyHtml(tracks) {
  const counts = {};
  tracks.forEach(t => { counts[t.activity] = (counts[t.activity] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.map(([activity, count], i) => {
    const src = ACTIVITY_ICON[activity];
    const alt = ACTIVITY_LABELS[activity] || activity;
    const suffix = i === entries.length - 1 ? ` ${count === 1 ? "traccia" : "tracce"}` : "";
    return `<div class="activity-tally-item" title="${alt}">${src ? `<img class="day-icon" src="${src}" alt="${alt}">` : alt}<span>${count}${suffix}</span></div>`;
  }).join("");
}

// Trip identity color: an unbounded generator, not a fixed palette --
// any number of trips gets its own deterministic, muted color, keyed
// purely by rank (date order; oldest = rank 0), so a trip keeps its
// color forever as more trips are added around it.
//
// Hue alone rotates by the golden angle (137.508deg), the classic
// low-discrepancy choice for spreading unboundedly many points around a
// circle with no long-run clustering. But hue rotation by itself isn't
// colorblind-safe: two hues can sit on the same CVD "confusion line"
// regardless of how far apart they are in degrees. Lightness and chroma
// each get their own independent low-discrepancy walk (golden ratio and
// sqrt(2), both irrational and mutually incommensurate with the hue
// step and each other), so nearby ranks essentially never share a
// confusion line at the same lightness/chroma -- decorrelating the
// three channels this way is what the plain single-ring version (hue
// rotation at one fixed L/C) got wrong.
//
// Validated (dataviz skill's validator) up to 40 sequential ranks: worst
// *adjacent*-rank CVD separation clears the 8 target outright (a couple
// of the most saturated greens/teals dip just under 3:1 against the map
// casing -- ~2.9, the expected trade for higher chroma -- which is why
// every trip's swatch always keeps the cream casing halo behind it plus
// its name as visible relief, not color alone). Full all-pairs
// distinctness (every trip vs every other, not just neighbors) can't be
// guaranteed for an open-ended count -- even a hand-curated 8-hue set
// can only guarantee that for 3 -- so color is never the sole
// identifier here: every swatch always carries the trip's name alongside it.
const HUE_STEP_DEG = 137.508/3;       // golden angle
const L_PHASE_STEP = 0.6180339887;  // golden ratio conjugate
const C_PHASE_STEP = 0.4142135624;  // sqrt(2) - 1
const TRIP_COLOR_L_MIN = 0.50, TRIP_COLOR_L_MAX = 0.64; // mid lightness band
const TRIP_COLOR_C_MIN = 0.18, TRIP_COLOR_C_MAX = 0.24; // saturated, not muted
function frac(x) { return x - Math.floor(x); }
function oklchToHex(L, C, h) {
  const hRad = (h * Math.PI) / 180;
  const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toSrgb = (c) => {
    c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, c));
  };
  const toHex = (v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bb)}`;
}
function tripColorForRank(rank) {
  const hue = (rank * HUE_STEP_DEG) % 360;
  const L = TRIP_COLOR_L_MIN + (TRIP_COLOR_L_MAX - TRIP_COLOR_L_MIN) * frac(rank * L_PHASE_STEP + 0.15);
  const C = TRIP_COLOR_C_MIN + (TRIP_COLOR_C_MAX - TRIP_COLOR_C_MIN) * frac(rank * C_PHASE_STEP + 0.4);
  return oklchToHex(L, C, hue);
}

// Ranks every trip by date (seed_date: real start_t, or the GPX file's own
// mtime as a fallback for trips with no timestamps at all) and assigns
// each a permanent color by that rank. Ties (e.g. several undated trips
// sharing one fallback date) are broken by original array order, so the
// result is fully deterministic for a given trips.json.
export function assignTripColors(trips) {
  const ranked = trips.map((trip, i) => ({ trip, i })).sort((a, b) => {
    const da = a.trip.summary.seed_date || "", db = b.trip.summary.seed_date || "";
    return da < db ? -1 : da > db ? 1 : a.i - b.i;
  });
  ranked.forEach((entry, rank) => {
    entry.trip._rank = rank;
    entry.trip._color = tripColorForRank(rank);
  });
}
