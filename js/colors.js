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

// Gradient (% slope) buckets. Signed (not mirrored): downhill and uphill
// get distinct colors on one continuous red -> yellow -> green ramp,
// rather than the same color by steepness alone.
export const GRADE_BUCKETS = [
  { max: -20, color: "#166534", label: "< -20%" },
  { max: -10, color: "#16a34a", label: "-20 / -10%" },
  { max: -3, color: "#65a30d", label: "-10 / -3%" },
  { max: 3, color: "#eab308", label: "-3 / 3%" },
  { max: 10, color: "#f97316", label: "3 / 10%" },
  { max: 20, color: "#dc2626", label: "10 / 20%" },
  { max: Infinity, color: "#7f1d1d", label: "> 20%" },
];
export function gradeColor(grade) {
  for (const b of GRADE_BUCKETS) if (grade <= b.max) return b.color;
  return GRADE_BUCKETS[GRADE_BUCKETS.length - 1].color;
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