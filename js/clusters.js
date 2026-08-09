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

import { state } from "./state.js";
import { haversineM, trackStartBearing, isRoundTripTrack, trackSidebarDayNumber } from "./geo.js";
import { ACTIVITY_ICON } from "./colors.js";
import {
  dayRank, poiRank, markerZIndexOffset, tripMarkerIcon, poiMarkerIcon, tripMarkerTooltipHtml,
  showTrackHoverHighlight, clearTrackHoverHighlight, showHoverTooltip, hideHoverTooltip,
  setHoveredPoiMarker, clearHoveredPoiMarker,
} from "./map-layers.js";
import { openBoundaryMilestone, openPoiByIndex } from "./poi.js";
import { openPhoto } from "./photos.js";
import { selectDay } from "./selection.js";

const CLUSTER_RADIUS_M = 30;

// Pure function -- returns plain cluster descriptors, no Leaflet objects,
// so the clustering logic itself stays easy to reason about independent
// of the DOM. Priority: a day-start sign claims any POI/photo within 30m
// of itself first (pass 1); then every still-unclaimed POI claims any
// still-unclaimed photo within 30m of itself (pass 2); then any leftover
// photos are grouped among themselves, greedily anchor-based -- earliest
// unclaimed photo becomes an anchor, absorbs unclaimed photos within 30m
// of *that anchor only* (not transitively), repeat (pass 3). The trip's
// own end ("ring") marker is never a candidate here -- always rendered
// standalone by buildTripClusterLayer, same as before.
export function buildTripClusters(trip, photos) {
  const firstPoint = trip.tracks[0].points[0];

  const starts = [];
  trip.tracks.forEach((track, idx) => {
    if (idx === 0) {
      starts.push({ track, idx, shape: "triangle" });
    } else if (ACTIVITY_ICON[track.activity]) {
      starts.push({ track, idx, shape: "square" });
    }
  });
  starts.sort((a, b) => (a.track.start_t || "").localeCompare(b.track.start_t || ""));
  starts.forEach(s => { s.lat = s.track.points[0].lat; s.lon = s.track.points[0].lon; });

  const pois = trip.pois.map((poi, index) => ({
    poi, index, lat: poi.lat, lon: poi.lon,
    distFromStart: haversineM(firstPoint.lat, firstPoint.lon, poi.lat, poi.lon),
  })).sort((a, b) => a.distFromStart - b.distFromStart);

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

  // Pass 1: each start (in time order) claims every not-yet-claimed
  // POI/photo within 30m of its own coordinates -- anchor-based, never
  // transitive, which is what guarantees two different starts' clusters
  // can never merge into one.
  starts.forEach(start => {
    const poiIndices = [];
    pois.forEach(p => {
      if (claimedPoi.has(p.index)) return;
      if (haversineM(start.lat, start.lon, p.lat, p.lon) <= CLUSTER_RADIUS_M) {
        claimedPoi.add(p.index);
        poiIndices.push(p.index);
      }
    });
    const photoList = [];
    photoEntries.forEach(pe => {
      if (claimedPhoto.has(pe.sourceIndex)) return;
      if (haversineM(start.lat, start.lon, pe.photo.lat, pe.photo.lon) <= CLUSTER_RADIUS_M) {
        claimedPhoto.add(pe.sourceIndex);
        photoList.push(pe);
      }
    });
    clusters.push(makeCluster({
      type: "start", lat: start.lat, lon: start.lon,
      hasStart: true, hasPoi: poiIndices.length > 0, hasPhoto: photoList.length > 0,
      start, poiIndices, photoList,
      rank: dayRank(trip, start.idx),
    }));
  });

  // Pass 2: every POI a start didn't already claim becomes its own
  // cluster anchor (same as a plain, unabsorbed POI always was before),
  // claiming any still-unclaimed photo within 30m of itself.
  pois.forEach(p => {
    if (claimedPoi.has(p.index)) return;
    const photoList = [];
    photoEntries.forEach(pe => {
      if (claimedPhoto.has(pe.sourceIndex)) return;
      if (haversineM(p.lat, p.lon, pe.photo.lat, pe.photo.lon) <= CLUSTER_RADIUS_M) {
        claimedPhoto.add(pe.sourceIndex);
        photoList.push(pe);
      }
    });
    clusters.push(makeCluster({
      type: "poi", lat: p.lat, lon: p.lon,
      hasStart: false, hasPoi: true, hasPhoto: photoList.length > 0,
      poiIndex: p.index, photoList,
      rank: poiRank(trip, p.index),
    }));
  });

  // Pass 3: whatever photos are still unclaimed cluster among themselves,
  // greedy and anchor-based (not true chain clustering): earliest
  // unclaimed photo becomes the anchor, absorbs unclaimed photos within
  // 30m of *that anchor only*, then repeat with the next earliest
  // survivor.
  photoEntries.forEach(anchorPe => {
    if (claimedPhoto.has(anchorPe.sourceIndex)) return;
    claimedPhoto.add(anchorPe.sourceIndex);
    const photoList = [anchorPe];
    photoEntries.forEach(pe => {
      if (claimedPhoto.has(pe.sourceIndex)) return;
      if (haversineM(anchorPe.photo.lat, anchorPe.photo.lon, pe.photo.lat, pe.photo.lon) <= CLUSTER_RADIUS_M) {
        claimedPhoto.add(pe.sourceIndex);
        photoList.push(pe);
      }
    });
    clusters.push(makeCluster({
      type: "photo", lat: anchorPe.photo.lat, lon: anchorPe.photo.lon,
      hasStart: false, hasPoi: false, hasPhoto: true,
      photoList,
      // No start/POI rank to inherit -- ranked by the earliest absorbed
      // photo's own position in the trip's photo list instead, inverted
      // (like dayRank/poiRank) so the older photo of two overlapping
      // clusters/markers renders on top, not the newer one.
      rank: photos.length - 1 - anchorPe.sourceIndex,
    }));
  });

  return clusters;
}

// Icon for any cluster that absorbed at least one photo (cluster.hasPhoto)
// -- previews the cluster's earliest photo instead of a plain start/POI
// glyph, since a thumbnail reads as richer/more identifiable at a glance.
// Clusters with no absorbed photo keep using tripMarkerIcon/poiMarkerIcon
// completely unmodified -- see buildTripClusterLayer -- so a lone start or
// POI looks exactly as it always did.
function combinedClusterIcon(cluster, trip) {
  const thumbClass = cluster.hasPoi ? "cluster-photo-thumb" : "cluster-photo-thumb-plain";
  const notchHtml = cluster.hasStart ? `
      <div class="cluster-notch">
        <div class="cluster-notch-shape"></div>
        <div class="cluster-notch-label">${cluster.dayNumber}</div>
      </div>` : "";
  const badgeHtml = cluster.photoCount > 1 ? `<div class="cluster-count-badge">${cluster.photoCount}</div>` : "";
  return L.divIcon({
    className: "cluster-marker",
    html: `
      <div style="--marker-color:${trip._color}">
        <div class="photo-divicon ${thumbClass}" style="background-image:url('${cluster.firstPhoto.thumb.replace(/'/g, "%27")}')"></div>
        ${notchHtml}
        ${badgeHtml}
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
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
//    click opens that POI, hover expands the signpost pin.
export function buildTripClusterLayer(trip, photos) {
  const clusters = buildTripClusters(trip, photos);
  const markers = [];
  const poiMarkersForTrip = [];

  clusters.forEach(cluster => {
    let icon;
    if (cluster.hasPhoto) {
      icon = combinedClusterIcon(cluster, trip);
    } else if (cluster.hasStart) {
      const start = cluster.start;
      icon = tripMarkerIcon(start.shape, trip._color, {
        dayNumber: start.track._dayNumber,
        bearing: trackStartBearing(start.track),
        roundTrip: isRoundTripTrack(start.track),
      });
    } else {
      icon = poiMarkerIcon(trip.pois[cluster.poiIndex], trip._color);
    }

    const marker = L.marker([cluster.lat, cluster.lon], {
      icon,
      zIndexOffset: markerZIndexOffset(trip, cluster.rank),
    });

    if (cluster.hasStart) {
      const start = cluster.start;
      const track = start.track;
      marker.on("mouseover", () => {
        showTrackHoverHighlight(track.id);
        state.hoverTooltipOnLayer = true;
        showHoverTooltip(
          marker.getLatLng(),
          tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity),
          { direction: "top", offset: [0, -15], className: "trip-marker-tooltip-wrap" }
        );
      });
      marker.on("mouseout", () => { clearTrackHoverHighlight(); state.hoverTooltipOnLayer = false; hideHoverTooltip(); });
      if (!cluster.hasPhoto) {
        if (start.idx === 0) {
          marker.on("click", () => openBoundaryMilestone(trip.id, "start"));
        } else {
          marker.on("click", () => selectDay(trip.id, track.id, { recenter: false }));
        }
      }
    } else if (cluster.hasPoi) {
      const poiIndex = cluster.poiIndex;
      marker.on("mouseover", () => setHoveredPoiMarker(marker));
      marker.on("mouseout", () => clearHoveredPoiMarker(marker));
      if (!cluster.hasPhoto) marker.on("click", () => openPoiByIndex(trip.id, poiIndex, true));
      poiMarkersForTrip[poiIndex] = marker;
    }

    // Photo click always wins over the start/POI detail card, regardless
    // of what else the cluster absorbed -- see the comment above.
    if (cluster.hasPhoto) {
      const anchorEntry = cluster.photos[0];
      marker.on("click", () => openPhoto(trip.id, anchorEntry.sourceIndex));
    }

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
    zIndexOffset: markerZIndexOffset(trip, dayRank(trip, trip.tracks.length - 1)),
  });
  endMarker.on("mouseover", () => {
    showTrackHoverHighlight(lastTrack.id);
    state.hoverTooltipOnLayer = true;
    showHoverTooltip(
      endMarker.getLatLng(),
      tripMarkerTooltipHtml(trip, trackSidebarDayNumber(lastTrack), lastTrack.end_t, lastTrack.activity),
      { direction: "top", offset: [0, -16], className: "trip-marker-tooltip-wrap" }
    );
  });
  endMarker.on("mouseout", () => { clearTrackHoverHighlight(); state.hoverTooltipOnLayer = false; hideHoverTooltip(); });
  endMarker.on("click", () => openBoundaryMilestone(trip.id, "end"));
  markers.push(endMarker);
  clusters.push({ hasStart: true, hasPoi: false, hasPhoto: false, marker: endMarker });

  state.poiMarkers[trip.id] = poiMarkersForTrip;
  state.clustersByTrip[trip.id] = clusters;
  state.clusterGroupsByTrip[trip.id] = L.layerGroup(markers);
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
    (state.clustersByTrip[tripId] || []).forEach(cluster => {
      const shouldShow = (cluster.hasStart && state.startsVisible)
        || (cluster.hasPoi && state.poisVisible)
        || (cluster.hasPhoto && state.photosVisible);
      const isShown = group.hasLayer(cluster.marker);
      if (shouldShow && !isShown) group.addLayer(cluster.marker);
      else if (!shouldShow && isShown) group.removeLayer(cluster.marker);
    });
  });
}
