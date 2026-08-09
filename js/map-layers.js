// ---- Map layers: track rendering, halos/dimming, markers, hover tooltip ----

import { state } from "./state.js";
import { closestPointOnPolyline, trackSidebarDayNumber, trackGradeSeries, trackCategorySeries } from "./geo.js";
import { SURFACE_COLORS, SURFACE_FALLBACK, HIGHWAY_COLORS, HIGHWAY_FALLBACK, gradeColor, ACTIVITY_DASH, ACTIVITY_ICON, ACTIVITY_LABELS } from "./colors.js";
import { poiIconHtml } from "./poi-icons.js";
import { realDayNumber, fmtDate } from "./format.js";
import { toRoman } from "./format.js";
import { selectDay, selectTrip } from "./selection.js";
import { clearChartHover, onTrackHover } from "./chart.js";

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

// Where two different trips visited the same stretch of road/path (flagged
// build-time in each point's `near` list -- see build_trips.py), each
// trip draws its own thin line laterally offset from the others instead of
// one trip's line simply painting over the other's. The offset is done in
// screen pixels (map.project/unproject at the current zoom), which is
// zoom-dependent -- recomputed on "zoomend" via OFFSET_LINE_REGISTRY -- but
// pan-independent, since Leaflet's projected pixel coords for a given zoom
// don't depend on where the map is currently centered.
const SHARED_LANE_WEIGHT = 3;
const SHARED_CASING_WEIGHT = TRACK_CASING_WEIGHT + 6;
const LANE_SPACING_PX = 5;
const OFFSET_LINE_REGISTRY = [];

export function laneOffsetForPoint(selfBuildIndex, near) {
  const group = [selfBuildIndex, ...(near || [])].sort((a, b) => a - b);
  const pos = group.indexOf(selfBuildIndex);
  return (pos - (group.length - 1) / 2) * LANE_SPACING_PX;
}

// Splits a track's points into runs of consecutive segments that are all
// either "shared" (near non-empty) or not, so each run can be rendered as
// one continuous polyline. Runs share their boundary point with their
// neighbor, so there's no visual gap between them.
//
// Parallel shared-route lanes are disabled for now (always a single
// "not shared" run spanning the whole track) -- flip SHARED_LANES_ENABLED
// to bring them back; the per-point `near` data and offset machinery
// below are untouched.
const SHARED_LANES_ENABLED = false;
export function splitDayRuns(points) {
  if (!SHARED_LANES_ENABLED || points.length < 2) {
    return [{ start: 0, end: points.length - 1, shared: false }];
  }
  const runs = [];
  let segStart = 0;
  let curShared = !!(points[0].near && points[0].near.length);
  for (let i = 1; i < points.length - 1; i++) {
    const segShared = !!(points[i].near && points[i].near.length);
    if (segShared !== curShared) {
      runs.push({ start: segStart, end: i, shared: curShared });
      segStart = i;
      curShared = segShared;
    }
  }
  runs.push({ start: segStart, end: points.length - 1, shared: curShared });
  return runs;
}

// Offsets each latlng perpendicular to its local direction (toward its
// neighbors) by the matching entry in offsetsPx, in screen-pixel space at
// the map's current zoom.
export function offsetLatLngsByPoint(map, latlngs, offsetsPx) {
  const zoom = map.getZoom();
  const pts = latlngs.map(ll => map.project(ll, zoom));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1] || pts[i];
    const next = pts[i + 1] || pts[i];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const off = offsetsPx[i];
    out.push(map.unproject(L.point(pts[i].x + nx * off, pts[i].y + ny * off), zoom));
  }
  return out;
}

// Registers a shared-run polyline for offset recomputation, and applies
// the offset immediately if the map already has a zoom level (it won't
// yet at initial layer build time, before the first fitBounds/setView --
// recomputeOffsetLines() catches those once the view is set).
export function registerOffsetLine(layer, latlngs, offsetsPx) {
  OFFSET_LINE_REGISTRY.push({ layer, latlngs, offsetsPx });
  if (typeof state.map.getZoom() === "number") {
    layer.setLatLngs(offsetLatLngsByPoint(state.map, latlngs, offsetsPx));
  }
}

export function recomputeOffsetLines() {
  if (typeof state.map.getZoom() !== "number") return;
  OFFSET_LINE_REGISTRY.forEach(({ layer, latlngs, offsetsPx }) => {
    layer.setLatLngs(offsetLatLngsByPoint(state.map, latlngs, offsetsPx));
  });
}

export function initMap() {
  const map = L.map("map", { zoomControl: true });
  // Esri World Imagery: satellite/aerial imagery.
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  }).addTo(map);
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
  // A pane above the track/casing overlayPane (400) but below Leaflet's
  // markerPane (600) -- keeps the track start dots always on top of lines
  // but under every icon/POI/boundary marker.
  map.createPane("trackDotsPane");
  map.getPane("trackDotsPane").style.zIndex = 450;
  map.getPane("trackDotsPane").style.pointerEvents = "none";
  map.createPane("hoverPointPane");
  map.getPane("hoverPointPane").style.zIndex = 675;
  map.getPane("hoverPointPane").style.pointerEvents = "none";
  state.map = map;
  map.on("zoomend", recomputeOffsetLines);
  return map;
}

// ---- Map layers ----

function segmentColorForMode(mode, surface, highway, grade) {
  if (mode === "surface") return SURFACE_COLORS[surface] || SURFACE_FALLBACK;
  if (mode === "highway") return HIGHWAY_COLORS[highway] || HIGHWAY_FALLBACK;
  if (mode === "gradient") return gradeColor(grade);
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
  const segments = [];
  for (let i = 1; i < track.points.length; i++) {
    const prev = track.points[i - 1];
    const cur = track.points[i];
    const color = segmentColorForMode(
      mode,
      surfaces ? surfaces[i - 1] : undefined,
      highways ? highways[i - 1] : undefined,
      grades ? grades[i - 1] : undefined
    );
    segments.push({ prev, cur, color, latlngs: [[prev.lat, prev.lon], [cur.lat, cur.lon]] });
  }
  segments.forEach(s => {
    group.addLayer(L.polyline(s.latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 0.9 }));
  });
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    const seg = L.polyline(s.latlngs, { color: s.color, weight: TRACK_WEIGHT, opacity: 0.9 });
    seg._trackLineWeight = TRACK_WEIGHT;
    group.addLayer(seg);
  }
  segments.forEach(s => {
    const hitLine = L.polyline(s.latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
    hitLine._isHitLine = true;
    attachTrackHandlers(hitLine, trip, track, [s.prev, s.cur]);
    group.addLayer(hitLine);
  });
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
export function attachTrackHandlers(hitLine, trip, track, points) {
  const tooltipHtml = tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity);
  const tooltipOpts = { sticky: true, direction: "top", offset: [0, -10], className: "trip-marker-tooltip-wrap" };
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
    moveHoverTooltip(closestOnSeg(latlng));
    onTrackHover(trip, track, latlng);
  };
  hitLine.on("mouseover", (e) => {
    if (isActiveTrip()) showTrackHoverHighlight(track.id);
    else showTripHoverHighlight(trip.id);
    state.hoverTooltipOnLayer = true;
    showHoverTooltip(closestOnSeg(e.latlng), tooltipHtml, tooltipOpts);
  });
  hitLine.on("mouseout", () => {
    pendingLatLng = null;
    clearTrackHoverHighlight();
    clearChartHover();
    state.hoverTooltipOnLayer = false;
    hideHoverTooltip();
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
  const runs = splitDayRuns(track.points);
  runs.forEach(run => {
    const runPoints = track.points.slice(run.start, run.end + 1);
    const latlngs = runPoints.map(p => [p.lat, p.lon]);
    // Casing stays solid even though the line above it is dashed by
    // activity -- it reads as a continuous colored-dash "tube" rather than
    // a broken line, so the track is always easy to follow at a glance.
    if (!run.shared) {
      const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 0.9 });
      const line = L.polyline(latlngs, {
        color: trip._color, weight: TRACK_WEIGHT, opacity: 0.9,
        dashArray: ACTIVITY_DASH[track.activity] || null,
      });
      line._trackLineWeight = TRACK_WEIGHT;
      const hitLine = L.polyline(latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
      hitLine._isHitLine = true;
      attachTrackHandlers(hitLine, trip, track, runPoints);
      group.addLayer(casing);
      group.addLayer(line);
      group.addLayer(hitLine);
    } else {
      // A stretch shared with another trip: this trip's line is drawn
      // thinner and offset a few pixels to one side (see
      // laneOffsetForPoint/OFFSET_LINE_REGISTRY) instead of painting
      // directly over the other trip's line for the same road/path -- the
      // shared casing is drawn a bit wider to comfortably underlie every
      // trip's offset line here, not just this one.
      const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: SHARED_CASING_WEIGHT, opacity: 0.9 });
      const line = L.polyline(latlngs, {
        color: trip._color, weight: SHARED_LANE_WEIGHT, opacity: 0.95,
        dashArray: ACTIVITY_DASH[track.activity] || null,
      });
      line._trackLineWeight = SHARED_LANE_WEIGHT;
      const hitLine = L.polyline(latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
      hitLine._isHitLine = true;
      attachTrackHandlers(hitLine, trip, track, runPoints);
      group.addLayer(casing);
      group.addLayer(line);
      group.addLayer(hitLine);
      const offsetsPx = runPoints.map(p => laneOffsetForPoint(trip._buildIndex, p.near));
      registerOffsetLine(line, latlngs, offsetsPx);
      registerOffsetLine(hitLine, latlngs, offsetsPx);
    }
  });

  return { day: group, mainLine, segmentGroups: {} };
}

// One icon per POI, created once and never swapped: `setIcon()` replaces
// the marker's DOM node, which can desync Leaflet's hover listeners from
// the new element and leave a pin stuck open. Instead both the resting dot
// and the full signpost pin are always in the DOM, and CSS classes on the
// (stable) icon element -- "expanded" on hover, "highlighted" when opened --
// decide which one is visible.
export function poiMarkerIcon(poi, color) {
  const glyph = poiIconHtml(poi);
  return L.divIcon({
    className: "poi-marker",
    html: `
      <div style="--poi-color: ${color}">
        <div class="poi-marker-dot"></div>
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

// Only one hover-expanded pin at a time: expanding a new one always
// collapses whichever was previously hover-expanded first.
export function setHoveredPoiMarker(marker) {
  if (state.hoveredPoiMarker && state.hoveredPoiMarker !== marker) {
    const prevEl = state.hoveredPoiMarker.getElement();
    if (prevEl) prevEl.classList.remove("expanded");
  }
  state.hoveredPoiMarker = marker;
  const el = marker.getElement();
  if (el) el.classList.add("expanded");
}
export function clearHoveredPoiMarker(marker) {
  const el = marker.getElement();
  if (el) el.classList.remove("expanded");
  if (state.hoveredPoiMarker === marker) state.hoveredPoiMarker = null;
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

// Only the specifically selected day (same scope as chartedTrackIds/the
// selection halo) ever shows the surface/highway/gradient coloring; every
// other track -- including the rest of a trip selected without a day --
// always stays in its own trip's identity color, no matter what
// "Colora tracce per" is set to.
export function applyColorMode() {
  const charted = new Set(chartedTrackIds());
  Object.keys(state.dayLayers).forEach(trackId => {
    const targetMode = charted.has(trackId) ? state.colorMode : "trip";
    const layers = state.dayLayers[trackId];
    const current = currentModeForTrack(trackId);
    if (current === targetMode) return;
    const oldGroup = groupForMode(trackId, current);
    const newGroup = groupForMode(trackId, targetMode);
    if (state.map.hasLayer(oldGroup)) state.map.removeLayer(oldGroup);
    newGroup.addTo(state.map);
    layers._currentMode = targetMode;
  });
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

// The track(s) backing the halo/color-mode scoping -- just the one
// selected day. Selecting a trip alone (no day picked) shows no halo and
// no forced color-mode coloring, same as the default "nothing selected"
// view.
export function chartedTrackIds() {
  return state.activeDayId ? [state.activeDayId] : [];
}

// The track(s) that stay full-opacity (everything else dims): the whole
// active trip, whether or not a specific day within it is picked.
export function dimmedTrackIds() {
  if (!state.activeTripId) return [];
  const trip = state.tripById[state.activeTripId];
  return trip ? trip.tracks.map(t => t.id) : [];
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

export function updateSelectionHighlight() {
  if (!state.selectionHighlight) state.selectionHighlight = L.layerGroup().addTo(state.map);
  state.selectionHighlight.clearLayers();
  chartedTrackIds().forEach(trackId => {
    const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
    if (halo) halo.addTo(state.selectionHighlight);
  });
  // A click that changes the selection can fire while the cursor is still
  // sitting on the hit-line it just selected -- clear any stale hover
  // halo so it doesn't linger under/alongside the new selection halo.
  clearTrackHoverHighlight();
  updateTrackDimming();
  updateDotWeights();
}

// Once a trip is active, every track outside it fades out so the active
// trip pops against the rest of the map -- applies to whichever
// color-mode group is currently shown for each track, casing included, so
// dimming stays correct across "Colora tracce per" switches too. Picking a
// specific day within the trip only narrows the halo/color-mode (see
// chartedTrackIds), not the dimming: the rest of that trip's tracks stay
// at full opacity too.
export function updateTrackDimming() {
  const charted = new Set(dimmedTrackIds());
  const dimActive = charted.size > 0;
  const selectedTrackId = state.activeDayId || null;
  Object.keys(state.dayLayers).forEach(trackId => {
    const isCharted = !dimActive || charted.has(trackId);
    const opacity = isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY;
    const isSelectedTrack = trackId === selectedTrackId;
    const group = groupForMode(trackId, currentModeForTrack(trackId));
    group.eachLayer(layer => {
      if (!layer.setStyle) return;
      // The invisible wide hit-line (see TRACK_HIT_WEIGHT) must always
      // stay fully transparent -- it has nothing to do with the
      // charted/dimmed distinction being applied here -- but it still
      // needs to be brought to front along with its casing/line below, or
      // else the click/hover area ends up buried under the now-topmost
      // casing/line and only the hit-line's margin outside them stays
      // clickable.
      if (!layer._isHitLine) {
        const weight = layer._trackLineWeight !== undefined
          ? (isSelectedTrack ? SELECTED_TRACK_WEIGHT : layer._trackLineWeight)
          : undefined;
        layer.setStyle(weight !== undefined ? { opacity, weight } : { opacity });
      }
      // Charted tracks draw above every dimmed one (casing, line, then
      // hit-line, in creation order), so the selected trip/day is never
      // hidden under an unrelated track it happens to cross.
      if (isCharted && dimActive && layer.bringToFront) layer.bringToFront();
    });
    const dot = state.startDotByTrackId[trackId];
    if (dot) dot.setStyle({ opacity: isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY / 2, fillOpacity: isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY / 2 });
  });
}

// Brings a track's casing+line (in whichever color mode is currently
// shown) to the top of the map's drawing order, so it isn't hidden under
// some other track it happens to cross.
function bringTrackToFront(trackId) {
  const group = groupForMode(trackId, currentModeForTrack(trackId));
  group.eachLayer(layer => { if (layer.bringToFront) layer.bringToFront(); });
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
const MARKER_ITEM_RANK_UNIT = 1e5;
export function markerZIndexOffset(trip, rank) {
  return trip._buildIndex * MARKER_TRIP_RANK_UNIT + rank * MARKER_ITEM_RANK_UNIT;
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
// Sets each dot's stroke weight to match its track's current halo state:
// enlarged when the track has a selection or hover halo, resting otherwise.
export function updateDotWeights(hoveredTrackIds = new Set()) {
  const selected = new Set(chartedTrackIds());
  Object.entries(state.startDotByTrackId).forEach(([trackId, dot]) => {
    const hasHalo = selected.has(trackId) || hoveredTrackIds.has(trackId);
    dot.setStyle({ weight: hasHalo ? 2 * (TRACK_CASING_WEIGHT - TRACK_WEIGHT) : 2 });
  });
}

export function showTrackHoverHighlight(trackId) {
  if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
  state.hoverHighlight.clearLayers();
  const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
  if (halo) halo.addTo(state.hoverHighlight);
  bringTrackToFront(trackId);
  updateDotWeights(new Set([trackId]));
}
// Same, but for every track of a whole trip at once -- used when hovering
// a track that isn't (yet) the active trip's own, so the halo previews
// "clicking this selects the trip" rather than pretending to single out
// just the one day under the cursor.
export function showTripHoverHighlight(tripId) {
  if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
  state.hoverHighlight.clearLayers();
  state.tripById[tripId].tracks.forEach(track => {
    const halo = trackHaloLayer(track.id, SELECTION_HIGHLIGHT_WEIGHT);
    if (halo) halo.addTo(state.hoverHighlight);
    bringTrackToFront(track.id);
  });
  updateDotWeights(new Set(state.tripById[tripId].tracks.map(t => t.id)));
}
export function clearTrackHoverHighlight() {
  if (state.hoverHighlight) state.hoverHighlight.clearLayers();
  // Hovering briefly raised some other track above the current
  // selection -- once the hover ends, restore the selected trip/day back
  // on top.
  updateDotWeights();
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

export function tripMarkerIcon(shape, color, { dayNumber, bearing, roundTrip } = {}) {
  const size = 30;
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
  return L.divIcon({
    // Leaflet's own hover/click listeners live on this outer icon element
    // (fixed at iconSize, never transformed) rather than on the inner
    // `.trip-marker-triangle`/`.trip-marker-square`/`.trip-marker-ring`
    // div it wraps -- see the CSS ":hover" rules keyed off
    // "trip-marker-hit" for why that separation matters.
    className: "trip-marker-hit",
    html: `<div class="trip-marker ${shapeClass}" style="--marker-color:${color}">${inner}</div>`,
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

// A plain dot at every track's own start (including day 1's, unlike the
// per-day activity-start cluster markers above, which skip day 1) --
// styled like the track itself, a
// casing-ringed dot in the trip's color, so there's always a visible
// anchor at each day's start even underneath the fancier icon pins.
// Unlike the trip-boundary/activity-icon marker groups, these stay on the
// map unconditionally -- at every trip and every level, including the All
// Trips overview -- rather than being scoped to the active trip. Returned
// rather than added directly: the map has no view/zoom yet when trips are
// first built (that only happens once selectAll's fitBounds runs, at the
// end of main()), and Leaflet's Path renderer throws if a circleMarker is
// added before then -- so the caller adds the combined group to the map
// only once the view is established. Non-interactive: it's purely
// decorative, sitting between the track lines and the icon/POI markers,
// and shouldn't steal hover/click from either.
export function trackStartDots(trip) {
  return trip.tracks.map(track => {
    const p = track.points[0];
    const dot = L.circleMarker([p.lat, p.lon], {
      radius: TRACK_WEIGHT-1,
      color: "#f7f2e4",
      weight: 4,
      fillColor: trip._color,
      fillOpacity: 1,
      opacity: FULL_TRACK_OPACITY,
      interactive: false,
      pane: "trackDotsPane",
      className: "track-start-dot",
    });
    state.startDotByTrackId[track.id] = dot;
    return dot;
  });
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
