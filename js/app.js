// ---- Entry point: wiring + bootstrap ----

import { state } from "./state.js";
import { loadTrips, loadPhotos } from "./data.js";
import { assignTripColors } from "./colors.js";
import {
  initMap, buildDayLayers, buildStartDotLayers, startDotId, tripTrackDrawOrder, recenterMap, recomputeOffsetLines,
} from "./map-layers.js";
import { buildTripClusterLayer, updateClusterVisibility } from "./clusters.js";
import { renderExploreLegend, setExploreLegendMode, TRIP_SORT_DEFAULT_DIR, TRACK_SORT_DEFAULT_DIR, renderPicker, showAllTripsFooter } from "./sidebar.js";
import { selectAll, selectTrip, switchColorMode } from "./selection.js";
import { closePoi, navigatePoi, openNoteModal, closeNoteModal } from "./poi.js";
import {
  activePhotos, openPhoto, closePhoto, openPresentation, closePresentation, setPhotosVisible,
  clampPresTx, applyPresentationLevel,
} from "./photos.js";
import { themeChartDefaults } from "./chart.js";

function wireUi() {
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    document.getElementById("app").classList.toggle("sidebar-open");
  });

  // The app title doubles as the breadcrumb's root crumb.
  document.getElementById("tripTitle").addEventListener("click", () => selectAll());

  document.getElementById("recenterBtn").addEventListener("click", () => recenterMap());

  document.querySelectorAll("#colorModeToggle button").forEach(btn => {
    btn.addEventListener("click", () => switchColorMode(btn.dataset.mode));
  });

  document.getElementById("pickerToggle").addEventListener("click", () => {
    const collapsed = document.getElementById("pickerPanel").classList.toggle("collapsed");
    document.getElementById("pickerChevron").textContent = collapsed ? "▸" : "▾";
  });

  document.getElementById("pickerBack").addEventListener("click", () => selectAll());

  document.getElementById("pickerContext").addEventListener("click", (e) => {
    const btn = e.target.closest(".picker-context-trip");
    if (btn) selectTrip(btn.dataset.tripId);
  });

  document.querySelectorAll("#tripSort button").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (state.tripSort === key) {
        state.tripSortDir *= -1;
      } else {
        state.tripSort = key;
        const defaults = state.activeTripId ? TRACK_SORT_DEFAULT_DIR : TRIP_SORT_DEFAULT_DIR;
        state.tripSortDir = defaults[key];
      }
      renderPicker();
    });
  });

  document.getElementById("elevationCollapse").addEventListener("click", () => {
    document.getElementById("app").classList.toggle("elevation-collapsed");
    setTimeout(() => { if (state.chart) state.chart.resize(); }, 220);
  });

  document.getElementById("exploreModeToggle").addEventListener("click", () => {
    const collapsed = document.getElementById("exploreModePanel").classList.toggle("collapsed");
    document.getElementById("exploreModeChevron").textContent = collapsed ? "▸" : "▾";
  });

  // Esplora-dati's own tabs only swap which legend is displayed here for
  // browsing -- deliberately not switchColorMode, so they never repaint
  // the map/chart (that's the footer's real #colorModeToggle, wired above).
  document.querySelectorAll("#exploreLegendTabs button").forEach(btn => {
    btn.addEventListener("click", () => {
      setExploreLegendMode(btn.dataset.mode);
    });
  });

  document.getElementById("poiListToggle").addEventListener("click", () => {
    const collapsed = document.getElementById("poiListPanel").classList.toggle("collapsed");
    document.getElementById("poiListChevron").textContent = collapsed ? "▸" : "▾";
  });

  document.getElementById("poiClose").addEventListener("click", closePoi);
  document.getElementById("poiCollapse").addEventListener("click", () => {
    const detail = document.getElementById("poiDetail");
    const collapsed = detail.classList.toggle("collapsed");
    document.getElementById("poiCollapse").textContent = collapsed ? "▸" : "▾";
  });
  document.getElementById("poiPrev").addEventListener("click", () => navigatePoi(-1));
  document.getElementById("poiNext").addEventListener("click", () => navigatePoi(1));

  document.getElementById("noteModalClose").addEventListener("click", closeNoteModal);
  document.getElementById("noteModal").addEventListener("click", (e) => {
    if (e.target.id === "noteModal") closeNoteModal();
  });

  // Headbar layer toggles -- each flips its own boolean and re-runs the
  // matching visibility function, which still layers the trip-scoping
  // (only the active trip's group) on top of the toggle.
  function wireHeadbarToggle(id, onToggle) {
    const btn = document.getElementById(id);
    btn.addEventListener("click", () => {
      const active = onToggle();
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }
  wireHeadbarToggle("toggleStarts", () => {
    state.startsVisible = !state.startsVisible;
    updateClusterVisibility();
    return state.startsVisible;
  });
  wireHeadbarToggle("togglePois", () => {
    state.poisVisible = !state.poisVisible;
    updateClusterVisibility();
    return state.poisVisible;
  });
  wireHeadbarToggle("togglePhotos", () => {
    setPhotosVisible(!state.photosVisible);
    return state.photosVisible;
  });
  document.getElementById("photoLightbox").addEventListener("click", closePhoto);
  document.getElementById("photoLightboxClose").addEventListener("click", (e) => { e.stopPropagation(); closePhoto(); });
  document.getElementById("photoLightboxBody").addEventListener("click", (e) => e.stopPropagation());
  document.getElementById("photoLightboxImg").addEventListener("click", openPresentation);
  document.getElementById("photoLightboxPrev").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPhotoIndex < 0) return;
    const photos = activePhotos();
    const newIndex = Math.max(0, state.selectedPhotoIndex - 1);
    openPhoto(state.activeTripId, newIndex);
  });
  document.getElementById("photoLightboxNext").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPhotoIndex < 0) return;
    const photos = activePhotos();
    const newIndex = Math.min(photos.length - 1, state.selectedPhotoIndex + 1);
    openPhoto(state.activeTripId, newIndex);
  });
  document.getElementById("photoPresentationClose").addEventListener("click", (e) => {
    e.stopPropagation();
    closePresentation();
  });
  document.getElementById("photoPresentationPrev").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPhotoIndex < 0) return;
    openPhoto(state.activeTripId, Math.max(0, state.selectedPhotoIndex - 1));
  });
  document.getElementById("photoPresentationNext").addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.selectedPhotoIndex < 0) return;
    const photos = activePhotos();
    openPhoto(state.activeTripId, Math.min(photos.length - 1, state.selectedPhotoIndex + 1));
  });

  // Drag-to-pan and auto-hide UI in presentation mode.
  (function () {
    const el = document.getElementById("photoPresentation");
    const img = document.getElementById("photoPresentationImg");
    let dragActive = false, dragX = 0, dragY = 0, didDrag = false;
    let uiTimer = null;

    function showUI() {
      el.classList.add("ui-active");
      clearTimeout(uiTimer);
      uiTimer = setTimeout(() => el.classList.remove("ui-active"), 3000);
    }

    el.addEventListener("mousemove", showUI);

    // Pointer cursor over the left/right nav zones (like hovering a real
    // button), overriding the zoom-in/zoom-out cursor that otherwise
    // covers the whole presentation area -- inline style beats the
    // .zoom-in-next/.zoom-out-next CSS classes' cursor, and clearing it
    // (empty string) lets those classes take back over outside the zones.
    el.addEventListener("mousemove", (e) => {
      const zone = sideZoneWidth();
      const inSideZone = zone > 0 && (e.clientX < zone || e.clientX > window.innerWidth - zone);
      el.style.cursor = inSideZone ? "pointer" : "";
    });

    el.addEventListener("mousedown", (e) => {
      if (!state.presentationOpen) return;
      if (e.button !== 0) return;
      if (e.target.tagName === "BUTTON") return;
      dragActive = true; didDrag = false;
      dragX = e.clientX; dragY = e.clientY;
      el.classList.add("dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragActive) return;
      const dx = e.clientX - dragX;
      const dy = e.clientY - dragY;
      dragX = e.clientX; dragY = e.clientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      if (el.classList.contains("panorama")) {
        el.scrollLeft -= dx;
      } else if (el.classList.contains("tall-fit")) {
        el.scrollTop -= dy;
      } else if (state.presZoom > state.presBaseZoom) {
        state.presTx += dx;
        state.preTy += dy;
        clampPresTx();
        img.style.transform = `translate(${state.presTx}px,${state.preTy}px) scale(${state.presZoom})`;
      }
    });

    // Left/right click-to-navigate zones, sized like the letterbox bars a
    // 4:3 photo would get on a 16:9 screen -- not actual bars (any photo's
    // real aspect ratio is irrelevant here), just a familiar-feeling
    // fixed proportion for "click the edge of the screen to go prev/next"
    // that's wider than the small prev/next buttons alone.
    function sideZoneWidth() {
      const vw = window.innerWidth, vh = window.innerHeight;
      return Math.max(0, (vw - vh * 4 / 3) / 2);
    }

    window.addEventListener("mouseup", (e) => {
      if (!dragActive) return;
      const wasDrag = didDrag;
      dragActive = false;
      el.classList.remove("dragging");
      if (!wasDrag && state.presentationOpen && img.naturalWidth > 0) {
        const zone = sideZoneWidth();
        if (zone > 0 && e.clientX < zone) {
          if (state.selectedPhotoIndex > 0) openPhoto(state.activeTripId, state.selectedPhotoIndex - 1);
          return;
        }
        if (zone > 0 && e.clientX > window.innerWidth - zone) {
          const photos = activePhotos();
          if (state.selectedPhotoIndex < photos.length - 1) openPhoto(state.activeTripId, state.selectedPhotoIndex + 1);
          return;
        }
        state.presLevel = 1 - state.presLevel;
        state.presZoom = 1; state.presTx = 0; state.preTy = 0;
        img.style.transform = "";
        applyPresentationLevel(img);
      }
    });
  }());
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.presentationOpen) closePresentation();
  });
  document.getElementById("photoPresentation").addEventListener("wheel", (e) => {
    if (!state.presentationOpen) return;
    e.preventDefault();
    const el = document.getElementById("photoPresentation");
    const img = document.getElementById("photoPresentationImg");

    // Horizontal scroll: trackpad swipe L/R or shift+wheel.
    const isHoriz = e.shiftKey || (e.deltaX !== 0 && Math.abs(e.deltaX) >= Math.abs(e.deltaY));
    if (isHoriz) {
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      if (el.classList.contains("panorama")) {
        el.scrollLeft += delta;
      } else if (el.classList.contains("tall-fit")) {
        el.scrollTop += delta;
      } else if (state.presZoom > 1) {
        state.presTx -= delta;
        clampPresTx();
        img.style.transform = `translate(${state.presTx}px,${state.preTy}px) scale(${state.presZoom})`;
      }
      return;
    }

    // Seamlessly exit scroll-layout modes into transform-based zoom.
    if (el.classList.contains("panorama")) {
      const containH = window.innerWidth * img.naturalHeight / img.naturalWidth;
      state.presBaseZoom = window.innerHeight / containH;
      state.presZoom = state.presBaseZoom;
      state.presTx = 0; state.preTy = 0;
      el.classList.remove("panorama");
      el.scrollLeft = 0;
      img.style.transform = `scale(${state.presZoom})`;
    } else if (el.classList.contains("tall-fit")) {
      const containW = window.innerHeight * img.naturalWidth / img.naturalHeight;
      state.presBaseZoom = window.innerWidth / containW;
      state.presZoom = state.presBaseZoom;
      state.presTx = 0; state.preTy = 0;
      el.classList.remove("tall-fit");
      el.scrollTop = 0;
      img.style.transform = `scale(${state.presZoom})`;
    }

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const rawZoom = state.presZoom * factor;

    // Zoomed all the way out: snap to whichever level shows the full width (contain = scale 1).
    if (rawZoom <= 1) {
      const ir = img.naturalWidth / img.naturalHeight;
      state.presLevel = ir > window.innerWidth / window.innerHeight ? 1 : 0;
      applyPresentationLevel(img);
      return;
    }

    const newZoom = Math.min(10, rawZoom);
    const rect = img.getBoundingClientRect();
    const imgCx = rect.left + rect.width / 2;
    const imgCy = rect.top + rect.height / 2;
    const dx = (e.clientX - imgCx) / state.presZoom;
    const dy = (e.clientY - imgCy) / state.presZoom;
    const layoutCx = imgCx - state.presTx;
    const layoutCy = imgCy - state.preTy;

    state.presZoom = newZoom;
    state.presTx = e.clientX - dx * newZoom - layoutCx;
    state.preTy = e.clientY - dy * newZoom - layoutCy;
    img.style.transform = `translate(${state.presTx}px,${state.preTy}px) scale(${state.presZoom})`;
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    // The note modal takes priority, then presentation, then the photo lightbox, then POI navigation.
    if (!document.getElementById("noteModal").classList.contains("hidden")) {
      if (e.key === "Escape") closeNoteModal();
      return;
    }
    if (state.presentationOpen) {
      const photos = activePhotos();
      if (e.key === "ArrowLeft") {
        openPhoto(state.activeTripId, Math.max(0, state.selectedPhotoIndex - 1));
      } else if (e.key === "ArrowRight") {
        openPhoto(state.activeTripId, Math.min(photos.length - 1, state.selectedPhotoIndex + 1));
      } else if (e.key === "Escape") closePresentation();
      return;
    }
    if (state.selectedPhotoIndex >= 0) {
      const photos = activePhotos();
      if (e.key === "ArrowLeft") {
        const newIndex = Math.max(0, state.selectedPhotoIndex - 1);
        openPhoto(state.activeTripId, newIndex);
      }
      else if (e.key === "ArrowRight") {
        const newIndex = Math.min(photos.length - 1, state.selectedPhotoIndex + 1);
        openPhoto(state.activeTripId, newIndex);
      }
      else if (e.key === "Escape") closePhoto();
      return;
    }
    if (state.navIndex < 0) return;
    if (e.key === "ArrowLeft") navigatePoi(-1);
    else if (e.key === "ArrowRight") navigatePoi(1);
    else if (e.key === "Escape") closePoi();
  });
}

async function main() {
  themeChartDefaults();
  const trips = await loadTrips();
  state.trips = trips;
  assignTripColors(trips);

  trips.forEach((trip, i) => {
    trip._buildIndex = i; // matches the trip index `points[*].near` refers to (see build_trips.py)
    state.tripById[trip.id] = trip;
    trip.tracks.forEach((track, idx) => {
      track._dayNumber = idx + 1; // 1-based sequential day, independent of track.name
      state.trackById[track.id] = { trip, track };
    });
  });

  const map = initMap();

  // Photos are loaded before any markers are built (traded off against a
  // small delay to first paint of the start/POI markers) so
  // buildTripClusterLayer can fold each trip's photos into its unified
  // start/POI/photo clustering pass in one go, rather than needing a
  // second marker-rebuild pass once photos land later.
  const photos = await loadPhotos();
  const photosByTrip = {};
  photos.forEach(photo => {
    if (!photo.trip_id) return;
    (photosByTrip[photo.trip_id] || (photosByTrip[photo.trip_id] = [])).push(photo);
  });
  Object.values(photosByTrip).forEach(list => list.sort((a, b) => (a.t || "").localeCompare(b.t || "")));
  state.photosByTrip = photosByTrip;

  trips.forEach(trip => {
    tripTrackDrawOrder(trip).forEach(track => {
      const layers = buildDayLayers(trip, track);
      state.dayLayers[track.id] = layers;
      layers.day.addTo(map);
    });
    buildTripClusterLayer(trip, photosByTrip[trip.id] || []);
  });
  // Start dots are added in a second pass, after every trip's tracks, so
  // they render on top of every track/casing regardless of trip order.
  trips.forEach(trip => {
    trip.tracks.forEach(track => {
      const layers = buildStartDotLayers(trip, track);
      state.dayLayers[startDotId(track.id)] = layers;
      layers.day.addTo(map);
    });
  });

  renderExploreLegend();
  wireUi();
  showAllTripsFooter();

  const togglePhotosBtn = document.getElementById("togglePhotos");
  togglePhotosBtn.classList.toggle("hidden", photos.length === 0);
  if (photos.length) {
    togglePhotosBtn.classList.add("active");
    togglePhotosBtn.setAttribute("aria-pressed", "true");
  }

  if (trips.length) {
    selectAll();
  } else {
    map.setView([46, 11], 10);
  }
  // The map has no zoom until the first setView/fitBounds above -- now
  // that it does, position every shared-route offset line for real.
  recomputeOffsetLines();
}

main();
