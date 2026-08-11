// ---- Elevation chart ----

import { state } from "./state.js";
import {
  trackGradeSeries, trackCategorySeries, tripGradeMinMax, nearestPointOnTrack, exploreScopeTracks,
} from "./geo.js";
import {
  SURFACE_COLORS, SURFACE_FALLBACK, SURFACE_LABELS, HIGHWAY_COLORS, HIGHWAY_FALLBACK,
  HIGHWAY_LABELS, gradeColor, altitudeBucket, dayIconHtml,
} from "./colors.js";
import { fmtKmRound, fmtM, fmtDuration, fmtDateRange } from "./format.js";
import { poiIconHtml, poiIcoName, drawIcoPath, icoHtml } from "./poi-icons.js";
import { visibleTracks, showHoverMarker, clearMapHover, segmentColorForMode, LEGEND_HIGHLIGHT_WIDTH, LEGEND_HIGHLIGHT_HALO_WIDTH } from "./map-layers.js";
import { openPoiByIndex } from "./poi.js";
import { openPhoto } from "./photos.js";
import { selectDay, selectAll, selectTrip } from "./selection.js";
import { perfMark } from "./perf-debug.js";

const OFFTRACK_THRESHOLD_M = 1500;

// All of a trip's POIs that fall near a given track, positioned by their
// nearest point on that track -- used to plot POI markers on the altitude chart.
export function poiChartPointsForTrack(trip, track, offsetKm) {
  const list = [];
  trip.pois.forEach((poi, i) => {
    const { alongDist, offDist, idx } = nearestPointOnTrack(poi.lat, poi.lon, track);
    if (offDist > OFFTRACK_THRESHOLD_M) return;
    list.push({ x: offsetKm + alongDist / 1000, y: track.points[idx].ele, tripId: trip.id, poiIndex: i, sym: poi.sym, cmt: poi.cmt, desc: poi.desc });
  });
  return list;
}

// A trip's photos already know which day they belong to (day_id, set at
// import time from the GPX track it was shot closest to in time) -- so
// unlike POIs, no nearest-track search is needed, just an exact match.
export function photoChartPointsForTrack(trip, track, offsetKm) {
  const photos = state.photosByTrip[trip.id] || [];
  const list = [];
  photos.forEach((photo, i) => {
    if (photo.day_id !== track.id) return;
    const { alongDist, offDist, idx } = nearestPointOnTrack(photo.lat, photo.lon, track);
    if (offDist > OFFTRACK_THRESHOLD_M) return;
    list.push({ x: offsetKm + alongDist / 1000, y: track.points[idx].ele, tripId: trip.id, photoIndex: i });
  });
  return list;
}

const dayBoundaryPlugin = {
  id: "dayBoundaries",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.dayBoundaries;
    const boundaries = opts && opts.boundaries;
    if (!boundaries || !boundaries.length) return;
    const { ctx, chartArea, scales } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(169,130,76,0.7)";
    ctx.lineWidth = 1;
    ctx.font = "10px Jost, sans-serif";
    ctx.fillStyle = "rgba(140,105,60,0.95)";
    boundaries.forEach(b => {
      const x = scales.x.getPixelForValue(b.x);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.save();
      ctx.translate(x + 3, chartArea.top + 10);
      ctx.fillText(b.label, 0, 0);
      ctx.restore();
    });
    ctx.restore();
  },
};

// Click/hover on a day boundary line jumps to that day (renderWholeTripChart
// is the only caller that ever passes boundaries; renderDayChart passes
// none, so this is a no-op at the single-day level). `thresholdPx` is
// generous since the line itself is only 1px wide.
function nearestDayBoundary(chart, offsetX, thresholdPx = 6) {
  const opts = chart.options.plugins && chart.options.plugins.dayBoundaries;
  const boundaries = opts && opts.boundaries;
  if (!boundaries || !boundaries.length) return null;
  let best = null, bestDist = Infinity;
  boundaries.forEach(b => {
    const x = chart.scales.x.getPixelForValue(b.x);
    const dist = Math.abs(x - offsetX);
    if (dist < bestDist) { bestDist = dist; best = b; }
  });
  return bestDist <= thresholdPx ? best : null;
}

// Draws the POI's emoji icon above its point on the altitude line, but only
// while it's hovered -- the point itself stays a plain small dot otherwise.
// Dashed crosshair through whatever is currently "of interest": the hovered
// point if any, else the POI currently open in the signpost card (if it's
// plotted on this chart).
const crosshairPlugin = {
  id: "crosshair",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.crosshair;
    if (!opts) return;
    let x, y;

    // Directly-hovered POI takes priority (exact snap to its position),
    // then whatever Chart's own "index" hover naturally found (i.e. the
    // nearest point on the elevation line under the cursor), then the
    // signpost card's currently-open POI as a fallback.
    if (chart._hoverPoi) {
      const meta = chart.getDatasetMeta(chart._hoverPoi.datasetIndex);
      const point = meta.data[chart._hoverPoi.index];
      if (point) { x = point.x; y = point.y; }
    } else if (chart._hoverPhoto) {
      const meta = chart.getDatasetMeta(chart._hoverPhoto.datasetIndex);
      const point = meta.data[chart._hoverPhoto.index];
      if (point) { x = point.x; y = point.y; }
    }

    if (x === undefined) {
      const active = chart.getActiveElements ? chart.getActiveElements() : [];
      if (active.length) {
        const meta = chart.getDatasetMeta(active[0].datasetIndex);
        const point = meta.data[active[0].index];
        if (point) { x = point.x; y = point.y; }
      }
    }

    if (x === undefined && opts.poiPoints) {
      const idx = opts.poiPoints.findIndex(p => isSelectedPoiPoint(p));
      if (idx !== -1) {
        const meta = chart.getDatasetMeta(1);
        const point = meta.data[idx];
        if (point) { x = point.x; y = point.y; }
      }
    }
    if (x === undefined) return;

    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.strokeStyle = "rgba(140,105,60,0.6)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.moveTo(chartArea.left, y);
    ctx.lineTo(chartArea.right, y);
    ctx.stroke();
    ctx.restore();
  },
};

// Thickens the elevation line itself, in place, exactly where the hovered
// sidebar legend entry occurs -- not a flat strip elsewhere, so it reads as
// "this line, but just the matching bits". If the segment's own current
// color (whatever the active color mode is showing there) doesn't already
// match the hover color, a white halo is drawn underneath first so the
// highlight doesn't just blend into an adjacent, differently-colored bit
// of line.
// The elevation-line data index currently "of interest" -- whatever's
// hovered directly on the chart, or hovered on the map via onTrackHover
// (both go through setActiveElements), matching crosshairPlugin's own
// priority order minus the signpost-POI fallback (a POI hover shouldn't
// brighten the area fill).
function chartHoverIndex(chart) {
  if (chart._hoverPoi || chart._hoverPhoto) return null;
  const active = chart.getActiveElements ? chart.getActiveElements() : [];
  const el = active.find(a => a.datasetIndex === 0);
  return el ? el.index : null;
}

// The one predicate behind every "does this point belong to the
// hovered/selected legend category" check -- on the chart it's called
// directly against a chartPoint; on the map (setMapLegendSelect below)
// it's called against a plain {surface, highway, grade, ele} descriptor
// built from the track's own per-point series, so both ends of the same
// legend-select interaction always agree on what counts as a match.
function legendCategoryMatches(type, key, p) {
  if (type === "surface") return (p.surface || "unknown") === key;
  if (type === "highway") return (p.highway || "unknown") === key;
  if (type === "gradient") return gradeColor(p.grade || 0) === key;
  if (type === "altimetry") return altitudeBucket(p.ele, state.altitudeLegendBuckets)?.color === key;
  return false;
}

// The line dataset's segment.backgroundColor callback (below) needs
// chartHoverIndex() to decide whether a given segment touches the hovered
// point -- but Chart.js invokes that callback once per segment, and the
// hovered index is the same for the whole draw. Calling chartHoverIndex()
// (which calls chart.getActiveElements()) freshly inside every one of a
// multi-thousand-segment whole-trip chart's segment callbacks, every single
// draw, is the same "redone thousands of times per frame" problem
// computeChartColors above was written to avoid -- so it's cached here once
// per draw instead, same fix.
const hoverIndexCachePlugin = {
  id: "hoverIndexCache",
  beforeDatasetsDraw(chart) {
    chart._cachedHoverIdx = chartHoverIndex(chart);
  },
};

const legendHighlightPlugin = {
  id: "legendHighlight",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.legendHighlight;
    const chartPoints = opts && opts.chartPoints;
    const hover = chart._legendSelect;
    if (!chartPoints || !hover) return;

    const ownColors = chart._chartColors || [];
    const segments = [];
    let needsHalo = false;
    for (let i = 0; i < chartPoints.length - 1; i++) {
      if (!legendCategoryMatches(hover.type, hover.key, chartPoints[i])) continue;
      segments.push(i);
      if ((ownColors[i] || "#888") !== hover.color) needsHalo = true;
    }
    if (!segments.length) return;

    const { ctx, scales, chartArea } = chart;

    // The fill highlight itself is handled by the dataset's own
    // `segment.backgroundColor` (bumping alpha for matching segments) --
    // that's Chart.js's native continuous-shape fill, so it has no seams.
    // Drawing separate overlapping quads here instead produced visible
    // vertical stripes at each segment boundary from the anti-aliased edges
    // double-stacking alpha.

    const drawPass = (width, color, yFor) => {
      ctx.save();
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      segments.forEach(i => {
        const p0 = chartPoints[i], p1 = chartPoints[i + 1];
        ctx.beginPath();
        ctx.moveTo(scales.x.getPixelForValue(p0.distKm), yFor(p0));
        ctx.lineTo(scales.x.getPixelForValue(p1.distKm), yFor(p1));
        ctx.stroke();
      });
      ctx.restore();
    };
    const onPathY = (p) => scales.y.getPixelForValue(p.ele);
    const baselineY = () => chartArea.bottom;

    if (needsHalo) drawPass(LEGEND_HIGHLIGHT_HALO_WIDTH, "#f7f2e4", onPathY);
    drawPass(LEGEND_HIGHLIGHT_WIDTH, hover.color, onPathY);
    // Also restated along the bottom (y=0) axis, so the highlighted
    // stretch is visible at a glance without following the line's climbs.
    drawPass(LEGEND_HIGHLIGHT_WIDTH, hover.color, baselineY);
  },
};

// Despite the "hover" name lingering in the older map/chart variable
// names below, this is actually click-triggered from the Esplora-dati
// legend (see sidebar.js's renderLegend) -- clicking a legend row
// toggles it selected/deselected, it doesn't track the mouse. Named
// "select" rather than "hover" throughout to match the real trigger.
function setChartLegendSelect(type, key, color) {
  if (!state.chart) return;
  state.chart._legendSelect = { type, key, color };
  state.chart.draw();
}
function clearChartLegendSelect() {
  if (!state.chart) return;
  state.chart._legendSelect = null;
  state.chart.draw();
}

// Same idea on the map: a white halo + colored overlay drawn only over the
// segments of the currently-visible tracks that match the selected legend
// category, as a temporary layer removed again on deselect. Reuses the
// exact same legendCategoryMatches predicate as the chart, fed a
// descriptor built from the track's own per-point series instead of a
// chartPoint, so map and chart can never disagree on what counts as a match.
function setMapLegendSelect(type, key, color) {
  clearMapLegendSelect();
  const segments = [];
  exploreScopeTracks(visibleTracks()).forEach(track => {
    const surfaces = trackCategorySeries(track, "surface");
    const highways = trackCategorySeries(track, "highway");
    const grades = trackGradeSeries(track);
    for (let i = 1; i < track.points.length; i++) {
      const descriptor = { surface: surfaces[i - 1], highway: highways[i - 1], grade: grades[i - 1], ele: track.points[i - 1].ele };
      if (!legendCategoryMatches(type, key, descriptor)) continue;
      segments.push([[track.points[i - 1].lat, track.points[i - 1].lon], [track.points[i].lat, track.points[i].lon]]);
    }
  });
  if (!segments.length) return;
  const group = L.layerGroup([
    L.polyline(segments, { color: "#f7f2e4", weight: LEGEND_HIGHLIGHT_HALO_WIDTH, opacity: 0.95 }),
    L.polyline(segments, { color, weight: LEGEND_HIGHLIGHT_WIDTH, opacity: 1 }),
  ]);
  group.addTo(state.map);
  state.mapLegendSelectHighlight = group;
}
function clearMapLegendSelect() {
  if (state.mapLegendSelectHighlight) { state.map.removeLayer(state.mapLegendSelectHighlight); state.mapLegendSelectHighlight = null; }
}

export function setLegendSelect(type, key, color) {
  setChartLegendSelect(type, key, color);
  setMapLegendSelect(type, key, color);
}
export function clearLegendSelect() {
  clearChartLegendSelect();
  clearMapLegendSelect();
}

const poiIconHoverPlugin = {
  id: "poiIconHover",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.poiIconHover;
    const poiPoints = opts && opts.poiPoints;
    const el = chart._hoverPoi;
    if (!poiPoints || !el) return;
    const p = poiPoints[el.index];
    if (!p) return;
    const meta = chart.getDatasetMeta(el.datasetIndex);
    const point = meta.data[el.index];
    if (!point) return;
    const { x, y } = point;

    const { ctx } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f2e4";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ab2328";
    ctx.stroke();
    ctx.fillStyle = "#ab2328";
    drawIcoPath(ctx, poiIcoName(p), x, y - 16, 16);
    ctx.restore();
  },
};

// Same enlarge-on-hover treatment as poiIconHoverPlugin, but for the photo
// markers (teal ring instead of red, camera glyph instead of the POI's).
const photoIconHoverPlugin = {
  id: "photoIconHover",
  afterDatasetsDraw(chart) {
    const el = chart._hoverPhoto;
    if (!el) return;
    const meta = chart.getDatasetMeta(el.datasetIndex);
    const point = meta.data[el.index];
    if (!point) return;
    const { x, y } = point;

    const { ctx } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#f7f2e4";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#1f4d47";
    ctx.stroke();
    ctx.fillStyle = "#1f4d47";
    drawIcoPath(ctx, "photo_camera", x, y - 16, 16);
    ctx.restore();
  },
};

// Highest point, lowest point, and the two steepest spots on the profile
// (by |gradient|, at least a bit apart from each other so they don't both
// land on the same climb/descent).
function findKeyPoints(chartPoints) {
  if (!chartPoints.length) return null;
  let maxP = null, minP = null;
  chartPoints.forEach(p => {
    if (p.ele == null) return;
    if (!maxP || p.ele > maxP.ele) maxP = p;
    if (!minP || p.ele < minP.ele) minP = p;
  });

  const totalKm = chartPoints[chartPoints.length - 1].distKm;
  const minSepKm = Math.max(totalKm * 0.03, 0.2);
  // Consumer GPS elevation can be off by tens of meters; over a short
  // stretch that reads as an absurd grade (100%+) that isn't real terrain.
  // Anything beyond a generous real-world cap is almost certainly noise,
  // not a genuine steep section, so it's excluded from consideration.
  const REALISTIC_GRADE_CAP = 45;
  const bySteepness = chartPoints
    .filter(p => p.grade != null && Math.abs(p.grade) <= REALISTIC_GRADE_CAP)
    .slice()
    .sort((a, b) => Math.abs(b.grade) - Math.abs(a.grade));
  const steep = [];
  for (const p of bySteepness) {
    if (steep.length >= 2) break;
    if (steep.every(s => Math.abs(s.distKm - p.distKm) >= minSepKm)) steep.push(p);
  }
  return { maxP, minP, steep };
}

// Marks the highest/lowest elevation and the two steepest points on the
// graph with a small tick + dot + label, like the signposts do on the map.
const keyPointsPlugin = {
  id: "keyPoints",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.keyPoints;
    const chartPoints = opts && opts.chartPoints;
    if (!chartPoints || !chartPoints.length) return;
    if (chart._keyPointsCacheRef !== chartPoints) {
      chart._keyPointsCache = findKeyPoints(chartPoints);
      chart._keyPointsCacheRef = chartPoints;
    }
    const kp = chart._keyPointsCache;
    if (!kp) return;

    const { ctx, chartArea, scales } = chart;
    const drawMark = (p, label, color) => {
      if (!p) return;
      const x = scales.x.getPixelForValue(p.distKm);
      const y = scales.y.getPixelForValue(p.ele);
      if (x < chartArea.left || x > chartArea.right) return;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.bottom);
      ctx.lineTo(x, chartArea.bottom - 8);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#f7f2e4";
      ctx.stroke();

      const labelBelow = y - 10 < chartArea.top + 10;
      ctx.font = "10px Jost, sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = labelBelow ? "top" : "bottom";
      ctx.fillText(label, x, labelBelow ? y + 10 : y - 10);
      ctx.restore();
    };

    drawMark(kp.maxP, `▲ ${Math.round(kp.maxP.ele)} m`, "#7f1d1d");
    drawMark(kp.minP, `▼ ${Math.round(kp.minP.ele)} m`, "#1f4d47");
    kp.steep.forEach(p => drawMark(p, `${p.grade > 0 ? "+" : ""}${Math.round(p.grade)}%`, gradeColor(p.grade)));
  },
};

// Same mode-to-color mapping as the map's own buildSegmentGroup, via the
// shared segmentColorForMode -- covers every mode except "trip" (no
// segment coloring of its own), which is why the fallback to the trip's
// own identity color lives here rather than inside the shared function.
// Resolved once per chartPoints/colorMode (not per segment): Chart.js
// invokes a segment style callback for every single point on every single
// draw -- and this line redraws in full on every mousemove (the crosshair
// plugin has to track the cursor), so for a multi-thousand-point whole-trip
// chart that's the same gradeColor()/surface-lookup work redone thousands
// of times per frame. A plain array lookup is the fix; segmentColorForMode
// itself still only runs once per point here.
function computeChartColors(chartPoints) {
  return chartPoints.map(p => segmentColorForMode(state.colorMode, p.surface, p.highway, p.grade, p.ele) || p.color || "#e01b24");
}

// Groups consecutive same-colored points into runs, exactly like
// map-layers.js's buildSegmentGroup does for the map's own polylines --
// feeds borderRunsPlugin below. Computed once per chart build (same
// lifecycle as computeChartColors' `colors`), not per frame.
function buildColorRuns(colors) {
  const runs = [];
  for (let i = 1; i < colors.length; i++) {
    const color = colors[i - 1] || "#888";
    const run = runs[runs.length - 1];
    if (run && run.color === color) run.end = i;
    else runs.push({ color, start: i - 1, end: i });
  }
  return runs;
}

// Draws the elevation line's border as one manual canvas stroke per
// same-color run instead of leaving it to Chart.js's own segment.borderColor
// -- Chart.js forces a fresh path at every point-to-point color change, so a
// multi-thousand-point whole-trip chart meant thousands of individual stroke
// calls on every single redraw (measured ~220ms/frame while hovering, the
// actual lag). The line dataset itself keeps its border invisible
// (borderWidth: 0) and only supplies the area fill (which still needs
// Chart.js's own per-segment backgroundColor for the seamless hover/
// legend-select highlight -- see legendHighlightPlugin's comment on why a
// manually-drawn overlay caused seams there); this plugin paints the
// visible line in its place, on top of that fill (afterDatasetsDraw, same
// timing the border used to draw in). Runs are precomputed once per chart
// build (drawChart), not per frame -- they only depend on the color mode.
// Straight segments between actual data points rather than the dataset's
// own bezier tension -- same approximation legendHighlightPlugin's overlay
// already makes, invisible at this point density.
const borderRunsPlugin = {
  id: "borderRuns",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.borderRuns;
    const runs = opts && opts.runs;
    const chartPoints = opts && opts.chartPoints;
    if (!runs || !chartPoints) return;
    const { ctx, scales } = chart;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    runs.forEach(run => {
      ctx.strokeStyle = run.color;
      ctx.beginPath();
      for (let i = run.start; i <= run.end; i++) {
        const p = chartPoints[i];
        const x = scales.x.getPixelForValue(p.distKm);
        const y = scales.y.getPixelForValue(p.ele);
        if (i === run.start) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();
  },
};

// Is this altitude-chart POI point the one currently open in the signpost
// card? Used to make it stand out on the graph, not just on the map.
function isSelectedPoiPoint(p) {
  return !!p && state.activePoiTripId === p.tripId && state.selectedPoiIndex === p.poiIndex;
}

// Custom HTML tooltip (Chart.js's own canvas-rendered one can't do a
// flex header with the altitude pinned top-right, or per-line color
// swatches matching the legend, so this replaces it entirely).
function renderChartTooltip(context, chartPoints, poiPoints, photoPoints) {
  const tooltipEl = document.getElementById("chartTooltip");
  const tooltip = context.tooltip;
  const dp = tooltip && tooltip.dataPoints && tooltip.dataPoints[0];
  if (!tooltip || tooltip.opacity === 0 || !dp) {
    tooltipEl.classList.add("hidden");
    return;
  }

  const titleEl = tooltipEl.querySelector(".chart-tooltip-title");
  const eleEl = tooltipEl.querySelector(".chart-tooltip-ele");
  const bodyEl = tooltipEl.querySelector(".chart-tooltip-body");

  if (dp.dataset.isPoiLayer) {
    const p = poiPoints[dp.dataIndex];
    const poi = state.tripById[p.tripId].pois[p.poiIndex];
    titleEl.innerHTML = `${poiIconHtml(poi)} ${poi.name || "(senza nome)"}`;
    eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
    bodyEl.innerHTML = "";
  } else if (dp.dataset.isPhotoLayer) {
    const p = photoPoints[dp.dataIndex];
    const photo = state.photosByTrip[p.tripId][p.photoIndex];
    titleEl.innerHTML = `${icoHtml("photo_camera")} ${photo.filename}`;
    eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
    bodyEl.innerHTML = "";
  } else {
    const p = chartPoints[dp.dataIndex];
    titleEl.textContent = `${Math.round(dp.parsed.x)} km`;
    eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
    const lines = [];
    if (p) {
      if (p.surface) lines.push({ color: SURFACE_COLORS[p.surface] || SURFACE_FALLBACK, text: `Fondo: ${SURFACE_LABELS[p.surface] || p.surface}` });
      if (p.highway) lines.push({ color: HIGHWAY_COLORS[p.highway] || HIGHWAY_FALLBACK, text: `Tipo: ${HIGHWAY_LABELS[p.highway] || p.highway}` });
      if (p.grade != null) lines.push({ color: gradeColor(p.grade), text: `Pendenza: ${p.grade > 0 ? "+" : ""}${Math.round(p.grade)}%` });
      if (p.ele != null) lines.push({ color: altitudeBucket(p.ele, state.altitudeBuckets)?.color, text: `Altitudine: ${Math.round(p.ele)} m` });
    }
    bodyEl.innerHTML = lines.map(l => `
      <div class="chart-tooltip-line"><span class="swatch" style="background:${l.color}"></span>${l.text}</div>
    `).join("");
  }

  tooltipEl.classList.remove("hidden");

  const wrap = document.getElementById("elevationChartWrap");
  const canvasRect = document.getElementById("elevationChart").getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const canvasOffsetX = canvasRect.left - wrapRect.left;
  const canvasOffsetY = canvasRect.top - wrapRect.top;

  let left = canvasOffsetX + tooltip.caretX + 12;
  const maxLeft = wrap.clientWidth - tooltipEl.offsetWidth - 4;
  if (left > maxLeft) left = canvasOffsetX + tooltip.caretX - tooltipEl.offsetWidth - 12;
  if (left < 0) left = 4;

  let top = canvasOffsetY + tooltip.caretY - tooltipEl.offsetHeight - 10;
  if (top < 0) top = canvasOffsetY + tooltip.caretY + 14;

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

// The actual per-frame work behind onHover below -- split out so it can be
// deferred to the next animation frame instead of running once per raw
// mousemove event.
function applyChartHover(evt, elements, chart, chartPoints) {
  // POI/photo hover is tracked separately from Chart's own active-element
  // state (which "index" mode uses for the line) instead of overwriting it
  // -- setActiveElements() here would otherwise wipe out the line's hover
  // tracking on every mousemove that isn't exactly over a marker, breaking
  // the crosshair/tooltip while hovering the line itself.
  const hits = chart.getElementsAtEventForMode(evt.native, "nearest", { intersect: true }, false);
  const poiHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPoiLayer);
  const photoHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPhotoLayer);
  const boundaryHit = nearestDayBoundary(chart, evt.native.offsetX);
  chart.canvas.style.cursor = (poiHits.length || photoHits.length || boundaryHit) ? "pointer" : "";
  chart._hoverPoi = poiHits.length ? poiHits[0] : null;
  chart._hoverPhoto = photoHits.length ? photoHits[0] : null;
  if (poiHits.length) {
    chart.tooltip.setActiveElements(poiHits, { x: evt.native.offsetX, y: evt.native.offsetY });
  } else if (photoHits.length) {
    chart.tooltip.setActiveElements(photoHits, { x: evt.native.offsetX, y: evt.native.offsetY });
  }
  perfMark("chart.draw", () => chart.draw());

  const lineHit = elements.find(el => {
    const ds = chart.data.datasets[el.datasetIndex];
    return !ds.isPoiLayer && !ds.isPhotoLayer;
  });
  if (lineHit) {
    const p = chartPoints[lineHit.index];
    if (p) showHoverMarker(p.lat, p.lon);
  } else if (!elements.length) {
    clearMapHover();
  }
}

function drawChart(chartPoints, poiPoints, photoPoints, options) {
  const ctx = document.getElementById("elevationChart").getContext("2d");
  // Per-chart-instance rAF coalescing state for onHover, see applyChartHover.
  let pendingHover = null, hoverRafScheduled = false;
  state.chartPoints = chartPoints;
  const dayRanges = new Map();
  chartPoints.forEach((p, i) => {
    const idx = p.dayIndex ?? 0;
    if (!dayRanges.has(idx)) dayRanges.set(idx, { start: i, end: i });
    else dayRanges.get(idx).end = i;
  });
  state.chartDayRanges = dayRanges;
  const data = chartPoints.map(p => ({ x: p.distKm, y: p.ele }));
  const xMax = chartPoints.length ? chartPoints[chartPoints.length - 1].distKm : undefined;

  if (state.chart) state.chart.destroy();
  document.getElementById("chartTooltip").classList.add("hidden");

  const colors = computeChartColors(chartPoints);
  const colorRuns = buildColorRuns(colors);

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          data,
          segment: {
            backgroundColor: (segCtx) => {
              const base = colors[segCtx.p0DataIndex] || "#888";
              const hover = state.chart && state.chart._legendSelect;
              if (hover && legendCategoryMatches(hover.type, hover.key, chartPoints[segCtx.p0DataIndex])) {
                return hover.color + "cc";
              }
              const hoverIdx = state.chart ? state.chart._cachedHoverIdx : null;
              if (hoverIdx != null && (segCtx.p0DataIndex === hoverIdx || segCtx.p1DataIndex === hoverIdx)) {
                return base + "cc";
              }
              return base + "55";
            },
          },
          borderWidth: 0,
          backgroundColor: (colors[0] || "#e01b24") + "55",
          fill: true,
          pointRadius: 0,
          tension: 0.1,
          order: 1,
        },
        {
          isPoiLayer: true,
          data: poiPoints.map(p => ({ x: p.x, y: p.y })),
          showLine: false,
          pointRadius: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 6 : 3,
          pointHoverRadius: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 6 : 3,
          pointBackgroundColor: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? "#d79a1e" : "#ab2328",
          pointBorderColor: "#f7f2e4",
          pointBorderWidth: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 2 : 0,
          order: 0,
        },
        {
          isPhotoLayer: true,
          data: photoPoints.map(p => ({ x: p.x, y: p.y })),
          showLine: false,
          pointRadius: 4,
          pointHoverRadius: 4,
          pointStyle: "rectRounded",
          pointBackgroundColor: "#1f4d47",
          pointBorderColor: "#f7f2e4",
          pointBorderWidth: 1,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      // "index" mode matches datasets by shared array position, not by actual
      // x-value -- fine for the single line dataset, but meaningless for the
      // much-shorter POI dataset. POI hover/click is hit-tested separately
      // below (geometrically, via "nearest"+intersect) instead of relying on
      // the elements this mode reports.
      interaction: { mode: "index", intersect: false },
      plugins: Object.assign({
        legend: { display: false },
        borderRuns: { runs: colorRuns, chartPoints },
        crosshair: { poiPoints },
        poiIconHover: { poiPoints },
        photoIconHover: { photoPoints },
        keyPoints: { chartPoints },
        legendHighlight: { chartPoints },
        tooltip: {
          enabled: false,
          external: (context) => perfMark("chart.tooltip.render", () => renderChartTooltip(context, chartPoints, poiPoints, photoPoints)),
        },
      }, options.plugins || {}),
      scales: {
        x: {
          type: "linear", min: 0, max: xMax, title: { display: true, text: "km", padding: { top: 0, bottom: 0 }, font: { lineHeight: 1 } },
          ticks: { maxTicksLimit: 10 },
          afterBuildTicks: (axis) => {
            const ticks = axis.ticks;
            if (xMax != null && (!ticks.length || ticks[ticks.length - 1].value !== xMax)) {
              ticks.push({ value: xMax, label: xMax.toFixed(1) });
            }
          },
          grid: { display: true, drawOnChartArea: false, drawTicks: true, tickLength: 6, tickColor: "#8a6530" },
        },
        y: {
          min: data.length ? Math.min(0, Math.round(Math.min(...data.map(p => p.y)))) : undefined,
          title: { display: true, text: "m" },
          grid: { display: true, drawOnChartArea: false, drawTicks: true, tickLength: 6, tickColor: "#8a6530" },
        },
      },
      // Chart.js invokes onHover for every native mousemove it sees on the
      // canvas -- no throttling of its own -- and the work below (a
      // duplicate geometric hit-test, a full canvas redraw via chart.draw(),
      // plus DOM layout reads in the tooltip and a Leaflet marker sync) is
      // too heavy to redo for every single one of those: on a fast/high-
      // polling-rate mouse they arrive faster than the handler can drain
      // them, so the backlog grows and the redraws fall further and further
      // behind the real cursor position the longer you keep moving (visible
      // as growing lag, and as segments flickering into their dim/"55"-alpha
      // state instead of the bright hover one because the hoverIdx a given
      // queued redraw sees is already stale by the time it runs). Coalescing
      // to one flush per animation frame keeps only the latest event and
      // matches the actual paint rate -- same fix already applied to the
      // map's own hit-line mousemove in map-layers.js.
      onHover: (evt, elements, chart) => {
        pendingHover = { evt, elements };
        if (hoverRafScheduled) return;
        hoverRafScheduled = true;
        requestAnimationFrame(() => {
          hoverRafScheduled = false;
          if (!pendingHover) return;
          const { evt, elements } = pendingHover;
          pendingHover = null;
          perfMark("chart.onHover.flush", () => applyChartHover(evt, elements, chart, chartPoints));
        });
      },
      onClick: (evt, elements, chart) => {
        const hits = chart.getElementsAtEventForMode(evt.native, "nearest", { intersect: true }, false);
        const poiHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPoiLayer);
        if (poiHits.length) {
          const p = poiPoints[poiHits[0].index];
          openPoiByIndex(p.tripId, p.poiIndex, true);
          return;
        }
        const photoHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPhotoLayer);
        if (photoHits.length) {
          const p = photoPoints[photoHits[0].index];
          openPhoto(p.tripId, p.photoIndex);
          return;
        }
        const boundaryHit = nearestDayBoundary(chart, evt.native.offsetX);
        // Deferred: selectDay() rebuilds (destroys + recreates) this very
        // chart instance -- doing that synchronously from inside its own
        // onClick would have Chart.js's internal event dispatch keep
        // running against an already-destroyed chart right after.
        if (boundaryHit) setTimeout(() => selectDay(state.activeTripId, boundaryHit.trackId), 0);
      },
    },
    plugins: [hoverIndexCachePlugin, borderRunsPlugin, dayBoundaryPlugin, keyPointsPlugin, legendHighlightPlugin, crosshairPlugin, poiIconHoverPlugin, photoIconHoverPlugin],
  });
  // legendHighlightPlugin reads this instead of recomputing colors itself --
  // it runs on every redraw while a legend entry is hovered, which is
  // exactly the per-mousemove path computeChartColors was written to stay
  // out of.
  state.chart._chartColors = colors;
}

// Shared by the day-view and whole-trip footer info rows: the same
// back-button + date-range "context" component used in the picker panel,
// followed by view-specific stats. Same semantics as the picker panel too:
// the arrow always goes all the way back to all trips, while the trip
// name jumps straight to that trip (a no-op from the whole-trip view
// itself, but the meaningful "up one level" step from a day view).
function renderFooterBackInfo(trip, dateRange, extraHtml) {
  document.getElementById("elevationDayInfo").innerHTML = `
    <span class="picker-context">
      <button class="picker-back" id="footerBackBtn" aria-label="Torna a tutti i viaggi" title="Torna a tutti i viaggi">←</button>
      <button class="picker-context-trip" id="footerBackLabel">${trip.name}</button>
      <span class="picker-context-date">${dateRange}</span>
    </span>
    ${extraHtml}
  `;
  document.getElementById("footerBackBtn").addEventListener("click", () => selectAll());
  document.getElementById("footerBackLabel").addEventListener("click", () => selectTrip(trip.id));
}

export function renderDayChart(trip, track) {
  const grades = trackGradeSeries(track);
  const surfaces = trackCategorySeries(track, "surface");
  const highways = trackCategorySeries(track, "highway");
  const chartPoints = track.points.map((p, i) => ({
    distKm: p.dist / 1000, ele: p.ele, lat: p.lat, lon: p.lon,
    surface: surfaces[i], highway: highways[i], color: trip._color, dayIndex: 0, grade: grades[i],
  }));
  const gradeMin = grades.length ? Math.min(...grades) : 0;
  const gradeMax = grades.length ? Math.max(...grades) : 0;

  renderFooterBackInfo(trip, fmtDateRange(trip.summary.start_t, trip.summary.end_t), `
    <span>${dayIconHtml(track)} <b>${track.name}</b></span>
    <span>${fmtKmRound(track.distance_m)}</span>
    <span>+${fmtM(track.ele_gain)} / -${fmtM(track.ele_loss)}</span>
    <span>${track.ele_min != null ? Math.round(track.ele_min) + "–" + Math.round(track.ele_max) + " m" : ""}</span>
    <span>${Math.round(gradeMin)}% / +${Math.round(gradeMax)}%</span>
    <span>${fmtDuration(track.duration_s)}</span>
  `);

  const poiPoints = poiChartPointsForTrack(trip, track, 0);
  const photoPoints = photoChartPointsForTrack(trip, track, 0);
  drawChart(chartPoints, poiPoints, photoPoints, { plugins: { dayBoundaries: { boundaries: [] } } });
}

export function renderWholeTripChart(trip) {
  let offsetKm = 0;
  const boundaries = [];
  const chartPoints = [];
  const poiPoints = [];
  const photoPoints = [];
  const seenPoiIndex = new Set();
  trip.tracks.forEach((track, idx) => {
    if (idx > 0) boundaries.push({ x: offsetKm, label: track.name, trackId: track.id });
    const grades = trackGradeSeries(track);
    const surfaces = trackCategorySeries(track, "surface");
    const highways = trackCategorySeries(track, "highway");
    track.points.forEach((p, i) => {
      chartPoints.push({
        distKm: offsetKm + p.dist / 1000, ele: p.ele, lat: p.lat, lon: p.lon,
        surface: surfaces[i], highway: highways[i], color: trip._color, dayIndex: idx, grade: grades[i],
      });
    });
    // A POI is only plotted once, on the day track it's closest to overall
    // (relevant when consecutive days' tracks pass near the same spot).
    poiChartPointsForTrack(trip, track, offsetKm).forEach(pp => {
      if (seenPoiIndex.has(pp.poiIndex)) return;
      seenPoiIndex.add(pp.poiIndex);
      poiPoints.push(pp);
    });
    photoPoints.push(...photoChartPointsForTrack(trip, track, offsetKm));
    offsetKm += track.distance_m / 1000;
  });

  const s = trip.summary;
  const eleMin = Math.min(...trip.tracks.map(t => t.ele_min));
  const eleMax = Math.max(...trip.tracks.map(t => t.ele_max));
  const grade = tripGradeMinMax(trip);
  renderFooterBackInfo(trip, fmtDateRange(s.start_t, s.end_t), `
    <span>${fmtKmRound(s.total_distance_m)}</span>
    <span>+${fmtM(s.total_ele_gain)} / -${fmtM(s.total_ele_loss)}</span>
    <span>${Math.round(eleMin)}–${Math.round(eleMax)} m</span>
    <span>${Math.round(grade.min)}% / +${Math.round(grade.max)}%</span>
    <span>${s.num_days} giorni</span>
  `);

  drawChart(chartPoints, poiPoints, photoPoints, { plugins: { dayBoundaries: { boundaries } } });
}

export function onTrackHover(trip, track, latlng) {
  const isCharted = state.activeDayId === track.id ||
    (state.activeDayId === null && state.activeTripId === trip.id);
  if (!isCharted) return;
  const pts = state.chartPoints;
  const dayIndex = trip.tracks.findIndex(t => t.id === track.id);
  const range = state.chartDayRanges && state.chartDayRanges.get(dayIndex);
  const scanStart = range ? range.start : 0;
  const scanEnd = range ? range.end : pts.length - 1;
  let bestIdx = scanStart, bestDist = Infinity;
  perfMark("map.hitline.onTrackHover.scan", () => {
    for (let i = scanStart; i <= scanEnd; i++) {
      const p = pts[i];
      const d = (p.lat - latlng.lat) ** 2 + (p.lon - latlng.lng) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
  });
  if (state.chart) {
    state.chart.setActiveElements([{ datasetIndex: 0, index: bestIdx }]);
    state.chart.tooltip.setActiveElements([{ datasetIndex: 0, index: bestIdx }], { x: 0, y: 0 });
    // draw() (not update()) -- setActiveElements() above already updated the
    // element state update() would otherwise recompute; update() re-runs
    // layout/dataset computation on top of that same draw, which measured
    // ~1.7x slower for no benefit here (see chart.draw vs
    // map.hitline.onTrackHover.chartUpdate in the perf instrumentation).
    perfMark("map.hitline.onTrackHover.chartDraw", () => state.chart.draw());
  }
  const p = pts[bestIdx];
  if (p) showHoverMarker(p.lat, p.lon);
}

export function clearChartHover() {
  if (state.chart) {
    state.chart.setActiveElements([]);
    state.chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    state.chart.update();
  }
  clearMapHover();
}

export function themeChartDefaults() {
  // Always themed for light mode -- this viewer intentionally ignores the
  // visitor's system dark-mode preference.
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = "'Jost', 'Futura', 'Century Gothic', Avenir, sans-serif";
  Chart.defaults.color = "#6b5636";
  Chart.defaults.borderColor = "#b99a5e";
  Chart.defaults.plugins.tooltip.backgroundColor = "#f1e4c4";
  Chart.defaults.plugins.tooltip.titleColor = "#241a12";
  Chart.defaults.plugins.tooltip.bodyColor = "#241a12";
  Chart.defaults.plugins.tooltip.borderColor = "#8a6530";
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 8;
  Chart.defaults.plugins.tooltip.cornerRadius = 2;
}
