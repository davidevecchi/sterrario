// Single shared mutable app state object -- every module imports this same
// instance and reads/writes its fields directly (not reassigned wholesale,
// so the one shared reference stays valid across every importer).
export const state = {
  trips: [],
  tripById: {},         // tripId -> trip
  trackById: {},        // trackId -> {trip, track}
  colorMode: "trip",
  tripSort: "date",      // "date" | "distance" | "gain" | "days" -- All Trips list order
  tripSortDir: -1,       // 1 = ascending, -1 = descending; flips on re-clicking the active sort
  activeTripId: null,     // null = "All Trips" level
  activeDayId: null,      // null = whole-trip view for activeTripId ("Trip" level); set = "Track" level
  dayLayers: {},         // trackId -> { day: L.layerGroup, surface: L.layerGroup, mainLine }
  startDotByTrackId: {}, // trackId -> L.circleMarker (track start dot)
  chartDayRanges: null,  // Map<dayIndex, {start, end}> index ranges into chartPoints
  poiMarkers: {},        // tripId -> [markers] parallel to trip.pois -- sparse: a POI
                          // absorbed into a start-anchored cluster (see buildTripClusters)
                          // has no standalone marker, so this index is left undefined.
  clusterGroupsByTrip: {}, // tripId -> L.layerGroup of every start/POI/photo cluster marker
                            // for that trip (plus its standalone trip-end ring), replacing
                            // the old poiLayerGroups/tripBoundaryGroups/activityMarkerGroups/
                            // photoGroupsByTrip -- see buildTripClusterLayer.
  clustersByTrip: {},    // tripId -> cluster descriptor array (see buildTripClusters),
                          // each enriched with its own `marker` by buildTripClusterLayer --
                          // used by updateClusterVisibility to toggle markers individually.
  poisVisible: true,     // headbar toggle -- on top of the trip-scoping in updateClusterVisibility
  startsVisible: true,   // headbar toggle -- on top of the trip-scoping in updateClusterVisibility
  mapLegendHighlight: null, // temporary layer group for legend-item hover
  selectionHighlight: null, // persistent white halo under the charted track(s)
  hoverHighlight: null,  // transient white halo under whichever track is currently hovered
  hoveredPoiMarker: null,
  activePoiTripId: null,
  selectedPoiIndex: -1,
  navTripId: null,       // milestone-nav context: which trip/list/position is shown
  navMilestones: [],
  navIndex: -1,
  navBoundaryMarker: null,
  poiSignTooltip: null,  // fixed (non-hover) L.tooltip pinned over the selected POI, see showMilestone
  chart: null,
  chartPoints: [],       // unified array backing whatever is currently charted
  hoverMarker: null,
  hoverTooltip: null,   // single shared L.tooltip reused for every track/marker hover
  hoverTooltipCloseTimer: null,
  hoverTooltipRemoveTimer: null,
  hoverTooltipFading: false,
  hoverTooltipOnLayer: false,   // true while the cursor is actually over the track/marker that opened it
  map: null,

  photosByTrip: {},       // tripId -> photos[], each sorted by time
  photosVisible: true,
  selectedPhotoIndex: -1,
  presentationOpen: false,
  presZoom: 1, presTx: 0, preTy: 0, presBaseZoom: 1, presLevel: 0,
};