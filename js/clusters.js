// ---- Unified priority-based marker clustering (start > POI > photo) ----
//
// The map used to render three completely independent marker families --
// trip/day starts, POIs, photos -- each its own layer group. At dense
// zoom levels or dense photo/POI spots they'd visually collide with no
// shared spatial de-duplication. This instead does one manual clustering
// pass per trip using the real-world 30m radius from haversineM (not
// leaflet.markercluster's pixel-based maxClusterRadius, which can't
// express a fixed real-world distance across zoom levels), so the map
// shows one clean marker per real-world location, previewing whichever
// content is most relevant there.
//
// Photos that land within 30m of a start/POI stay part of that same
// unified pass -- they're clearly "about" that place. Every other photo
// (the bulk of a typical trip's roll) used to also self-cluster by the
// same 30m rule, but that reads as clutter: dense photo spans hide the
// track under a wall of overlapping thumbnails while sparse ones scatter
// pins the 30m radius doesn't merge. Those leftovers now get their own
// pixel-based clustering pass instead (buildPhotoPixelClusters), which
// recomputes on every zoom/pan (see hookPhotoClusterZoomRefresh) so
// density on screen -- not real-world distance -- decides how many
// markers show.
//
// Photos never render below PHOTO_MIN_ZOOM, however they were clustered.
// Below that zoom the map looks exactly like it did before this feature
// existed -- plain start signs and POI dots, no thumbnails -- since at
// that scale a photo pin can't be pinpointed to a real spot anyway and
// only adds clutter. The 30m start/POI clustering pass itself (pass 1/2
// below) stays zoom-independent -- a POI within 30m of a start always
// merges into that start's marker, at every zoom.

import { state } from "./state.js";
import { haversineM, trackStartBearing, isRoundTripTrack, trackSidebarDayNumber } from "./geo.js";
import { ACTIVITY_ICON } from "./colors.js";
import {
  dayRank, poiRank, markerZIndexOffset, MARKER_TIER_START, MARKER_TIER_POI, MARKER_TIER_PHOTO,
  tripMarkerIcon, poiMarkerIcon, tripMarkerTooltipHtml,
  trackTooltipOpts, beginTrackHover, endTrackHover,
} from "./map-layers.js";
import { poiIconHtml } from "./poi-icons.js";
import { openBoundaryMilestone, openPoiByIndex } from "./poi.js";
import { openPhoto } from "./photos.js";
import { selectDay } from "./selection.js";

const CLUSTER_RADIUS_M = 40;

// Leftover-photo pixel clustering (pass 3 replacement) -- see the module
// comment above for why this is separate from the 30m start/POI pass.
const PHOTO_CLUSTER_RADIUS_PX = 60;
// Below this zoom, no photo markers show at all -- neither the leftover
// pixel-clusters nor the thumbnail on a start/POI cluster that absorbed a
// photo. See the module comment above.
const PHOTO_MIN_ZOOM = 12;
const isPhotoZoom = (zoom) => typeof zoom === "number" && zoom >= PHOTO_MIN_ZOOM;

// Pure function -- returns { clusters, leftoverPhotos }, no Leaflet
// objects, so the clustering logic itself stays easy to reason about
// independent of the DOM. Nearest-anchor-wins throughout (pass 1: each POI
// merges into its nearest start within 30m; pass 2: each photo attaches to
// its remaining anchor -- a start or a standalone POI -- within 30m),
// first-come-first-served by iteration order, NOT nearest-wins -- when two
// anchors (e.g. two starts, or a start+POI) sit within 30m of the same
// photo/POI, the earlier one in iteration order (day/rank order for
// starts, then POI order) claims it even if another anchor is technically
// closer. Photos no anchor claims are returned as `leftoverPhotos`,
// unclustered -- see buildPhotoPixelClusters for how those get grouped
// instead. The trip's own end ("ring") marker is never a candidate here --
// always rendered standalone by buildTripClusterLayer, same as before.
export function buildTripClusters(trip, photos) {
  const starts = [];
  trip.tracks.forEach((track, idx) => {
    if (idx === 0) {
      starts.push({ track, idx, shape: "triangle" });
    } else if (ACTIVITY_ICON[track.activity]) {
      starts.push({ track, idx, shape: "square" });
    }
  });
  starts.sort((a, b) => (a.track.start_t || "").localeCompare(b.track.start_t || ""));
  starts.forEach(s => {
    s.lat = s.track.points[0].lat; s.lon = s.track.points[0].lon;
    s.poiIndices = []; s.photoList = [];
  });

  const pois = trip.pois.map((poi, index) => ({
    poi, index, lat: poi.lat, lon: poi.lon, photoList: [],
  }));

  // sourceIndex is the photo's own index into `photos` -- the exact same
  // array as state.photosByTrip[trip.id], so it doubles as the index
  // openPhoto(tripId, index) expects, untouched by this function's own
  // (re-)sort by time.
  const photoEntries = photos
    .map((photo, sourceIndex) => ({ photo, sourceIndex }))
    .filter(e => e.photo.trip_id === trip.id)
    .sort((a, b) => (a.photo.t || "").localeCompare(b.photo.t || ""));

  const claimedPoi = new Set();
  const claimedPhoto = new Set();
  const clusters = [];

  function makeCluster({ type, lat, lon, hasStart, hasPoi, hasPhoto, start, poiIndices, poiIndex, photoList, rank }) {
    const sortedPhotos = photoList.slice().sort((a, b) => (a.photo.t || "").localeCompare(b.photo.t || ""));
    return {
      type, lat, lon, hasStart, hasPoi, hasPhoto,
      start: start || null,
      dayNumber: start ? start.track._dayNumber : null,
      poiIndices: poiIndices || (poiIndex != null ? [poiIndex] : []),
      poiIndex: poiIndex != null ? poiIndex : null,
      photos: sortedPhotos,
      firstPhoto: sortedPhotos.length ? sortedPhotos[0].photo : null,
      photoCount: sortedPhotos.length,
      rank,
    };
  }

  // Finds the first of `anchors` (in iteration order) within
  // CLUSTER_RADIUS_M of (lat, lon), or null if none qualify -- shared by
  // both passes below so "first in order, not nearest" is enforced the
  // same way for POIs and photos alike. Order, not distance, breaks ties:
  // if two anchors are both in range, the earlier one in the `anchors`
  // array wins even when the later one is technically closer.
  function nearestAnchor(anchors, lat, lon) {
    for (const a of anchors) {
      if (haversineM(a.lat, a.lon, lat, lon) <= CLUSTER_RADIUS_M) return a;
    }
    return null;
  }

  // Pass 1: each POI merges into its nearest start within 30m.
  pois.forEach(p => {
    const start = nearestAnchor(starts, p.lat, p.lon);
    if (start) {
      claimedPoi.add(p.index);
      start.poiIndices.push(p.index);
    }
  });

  // Pass 2: each photo attaches to its nearest remaining anchor within
  // 30m -- a start (POIs it just absorbed above included) or a POI no
  // start claimed.
  const standalonePois = pois.filter(p => !claimedPoi.has(p.index));
  const anchors = [...starts, ...standalonePois];
  photoEntries.forEach(pe => {
    const anchor = nearestAnchor(anchors, pe.photo.lat, pe.photo.lon);
    if (anchor) {
      claimedPhoto.add(pe.sourceIndex);
      anchor.photoList.push(pe);
    }
  });

  starts.forEach(start => {
    clusters.push(makeCluster({
      type: "start", lat: start.lat, lon: start.lon,
      hasStart: true, hasPoi: start.poiIndices.length > 0, hasPhoto: start.photoList.length > 0,
      start, poiIndices: start.poiIndices, photoList: start.photoList,
      rank: dayRank(trip, start.idx),
    }));
  });

  standalonePois.forEach(p => {
    clusters.push(makeCluster({
      type: "poi", lat: p.lat, lon: p.lon,
      hasStart: false, hasPoi: true, hasPhoto: p.photoList.length > 0,
      poiIndex: p.index, photoList: p.photoList,
      rank: poiRank(trip, p.index),
    }));
  });

  // Whatever photos no anchor claimed don't self-cluster here by the same
  // 30m rule (see the module comment) -- they're returned as-is and
  // handed to buildPhotoPixelClusters instead, which re-clusters them by
  // on-screen pixel distance every time the map zooms/pans.
  const leftoverPhotos = photoEntries.filter(pe => !claimedPhoto.has(pe.sourceIndex));

  return { clusters, leftoverPhotos };
}

// Icon for any cluster that absorbed at least one photo (cluster.hasPhoto)
// -- previews the cluster's earliest photo instead of a plain start/POI
// glyph, since a thumbnail reads as richer/more identifiable at a glance.
// Clusters with no absorbed photo keep using tripMarkerIcon/poiMarkerIcon
// completely unmodified -- see buildTripClusterLayer -- so a lone start or
// POI looks exactly as it always did.
function combinedClusterIcon(cluster, trip) {
  const thumbClass = cluster.hasPoi ? "cluster-photo-thumb" : "cluster-photo-thumb-plain";
  const bg = cluster.firstPhoto.thumb.replace(/'/g, "%27");
  // A cluster anchored to a day-start reuses that start's own oriented
  // rounded-square shape/rotation (see tripMarkerIcon's "+135deg" comment)
  // instead of the plain circular thumbnail, so the photo still reads as
  // "this day's start" at a glance. Only the shape/border rotates -- the
  // photo itself is counter-rotated back upright on a nested layer (clipped
  // to the outer shape via overflow:hidden), and the day-number label sits
  // outside the rotated element entirely, so neither ever appears tilted.
  let thumbHtml;
  let labelHtml = "";
  if (cluster.hasStart) {
    const bearing = trackStartBearing(cluster.start.track);
    const roundTrip = isRoundTripTrack(cluster.start.track);
    const rotation = roundTrip ? 0 : bearing + 135;
    const borderRadius = roundTrip ? "50%" : "50% 50% 50% 0";
    thumbHtml = `
        <div class="photo-divicon ${thumbClass}" style="border-radius: ${borderRadius}; transform: rotate(${rotation}deg);">
          <div class="photo-divicon-image" style="transform: rotate(${-rotation}deg); background-image:url('${bg}')"></div>
        </div>`;
    labelHtml = `<div class="cluster-start-label">${cluster.dayNumber}</div>`;
    // A day-start that also absorbed a POI keeps the day-number label (the
    // photo already replaced the plain start shape, so there's no shape
    // left to badge -- see tripMarkerIcon's poiBadge for the non-photo
    // equivalent) but still gets the same corner badge to signal the POI.
    if (cluster.hasPoi) {
      labelHtml += `<div class="trip-marker-poi-badge">${poiIconHtml(trip.pois[cluster.poiIndices[0]])}</div>`;
    }
  } else {
    thumbHtml = `<div class="photo-divicon ${thumbClass}" style="background-image:url('${bg}')"></div>`;
    // No day-number to show here -- the cluster also absorbed a POI, so its
    // icon (the same glyph the plain POI dot shows, see poiMarkerIcon) takes
    // that same centered-label spot instead, so what kind of place this is
    // still reads at a glance even once the photo takes over the marker.
    // Only the first absorbed POI's icon is shown -- same "earliest one
    // wins" simplification combinedClusterIcon already applies to its own
    // photo preview.
    if (cluster.hasPoi) {
      labelHtml = `<div class="cluster-start-label">${poiIconHtml(trip.pois[cluster.poiIndices[0]])}</div>`;
    }
  }
  const badgeHtml = cluster.photoCount > 1 ? `<div class="cluster-count-badge">${cluster.photoCount}</div>` : "";
  return L.divIcon({
    className: "cluster-marker",
    html: `
      <div style="--marker-color:${trip._color}">
        ${thumbHtml}
        ${labelHtml}
        ${badgeHtml}
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

// Icon for a cluster at the given zoom -- a photo thumbnail only once
// zoomed to PHOTO_MIN_ZOOM or beyond (see the module comment); below that,
// or for a cluster that never absorbed a photo, this is identical to what
// tripMarkerIcon/poiMarkerIcon alone would produce, so a start/POI reverts
// to looking exactly as it did before photo clustering existed.
function clusterIcon(cluster, trip, zoom) {
  if (cluster.hasPhoto && isPhotoZoom(zoom)) return combinedClusterIcon(cluster, trip);
  if (cluster.hasStart) {
    const start = cluster.start;
    return tripMarkerIcon(start.shape, trip._color, {
      dayNumber: start.track._dayNumber,
      bearing: trackStartBearing(start.track),
      roundTrip: isRoundTripTrack(start.track),
      poi: cluster.hasPoi ? trip.pois[cluster.poiIndices[0]] : null,
    });
  }
  return poiMarkerIcon(trip.pois[cluster.poiIndex], trip._color);
}

// Re-applies clusterIcon to every cluster that absorbed a photo, across
// every built trip (not just the active one -- a trip can become active
// later at whatever zoom the map is at by then). Only hasPhoto clusters
// can ever change appearance with zoom, so this skips everything else.
function refreshClusterIcons(zoom) {
  Object.entries(state.clustersByTrip).forEach(([tripId, clusters]) => {
    const trip = state.tripById[tripId];
    if (!trip) return;
    clusters.forEach(cluster => {
      if (!cluster.hasPhoto || !cluster.marker) return;
      cluster.marker.setIcon(clusterIcon(cluster, trip, zoom));
    });
  });
}

// Builds one L.marker per cluster from buildTripClusters, plus the trip's
// always-standalone end ("ring") marker, and populates
// state.clusterGroupsByTrip/state.clustersByTrip/state.poiMarkers (sparse
// -- see the poiMarkers field comment). Click/hover behavior per cluster
// type:
//  - hasPhoto: click always opens the lightbox directly at the earliest
//    absorbed photo, even if the cluster also has a start/POI -- clicking
//    a photo thumbnail should show the photo, not the day/POI detail
//    card. Hover still shows the start's day tooltip or expands the POI
//    signpost, same as before, since hover isn't a "which detail wins"
//    conflict the way a single click target is.
//  - hasStart (no photo): identical to the old addTripBoundaryMarkers/
//    addActivityStartMarkers -- hover shows the day tooltip, click opens
//    the boundary milestone (day-1 triangle) or selects the day (square).
//  - hasPoi (no start, no photo): identical to the old addPoiMarkers --
//    click opens that POI.
export function buildTripClusterLayer(trip, photos) {
  const { clusters, leftoverPhotos } = buildTripClusters(trip, photos);
  const markers = [];
  const poiMarkersForTrip = [];
  const zoom = state.map.getZoom();

  clusters.forEach(cluster => {
    const marker = L.marker([cluster.lat, cluster.lon], {
      icon: clusterIcon(cluster, trip, zoom),
      zIndexOffset: markerZIndexOffset(trip, cluster.rank, cluster.hasStart ? MARKER_TIER_START : MARKER_TIER_POI),
    });

    if (cluster.hasStart) {
      const start = cluster.start;
      const track = start.track;
      marker.on("mouseover", () => beginTrackHover(
        marker.getLatLng(),
        tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity),
        trackTooltipOpts(-10),
        { trackId: track.id }
      ));
      marker.on("mouseout", () => endTrackHover());
    } else if (cluster.hasPoi) {
      const poiIndex = cluster.poiIndex;
      poiMarkersForTrip[poiIndex] = marker;
    }

    // Photo click wins over the start/POI detail card whenever the photo
    // is actually visible right now (hasPhoto and zoomed to PHOTO_MIN_ZOOM
    // or beyond) -- below that zoom the marker looks and behaves like a
    // plain start/POI, so clicking it opens the day/POI card instead, same
    // as before photo clustering existed.
    marker.on("click", () => {
      if (cluster.hasPhoto && isPhotoZoom(state.map.getZoom())) {
        openPhoto(trip.id, cluster.photos[0].sourceIndex);
      } else if (cluster.hasStart) {
        const start = cluster.start;
        if (start.idx === 0) openBoundaryMilestone(trip.id, "start");
        else selectDay(trip.id, start.track.id, { recenter: false });
      } else if (cluster.hasPoi) {
        openPoiByIndex(trip.id, cluster.poiIndex, true);
      }
    });

    cluster.marker = marker;
    markers.push(marker);
  });

  // The trip's end is never an anchor -- always its own standalone
  // marker, same look/behavior as the old addTripBoundaryMarkers's
  // endMarker. Folded into the same visibility bookkeeping as the
  // clusters above (as a synthetic "hasStart" descriptor) so
  // updateClusterVisibility can treat every marker uniformly.
  const lastTrack = trip.tracks[trip.tracks.length - 1];
  const last = lastTrack.points[lastTrack.points.length - 1];
  const endMarker = L.marker([last.lat, last.lon], {
    icon: tripMarkerIcon("ring", trip._color),
    zIndexOffset: markerZIndexOffset(trip, dayRank(trip, trip.tracks.length - 1), MARKER_TIER_START),
  });
  endMarker.on("mouseover", () => beginTrackHover(
    endMarker.getLatLng(),
    tripMarkerTooltipHtml(trip, trackSidebarDayNumber(lastTrack), lastTrack.end_t, lastTrack.activity),
    trackTooltipOpts(-10),
    { trackId: lastTrack.id }
  ));
  endMarker.on("mouseout", () => endTrackHover());
  endMarker.on("click", () => openBoundaryMilestone(trip.id, "end"));
  markers.push(endMarker);
  clusters.push({ hasStart: true, hasPoi: false, hasPhoto: false, marker: endMarker });

  state.poiMarkers[trip.id] = poiMarkersForTrip;
  state.clustersByTrip[trip.id] = clusters;
  state.clusterGroupsByTrip[trip.id] = L.layerGroup(markers);

  state.leftoverPhotosByTrip[trip.id] = leftoverPhotos;
  rebuildPhotoClusterLayer(trip.id);
  hookPhotoClusterZoomRefresh();
}

// ---- Leftover-photo pixel clustering (declutter pass replacing the old
// 30m self-clustering -- see the module comment at the top of this file)

// Anchor-based greedy clustering, same shape as the old 30m pass-3, but
// measured in on-screen pixels (map.latLngToLayerPoint, current zoom) so
// it reflects visual density instead of real-world distance -- rebuilt
// from scratch on every zoom change (see hookPhotoClusterZoomRefresh)
// rather than cached, since the same photos cluster differently at every
// zoom.
function buildPhotoPixelClusters(map, leftoverPhotos, totalPhotoCount) {
  const pts = leftoverPhotos.map(pe => map.latLngToLayerPoint([pe.photo.lat, pe.photo.lon]));
  const claimed = new Set();
  const pixelClusters = [];
  // Bucket every point into a PHOTO_CLUSTER_RADIUS_PX-sized grid cell first,
  // so each anchor only has to check the ~9 neighboring cells instead of
  // every other leftover photo -- this pass reruns on every zoom/pan (see
  // hookPhotoClusterZoomRefresh), so the naive all-pairs check would get
  // quadratically slower as a trip's leftover-photo count grows.
  const cellOf = (pt) => `${Math.floor(pt.x / PHOTO_CLUSTER_RADIUS_PX)},${Math.floor(pt.y / PHOTO_CLUSTER_RADIUS_PX)}`;
  const grid = new Map();
  pts.forEach((pt, i) => {
    const key = cellOf(pt);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  leftoverPhotos.forEach((anchorPe, i) => {
    if (claimed.has(i)) return;
    claimed.add(i);
    const photoList = [anchorPe];
    const [cx, cy] = cellOf(pts[i]).split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbors = grid.get(`${cx + dx},${cy + dy}`);
        if (!neighbors) continue;
        neighbors.forEach(j => {
          if (claimed.has(j)) return;
          if (pts[i].distanceTo(pts[j]) <= PHOTO_CLUSTER_RADIUS_PX) {
            claimed.add(j);
            photoList.push(leftoverPhotos[j]);
          }
        });
      }
    }
    const sortedPhotos = photoList.slice().sort((a, b) => (a.photo.t || "").localeCompare(b.photo.t || ""));
    const centroidLat = photoList.reduce((sum, pe) => sum + pe.photo.lat, 0) / photoList.length;
    const centroidLon = photoList.reduce((sum, pe) => sum + pe.photo.lon, 0) / photoList.length;
    pixelClusters.push({
      lat: centroidLat, lon: centroidLon,
      photos: sortedPhotos,
      firstPhoto: sortedPhotos[0].photo,
      photoCount: sortedPhotos.length,
      // Scaled against the trip's *total* photo count (not leftoverPhotos'
      // own, smaller length) so this stays consistent with dayRank/
      // poiRank/pass-1&2's own photo rank -- sourceIndex indexes into the
      // full per-trip photos array, so scaling against a shorter length
      // would send rank deeply negative for early-index leftover photos.
      rank: totalPhotoCount - 1 - anchorPe.sourceIndex,
    });
  });
  return pixelClusters;
}

// Square photo centered on the cluster's position -- distinct from
// combinedClusterIcon's centered thumbnail: these are the decluttered
// "everything else" photos, not a place (start/POI) the trip stopped at,
// so the smaller square size reads as secondary. A "+N" badge replaces
// showing every absorbed photo when there's more than one, per the same
// "nearest wins, rest badged" idea as combinedClusterIcon's count badge.
function photoFlagIcon(cluster, trip) {
  const badgeHtml = cluster.photoCount > 1 ? `<div class="cluster-count-badge">${cluster.photoCount}</div>` : "";
  return L.divIcon({
    className: "photo-flag-marker",
    html: `
      <div class="photo-flag" style="--marker-color:${trip._color}">
        <div class="photo-flag-thumb" style="background-image:url('${cluster.firstPhoto.thumb.replace(/'/g, "%27")}')"></div>
        ${badgeHtml}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

// Tears down and rebuilds just this trip's leftover-photo marker layer
// from its stored (unclustered) photo list -- called once at initial
// build and again on every zoom change while a trip is active (see
// hookPhotoClusterZoomRefresh), since the pixel clustering only makes
// sense recomputed at the map's current zoom.
function rebuildPhotoClusterLayer(tripId) {
  const trip = state.tripById[tripId];
  const leftoverPhotos = state.leftoverPhotosByTrip[tripId] || [];
  const oldGroup = state.photoClusterGroupsByTrip[tripId];
  if (oldGroup && state.map.hasLayer(oldGroup)) state.map.removeLayer(oldGroup);

  const totalPhotoCount = (state.photosByTrip[tripId] || []).length;
  const zoom = state.map.getZoom();
  const pixelClusters = isPhotoZoom(zoom) ? buildPhotoPixelClusters(state.map, leftoverPhotos, totalPhotoCount) : [];
  const markers = pixelClusters.map(cluster => {
    const marker = L.marker([cluster.lat, cluster.lon], {
      icon: photoFlagIcon(cluster, trip),
      zIndexOffset: markerZIndexOffset(trip, cluster.rank, MARKER_TIER_PHOTO),
    });
    marker.on("click", () => openPhoto(tripId, cluster.photos[0].sourceIndex));
    return marker;
  });

  state.photoClusterGroupsByTrip[tripId] = L.layerGroup(markers);
  if (tripId === state.activeTripId && state.photosVisible) {
    state.photoClusterGroupsByTrip[tripId].addTo(state.map);
  }
}

// Only zoom changes which photos cluster together -- map.latLngToLayerPoint
// distances between two fixed lat/lngs are translation-invariant, so a
// plain pan (moveend with no zoom change) never changes the pixel
// clustering and would just be a wasted rebuild; only "zoomend" triggers
// this. Recomputing every trip's leftover-photo layer would also be
// wasted work for trips not even on screen -- only the active trip's
// leftover photos are ever shown (same trip-scoping rule as
// updateClusterVisibility), so only it needs refreshing.
function refreshActivePhotoClusters() {
  if (!state.activeTripId || !state.leftoverPhotosByTrip[state.activeTripId]) return;
  rebuildPhotoClusterLayer(state.activeTripId);
}

// Crossing PHOTO_MIN_ZOOM also flips whether any hasPhoto cluster shows its
// thumbnail at all (see clusterIcon/refreshClusterIcons), not just how the
// active trip's leftover photos pixel-cluster -- both need redoing on every
// zoom change.
function onPhotoClusterZoomEnd() {
  refreshClusterIcons(state.map.getZoom());
  refreshActivePhotoClusters();
  updateClusterVisibility();
}

let photoClusterZoomHooked = false;
function hookPhotoClusterZoomRefresh() {
  if (photoClusterZoomHooked) return;
  photoClusterZoomHooked = true;
  state.map.on("zoomend", onPhotoClusterZoomEnd);
}

// Waypoints (trip POIs), trip/day starts, and photos only make sense in
// the context of a single trip -- at the "all trips" level they'd just be
// a wall of overlapping pins with no way to tell which trip each belongs
// to, so only the active trip's cluster group (if any) ever stays on the
// map. Within that trip, each individual cluster marker (not a whole
// group at once) then decides its own visibility from whichever of its
// absorbed content types has its own headbar toggle on -- e.g. a
// start+photo combined marker stays visible via the starts toggle alone
// even with photos hidden, since it still carries a start. Replaces the
// old updatePoiMarkerVisibility/updateTripMarkerVisibility/
// updatePhotoMarkerVisibility, one per marker family, now that a single
// marker can carry more than one family's content.
export function updateClusterVisibility() {
  Object.entries(state.clusterGroupsByTrip).forEach(([tripId, group]) => {
    const isActiveTrip = tripId === state.activeTripId;
    const isGroupOnMap = state.map.hasLayer(group);
    if (!isActiveTrip) {
      if (isGroupOnMap) state.map.removeLayer(group);
      return;
    }
    if (!isGroupOnMap) group.addTo(state.map);
    const photoContentShowing = state.photosVisible && isPhotoZoom(state.map.getZoom());
    (state.clustersByTrip[tripId] || []).forEach(cluster => {
      const shouldShow = (cluster.hasStart && state.startsVisible)
        || (cluster.hasPoi && state.poisVisible)
        || (cluster.hasPhoto && photoContentShowing);
      const isShown = group.hasLayer(cluster.marker);
      if (shouldShow && !isShown) group.addLayer(cluster.marker);
      else if (!shouldShow && isShown) group.removeLayer(cluster.marker);
    });
  });

  // Leftover-photo pixel clusters follow the same trip-scoping as above,
  // but as one whole layer group (not per-marker) since they only ever
  // carry photos -- there's no start/POI mix to pick apart marker by
  // marker the way the 30m clusters need.
  Object.keys(state.photoClusterGroupsByTrip).forEach(tripId => {
    const shouldShow = tripId === state.activeTripId && state.photosVisible && isPhotoZoom(state.map.getZoom());
    const isGroupOnMap = state.map.hasLayer(state.photoClusterGroupsByTrip[tripId]);
    if (shouldShow && !isGroupOnMap) {
      // Rebuilt (not just re-added) on becoming visible -- the group may
      // have been built empty at initial load, before the map had a zoom
      // level yet (see rebuildPhotoClusterLayer), or be stale from
      // whatever zoom was active the last time this trip was shown.
      rebuildPhotoClusterLayer(tripId);
    } else if (!shouldShow && isGroupOnMap) {
      state.map.removeLayer(state.photoClusterGroupsByTrip[tripId]);
    }
  });
}
