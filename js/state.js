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
  dayLayers: {},         // trackId -> { points, tripId, tripColor, activity, isStartDot, bounds,
                          //              featuresByMode, _currentMode } -- plain data backing the
                          // shared MapLibre tracks-casing/tracks-line/etc sources (see
                          // initTrackLayers in map-layers.js), not a Leaflet layer anymore.
                          // Also holds a "<trackId>-start" entry per track, the degenerate
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
  globeActive: false,    // headbar toggle -- MapLibre projection, "mercator" (flat) vs "globe"
  leftoverPhotosByTrip: {},    // tripId -> photo entries the 30m start/POI pass didn't claim
                                // (see buildTripClusters) -- re-clustered by on-screen pixel
                                // distance on every zoom/pan, see buildPhotoPixelClusters.
  photoClusterGroupsByTrip: {}, // tripId -> L.layerGroup of that trip's leftover-photo pixel
                                 // clusters, rebuilt from scratch on zoom/pan and whenever the
                                 // trip becomes active -- see rebuildPhotoClusterLayer.
  hoveredTrackId: null,  // track the persistent selection halo/stroke is narrowed to while hovering it (see showTrackHoverHighlight)
  hoveredTripId: null,   // trip whose every track gets the halo/weight-5 preview while hovering one of its tracks on a different (or no) active trip (see showTripHoverHighlight)
  hoveredHitTrackId: null, // trackId currently under the cursor on the shared tracks-hit layer --
                            // MapLibre only fires one delegated mousemove per layer, not per
                            // feature, so this is how the handler notices "the cursor moved onto a
                            // different track" and re-fires begin/endTrackHover (see
                            // setupTrackEventHandlers in map-layers.js)
  activePoiTripId: null,
  selectedPoiIndex: -1,
  navTripId: null,       // milestone-nav context: which trip/list/position is shown
  navMilestones: [],
  navIndex: -1,
  navBoundaryMarker: null,
  poiSignTooltip: null,  // fixed (non-hover) L.tooltip pinned over the selected POI, see showMilestone
  chart: null,
  chartPoints: [],       // unified array backing whatever is currently charted
  hoverTooltipEl: null,   // single shared absolutely-positioned DOM div reused for every
                           // track/marker hover tooltip (see showHoverTooltip in map-layers.js)
  hoverTooltipAnchor: null, // {lat,lng} the tooltip is currently pinned to, re-projected on every map move
  hoverTooltipOpts: null, // {direction, offset, className, sticky} from the last showHoverTooltip() call, reused by moveHoverTooltip/the "move" reprojection so the offset doesn't reset on every mousemove
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