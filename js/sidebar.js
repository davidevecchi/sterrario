// ---- Sidebar: zoomable trips/days timeline, breadcrumb, legend, timeline strip ----

import { state } from "./state.js";
import { sampleArray, tripAllPoints, trackGradeSeries, trackCategorySeries, trackSidebarDayNumber, exploreScopeTracks, tracksEleMinMax } from "./geo.js";
import {
  SURFACE_COLORS, SURFACE_FALLBACK, SURFACE_LABELS, HIGHWAY_COLORS, HIGHWAY_FALLBACK,
  HIGHWAY_LABELS, GRADE_BUCKETS, gradeColor, altitudeBucket, buildAltitudeLegendBuckets, ACTIVITY_LABELS, ACTIVITY_COLORS, dayIconHtml, activityTallyHtml,
} from "./colors.js";
import { fmtKmRound, fmtM, fmtDuration, fmtDate, fmtDateRange, toRoman, realDayNumber } from "./format.js";
import { categoryPercents, visibleTracks, showTrackHoverHighlight, clearTrackHoverHighlight } from "./map-layers.js";
import { setLegendSelect, clearLegendSelect } from "./chart.js";
import { selectAll, selectTrip, selectDay } from "./selection.js";

// Three selection levels, always derivable from activeTripId/activeDayId
// rather than tracked separately, so they can never drift out of sync.
export function currentLevel() {
  if (state.activeDayId) return "track";
  if (state.activeTripId) return "trip";
  return "all";
}

// Display order for the All Trips list, per state.tripSort -- independent
// of each trip's permanent color rank (assigned once, ascending, at load).
// Ascending-order base comparators (smallest/oldest first); the actual
// sort direction is applied on top via state.tripSortDir, which flips on
// re-clicking the already-active sort button.
const TRIP_SORTERS = {
  date: (a, b) => (a.summary.seed_date || "").localeCompare(b.summary.seed_date || ""),
  distance: (a, b) => a.summary.total_distance_m - b.summary.total_distance_m,
  gain: (a, b) => a.summary.total_ele_gain - b.summary.total_ele_gain,
  days: (a, b) => a.summary.num_days - b.summary.num_days,
};
// Trips default to newest-first; tracks default to oldest-first (day 1
// first) since that's the natural way to read a single trip's itinerary.
export const TRIP_SORT_DEFAULT_DIR = { date: -1, distance: -1, gain: -1, days: -1 };
export const TRACK_SORT_DEFAULT_DIR = { date: 1, distance: -1, gain: -1, days: -1 };

function sortedTrips() {
  const cmp = TRIP_SORTERS[state.tripSort] || TRIP_SORTERS.date;
  return [...state.trips].sort((a, b) => cmp(a, b) * state.tripSortDir);
}

// Same sort keys as the trip list, applied to a single trip's tracks --
// "days" (Durata) maps to each track's own time duration instead of the
// trip's day count, since a track has no "number of days" of its own.
const TRACK_SORTERS = {
  date: (a, b) => (a.start_t || "").localeCompare(b.start_t || ""),
  distance: (a, b) => a.distance_m - b.distance_m,
  gain: (a, b) => a.ele_gain - b.ele_gain,
  days: (a, b) => a.duration_s - b.duration_s,
};
function sortedTracks(trip) {
  const cmp = TRACK_SORTERS[state.tripSort] || TRACK_SORTERS.date;
  return [...trip.tracks].sort((a, b) => cmp(a, b) * state.tripSortDir);
}

// Hover flyout under the trip chip, listing every trip so switching trips
// doesn't require a detour through the sidebar's own (now auto-collapsing)
// picker panel -- same list/order as that panel, just a quick-jump copy of
// it living right next to the "where am I" breadcrumb. "Tutti i viaggi"
// sits on top, set off from the trip list below by its own separator/rule
// (.crumb-dropdown-all's border-bottom).
function tripDropdownHtml(activeTripId) {
  // Always newest-first here, independent of the picker panel's current
  // sort/direction -- this flyout is a quick-jump list, not the sortable
  // picker, so it keeps one fixed, predictable order.
  const trips = [...state.trips].sort(TRIP_SORTERS.date).reverse();
  const items = trips.map((t, i) =>
    `<button type="button" class="crumb-dropdown-item${t.id === activeTripId ? " active" : ""}" data-trip-id="${t.id}"><span class="crumb-dropdown-index">${trips.length - i}.</span> ${t.name}</button>`
  ).join("");
  return `<div class="crumb-dropdown">
    <button type="button" class="crumb-dropdown-item crumb-dropdown-all" data-level="all">Tutti i viaggi</button>
    ${items}
  </div>`;
}

// "Giorni I-XX" range label for a trip's whole-days view, echoing the
// "Giorno <roman>" naming used for individual day chips/titles elsewhere --
// a single-day trip has no range to show, so it falls back to "Giorno I".
function allDaysLabel(trip) {
  return trip.summary.num_days <= 1 ? "Giorno I" : `Giorni I-${toRoman(trip.summary.num_days)}`;
}

// "Giorno <roman>" label for a single track, using the same real-calendar-day
// numbering (falling back to the name-parsed number) as the picker list's own
// day rows, rather than the track's raw name -- so the breadcrumb and its
// dropdown always agree with the picker on which day a track actually is.
function trackDayLabel(trip, track) {
  return `Giorno ${toRoman(realDayNumber(trip.summary.start_t, track.start_t) ?? trackSidebarDayNumber(track))}`;
}

// Hover flyout under the day chip, listing every track of the active trip
// (in its own day order, not the picker panel's current sort) so the whole
// trip can be paged through without leaving the map. Each row carries its
// activity icon, same as the sidebar's own day rows.
function trackDropdownHtml(trip, activeTrackId) {
  const items = trip.tracks.map((t, i) =>
    `<button type="button" class="crumb-dropdown-item${t.id === activeTrackId ? " active" : ""}" data-trip-id="${trip.id}" data-day-id="${t.id}"><span class="crumb-dropdown-index crumb-dropdown-index-day">${i + 1}.</span>${dayIconHtml(t)}<span>${trackDayLabel(trip, t)}</span></button>`
  ).join("");
  return `<div class="crumb-dropdown">
    ${items}
  </div>`;
}

export function renderBreadcrumb() {
  const nav = document.getElementById("breadcrumb");
  const level = currentLevel();
  const trip = state.activeTripId ? state.tripById[state.activeTripId] : null;
  const track = trip && state.activeDayId ? trip.tracks.find(t => t.id === state.activeDayId) : null;

  // The app title itself is the root crumb (click -> selectAll), so no
  // separate "Viaggi" segment is needed here -- it'd just repeat the title.
  document.getElementById("tripTitle").classList.toggle("crumb-current", level === "all");

  // Root ("Tutti i viaggi") and trip share a single chip -- "Tutti i
  // viaggi" is never shown alongside a trip name, only in place of it
  // before any trip is picked. Its hover dropdown always offers both "Tutti
  // i viaggi" and every trip regardless of which label is currently
  // showing, so switching back to the root level is always one hover away.
  const rootOrTripLabel = trip ? trip.name : "Tutti i viaggi";
  // The trip chip carries the colored "current" border whenever no single
  // day is active (root level, or a trip selected as a whole) -- the day
  // chip only takes it over once an actual day is picked.
  let html = `<span class="crumb-dropdown-wrap">
    <button type="button" class="crumb crumb-chip${!track ? " crumb-current" : ""}"
      ${trip ? `data-nav="trip" data-trip-id="${trip.id}"` : `data-nav="all"`}
      title="${rootOrTripLabel}" ${trip ? `style="--crumb-color:${trip._color}"` : ""}>${rootOrTripLabel}</button>
    ${tripDropdownHtml(trip ? trip.id : null)}
  </span>`;
  if (trip) {
    html += `<span class="crumb-sep">›</span>`;
    // "Giorni I-XX" is a read-only status, not a level of its own -- shown
    // faded (crumb-chip-disabled, not crumb-current) whenever the whole
    // trip is selected, with no click behavior and no data-nav; only an
    // actually active day gets the real current-chip treatment and a click
    // back up to the trip level.
    const dayLabel = track ? `${dayIconHtml(track)}<span>${trackDayLabel(trip, track)}</span>` : allDaysLabel(trip);
    html += `<span class="crumb-dropdown-wrap">
      <button type="button" class="crumb crumb-chip${track ? " crumb-current" : " crumb-chip-disabled"}" ${track ? `data-nav="trip" data-trip-id="${trip.id}"` : ""} title="${track ? trackDayLabel(trip, track) : allDaysLabel(trip)}" style="--crumb-color:${trip._color}">${dayLabel}</button>
      ${trackDropdownHtml(trip, track ? track.id : null)}
    </span>`;
  }
  nav.innerHTML = html;

  nav.querySelectorAll(".crumb[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.nav === "all") selectAll();
      else if (btn.dataset.nav === "trip") selectTrip(btn.dataset.tripId);
    });
  });
  nav.querySelectorAll(".crumb-dropdown-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.level === "all") selectAll();
      else if (btn.dataset.level === "all-days") selectTrip(btn.dataset.tripId);
      else if (btn.dataset.dayId) selectDay(btn.dataset.tripId, btn.dataset.dayId);
      else if (btn.dataset.tripId) selectTrip(btn.dataset.tripId);
    });
  });

  // Hovering the "Giorno" breadcrumb chip, or one of its dropdown rows,
  // glows the corresponding track on the map the same way the map's own
  // hover does (showTrackHoverHighlight) -- gives a way to spot a day's
  // route without having to go hunt for it on the map first.
  nav.querySelectorAll('.crumb-dropdown-item[data-day-id]').forEach(btn => {
    btn.addEventListener("mouseenter", () => showTrackHoverHighlight(btn.dataset.dayId));
    btn.addEventListener("mouseleave", () => clearTrackHoverHighlight());
  });
  if (track) {
    const dayCrumbWrap = nav.querySelectorAll(".crumb-dropdown-wrap")[1];
    const dayChipBtn = dayCrumbWrap && dayCrumbWrap.querySelector(".crumb-chip");
    if (dayChipBtn) {
      dayChipBtn.addEventListener("mouseenter", () => showTrackHoverHighlight(track.id));
      dayChipBtn.addEventListener("mouseleave", () => clearTrackHoverHighlight());
    }
  }
}

function renderTripSort() {
  const el = document.getElementById("tripSort");
  el.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.sort === state.tripSort));
}

// Drawn as if with a chisel nib held at 45° ("\") rather than a flat
// plotted line: segments running parallel to the nib go thin, segments
// crossing it go thick, giving the profile a hand-drawn hachure feel.
function sparklineSvg(points, w = 100, h = 28) {
  const eles = sampleArray(points, 40).map(p => p.ele).filter(e => e != null);
  if (eles.length < 2) return "";
  const min = Math.min(...eles), max = Math.max(...eles);
  const range = max - min || 1;
  const step = w / (eles.length - 1);
  const pad = 1, usableH = h - pad * 2;
  const xy = eles.map((e, i) => [i * step, h - pad - ((e - min) / range) * usableH]);
  const NIB_ANGLE = Math.PI / 4, MIN_W = 1, MAX_W = 2.6;
  const segs = [];
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
    const theta = Math.atan2(y1 - y0, x1 - x0);
    const sw = MIN_W + (MAX_W - MIN_W) * Math.abs(Math.sin(theta - NIB_ANGLE));
    segs.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${sw.toFixed(2)}"/>`);
  }
  return `<svg class="tl-spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><g fill="none" stroke="currentColor" stroke-linecap="round">${segs.join("")}</g></svg>`;
}

// Route shape thumbnail: normalizes lat/lon into a small square, correcting
// for longitude compression at the given latitude (1° lon != 1° lat) so the
// shape isn't stretched.
function routeThumbnailSvg(points, size = 40) {
  const samples = sampleArray(points, 60);
  if (samples.length < 2) return "";
  const avgLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
  const lonScale = Math.cos(avgLat * Math.PI / 180);
  const xs = samples.map(p => p.lon * lonScale);
  const ys = samples.map(p => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - 6) / span;
  const pts = samples.map((p, i) => `${(3 + (xs[i] - minX) * scale).toFixed(1)},${(3 + (ys[i] - minY) * scale).toFixed(1)}`).join(" ");
  return `<svg class="tl-thumb-svg" viewBox="0 0 ${size} ${size}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function renderPicker() {
  renderTripSort();
  const list = document.getElementById("pickerList");
  list.innerHTML = "";

  if (state.activeTripId) {
    const trip = state.tripById[state.activeTripId];

    sortedTracks(trip).forEach(track => {
      const li = document.createElement("li");
      li.className = "timeline-row" + (state.activeDayId === track.id ? " active" : "");
      li.innerHTML = `
        <div class="tl-thumb tl-thumb-icon">${dayIconHtml(track)}</div>
        <div class="tl-main">
          <div class="tl-title">${track._dayNumber}. Giorno ${toRoman(realDayNumber(trip.summary.start_t, track.start_t) ?? trackSidebarDayNumber(track))}, ${fmtDate(track.start_t, false)} <span class="tl-title-activity">– ${ACTIVITY_LABELS[track.activity] || track.activity}</span></div>
          <div class="tl-stats tl-stats-day">${fmtKmRound(track.distance_m)} · +${fmtM(track.ele_gain, false)}/-${fmtM(track.ele_loss)} · ${fmtDuration(track.duration_s)}</div>
        </div>
        <div class="tl-leaf" title="Seleziona questa tappa">●</div>`;
      li.addEventListener("click", () => {
        if (state.activeDayId === track.id) selectTrip(trip.id);
        else selectDay(trip.id, track.id);
      });
      list.appendChild(li);
    });
  } else {
    sortedTrips().forEach(trip => {
      const li = document.createElement("li");
      li.className = "timeline-row" + (state.activeTripId === trip.id ? " active" : "");
      li.innerHTML = `
        <div class="tl-thumb" style="color:${trip._color}">${routeThumbnailSvg(tripAllPoints(trip))}</div>
        <div class="tl-main">
          <div class="tl-title">${trip._buildIndex + 1}. ${trip.name} <span class="tl-title-activity">(${trip.summary.num_days} gg)</span></div>
          <div class="tl-stats">${fmtDateRange(trip.summary.start_t, trip.summary.end_t)} · ${fmtKmRound(trip.summary.total_distance_m)} · +${fmtM(trip.summary.total_ele_gain)}</div>
          <div class="tl-spark" style="color:${trip._color}">${sparklineSvg(tripAllPoints(trip))}</div>
          <div class="activity-tally tl-activity-tally">${activityTallyHtml(trip.tracks)}</div>
        </div>
        <div class="tl-chev">›</div>`;
      li.addEventListener("click", () => selectTrip(trip.id));
      list.appendChild(li);
    });
  }
}

export function showTripLevelFooter() {
  document.getElementById("elevationChartWrap").classList.remove("hidden");
  document.getElementById("dayTimelineStrip").classList.add("hidden");
  document.getElementById("colorModeToggle").classList.remove("hidden");
  if (state.chart) state.chart.resize();
}
export function showAllTripsFooter() {
  document.getElementById("elevationChartWrap").classList.add("hidden");
  document.getElementById("dayTimelineStrip").classList.remove("hidden");
  document.getElementById("colorModeToggle").classList.add("hidden");
}

// The footer's info row at the All Trips level -- without this it just
// kept showing whatever single trip/day was last charted, stale and
// misleading once you'd backed all the way out.
export function renderAllTripsFooterInfo() {
  const trips = state.trips;
  const totalDistance = trips.reduce((sum, t) => sum + t.summary.total_distance_m, 0);
  const totalGain = trips.reduce((sum, t) => sum + t.summary.total_ele_gain, 0);
  const totalDays = trips.reduce((sum, t) => sum + t.summary.num_days, 0);
  const totalPois = trips.reduce((sum, t) => sum + t.summary.num_pois, 0);
  document.getElementById("elevationDayInfo").innerHTML = `
    <span><b>Tutti i viaggi</b></span>
    <span>${trips.length} viaggi</span>
    <span>${fmtKmRound(totalDistance)}</span>
    <span>+${fmtM(totalGain, false)}</span>
    <span>${totalDays} gg</span>
    <span>${totalPois} POI</span>
  `;
}

// Builds the <div class="legend-item"> rows for a categorical legend:
// sorted by descending share, "unknown" pinned last (if present), and any
// row that rounds to 0% dropped -- rounds first so a category that reads
// as "0%" never lingers in the list. The gradient legend opts out of that
// drop (dropZero: false): its buckets are a fixed, known-in-advance set
// (unlike surface/highway, discovered from whatever's actually in the
// data), so the steepest buckets should stay visible as a reference even
// when nothing in the current view is that steep.
function legendItemRows(items, { sortByPct = true, dropZero = true } = {}) {
  let rows = items.map(it => ({ ...it, pct: Math.round(it.pct) }));
  if (dropZero) rows = rows.filter(it => it.pct > 0);
  if (sortByPct) rows = rows.sort((a, b) => (Number(!!a.isUnknown) - Number(!!b.isUnknown)) || (b.pct - a.pct));
  return rows.map(it => `
      <div class="legend-item" data-legend-type="${it.type}" data-legend-key="${it.key}" data-legend-color="${it.color}">
        <span class="swatch" style="background:${it.color}"></span>
        ${it.label} <span class="legend-pct">${it.pct}%</span>
      </div>`).join("");
}

// Renders exactly one legend section for the given mode ("trip", "surface",
// "highway", "gradient", or anything else to get all three category
// legends stacked). This is only ever fed the Esplora-dati panel's own
// exploreLegendMode -- never state.colorMode -- so browsing this legend
// never touches the map/chart's real color mode (see switchColorMode).
// The Esplora-dati legend always breaks down whatever's currently
// selected -- the one active day, the active trip's tracks, or (nothing
// selected) every track on the map -- rather than always the full map, so
// its percentages match what the halo/dimming is actually pointing at.
function renderLegend(mode) {
  const el = document.getElementById("modeLegend");
  el.classList.toggle("legend-readonly", !state.activeTripId);

  const tracks = exploreScopeTracks(visibleTracks());

  if (mode === "trip") {
    const activityPct = categoryPercents(tracks, track => track.activity || "other");
    el.innerHTML = `
      <div class="legend-group-title">Tracce</div>` +
      legendItemRows(Object.keys(activityPct).map(a => ({
        color: ACTIVITY_COLORS[a] || ACTIVITY_COLORS.other, label: ACTIVITY_LABELS[a] || a, pct: activityPct[a], type: "activity", key: a,
      })));
    return;
  }

  const surfaces = new Set();
  tracks.forEach(t => trackCategorySeries(t, "surface").forEach(s => { if (s) surfaces.add(s); }));
  const surfacePct = categoryPercents(tracks, (track, i) => trackCategorySeries(track, "surface")[i] || "unknown");
  const surfaceHtml = `
    <div class="legend-group-title">Fondo</div>` +
    legendItemRows([...surfaces].map(s => ({
      color: SURFACE_COLORS[s] || SURFACE_FALLBACK, label: SURFACE_LABELS[s] || s, pct: surfacePct[s] || 0, type: "surface", key: s,
    })).concat([{ color: SURFACE_FALLBACK, label: "Sconosciuto", pct: surfacePct.unknown || 0, isUnknown: true, type: "surface", key: "unknown" }]));

  const gradePct = categoryPercents(tracks, (track, i) => gradeColor(trackGradeSeries(track)[i]));
  const gradientHtml = `
    <div class="legend-group-title">Pendenza</div>
    <div class="legend-grade-pcts">${legendItemRows([...GRADE_BUCKETS].reverse().map(b => ({
      color: b.color, label: b.label, pct: gradePct[b.color] || 0, type: "gradient", key: b.color,
    })), { sortByPct: false, dropZero: false })}</div>`;

  // Scoped to whatever's currently selected (the one active day, the active
  // trip's tracks, or every track at the "all trips" level) -- see
  // tracksEleMinMax -- so the legend only lists rows this selection
  // actually reaches, instead of always listing the full global range's
  // rows even for a single flat day. The color scale itself still comes
  // from the global 99.5th-percentile elevation (state.eleRange.p995, see
  // buildAltitudeLegendBuckets) so a given altitude's color never depends
  // on what's selected.
  const scopedEleRange = tracksEleMinMax(tracks);
  state.altitudeLegendBuckets = buildAltitudeLegendBuckets(scopedEleRange.min, scopedEleRange.max, state.eleRange.p995);
  const altitudePct = categoryPercents(tracks, (track, i) => altitudeBucket(track.points[i].ele, state.altitudeLegendBuckets)?.color);
  const altimetryHtml = `
    <div class="legend-group-title">Altimetria</div>
    <div class="legend-grade-pcts">${legendItemRows(state.altitudeLegendBuckets.map(b => ({
      color: b.color, label: b.label, pct: altitudePct[b.color] || 0, type: "altimetry", key: b.color,
    })), { sortByPct: false, dropZero: false })}</div>`;

  const highways = new Set();
  tracks.forEach(t => trackCategorySeries(t, "highway").forEach(h => { if (h) highways.add(h); }));
  const highwayPct = categoryPercents(tracks, (track, i) => trackCategorySeries(track, "highway")[i] || "unknown");
  const highwayHtml = `
    <div class="legend-group-title">Tipo strada</div>` +
    legendItemRows([...highways].map(h => ({
      color: HIGHWAY_COLORS[h] || HIGHWAY_FALLBACK, label: HIGHWAY_LABELS[h] || h, pct: highwayPct[h] || 0, type: "highway", key: h,
    })).concat([{ color: HIGHWAY_FALLBACK, label: "Sconosciuto", pct: highwayPct.unknown || 0, isUnknown: true, type: "highway", key: "unknown" }]));

  el.innerHTML = mode === "surface" ? surfaceHtml
    : mode === "highway" ? highwayHtml
    : mode === "gradient" ? gradientHtml
    : mode === "altimetry" ? altimetryHtml
    : surfaceHtml + highwayHtml + gradientHtml + altimetryHtml;

  // setMapLegendSelect always overlays the match across every visible
  // track (see chart.js), which only reads as "this category, within the
  // current selection" once a trip is actually selected -- at the "all
  // trips" level there's no selection for it to scope to, so skip wiring
  // the click there entirely rather than showing a highlight that doesn't
  // correspond to anything.
  if (!state.activeTripId) return;

  el.querySelectorAll(".legend-item").forEach(item => {
    item.addEventListener("click", () => {
      const wasActive = item.classList.contains("active");
      el.querySelectorAll(".legend-item.active").forEach(i => i.classList.remove("active"));
      if (wasActive) {
        clearLegendSelect();
      } else {
        item.classList.add("active");
        setLegendSelect(item.dataset.legendType, item.dataset.legendKey, item.dataset.legendColor);
      }
    });
  });
}

// Which legend the Esplora-dati panel is browsing right now -- its own
// piece of UI state, deliberately independent of state.colorMode (the
// real color mode driving the map/chart, switched only by the footer's
// #colorModeToggle). Clicking these tabs must never call switchColorMode.
let exploreLegendMode = "trip";

export function renderExploreLegend() {
  document.querySelectorAll("#exploreLegendTabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === exploreLegendMode);
  });
  renderLegend(exploreLegendMode);
}

export function setExploreLegendMode(mode) {
  exploreLegendMode = mode;
  renderExploreLegend();
}

// Rough on-screen text width, used only to decide whether two labels
// would collide -- doesn't need to be exact, just in the right ballpark.
const _tlMeasureCtx = document.createElement("canvas").getContext("2d");
function timelineTextWidthPx(text, font) {
  _tlMeasureCtx.font = font;
  return _tlMeasureCtx.measureText(text).width;
}

// Picks a readable month step (1/2/3/6/12/24/36 months) for a calendar
// axis spanning [minMs, maxMs], aiming for roughly targetCount ticks, then
// returns each tick's timestamp + a label ("Mag" mid-year, "Gen '24" or
// just the year at a year boundary, depending on how coarse the step is).
function monthTicksForRange(minMs, maxMs, targetCount) {
  const start = new Date(minMs);
  const end = new Date(maxMs);
  const totalMonths = Math.max((end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1, 1);
  const STEPS = [1, 2, 3, 6, 12, 24, 36];
  const step = STEPS.find(s => totalMonths / s <= targetCount) || STEPS[STEPS.length - 1];
  const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / step) * step, 1);
  const ticks = [];
  while (cursor.getTime() <= end.getTime()) {
    const isYearStart = cursor.getMonth() === 0;
    const monthLabel = cursor.toLocaleDateString("it-IT", { month: "short" }).replace(/^./, c => c.toUpperCase());
    const label = step >= 12 ? String(cursor.getFullYear())
      : isYearStart ? `${monthLabel} '${String(cursor.getFullYear()).slice(2)}` : monthLabel;
    ticks.push({ ms: cursor.getTime(), label, isYearStart });
    cursor.setMonth(cursor.getMonth() + step);
  }
  return ticks;
}

// Lanes for a Gantt-style row of [leftPx, rightPx] bars, each with a name
// label that sits beside it (to the right, or to the left if it would run
// off the right edge) rather than inside -- so the label's own footprint,
// not just the bar's, is what has to clear before two trips share a lane.
function layoutGanttBarRows(items, widthPx) {
  const GAP = 6;
  items.forEach(it => {
    const fitsRight = it.rightPx + GAP + it.labelWidthPx <= widthPx;
    it.labelSide = fitsRight ? "right" : "left";
    it.occStart = fitsRight ? it.leftPx : Math.max(it.leftPx - GAP - it.labelWidthPx, 0);
    it.occEnd = fitsRight ? it.rightPx + GAP + it.labelWidthPx : it.rightPx;
  });
  const rowEnd = [];
  items.slice().sort((a, b) => a.occStart - b.occStart).forEach(it => {
    let row = 0;
    while (rowEnd[row] != null && rowEnd[row] > it.occStart) row++;
    rowEnd[row] = it.occEnd;
    it.row = row;
  });
  return rowEnd.length;
}

// The footer's Timeline view at the All Trips level: a real Gantt-style
// calendar-time chart. A month/year axis runs along the bottom (trips
// with real GPX timestamps get a bar spanning their true start-end range;
// trips with no timestamps at all, only a fallback seed_date, get a small
// dot instead, since there's no real duration to show honestly), and each
// trip lands in the first free lane above the baseline with its name
// printed in full beside the bar.
export function renderAllTripsTimelineStrip() {
  const wrap = document.getElementById("dayTimelineStrip");
  const trips = state.trips;
  if (!trips.length) { wrap.innerHTML = ""; return; }

  const panel = document.getElementById("elevationPanel");
  const header = document.getElementById("elevationHeader");
  // The strip itself may be the hidden tab right now (display:none, size
  // 0), so measure its always-visible ancestor instead.
  const widthPx = (panel.clientWidth - 20) || 800;
  const heightPx = (panel.clientHeight - header.offsetHeight - 8) || 160;

  const toMs = (iso) => iso ? new Date(iso).getTime() : null;
  const spans = trips.map(trip => {
    const s = trip.summary;
    const start = toMs(s.start_t) || toMs(s.seed_date);
    const end = toMs(s.end_t) || start;
    return { trip, start, end, isPoint: !s.start_t };
  });
  const globalMin = Math.min(...spans.map(sp => sp.start));
  const globalMax = Math.max(...spans.map(sp => sp.end));
  const span = Math.max(globalMax - globalMin, 1);
  const toX = (ms) => ((ms - globalMin) / span) * widthPx;

  const AXIS_LABEL_H = 16;
  const baselineY = heightPx - AXIS_LABEL_H - 6;

  const items = spans.map(({ trip, start, end, isPoint }) => {
    const leftPx = toX(start);
    // A trip bar is exactly as long as its real span -- only the tiny
    // undated "point" trips get an artificial fixed width.
    const rightPx = isPoint ? leftPx + 11 : Math.max(toX(end), leftPx + 3);
    const labelWidthPx = timelineTextWidthPx(trip.name, "600 11px sans-serif");
    return { trip, isPoint, leftPx, rightPx, labelWidthPx };
  });
  const numRows = layoutGanttBarRows(items, widthPx);
  const rowH = Math.min(22, Math.max(baselineY - 8, 20) / numRows);
  const barH = Math.max(8, rowH - 8);

  // Month grid: faint vertical lines across the full height, with a tick
  // label sitting just under the baseline -- a real scale to read trip
  // lengths against, instead of a bare undated line.
  const ticks = monthTicksForRange(globalMin, globalMax, 8);
  const gridHtml = ticks.map(t => {
    const leftPct = (toX(t.ms) / widthPx * 100).toFixed(2);
    return `
      <div class="dts-axis-grid${t.isYearStart ? " dts-axis-grid-year" : ""}" style="left:${leftPct}%"></div>
      <div class="dts-axis-tick-label" style="left:${leftPct}%;top:${baselineY + 6}px">${t.label}</div>`;
  }).join("");

  const barsHtml = items.map(({ trip, isPoint, leftPx, rightPx, row }) => {
    const bottom = baselineY - row * rowH;
    if (isPoint) {
      return `<button class="dts-gantt-point" style="left:${leftPx.toFixed(1)}px;top:${(bottom - barH / 2).toFixed(1)}px;background:${trip._color}" data-trip-id="${trip.id}" title="${trip.name}"></button>`;
    }
    return `<button class="dts-gantt-bar" style="left:${leftPx.toFixed(1)}px;width:${(rightPx - leftPx).toFixed(1)}px;top:${(bottom - barH).toFixed(1)}px;height:${barH}px;background:${trip._color}" data-trip-id="${trip.id}" title="${trip.name}"></button>`;
  }).join("");

  const labelsHtml = items.map(({ trip, leftPx, rightPx, row, labelSide }) => {
    const y = baselineY - row * rowH - barH / 2;
    const x = labelSide === "right" ? rightPx + 6 : leftPx - 6;
    const transform = labelSide === "right" ? "translateY(-50%)" : "translate(-100%, -50%)";
    return `<button class="dts-gantt-label" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:${transform}" data-trip-id="${trip.id}">${trip.name}</button>`;
  }).join("");

  wrap.innerHTML = `
    <div class="dts-axis-baseline" style="top:${baselineY}px"></div>
    ${gridHtml}${barsHtml}${labelsHtml}`;

  wrap.querySelectorAll(".dts-gantt-bar, .dts-gantt-point, .dts-gantt-label").forEach(btn => {
    btn.addEventListener("click", () => selectTrip(btn.dataset.tripId));
  });
}
