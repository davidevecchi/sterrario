// ---- POIs: list panel, signpost navigation, note modal ----

import { state } from "./state.js";
import { poiIconHtml, boundaryIconHtml, stripHashTags, icoHtml } from "./poi-icons.js";
import {
  computeTripMilestones, poisForTrack, nearestTrackForPoi, milestoneShortLabel,
  findNextSign, trackSidebarDayNumber,
} from "./geo.js";
import { fmtSignDistKm } from "./format.js";
import { tripMarkerTooltipHtml, showPinnedTooltip, hidePinnedTooltip } from "./map-layers.js";

export function openBoundaryMilestone(tripId, end) {
  const milestones = computeTripMilestones(state.tripById[tripId]);
  const idx = end === "start" ? 0 : milestones.length - 1;
  showMilestone(tripId, milestones, idx, true);
}

export function renderPoiListFor(tripId) {
  state.activePoiTripId = tripId;
  const trip = state.tripById[tripId];
  document.getElementById("poiListLabel").textContent = `Posti`;
  const ul = document.getElementById("poiList");
  ul.innerHTML = "";
  document.getElementById("poiCount").textContent = trip.pois.length;
  if (state.navIndex >= 0) closePoi();
  trip.pois.forEach((poi, i) => {
    const li = document.createElement("li");
    li.className = "poi-item";
    li.innerHTML = `<span class="icon">${poiIconHtml(poi)}</span><span class="poi-name">${poi.name || "(senza nome)"}</span>`;
    li.addEventListener("click", () => openPoiByIndex(tripId, i, true));
    ul.appendChild(li);
  });
}

// Opens a real POI by its index in trip.pois, building the signpost
// prev/next list for the whole trip in original GPX order.
export function openPoiByIndex(tripId, index, pan) {
  const trip = state.tripById[tripId];
  if (!trip.pois[index]) return;
  const milestones = computeTripMilestones(trip);
  const idx = milestones.findIndex(m => m.kind === "poi" && m.poiIndex === index);
  showMilestone(tripId, milestones, idx, pan);
}

export function navigatePoi(delta) {
  if (!state.navTripId || state.navIndex < 0) return;
  const newIdx = state.navIndex + delta;
  if (newIdx < 0 || newIdx >= state.navMilestones.length) return;
  showMilestone(state.navTripId, state.navMilestones, newIdx, true);
}

export function showMilestone(tripId, milestones, idx, pan) {
  const trip = state.tripById[tripId];
  const m = milestones[idx];

  // Unhighlight whatever POI marker was previously shown, and drop any boundary marker.
  if (state.selectedPoiIndex >= 0 && state.activePoiTripId) {
    const prevMarker = state.poiMarkers[state.activePoiTripId][state.selectedPoiIndex];
    const prevEl = prevMarker && prevMarker.getElement();
    if (prevEl) prevEl.classList.remove("highlighted");
  }
  if (state.navBoundaryMarker) { state.navBoundaryMarker.remove(); state.navBoundaryMarker = null; }
  state.selectedPoiIndex = -1;
  state.activePoiTripId = null;
  removePoiSignTooltip();

  state.navTripId = tripId;
  state.navMilestones = milestones;
  state.navIndex = idx;

  let lat, lon, titleHtml, extraHtml;
  if (m.kind === "poi") {
    const poi = trip.pois[m.poiIndex];
    state.activePoiTripId = tripId;
    state.selectedPoiIndex = m.poiIndex;
    const marker = state.poiMarkers[tripId][m.poiIndex];
    // state.poiMarkers is sparse -- a POI absorbed into a start-anchored
    // cluster (see buildTripClusters) has no standalone marker of its own
    // to highlight, so fall back to the same transient marker (see
    // makeBoundaryMarker) used for trip start/end boundary milestones just
    // below.
    let anchorLatLng;
    if (marker) {
      const markerEl = marker.getElement();
      if (markerEl) markerEl.classList.add("highlighted");
      anchorLatLng = marker.getLngLat();
    } else {
      state.navBoundaryMarker = makeBoundaryMarker(poi.lat, poi.lon);
      anchorLatLng = { lat: poi.lat, lng: poi.lon };
    }
    lat = poi.lat; lon = poi.lon;
    titleHtml = `${poiIconHtml(poi)} ${poi.name || "(senza nome)"}`;
    const note = stripHashTags(poi.cmt || poi.desc || "");
    extraHtml = `
      ${note ? `<button class="poi-note-btn" id="poiNoteBtn">${icoHtml("sticky_note_2")} Leggi la nota</button>` : ""}
      ${poi.ele != null ? `<div class="poi-ele">Altitudine: ${Math.round(poi.ele)} m</div>` : ""}
    `;
    if (pan) state.map.panTo([lon, lat]);
    document.getElementById("poiDetailBody").innerHTML = `<div class="poi-title">${titleHtml}</div>${extraHtml}`;
    if (note) {
      document.getElementById("poiNoteBtn").addEventListener("click", () => openNoteModal(titleHtml, note));
    }
    showPoiSignTooltip(trip, poi, anchorLatLng);
  } else {
    lat = m.lat; lon = m.lon;
    titleHtml = `${boundaryIconHtml(m.end)} ${m.end === "start" ? "Partenza" : "Arrivo"}`;
    extraHtml = `
      <div class="poi-cmt">${trip.name}</div>
      ${m.ele != null ? `<div class="poi-ele">Altitudine: ${Math.round(m.ele)} m</div>` : ""}
    `;
    state.navBoundaryMarker = makeBoundaryMarker(lat, lon);
    if (pan) state.map.panTo([lon, lat]);
    document.getElementById("poiDetailBody").innerHTML = `<div class="poi-title">${titleHtml}</div>${extraHtml}`;
  }

  document.getElementById("poiNavRow").classList.remove("hidden");
  updateNavButtons(trip, milestones, idx);
  if (state.chart) state.chart.update();
}

// Transient marker for a trip start/end or POI absorbed into a cluster
// (see showMilestone) -- was an SVG `L.circleMarker`; MapLibre has no
// vector-circle marker primitive, so this is a small round CSS div instead,
// anchored at its own center (radius 7 => 14px, weight 2 => 2px border,
// same color/fillColor/fillOpacity as before).
function makeBoundaryMarker(lat, lon) {
  const element = document.createElement("div");
  element.style.cssText = "width:14px;height:14px;border-radius:50%;border:2px solid #f7f2e4;background:#ab2328;";
  return new maplibregl.Marker({ element, anchor: "center" }).setLngLat([lon, lat]).addTo(state.map);
}

// The day-sign tooltip (see tripMarkerTooltipHtml), pinned open over the
// selected POI for as long as its bottom card is -- unlike the plain
// hover version, this one is never opened/closed by mouseover/mouseout,
// only by showMilestone/closePoi, and it stays fixed at the POI's own
// latlng rather than tracking the cursor (matching the trip start/end
// markers' own tooltip, which is likewise never sticky).
function showPoiSignTooltip(trip, poi, latlng) {
  const track = nearestTrackForPoi(trip, poi).track;
  const html = tripMarkerTooltipHtml(
    trip, trackSidebarDayNumber(track), track.start_t, track.activity, poisForTrack(trip, track)
  );
  showPinnedTooltip(latlng, html, { offset: [0, -18], className: "trip-marker-tooltip-wrap" });
}

function removePoiSignTooltip() {
  hidePinnedTooltip();
}

export function openNoteModal(titleHtml, note) {
  document.getElementById("noteModalTitle").innerHTML = titleHtml;
  document.getElementById("noteModalBody").textContent = note;
  const angle = (Math.random() * 1 + 1) * (Math.random() < 0.5 ? -1 : 1); // +-1-2deg
  document.getElementById("noteModalPaper").style.transform = `rotate(${angle.toFixed(2)}deg)`;
  document.getElementById("noteModal").classList.remove("hidden");
}

export function closeNoteModal() {
  document.getElementById("noteModal").classList.add("hidden");
}

function updateNavButtons(trip, milestones, idx) {
  const prevBtn = document.getElementById("poiPrev");
  const nextBtn = document.getElementById("poiNext");
  const prevLabel = prevBtn.querySelector(".poi-side-nav-label");
  const prevDist = prevBtn.querySelector(".poi-side-nav-dist");
  const nextLabel = nextBtn.querySelector(".poi-side-nav-label");
  const nextDist = nextBtn.querySelector(".poi-side-nav-dist");

  if (idx > 0) {
    const sign = findNextSign(trip, milestones, idx, -1);
    prevLabel.textContent = sign ? milestoneShortLabel(trip, sign) : "";
    prevDist.textContent = sign ? fmtSignDistKm((milestones[idx].dist - sign.dist) / 1000) : "";
    prevBtn.classList.remove("disabled");
  } else {
    prevBtn.classList.add("disabled");
  }

  if (idx < milestones.length - 1) {
    const sign = findNextSign(trip, milestones, idx, 1);
    nextLabel.textContent = sign ? milestoneShortLabel(trip, sign) : "";
    nextDist.textContent = sign ? fmtSignDistKm((sign.dist - milestones[idx].dist) / 1000) : "";
    nextBtn.classList.remove("disabled");
  } else {
    nextBtn.classList.add("disabled");
  }
}

export function closePoi() {
  if (state.selectedPoiIndex >= 0 && state.activePoiTripId) {
    const prevMarker = state.poiMarkers[state.activePoiTripId][state.selectedPoiIndex];
    const prevEl = prevMarker && prevMarker.getElement();
    if (prevEl) prevEl.classList.remove("highlighted");
  }
  if (state.navBoundaryMarker) { state.navBoundaryMarker.remove(); state.navBoundaryMarker = null; }
  removePoiSignTooltip();
  state.selectedPoiIndex = -1;
  state.activePoiTripId = null;
  state.navTripId = null;
  state.navMilestones = [];
  state.navIndex = -1;
  document.getElementById("poiNavRow").classList.add("hidden");
  if (state.chart) state.chart.update();
}
