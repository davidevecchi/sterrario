// ---- Geometry, distance, track series, and milestone helpers ----

import { state } from "./state.js";

// The tracks the Esplora-dati legend should break down / highlight -- the
// one active day, the active trip's tracks, or (nothing selected) allTracks.
export function exploreScopeTracks(allTracks) {
  if (state.activeDayId) {
    const trip = state.tripById[state.activeTripId];
    const track = trip && trip.tracks.find(t => t.id === state.activeDayId);
    if (track) return [track];
  } else if (state.activeTripId) {
    const trip = state.tripById[state.activeTripId];
    if (trip) return trip.tracks;
  }
  return allTracks;
}

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dphi = (lat2 - lat1) * Math.PI / 180;
  const dlambda = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Initial bearing (degrees, 0 = north, clockwise) from p1 to p2 -- used to
// orient the trip-start triangle so its tip points at the first day's
// destination.
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function nearestPointOnTrack(lat, lon, track) {
  let bestOff = Infinity, bestAlong = 0, bestIdx = 0;
  track.points.forEach((p, i) => {
    const d = haversineM(lat, lon, p.lat, p.lon);
    if (d < bestOff) { bestOff = d; bestAlong = p.dist; bestIdx = i; }
  });
  return { alongDist: bestAlong, offDist: bestOff, idx: bestIdx };
}

// Cached on the poi itself, since a poi belongs to exactly one trip and its
// nearest track never changes -- avoids redoing an O(tracks x points) scan
// every time a POI is clicked (showPoiSignTooltip, poisForTrack,
// computeTripMilestones all call this).
export function nearestTrackForPoi(trip, poi) {
  if (poi._nearestTrack) return poi._nearestTrack;
  let best = null;
  trip.tracks.forEach(track => {
    const { alongDist, offDist } = nearestPointOnTrack(poi.lat, poi.lon, track);
    if (!best || offDist < best.offDist) best = { track, alongDist, offDist };
  });
  return (poi._nearestTrack = best);
}

// Every POI whose nearest track is this one, in the trip's own POI order
// -- the day-sign tooltip's POI list (see tripMarkerTooltipHtml) walks
// this to show the whole day's itinerary alongside whichever POI is
// currently selected.
export function poisForTrack(trip, track) {
  const list = [];
  trip.pois.forEach((poi, i) => {
    if (nearestTrackForPoi(trip, poi).track === track) list.push({ poi, index: i });
  });
  return list;
}

// Cumulative distance-so-far at the start of each of the trip's tracks, in
// trip.tracks order -- lets any along-track distance be turned into a
// trip-wide one so the distance shown on a signpost is meaningful even
// across day boundaries.
export function tripDayOffsets(trip) {
  const dayOffset = [];
  let running = 0;
  trip.tracks.forEach(track => { dayOffset.push(running); running += track.distance_m; });
  return dayOffset;
}

// Every POI in the trip, kept in its original GPX order -- the signpost
// prev/next nav never skips a POI, it just walks straight through the list;
// only the displayed distance is recomputed per POI (via its nearest point
// on whichever track it's closest to, turned into a trip-wide distance).
// Bookended with the trip's own start and end as two extra "signs".
export function computeTripMilestones(trip) {
  const dayOffset = tripDayOffsets(trip);
  const list = trip.pois.map((poi, i) => {
    const best = nearestTrackForPoi(trip, poi);
    const trackIdx = best ? trip.tracks.indexOf(best.track) : -1;
    const dist = best ? dayOffset[trackIdx] + best.alongDist : 0;
    return { kind: "poi", poiIndex: i, trackIdx, dist };
  });

  const firstTrack = trip.tracks[0], lastTrack = trip.tracks[trip.tracks.length - 1];
  const first = firstTrack.points[0], last = lastTrack.points[lastTrack.points.length - 1];
  const totalDist = dayOffset[dayOffset.length - 1] + lastTrack.distance_m;
  list.unshift({ kind: "boundary", end: "start", dist: 0, lat: first.lat, lon: first.lon, ele: first.ele });
  list.push({ kind: "boundary", end: "end", dist: totalDist, lat: last.lat, lon: last.lon, ele: last.ele });
  return list;
}

export function milestoneShortLabel(trip, m) {
  if (m.kind === "boundary") return m.end === "start" ? "Partenza" : "Arrivo";
  const poi = trip.pois[m.poiIndex];
  return poi.name || "(senza nome)";
}

// The categories that actually get named on a signpost: summits, huts/refuges
// and accommodations, plus the trip's own start/end. Every POI is still
// stepped through one at a time by the arrows -- this only decides which
// upcoming/previous stop is worth announcing, like a real trail sign telling
// you "next hut, 3km" without teleporting you there.
export const SIGN_SYMS = new Set(["Summit", "Lodge", "Shelter", "Lodging"]);
export function isSignworthy(trip, m) {
  return m.kind === "boundary" || SIGN_SYMS.has(trip.pois[m.poiIndex].sym);
}
export function findNextSign(trip, milestones, idx, dir) {
  for (let i = idx + dir; i >= 0 && i < milestones.length; i += dir) {
    if (isSignworthy(trip, milestones[i])) return milestones[i];
  }
  return null;
}

// Smoothed grade (%) per point, precomputed build-time (see GRADE_SMOOTHING_M
// in build_trips.py) so it doesn't need redoing on every viewer session.
export function trackGradeSeries(track) {
  return trackCategorySeries(track, "grade");
}

export function trackCategorySeries(track, field) {
  const cache = track._catSeries || (track._catSeries = {});
  if (cache[field]) return cache[field];
  return (cache[field] = track.points.map((p) => p[field]));
}

// A track whose start and end sit within 40m of each other is an
// out-and-back/loop -- its start-to-end bearing is meaningless (often just
// GPS noise), so its marker drops the directional notch/corner entirely
// and its hover compass spins instead of pointing anywhere.
const ROUND_TRIP_THRESHOLD_M = 60;
export function isRoundTripTrack(track) {
  const points = track.points;
  const p0 = points[0], pEnd = points[points.length - 1];
  return haversineM(p0.lat, p0.lon, pEnd.lat, pEnd.lon) <= ROUND_TRIP_THRESHOLD_M;
}

// Straight-line bearing from the track's start to its actual destination
// (the first track's last point), not just its initial heading -- the
// triangle should point at where the first day ends up, even if the road
// curves along the way.
export function trackStartBearing(track) {
  const points = track.points;
  const p0 = points[0];
  const target = points[points.length - 1];
  if (target === p0) return 0;
  return bearingDeg(p0.lat, p0.lon, target.lat, target.lon);
}

// The "day" number as it reads in the sidebar picker, not the track's
// cardinal position -- most track names already embed one ("Day 6",
// "Giorno II"), and a single calendar day can hold more than one track
// (e.g. a hike and a bike leg the same day), so the picker's own number
// can repeat or skip ahead of the plain 1-based track count. Falls back to
// that cardinal count for trips whose tracks aren't named with a day
// number at all.
export function trackSidebarDayNumber(track) {
  const match = track.name && track.name.match(/\d+/);
  return match ? parseInt(match[0], 10) : track._dayNumber;
}

// Projects `latlng` onto the segment a-b (plain lat/lon space -- fine at
// the scale of a single track segment) so the hover tooltip can stick to
// the track itself instead of the raw cursor position.
export function closestPointOnSegment(latlng, aLat, aLon, bLat, bLon) {
  const dLat = bLat - aLat, dLon = bLon - aLon;
  const lenSq = dLat * dLat + dLon * dLon;
  let t = lenSq === 0 ? 0 : ((latlng.lat - aLat) * dLat + (latlng.lng - aLon) * dLon) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return L.latLng(aLat + t * dLat, aLon + t * dLon);
}
// Same, but over every consecutive pair in a multi-point run (the day-view
// hit-lines cover a whole run, not just one segment).
export function closestPointOnPolyline(latlng, points) {
  let best = null, bestDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const cand = closestPointOnSegment(latlng, a.lat, a.lon, b.lat, b.lon);
    const d = (cand.lat - latlng.lat) ** 2 + (cand.lng - latlng.lng) ** 2;
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  return best || latlng;
}

// Downsamples by index, not by scanning -- O(maxN) regardless of the
// source array's length, since tracks can carry tens of thousands of points.
export function sampleArray(arr, maxN) {
  if (arr.length <= maxN) return arr;
  const step = arr.length / maxN;
  const out = [];
  for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

export function tripAllPoints(trip) {
  return [].concat(...trip.tracks.map(t => t.points));
}

// Elevation min/max across just the given tracks -- e.g. for scoping the
// altimetry legend to whatever's currently selected. Reuses each track's
// own ele_min/ele_max (already computed build-time, see build_trips.py and
// their use in chart.js's footer info) rather than re-scanning every point
// the way globalEleMinMax does, since that full scan is only meant to run
// once at startup.
export function tracksEleMinMax(tracks) {
  if (!tracks.length) return { min: 0, max: 0 };
  return {
    min: Math.min(...tracks.map(t => t.ele_min)),
    max: Math.max(...tracks.map(t => t.ele_max)),
  };
}

// Steepest downhill/uphill grade reached anywhere across the trip's tracks
// -- reuses the same cached, smoothed per-track grade series as the
// gradient color mode, so this is just a min/max scan over already-computed data.
export function tripGradeMinMax(trip) {
  let min = Infinity, max = -Infinity;
  trip.tracks.forEach(track => {
    trackGradeSeries(track).forEach(g => {
      if (g < min) min = g;
      if (g > max) max = g;
    });
  });
  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
}