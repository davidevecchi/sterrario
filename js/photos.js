// ---- Photos ----
//
// Photo markers are no longer their own independent layer/icon family --
// every photo is absorbed into a priority cluster (see buildTripClusters/
// buildTripClusterLayer, near tripMarkerIcon/poiMarkerIcon) alongside any
// start/POI within 30m of it, rendered with combinedClusterIcon. Grouping
// photos by trip (byTrip, sorted by time, feeding both buildTripClusters
// and openPhoto's index contract) now happens once in main(), before that
// per-trip cluster pass, instead of in a photo-only helper here.

import { state } from "./state.js";
import { updateClusterVisibility } from "./clusters.js";

export function activePhotos() {
  return (state.activeTripId && state.photosByTrip[state.activeTripId]) || [];
}

export function openPhoto(tripId, index) {
  const photos = state.photosByTrip[tripId] || [];
  if (index < 0 || index >= photos.length) return;
  state.selectedPhotoIndex = index;
  const photo = photos[index];
  document.getElementById("photoLightboxImg").src = photo.display;
  const when = photo.t ? new Date(photo.t).toLocaleString("it-IT", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";
  document.getElementById("photoLightboxCaption").textContent =
    `${photo.filename}${when ? " — " + when : ""} (${index + 1} / ${photos.length})`;
  document.getElementById("photoLightboxPrev").classList.toggle("hidden", index === 0);
  document.getElementById("photoLightboxNext").classList.toggle("hidden", index === photos.length - 1);
  document.getElementById("photoLightboxPanoBadge").classList.toggle("hidden", !(photo.w && photo.h && photo.w / photo.h > 16 / 9));
  document.getElementById("photoLightbox").classList.remove("hidden");
  if (state.presentationOpen) {
    setPresentationSrc(photo.original || photo.display);
    document.getElementById("photoPresentationPrev").classList.toggle("hidden", index === 0);
    document.getElementById("photoPresentationNext").classList.toggle("hidden", index === photos.length - 1);
  }
}

export function resetPresentationZoom() {
  state.presZoom = 1; state.presTx = 0; state.preTy = 0;
  state.presBaseZoom = 1; state.presLevel = 0;
  document.getElementById("photoPresentationImg").style.transform = "";
}

export function clampPresTx() {
  const img = document.getElementById("photoPresentationImg");
  const vw = window.innerWidth, vh = window.innerHeight;
  const ir = img.naturalWidth / img.naturalHeight;
  const containedW = ir > vw / vh ? vw : vh * ir;
  const maxTx = Math.max(0, containedW * state.presZoom / 2 - vw / 2);
  state.presTx = Math.max(-maxTx, Math.min(maxTx, state.presTx));
}

// Apply the current presLevel (0=fit-h, 1=fit-w) to the presentation overlay.
// Sets presZoom/presBaseZoom, panorama class, cursor class, and transform.
export function applyPresentationLevel(img) {
  const el = document.getElementById("photoPresentation");
  const vw = window.innerWidth, vh = window.innerHeight;
  const ir = img.naturalWidth / img.naturalHeight;
  const vr = vw / vh;

  el.classList.remove("panorama", "tall-fit");
  el.scrollLeft = 0; el.scrollTop = 0;
  state.presTx = 0; state.preTy = 0;
  img.style.transform = "";

  if (state.presLevel === 0) {
    if (ir > vr) {
      // Wide image at fit-h: panorama scroll (full height, horizontal overflow)
      state.presZoom = ir / vr;
      state.presBaseZoom = ir / vr;
      el.classList.add("panorama");
      el.scrollLeft = (ir * vh - vw) / 2;
    } else {
      // Tall/square at fit-h: contain already fills height
      state.presZoom = 1;
      state.presBaseZoom = 1;
    }
  } else {
    if (ir > vr) {
      // Wide image at fit-w: contain already fills width
      state.presZoom = 1;
      state.presBaseZoom = 1;
    } else {
      // Tall image at fit-w: tall-fit scroll (full width, vertical overflow)
      state.presZoom = vr / ir;
      state.presBaseZoom = vr / ir;
      el.classList.add("tall-fit");
      el.scrollTop = (vw / ir - vh) / 2;
    }
  }

  // Cursor: indicates what clicking will do (toggle to the other level)
  const clickZoomsIn = state.presLevel === 0 ? ir <= vr : ir > vr;
  el.classList.toggle("zoom-in-next", clickZoomsIn);
  el.classList.toggle("zoom-out-next", !clickZoomsIn);
}

export function setPresentationSrc(src) {
  const img = document.getElementById("photoPresentationImg");
  const el = document.getElementById("photoPresentation");
  el.classList.remove("panorama", "tall-fit");
  el.scrollLeft = 0; el.scrollTop = 0;
  resetPresentationZoom();
  img.onload = () => { if (img.naturalWidth > 0) applyPresentationLevel(img); };
  img.src = src;
  if (img.complete && img.naturalWidth > 0) img.onload();
}

export function closePhoto() {
  state.selectedPhotoIndex = -1;
  document.getElementById("photoLightbox").classList.add("hidden");
  closePresentation();
}

export function openPresentation() {
  if (state.selectedPhotoIndex < 0) return;
  const photos = activePhotos();
  const photo = photos[state.selectedPhotoIndex];
  if (!photo) return;
  state.presentationOpen = true;
  setPresentationSrc(photo.original || photo.display);
  document.getElementById("photoPresentationPrev").classList.toggle("hidden", state.selectedPhotoIndex === 0);
  document.getElementById("photoPresentationNext").classList.toggle("hidden", state.selectedPhotoIndex === photos.length - 1);
  const presentationEl = document.getElementById("photoPresentation");
  presentationEl.classList.remove("hidden");
  presentationEl.classList.add("ui-active");
  document.documentElement.requestFullscreen().catch(() => {});
}

export function closePresentation() {
  state.presentationOpen = false;
  resetPresentationZoom();
  const el = document.getElementById("photoPresentation");
  el.classList.add("hidden");
  el.classList.remove("panorama", "tall-fit", "ui-active", "dragging", "zoom-in-next", "zoom-out-next");
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

export function setPhotosVisible(visible) {
  state.photosVisible = visible;
  updateClusterVisibility();
}
