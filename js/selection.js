// ---- Selection: All Trips / Trip / Track level transitions ----

import { state } from "./state.js";
import { TRIP_SORT_DEFAULT_DIR, TRACK_SORT_DEFAULT_DIR, renderPicker, renderBreadcrumb, showTripLevelFooter, showAllTripsFooter, renderAllTripsFooterInfo, renderAllTripsTimelineStrip, renderExploreLegend } from "./sidebar.js";
import { renderPoiListFor, closePoi } from "./poi.js";
import { renderWholeTripChart, renderDayChart } from "./chart.js";
import { fitBoundsForTracks, visibleTracks, updateSelectionHighlight, applyColorMode } from "./map-layers.js";
import { updateClusterVisibility } from "./clusters.js";

export function selectAll() {
  // Only reset the direction when actually leaving a trip (not on a
  // no-op re-selectAll), so it doesn't clobber a manual toggle done while
  // already at the root level.
  if (state.activeTripId !== null) state.tripSortDir = TRIP_SORT_DEFAULT_DIR[state.tripSort];
  state.activeTripId = null;
  state.activeDayId = null;
  renderPicker();
  renderBreadcrumb();
  document.getElementById("poiListPanel").classList.add("hidden");
  closePoi();
  fitBoundsForTracks(visibleTracks());
  showAllTripsFooter();
  renderAllTripsFooterInfo();
  renderAllTripsTimelineStrip();
  updateSelectionHighlight();
  updateClusterVisibility();
  applyColorMode();
  renderExploreLegend();
}

// `recenter` is false for clicks originating on the map itself (a track
// line, or a day's activity-start marker) -- the user is already looking
// right at the spot they clicked, so re-fitting the view would just yank
// it out from under them. Sidebar/breadcrumb/footer-triggered selection
// (the default) still frames the newly selected trip/day.
export function selectTrip(tripId, { recenter = true } = {}) {
  // Only reset when actually entering a trip from the root ("all") level
  // -- going trip <-> track within the same trip keeps whatever direction
  // is currently active there.
  if (state.activeTripId === null) state.tripSortDir = TRACK_SORT_DEFAULT_DIR[state.tripSort];
  state.activeTripId = tripId;
  state.activeDayId = null;
  const trip = state.tripById[tripId];
  document.getElementById("poiListPanel").classList.remove("hidden");
  renderPicker();
  renderBreadcrumb();
  renderPoiListFor(tripId);
  if (recenter) fitBoundsForTracks(trip.tracks);
  showTripLevelFooter();
  renderWholeTripChart(trip);
  updateSelectionHighlight();
  updateClusterVisibility();
  applyColorMode();
  renderExploreLegend();
}

export function selectDay(tripId, dayId, { recenter = true } = {}) {
  state.activeTripId = tripId;
  state.activeDayId = dayId;
  const trip = state.tripById[tripId];
  document.getElementById("poiListPanel").classList.remove("hidden");
  renderPicker();
  renderBreadcrumb();
  renderPoiListFor(tripId);
  const track = trip.tracks.find(t => t.id === dayId);
  if (recenter) fitBoundsForTracks([track]);
  showTripLevelFooter();
  renderDayChart(trip, track);
  updateSelectionHighlight();
  updateClusterVisibility();
  applyColorMode();
  renderExploreLegend();
}

export function switchColorMode(mode) {
  if (mode === state.colorMode) return;
  state.colorMode = mode;
  document.querySelectorAll("#colorModeToggle button").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  // Only the charted selection (see applyColorMode) ever shows this
  // coloring -- every other trip stays in its own identity color.
  applyColorMode();

  // Re-render whatever chart is showing so its coloring matches the new mode.
  if (state.activeTripId) {
    const trip = state.tripById[state.activeTripId];
    if (state.activeDayId) {
      const track = trip.tracks.find(t => t.id === state.activeDayId);
      renderDayChart(trip, track);
    } else {
      renderWholeTripChart(trip);
    }
  }
}
