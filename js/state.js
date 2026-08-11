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
                          // also holds a "<trackId>-start" entry per track, the degenerate
                          // one-point track rendering its start dot (see buildStartDotLayers)
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
  leftoverPhotosByTrip: {},    // tripId -> photo entries the 30m start/POI pass didn't claim
                                // (see buildTripClusters) -- re-clustered by on-screen pixel
                                // distance on every zoom/pan, see buildPhotoPixelClusters.
  photoClusterGroupsByTrip: {}, // tripId -> L.layerGroup of that trip's leftover-photo pixel
                                 // clusters, rebuilt from scratch on zoom/pan and whenever the
                                 // trip becomes active -- see rebuildPhotoClusterLayer.
  mapLegendSelectHighlight: null, // temporary layer group for the clicked-legend-item highlight (see setLegendSelect in chart.js -- named "select" since it's click-triggered, not hover-triggered)
  selectionHighlight: null, // persistent white halo under the charted track(s)
  hoverHighlight: null,  // transient white halo under whichever track is currently hovered
  hoveredTrackId: null,  // track the persistent selection halo/stroke is narrowed to while hovering it (see showTrackHoverHighlight)
  hoveredTripId: null,   // trip whose every track gets the halo/weight-5 preview while hovering one of its tracks on a different (or no) active trip (see showTripHoverHighlight)
  prevChartedTrackIds: [],  // last set applyColorMode acted on -- lets it only touch tracks whose
                             // charted/uncharted status actually flipped instead of every track
  prevDimmingTrackIds: [],  // last (dimmed ∪ selected) set updateTrackDimming acted on, same reason
  prevDimActive: false,  // whether dimming was active last time updateTrackDimming ran -- when this
                          // flips, every track must be walked since tracks outside the old and new
                          // dimmed/selected sets still need their opacity flipped too
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

  eleRange: { min: 0, max: 0 },   // global elevation min/max across every trip -- computed
                                   // build-time (global_ele_stats in build_trips.py), loaded
                                   // via ele_stats in main() (app.js). Fixed once at startup
                                   // so the altimetry color scale never shifts per selection.
  altitudeBuckets: [],     // fine 100m render bands, built from eleRange -- see buildAltitudeBuckets (colors.js)
  altitudeLegendBuckets: [], // coarser <=10-row legend bands -- see buildAltitudeLegendBuckets (colors.js)

  photosByTrip: {},       // tripId -> photos[], each sorted by time
  photosVisible: true,
  selectedPhotoIndex: -1,
  presentationOpen: false,
  presZoom: 1, presTx: 0, preTy: 0, presBaseZoom: 1, presLevel: 0,
};