// A `#ico=<name>` tag embedded in a POI's cmt/desc (Material Symbols icon
// names, as written by whatever tool tagged these points) is more specific
// than the GPX `sym` field and wins over it when present. Values are PUA
// codepoints into the self-hosted Material Symbols Outlined variable font
// (css/fonts/material-symbols-outlined.woff2, see css/base.css's `.msym`
// class and scripts/material-symbols-outlined.codepoints for the full
// name->codepoint table) -- codepoints work identically in DOM text and
// Canvas fillText, unlike the font's ligature names.
export const ICO_CODEPOINT = {
  accomodation: "\ue549", // hotel
  camping: "\uf8a2",
  cottage: "\ue587",
  cabin: "\ue589",
  landscape: "\ue564",
  landscape_2: "\uf4c4",
  // App brand icon (see the title bar / favicon.svg).
  landscape_2_edit: "\uf310",
  mountain_flag: "\uf5e2",
  holiday_village: "\ue58a",
  house_siding: "\uf202",
  icecream: "\uea69",
  directions_run: "\ue566",
  emoji_people: "\uea1d",
  minor_crash: "\uebf1",
  nutrition: "\ue110",
  pedal_bike: "\ueb29",
  report: "\uf052",
  rest_area: "\uf22a",
  thunderstorm: "\uebdb",
  warning: "\uf083",
  water: "\uf084",
  water_full: "\uf6d6",
  alt_route: "\uf184",
  elevation: "\uf6e7",
  shopping_basket: "\ue8cb",
  local_parking: "\ue54f",
  landslide: "\uebd7",
  photo_camera: "\ue412",
  location_on: "\uf1db", // default, no #ico tag
  flag: "\uf0c6",
  sticky_note_2: "\uf1fc",
  // Trip-start/end milestone card (see showMilestone's "boundary" branch).
  trip_start: "\ue86b", // change_history
  trip_end: "\uef4a", // circle

  // Map layer-switcher pictograms (js/map-layers.js's LAYER_ICON/buildLayerSwitcher).
  satellite_alt: "\ueb3a",
  terrain: "\ue564",
  hiking: "\ue50a",
  map: "\ue55b",
  directions_bus: "\ue530",
  sell: "\uf05b",
  border_all: "\ue228",
  downhill_skiing: "\ue509",
  route: "\ueacd",
  layers: "\ue53b",
  public: "\ue80b",
  explore: "\ue87a",
  altitude: "\uf873",
  pin_road: "\u{fff2d}",
  edit_location_alt: "\ue1c5",
  my_location: "\ue55c",
  // _: "\u",
};
// Icon name from the POI's own `#ico=` tag, or the generic default if absent.
export function poiIcoName(poi) {
  const text = `${poi.cmt || ""}\n${poi.desc || ""}`;
  const m = text.match(/#ico=([a-zA-Z0-9_]+)/);
  return m && ICO_CODEPOINT[m[1]] ? m[1] : "location_on";
}
// HTML icon markup (self-hosted Material Symbols glyph), for contexts set
// via `.innerHTML`. Sizing/color/weight/fill are all plain CSS on `.msym`
// (currentColor + font-variation-settings), no per-icon markup needed.
export function icoHtml(name) {
  return `<span class="msym">${ICO_CODEPOINT[name]}</span>`;
}
export function poiIconHtml(poi) {
  return icoHtml(poiIcoName(poi));
}
export function boundaryIconHtml(end) {
  return icoHtml(end === "start" ? "trip_start" : "trip_end");
}
// Draws a named icon (from ICO_CODEPOINT) directly on a Canvas 2D context,
// filling with whatever ctx.fillStyle is already set. `size` is the glyph's
// font size in canvas pixels, centered at (cx, cy). Weight is baked in to
// match the app's chosen wght:300/GRAD:50 look (see css/base.css's
// `.msym`) -- GRAD and opsz have no Canvas `font` shorthand equivalent
// (only weight and family do), so this is as close as Canvas text can get.
export function drawIcoPath(ctx, name, cx, cy, size) {
  ctx.save();
  ctx.font = `300 ${size}px "Material Symbols Outlined"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ICO_CODEPOINT[name] || ICO_CODEPOINT.location_on, cx, cy);
  ctx.restore();
}
// Kick off loading the icon font as early as possible so the first Canvas
// draw (e.g. on hover, before any DOM .msym element has forced a load)
// doesn't race a not-yet-ready font.
if (typeof document !== "undefined" && document.fonts) {
  document.fonts.load('300 24px "Material Symbols Outlined"');
}

// `#tag=value` lines in a POI's cmt/desc are metadata for this app (icon
// hints, etc.), not part of the human-readable note -- strip them before
// showing the note to the user.
export function stripHashTags(text) {
  return text.split("\n").filter(line => !line.trim().startsWith("#")).join("\n").trim();
}
