(function () {
  "use strict";

  const SYM_ICON = {
    "Bike Trail": "🚲",
    "Summit": "⛰️",
    "Alert": "⚠️",
    "Information": "ℹ️",
    "Parking Area": "🅿️",
    "Lodge": "🏠",
    "Picnic Area": "🧺",
    "Shelter": "⛺",
    "Water Source": "💧",
    "Lodging": "🛏️",
    "Scenic Area": "📷",
    "Convenience Store": "🏪",
    "Drinking Water": "🚰",
    "Restaurant": "🍽️",
  };
  const DEFAULT_ICON = "📍";

  // A `#ico=<name>` tag embedded in a POI's cmt/desc (Material Symbols icon
  // names, as written by whatever tool tagged these points) is more specific
  // than the GPX `sym` field and wins over it when present. Paths are Material
  // Symbols Outlined glyphs (24px, "0 -960 960 960" viewBox), inlined so
  // `fill="currentColor"` picks up whatever color CSS gives the icon's
  // container (e.g. .poi-glyph, .poi-item .icon -- see poiIconHtml below).
  const ICO_PATH = {
    accomodation: "M40-200v-600h80v400h320v-320h320q66 0 113 47t47 113v360h-80v-120H120v120H40Zm155-275q-35-35-35-85t35-85q35-35 85-35t85 35q35 35 35 85t-35 85q-35 35-85 35t-85-35Zm325 75h320v-160q0-33-23.5-56.5T760-640H520v240ZM308.5-531.5Q320-543 320-560t-11.5-28.5Q297-600 280-600t-28.5 11.5Q240-577 240-560t11.5 28.5Q263-520 280-520t28.5-11.5ZM280-560Zm240-80v240-240Z", // hotel
    camping: "M80-80v-186l350-472-70-94 64-48 56 75 56-75 64 48-70 94 350 472v186H80Zm400-591L160-240v80h120l200-280 200 280h120v-80L480-671ZM378-160h204L480-302 378-160Zm102-280 200 280-200-280-200 280 200-280Z",
    cottage: "M160-120v-375l-72 55-48-64 120-92v-124h80v63l240-183 440 336-48 63-72-54v375H160Zm80-80h200v-160h80v160h200v-356L480-739 240-556v356Zm-80-560q0-50 35-85t85-35q17 0 28.5-11.5T320-920h80q0 50-35 85t-85 35q-17 0-28.5 11.5T240-760h-80Zm80 560h480-480Z",
    cabin: "M240-200h480v-80H240v80Zm0-160h480v-80H240v80Zm0-160h480v-36l-58-44H298l-58 44v36Zm162-160h156l-78-59-78 59ZM160-120v-375l-72 55-48-64 120-92v-124h80v63l240-183 440 336-48 63-72-54v375H160Zm0-640q0-50 35-85t85-35q17 0 28.5-11.5T320-920h80q0 50-35 85t-85 35q-17 0-28.5 11.5T240-760h-80Z",
    landscape: "m40-240 240-320 180 240h300L560-586 460-454l-50-66 150-200 360 480H40Zm521-80Zm-361 0h160l-80-107-80 107Zm0 0h160-160Z",
    landscape_2: "m46-160 138-276q10-20 28.5-32t41.5-12q24 0 44 12.5t29 35.5l27 66q2 6 9 5.5t9-6.5l86-287q14-48 53.5-77t89.5-29q49 0 87.5 28.5T742-657l173 497h-85L666-632q-8-23-25-35.5T601-680q-23 0-40.5 13T535-631l-86 287q-9 28-32.5 46T363-280q-27 0-50-14.5T280-335l-27-66-118 241H46Zm194-400q-50 0-85-35.5T120-680q0-50 35-85t85-35q50 0 85 35t35 85q0 49-35 84.5T240-560Zm0-80q17 0 28.5-11.5T280-680q0-17-11.5-28.5T240-720q-17 0-28.5 11.5T200-680q0 17 11.5 28.5T240-640Zm123 360ZM240-680Z",
    mountain_flag: "M480-390Zm-132-53 55 37 77-39 77 39 53-35-40-79H386l-38 77ZM209-160h541L646-369l-83 55-83-41-83 41-85-56-103 210ZM80-80l234-475q10-20 29.5-32.5T386-600h54v-280h280l-40 80 40 80H520v120h50q23 0 42 12t30 32L880-80H80Z",
    holiday_village: "M80-160v-400l240-240 240 240v400H80Zm80-80h120v-120h80v120h120v-287L320-687 160-527v287Zm120-200v-80h80v80h-80Zm360 280v-433L433-800h113l174 174v466h-80Zm160 0v-499L659-800h113l108 108v532h-80Zm-640-80h320-320Z",
    house_siding: "M200-120v-406L88-440l-48-64 440-336 440 336-48 64-112-86v406h-80v-120H280v120h-80Zm80-360h400v-80H280v80Zm0 160h400v-80H280v80Zm70-320h260l-130-99-130 99Z",
    icecream: "M482-40 294-400q-71 3-122.5-41T120-560q0-51 29.5-92t74.5-58q18-91 89.5-150.5T480-920q95 0 166.5 59.5T736-710q45 17 74.5 58t29.5 92q0 75-53 119t-119 41L482-40ZM280-480q15 0 29.5-5t26.5-17l22-22 26 16q21 14 45.5 21t50.5 7q26 0 50.5-7t45.5-21l26-16 22 22q12 12 26.5 17t29.5 5q33 0 56.5-23.5T760-560q0-30-19-52.5T692-640l-30-4-2-32q-5-69-57-116.5T480-840q-71 0-123 47.5T300-676l-2 32-30 6q-30 6-49 27t-19 51q0 33 23.5 56.5T280-480Zm202 266 108-210q-24 12-52 18t-58 6q-27 0-54.5-6T372-424l110 210Zm-2-446Z",
    directions_run: "M520-40v-240l-84-80-40 176-276-56 16-80 192 40 64-324-72 28v136h-80v-188l158-68q35-15 51.5-19.5T480-720q21 0 39 11t29 29l40 64q26 42 70.5 69T760-520v80q-66 0-123.5-27.5T540-540l-24 120 84 80v300h-80Zm-36.5-723.5Q460-787 460-820t23.5-56.5Q507-900 540-900t56.5 23.5Q620-853 620-820t-23.5 56.5Q573-740 540-740t-56.5-23.5Z",
    emoji_people: "M360-80v-529q-91-24-145.5-100.5T160-880h80q0 83 53.5 141.5T430-680h100q30 0 56 11t47 32l181 181-56 56-158-158v478h-80v-240h-80v240h-80Zm63.5-663.5Q400-767 400-800t23.5-56.5Q447-880 480-880t56.5 23.5Q560-833 560-800t-23.5 56.5Q513-720 480-720t-56.5-23.5Z",
    minor_crash: "M320-704 200-824l56-56 120 120-56 56Zm320 0-56-56 120-120 56 56-120 120Zm-200-56v-200h80v200h-80ZM160 0q-17 0-28.5-11.5T120-40v-320l84-240q6-18 21.5-29t34.5-11h440q19 0 34.5 11t21.5 29l84 240v320q0 17-11.5 28.5T800 0h-40q-17 0-28.5-11.5T720-40v-40H240v40q0 17-11.5 28.5T200 0h-40Zm72-440h496l-42-120H274l-42 120Zm68 240q25 0 42.5-17.5T360-260q0-25-17.5-42.5T300-320q-25 0-42.5 17.5T240-260q0 25 17.5 42.5T300-200Zm360 0q25 0 42.5-17.5T720-260q0-25-17.5-42.5T660-320q-25 0-42.5 17.5T600-260q0 25 17.5 42.5T660-200Zm-460 40h560v-200H200v200Zm0 0v-200 200Z",
    nutrition: "M281.5-201.5Q200-283 200-400q0-94 55.5-168.5T401-669q-20-5-39-14.5T328-708q-33-33-42.5-78.5T281-879q47-5 92.5 4.5T452-832q23 23 33.5 52t13.5 61q13-31 31.5-58.5T572-828q11-11 28-11t28 11q11 11 11 28t-11 28q-22 22-39 48.5T564-667q88 28 142 101.5T760-400q0 117-81.5 198.5T480-120q-117 0-198.5-81.5Zm340-57Q680-317 680-400t-58.5-141.5Q563-600 480-600t-141.5 58.5Q280-483 280-400t58.5 141.5Q397-200 480-200t141.5-58.5ZM480-400Z",
    pedal_bike: "M200-160q-85 0-142.5-57.5T0-360q0-85 58.5-142.5T200-560q77 0 129.5 46T396-400h26l-72-200h-70v-80h200v80h-44l14 40h192l-58-160H480v-80h104q26 0 46.5 14t29.5 38l68 186h32q83 0 141.5 58.5T960-362q0 84-58 143t-142 59q-72 0-126.5-45T564-320H396q-14 69-68 114.5T200-160Zm0-80q41 0 70.5-22.5T312-320H200v-80h112q-12-36-41.5-58T200-480q-51 0-85.5 34.5T80-360q0 50 34.5 85t85.5 35Zm308-160h56q5-23 13.5-43t22.5-37H478l30 80Zm252 160q51 0 85.5-35t34.5-85q0-51-34.5-85.5T760-480h-4l40 106-76 28-38-106q-20 17-31 40t-11 52q0 50 34.5 85t85.5 35ZM196-360Zm564 0Z",
    report: "M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z",
    rest_area: "m160-566 151-128 128 118 159-158 202 168v-234H160v234Zm40 486v-80h-80v-80h240v80h-80v80h-80Zm240 0v-240H280v-80h400v80H520v240h-80Zm240 0v-80h-80v-80h240v80h-80v80h-80ZM160-320q-33 0-56.5-23.5T80-400v-400q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v400q0 33-23.5 56.5T800-320h-40v-80h40v-61L602-626 441-465 309-587 160-462v62h40v80h-40Zm320-480Z",
    thunderstorm: "m300-40 36-100h-76l50-140h100l-43 100h83L340-40h-40Zm270-40 28-80h-78l43-120h100l-35 80h82L610-80h-40ZM300-320q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z",
    warning: "m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z",
    water: "M80-240v-80q38 0 56.5-20t77.5-20q59 0 77.5 20t54.5 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20q38 0 55.5-20t76.5-20q59 0 77.5 20t56.5 20v80q-57 0-77.5-20T746-280q-36 0-54.5 20T614-240q-57 0-77.5-20T480-280q-38 0-56.5 20T346-240q-59 0-76.5-20T214-280q-38 0-56.5 20T80-240Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-440q-36 0-54.5 20T614-400q-57 0-77.5-20T480-440q-38 0-55.5 20T348-400q-59 0-78.5-20T214-440q-36 0-56.5 20T80-400Zm0-160v-80q38 0 56.5-20t77.5-20q57 0 76.5 20t55.5 20q38 0 56.5-20t77.5-20q57 0 77 20t55 20q38 0 56.5-20t77.5-20q57 0 77.5 20t56.5 20v80q-59 0-78.5-20T746-600q-36 0-54.5 20T614-560q-57 0-77.5-20T480-600q-38 0-55.5 20T348-560q-59 0-78.5-20T214-600q-36 0-56.5 20T80-560Z",
    water_full: "M444-600q-55 0-108 15.5T238-538l42 378h400l44-400h-28q-38 0-69-5.5T542-587q-23-7-48-10t-50-3Zm-216-25q51-27 105.5-41T445-680q30 0 59.5 4t58.5 12q50 14 76.5 19t56.5 5h37l17-160H210l18 175Zm51 545q-31 0-53.5-20T200-151l-80-729h720l-80 729q-3 31-25.5 51T681-80H279Zm165-80h236-400 164Z",
    alt_route: "M440-80v-200q0-56-17-83t-45-53l57-57q12 11 23 23.5t22 26.5q14-19 28.5-33.5T538-485q38-35 69-81t33-161l-63 63-57-56 160-160 160 160-56 56-64-63q-2 143-44 203.5T592-425q-32 29-52 56.5T520-280v200h-80ZM248-633q-4-20-5.5-44t-2.5-50l-64 63-56-56 160-160 160 160-57 56-63-62q0 21 2 39.5t4 34.5l-78 19Zm86 176q-20-21-38.5-49T263-575l77-19q10 27 23 46t28 34l-57 57Z",
    elevation: "m82-120 258-360h202l298-348v708H82Zm70-233-64-46 172-241h202l188-219 60 52-212 247H300L152-353Zm86 153h522v-412L578-400H380L238-200Zm522 0Z",
    shopping_basket: "M221-120q-27 0-48-16.5T144-179L42-549q-5-19 6.5-35T80-600h190l176-262q5-8 14-13t19-5q10 0 19 5t14 13l176 262h192q20 0 31.5 16t6.5 35L816-179q-8 26-29 42.5T739-120H221Zm-1-80h520l88-320H132l88 320Zm316.5-103.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM367-600h225L479-768 367-600Zm113 240Z",
    local_parking: "M240-120v-720h280q100 0 170 70t70 170q0 100-70 170t-170 70H400v240H240Zm160-400h128q33 0 56.5-23.5T608-600q0-33-23.5-56.5T528-680H400v160Z",
    landslide: "M80-80h800L640-400l-200-80-120-160H80v560Zm80-80v-64l80 26 361-120 119 158H160Zm80-122-80-27v-75l80 26 158-52 96 43-254 85Zm500-118 180-80v-160l-180-40-100 80v120l100 80Zm-500-42-80-27v-91h120l65 83-105 35Zm512-51-32-25v-44l40-32 80 18v44l-88 39ZM480-640l200-80v-200l-200-40-120 80v160l120 80Zm9-90-49-33v-74l57-38 103 21v80l-111 44Z",
  };
  // Plain-text glyphs for contexts that can't render markup (Canvas
  // `fillText`, `textContent`): SYM_ICON is used verbatim there, and #ico
  // POIs fall back to a hand-picked emoji standing in for their material icon.
  const ICO_EMOJI = {
    accomodation: "\ud83c\udfe8", camping: "\u26fa", cottage: "\ud83c\udfe1", cabin: "\ud83d\uded6",
    landscape: "\ud83c\udfde\ufe0f", landscape_2: "\ud83c\udfde\ufe0f", mountain_flag: "\ud83d\udea9",
    holiday_village: "\ud83c\udfd8\ufe0f", house_siding: "\ud83c\udfe0", icecream: "\ud83c\udf66",
    directions_run: "\ud83c\udfc3", emoji_people: "\ud83d\udeb6", minor_crash: "\ud83d\udca5",
    nutrition: "\ud83c\udf4e", pedal_bike: "\ud83d\udeb2", report: "\ud83d\udccc", rest_area: "\ud83d\udecb\ufe0f",
    thunderstorm: "\u26c8\ufe0f", warning: "\u26a0\ufe0f", water: "\ud83d\udca7", water_full: "\ud83d\udeb0",
    alt_route: "\ud83d\udd00", elevation: "\u26f0\ufe0f", shopping_basket: "\ud83d\uded2", local_parking: "\ud83c\udd7f\ufe0f",
    landslide: "\ud83e\udea8",
  };
  function poiIcoName(poi) {
    const text = `${poi.cmt || ""}\n${poi.desc || ""}`;
    const m = text.match(/#ico=([a-zA-Z0-9_]+)/);
    return m && ICO_PATH[m[1]] ? m[1] : null;
  }
  // Plain-text icon glyph, safe for Canvas `fillText` and `.textContent`.
  function poiIconGlyph(poi) {
    const name = poiIcoName(poi);
    if (name) return ICO_EMOJI[name];
    return SYM_ICON[poi.sym] || DEFAULT_ICON;
  }
  // HTML icon markup (inline SVG for `#ico=`, same emoji/text otherwise),
  // for contexts set via `.innerHTML`.
  function poiIconHtml(poi) {
    const name = poiIcoName(poi);
    if (name) return `<svg viewBox="0 -960 960 960"><path d="${ICO_PATH[name]}"/></svg>`;
    return poiIconGlyph(poi);
  }

  // Material Symbols Outlined glyphs for the trip-start/end milestone card
  // (see showMilestone's "boundary" branch): a plain triangle for the start,
  // a bullseye/target ring for the end.
  const BOUNDARY_ICON_PATH = {
    start: "m80-160 400-640 400 640H80Zm144-80h512L480-650 224-240Zm256-205Z", // change_history
    end: "M480-360q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Zm0-320Zm141.5 141.5Q680-397 680-480t-58.5-141.5Q563-680 480-680t-141.5 58.5Q280-563 280-480t58.5 141.5Q397-280 480-280t141.5-58.5Z", // circle_circle
  };
  function boundaryIconHtml(end) {
    const path = end === "start" ? BOUNDARY_ICON_PATH.start : BOUNDARY_ICON_PATH.end;
    return `<svg viewBox="0 -960 960 960"><path d="${path}"/></svg>`;
  }

  // `#tag=value` lines in a POI's cmt/desc are metadata for this app (icon
  // hints, etc.), not part of the human-readable note -- strip them before
  // showing the note to the user.
  function stripHashTags(text) {
    return text.split("\n").filter(line => !line.trim().startsWith("#")).join("\n").trim();
  }

  const SURFACE_COLORS = {
    asphalt: "#3f3f46",
    paved: "#52525b",
    concrete: "#71717a",
    paving_stones: "#a1a1aa",
    cobblestone: "#b45309",
    wood: "#92400e",
    gravel: "#ca8a04",
    fine_gravel: "#eab308",
    compacted: "#65a30d",
    unpaved: "#16a34a",
    ground: "#166534",
    grass: "#22c55e",
  };
  const SURFACE_FALLBACK = "#9ca3af";
  const SURFACE_LABELS = {
    asphalt: "Asfalto", paved: "Pavimentato", concrete: "Cemento",
    paving_stones: "Pietre", cobblestone: "Ciottoli", wood: "Legno",
    gravel: "Ghiaia", fine_gravel: "Ghiaia fine", compacted: "Sterrato compatto",
    unpaved: "Sterrato", ground: "Terreno", grass: "Erba",
  };

  const HIGHWAY_COLORS = {
    primary: "#b91c1c",
    secondary: "#c2410c",
    tertiary: "#d97706",
    unclassified: "#a16207",
    residential: "#78716c",
    service: "#57534e",
    track: "#15803d",
    path: "#0d9488",
    footway: "#0e7490",
    pedestrian: "#0369a1",
    cycleway: "#2563eb",
  };
  const HIGHWAY_FALLBACK = "#9ca3af";
  const HIGHWAY_LABELS = {
    primary: "Strada primaria", secondary: "Strada secondaria", tertiary: "Strada terziaria",
    unclassified: "Strada non classificata", residential: "Strada residenziale",
    service: "Strada di servizio", track: "Sterrato/carrareccia", path: "Sentiero",
    footway: "Marciapiede", pedestrian: "Area pedonale", cycleway: "Pista ciclabile",
  };

  // Gradient (% slope) buckets. Signed (not mirrored): downhill and uphill
  // get distinct colors on one continuous red -> yellow -> green ramp,
  // rather than the same color by steepness alone.
  const GRADE_BUCKETS = [
    { max: -20, color: "#166534", label: "< -20%" },
    { max: -10, color: "#16a34a", label: "-20 / -10%" },
    { max: -3, color: "#65a30d", label: "-10 / -3%" },
    { max: 3, color: "#eab308", label: "-3 / 3%" },
    { max: 10, color: "#f97316", label: "3 / 10%" },
    { max: 20, color: "#dc2626", label: "10 / 20%" },
    { max: Infinity, color: "#7f1d1d", label: "> 20%" },
  ];
  function gradeColor(grade) {
    for (const b of GRADE_BUCKETS) if (grade <= b.max) return b.color;
    return GRADE_BUCKETS[GRADE_BUCKETS.length - 1].color;
  }

  // One dash pattern per activity (matching the icons in res/) so days
  // within a trip stay legible on the map even though they all now share
  // the same trip color -- the color says "which trip", the dash says
  // "which kind of day". "other" (no #activity= tag, no matching emoji)
  // gets its own pattern but no icon (see ACTIVITY_ICON).
  const ACTIVITY_DASH = {
    touring: null,            // solid -- the default/most common activity
    road: "18,5",
    gravel: "4,4",
    bike: "11,5",
    mtb: "7,3,1,3",
    hike: "1,7",
    walk: "1,4",
    run: "2,3",
    alpine: "9,3,2,3",
    other: "5,5",
  };
  // Prefer the vector res/<activity>.svg where one exists (crisper at the
  // small sizes markers render at); falls back to the .png for activities
  // that only have a raster icon.
  const ACTIVITY_ICON = {
    touring: "res/touring.svg", road: "res/road.svg", gravel: "res/gravel.svg",
    bike: "res/bike.svg", mtb: "res/mtb.svg", hike: "res/hike.png",
    walk: "res/walk.png", run: "res/run.png", alpine: "res/alpine.png",
  };
  function dayIconHtml(track) {
    const src = ACTIVITY_ICON[track.activity];
    if (!src) return "";
    const alt = ACTIVITY_LABELS[track.activity] || track.activity;
    return `<img class="day-icon" src="${src}" alt="${alt}">`;
  }
  const ACTIVITY_LABELS = {
    touring: "Touring", road: "Bici da strada", gravel: "Gravel", bike: "Bici",
    mtb: "MTB", hike: "Trekking", walk: "Camminata", run: "Corsa", alpine: "Alpinismo",
    other: "Altro",
  };
  // Swatch colors for the "Tracce" legend's per-activity km breakdown --
  // its own small palette, same pattern as SURFACE_COLORS/HIGHWAY_COLORS
  // above (an independent hex set, not the parchment theme's CSS vars).
  const ACTIVITY_COLORS = {
    touring: "#2563eb", road: "#dc2626", gravel: "#ca8a04", bike: "#0d9488",
    mtb: "#7c3aed", hike: "#16a34a", walk: "#65a30d", run: "#ea580c",
    alpine: "#57534e", other: "#9ca3af",
  };
  // Every distinct activity among the given tracks, most-common first --
  // used both for the All Trips summary and each trip's picker row.
  function activityTallyHtml(tracks) {
    const counts = {};
    tracks.forEach(t => { counts[t.activity] = (counts[t.activity] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return entries.map(([activity, count], i) => {
      const src = ACTIVITY_ICON[activity];
      const alt = ACTIVITY_LABELS[activity] || activity;
      const suffix = i === entries.length - 1 ? ` ${count === 1 ? "traccia" : "tracce"}` : "";
      return `<div class="activity-tally-item" title="${alt}">${src ? `<img class="day-icon" src="${src}" alt="${alt}">` : alt}<span>${count}${suffix}</span></div>`;
    }).join("");
  }

  // Trip identity color: an unbounded generator, not a fixed palette --
  // any number of trips gets its own deterministic, muted color, keyed
  // purely by rank (date order; oldest = rank 0), so a trip keeps its
  // color forever as more trips are added around it.
  //
  // Hue alone rotates by the golden angle (137.508deg), the classic
  // low-discrepancy choice for spreading unboundedly many points around a
  // circle with no long-run clustering. But hue rotation by itself isn't
  // colorblind-safe: two hues can sit on the same CVD "confusion line"
  // regardless of how far apart they are in degrees. Lightness and chroma
  // each get their own independent low-discrepancy walk (golden ratio and
  // sqrt(2), both irrational and mutually incommensurate with the hue
  // step and each other), so nearby ranks essentially never share a
  // confusion line at the same lightness/chroma -- decorrelating the
  // three channels this way is what the plain single-ring version (hue
  // rotation at one fixed L/C) got wrong.
  //
  // Validated (dataviz skill's validator) up to 40 sequential ranks: worst
  // *adjacent*-rank CVD separation clears the 8 target outright (a couple
  // of the most saturated greens/teals dip just under 3:1 against the map
  // casing -- ~2.9, the expected trade for higher chroma -- which is why
  // every trip's swatch always keeps the cream casing halo behind it plus
  // its name as visible relief, not color alone). Full all-pairs
  // distinctness (every trip vs every other, not just neighbors) can't be
  // guaranteed for an open-ended count -- even a hand-curated 8-hue set
  // can only guarantee that for 3 -- so color is never the sole
  // identifier here: every swatch always carries the trip's name alongside it.
  const HUE_STEP_DEG = 137.508/3;       // golden angle
  const L_PHASE_STEP = 0.6180339887;  // golden ratio conjugate
  const C_PHASE_STEP = 0.4142135624;  // sqrt(2) - 1
  const TRIP_COLOR_L_MIN = 0.50, TRIP_COLOR_L_MAX = 0.64; // mid lightness band
  const TRIP_COLOR_C_MIN = 0.18, TRIP_COLOR_C_MAX = 0.24; // saturated, not muted
  function frac(x) { return x - Math.floor(x); }
  function oklchToHex(L, C, h) {
    const hRad = (h * Math.PI) / 180;
    const a = C * Math.cos(hRad), b = C * Math.sin(hRad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const toSrgb = (c) => {
      c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.min(1, Math.max(0, c));
    };
    const toHex = (v) => Math.round(toSrgb(v) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(bb)}`;
  }
  function tripColorForRank(rank) {
    const hue = (rank * HUE_STEP_DEG) % 360;
    const L = TRIP_COLOR_L_MIN + (TRIP_COLOR_L_MAX - TRIP_COLOR_L_MIN) * frac(rank * L_PHASE_STEP + 0.15);
    const C = TRIP_COLOR_C_MIN + (TRIP_COLOR_C_MAX - TRIP_COLOR_C_MIN) * frac(rank * C_PHASE_STEP + 0.4);
    return oklchToHex(L, C, hue);
  }

  // Ranks every trip by date (seed_date: real start_t, or the GPX file's own
  // mtime as a fallback for trips with no timestamps at all) and assigns
  // each a permanent color by that rank. Ties (e.g. several undated trips
  // sharing one fallback date) are broken by original array order, so the
  // result is fully deterministic for a given trips.json.
  function assignTripColors(trips) {
    const ranked = trips.map((trip, i) => ({ trip, i })).sort((a, b) => {
      const da = a.trip.summary.seed_date || "", db = b.trip.summary.seed_date || "";
      return da < db ? -1 : da > db ? 1 : a.i - b.i;
    });
    ranked.forEach((entry, rank) => {
      entry.trip._rank = rank;
      entry.trip._color = tripColorForRank(rank);
    });
  }

  const GRADE_SMOOTHING_M = 30; // look-ahead window: raw point-to-point elevation
  // deltas are noisy (consumer GPS elevation can easily be off by 10-50m, so a
  // single bad reading over a couple of meters of travel reads as an absurd
  // grade -- 100%+ spikes); a wider window averages that error away over more
  // distance instead. Computed once per track in a single O(n) pass
  // (two-pointer over the already-distance-sorted points) and cached on the
  // track object, so repeatedly recoloring by gradient (mode switches,
  // re-renders) is free.
  function trackGradeSeries(track) {
    if (track._gradeSeries) return track._gradeSeries;
    const points = track.points;
    const n = points.length;
    const grades = new Array(n).fill(0);
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (j < i) j = i;
      while (j < n - 1 && points[j].dist - points[i].dist < GRADE_SMOOTHING_M) j++;
      const distM = points[j].dist - points[i].dist;
      const e0 = points[i].ele, e1 = points[j].ele;
      grades[i] = (e0 == null || e1 == null || distM < 1) ? 0 : ((e1 - e0) / distM) * 100;
    }
    track._gradeSeries = grades;
    return grades;
  }

  function trackCategorySeries(track, field) {
    return track.points.map((p) => p[field]);
  }

  const OFFTRACK_THRESHOLD_M = 1500;
  // Stroke width for the legend-hover highlight only -- the base map/chart
  // lines stay their normal thickness; just the hovered category's segments
  // get thickened, both on the map and directly on the elevation line.
  const LEGEND_HIGHLIGHT_WIDTH = 5;
  const LEGEND_HIGHLIGHT_HALO_WIDTH = LEGEND_HIGHLIGHT_WIDTH + 3;

  // Every map track always gets a thin white casing underneath it (a wider
  // white line added to the map first, so the colored line renders on top),
  // +2px visible on each side -- doesn't apply to the elevation graph.
  const TRACK_WEIGHT = 3;
  const TRACK_CASING_WEIGHT = TRACK_WEIGHT + 3;
  // The colored line itself (not its casing) draws a bit thicker for the
  // currently-charted trip/day, on top of the white halo, so the selected
  // track pops even where the halo alone wouldn't stand out (e.g. thin
  // shared-lane runs).
  const SELECTED_TRACK_WEIGHT = 5;

  // Actual visible track/casing strokes are only a few px wide, too thin to
  // reliably hover/click -- every track segment also gets an invisible line
  // drawn this wide purely to widen the mouseover/mousemove/click hit area.
  // Made invisible via opacity: 0, not a transparent stroke color -- Chrome
  // and Firefox both skip hit-testing an SVG stroke/fill painted with a
  // literal transparent (zero-alpha) color, which would silently kill the
  // wider hit area this exists for; a fully opaque color faded out via the
  // element's own opacity keeps the hit area while staying invisible.
  const TRACK_HIT_WEIGHT = 40;

  // The currently-charted track(s) -- the whole trip, or just one selected
  // day -- get an extra-wide white halo, rendered in trackHighlightPane so it
  // always sits below every track/casing regardless of add order. Hovering
  // any other track reuses the exact same halo treatment, just for whichever
  // track is under the cursor instead of the persistent selection.
  const SELECTION_HIGHLIGHT_WEIGHT = TRACK_CASING_WEIGHT + 4;

  // Once something is charted (a trip or a single day selected), every other
  // track fades to this opacity so the selected one visually pops -- at the
  // "all trips" level (nothing charted yet) everything stays at full opacity.
  const DIMMED_TRACK_OPACITY = 0.4;
  const FULL_TRACK_OPACITY = 1;

  // Where two different trips visited the same stretch of road/path (flagged
  // build-time in each point's `near` list -- see build_trips.py), each
  // trip draws its own thin line laterally offset from the others instead of
  // one trip's line simply painting over the other's. The offset is done in
  // screen pixels (map.project/unproject at the current zoom), which is
  // zoom-dependent -- recomputed on "zoomend" via OFFSET_LINE_REGISTRY -- but
  // pan-independent, since Leaflet's projected pixel coords for a given zoom
  // don't depend on where the map is currently centered.
  const SHARED_LANE_WEIGHT = 3;
  const SHARED_CASING_WEIGHT = TRACK_CASING_WEIGHT + 6;
  const LANE_SPACING_PX = 5;
  const OFFSET_LINE_REGISTRY = [];

  function laneOffsetForPoint(selfBuildIndex, near) {
    const group = [selfBuildIndex, ...(near || [])].sort((a, b) => a - b);
    const pos = group.indexOf(selfBuildIndex);
    return (pos - (group.length - 1) / 2) * LANE_SPACING_PX;
  }

  // Splits a track's points into runs of consecutive segments that are all
  // either "shared" (near non-empty) or not, so each run can be rendered as
  // one continuous polyline. Runs share their boundary point with their
  // neighbor, so there's no visual gap between them.
  //
  // Parallel shared-route lanes are disabled for now (always a single
  // "not shared" run spanning the whole track) -- flip SHARED_LANES_ENABLED
  // to bring them back; the per-point `near` data and offset machinery
  // below are untouched.
  const SHARED_LANES_ENABLED = false;
  function splitDayRuns(points) {
    if (!SHARED_LANES_ENABLED || points.length < 2) {
      return [{ start: 0, end: points.length - 1, shared: false }];
    }
    const runs = [];
    let segStart = 0;
    let curShared = !!(points[0].near && points[0].near.length);
    for (let i = 1; i < points.length - 1; i++) {
      const segShared = !!(points[i].near && points[i].near.length);
      if (segShared !== curShared) {
        runs.push({ start: segStart, end: i, shared: curShared });
        segStart = i;
        curShared = segShared;
      }
    }
    runs.push({ start: segStart, end: points.length - 1, shared: curShared });
    return runs;
  }

  // Offsets each latlng perpendicular to its local direction (toward its
  // neighbors) by the matching entry in offsetsPx, in screen-pixel space at
  // the map's current zoom.
  function offsetLatLngsByPoint(map, latlngs, offsetsPx) {
    const zoom = map.getZoom();
    const pts = latlngs.map(ll => map.project(ll, zoom));
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[i - 1] || pts[i];
      const next = pts[i + 1] || pts[i];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const off = offsetsPx[i];
      out.push(map.unproject(L.point(pts[i].x + nx * off, pts[i].y + ny * off), zoom));
    }
    return out;
  }

  // Registers a shared-run polyline for offset recomputation, and applies
  // the offset immediately if the map already has a zoom level (it won't
  // yet at initial layer build time, before the first fitBounds/setView --
  // recomputeOffsetLines() catches those once the view is set).
  function registerOffsetLine(layer, latlngs, offsetsPx) {
    OFFSET_LINE_REGISTRY.push({ layer, latlngs, offsetsPx });
    if (typeof state.map.getZoom() === "number") {
      layer.setLatLngs(offsetLatLngsByPoint(state.map, latlngs, offsetsPx));
    }
  }

  function recomputeOffsetLines() {
    if (typeof state.map.getZoom() !== "number") return;
    OFFSET_LINE_REGISTRY.forEach(({ layer, latlngs, offsetsPx }) => {
      layer.setLatLngs(offsetLatLngsByPoint(state.map, latlngs, offsetsPx));
    });
  }

  function haversineM(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dphi = (lat2 - lat1) * Math.PI / 180;
    const dlambda = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlambda / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function nearestPointOnTrack(lat, lon, track) {
    let bestOff = Infinity, bestAlong = 0, bestIdx = 0;
    track.points.forEach((p, i) => {
      const d = haversineM(lat, lon, p.lat, p.lon);
      if (d < bestOff) { bestOff = d; bestAlong = p.dist; bestIdx = i; }
    });
    return { alongDist: bestAlong, offDist: bestOff, idx: bestIdx };
  }

  // All of a trip's POIs that fall near a given track, positioned by their
  // nearest point on that track -- used to plot POI markers on the altitude chart.
  function poiChartPointsForTrack(trip, track, offsetKm) {
    const list = [];
    trip.pois.forEach((poi, i) => {
      const { alongDist, offDist, idx } = nearestPointOnTrack(poi.lat, poi.lon, track);
      if (offDist > OFFTRACK_THRESHOLD_M) return;
      list.push({ x: offsetKm + alongDist / 1000, y: track.points[idx].ele, tripId: trip.id, poiIndex: i, sym: poi.sym, cmt: poi.cmt, desc: poi.desc });
    });
    return list;
  }

  // A trip's photos already know which day they belong to (day_id, set at
  // import time from the GPX track it was shot closest to in time) -- so
  // unlike POIs, no nearest-track search is needed, just an exact match.
  function photoChartPointsForTrack(trip, track, offsetKm) {
    const photos = state.photosByTrip[trip.id] || [];
    const list = [];
    photos.forEach((photo, i) => {
      if (photo.day_id !== track.id) return;
      const { alongDist, offDist, idx } = nearestPointOnTrack(photo.lat, photo.lon, track);
      if (offDist > OFFTRACK_THRESHOLD_M) return;
      list.push({ x: offsetKm + alongDist / 1000, y: track.points[idx].ele, tripId: trip.id, photoIndex: i });
    });
    return list;
  }

  function nearestTrackForPoi(trip, poi) {
    let best = null;
    trip.tracks.forEach(track => {
      const { alongDist, offDist } = nearestPointOnTrack(poi.lat, poi.lon, track);
      if (!best || offDist < best.offDist) best = { track, alongDist, offDist };
    });
    return best;
  }

  // Every POI whose nearest track is this one, in the trip's own POI order
  // -- the day-sign tooltip's POI list (see tripMarkerTooltipHtml) walks
  // this to show the whole day's itinerary alongside whichever POI is
  // currently selected.
  function poisForTrack(trip, track) {
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
  function tripDayOffsets(trip) {
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
  function computeTripMilestones(trip) {
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

  function milestoneShortLabel(trip, m) {
    if (m.kind === "boundary") return m.end === "start" ? "Partenza" : "Arrivo";
    const poi = trip.pois[m.poiIndex];
    return poi.name || "(senza nome)";
  }

  // The categories that actually get named on a signpost: summits, huts/refuges
  // and accommodations, plus the trip's own start/end. Every POI is still
  // stepped through one at a time by the arrows -- this only decides which
  // upcoming/previous stop is worth announcing, like a real trail sign telling
  // you "next hut, 3km" without teleporting you there.
  const SIGN_SYMS = new Set(["Summit", "Lodge", "Shelter", "Lodging"]);
  function isSignworthy(trip, m) {
    return m.kind === "boundary" || SIGN_SYMS.has(trip.pois[m.poiIndex].sym);
  }
  function findNextSign(trip, milestones, idx, dir) {
    for (let i = idx + dir; i >= 0 && i < milestones.length; i += dir) {
      if (isSignworthy(trip, milestones[i])) return milestones[i];
    }
    return null;
  }

  const state = {
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
    poiMarkers: {},        // tripId -> [markers] parallel to trip.pois
    poiLayerGroups: {},    // tripId -> L.layerGroup
    poisVisible: true,     // headbar toggle -- on top of the trip-scoping in updatePoiMarkerVisibility
    tripBoundaryGroups: {}, // tripId -> L.layerGroup (start/end markers)
    activityMarkerGroups: {}, // tripId -> L.layerGroup (per-day activity-icon start pins)
    startsVisible: true,   // headbar toggle -- on top of the trip-scoping in updateTripMarkerVisibility
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
    photoGroupsByTrip: {},  // tripId -> L.markerClusterGroup
    photosVisible: true,
    selectedPhotoIndex: -1,
    presentationOpen: false,
    presZoom: 1, presTx: 0, preTy: 0, presBaseZoom: 1, presLevel: 0,
  };

  function fmtKmRound(m) { return Math.round(m / 1000).toLocaleString("en-US") + " km"; }
  function fmtM(m, unit = true) { return Math.round(m).toLocaleString("en-US") + (unit ? " m" : ""); }
  function fmtSignDistKm(km) { return Math.round(Math.abs(km)) + " km"; }
  function fmtDuration(sec) {
    if (sec == null) return "-";
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  // `withYear` defaults on so a lone date always reads unambiguously; range
  // formatting below turns it off for whichever end would otherwise repeat
  // a year already shown on the other end.
  function fmtDate(iso, withYear = true) {
    if (!iso) return "";
    const d = new Date(iso);
    const base = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
    return withYear ? `${base} '${String(d.getFullYear()).slice(-2)}` : base;
  }
  function fmtDateRange(startIso, endIso) {
    if (!startIso || !endIso) return "";
    const start = new Date(startIso), end = new Date(endIso);
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    const startStr = sameMonth ? start.toLocaleDateString("it-IT", { day: "numeric" }) : fmtDate(startIso, !sameYear);
    return `${startStr} – ${fmtDate(endIso)}`;
  }
  // Calendar-day count between the trip's own start date and some later
  // date, 1-based (the start date itself is day 1) -- unlike
  // trackSidebarDayNumber (parsed from the track name, or the plain 1-based
  // track count) this always matches the real dates, including rest days
  // or multiple tracks sharing a calendar day.
  function realDayNumber(tripStartIso, dateIso) {
    if (!tripStartIso || !dateIso) return null;
    const start = new Date(tripStartIso), date = new Date(dateIso);
    const msPerDay = 24 * 60 * 60 * 1000;
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((dateUtc - startUtc) / msPerDay) + 1;
  }
  async function loadTrips() {
    const res = await fetch("data/.generated/trips.json");
    return (await res.json()).trips;
  }

  async function loadPhotos() {
    try {
      const res = await fetch("data/.generated/photos.json");
      if (!res.ok) return [];
      const photos = (await res.json()).photos || [];
      photos.sort((a, b) => (a.t || "").localeCompare(b.t || ""));
      return photos;
    } catch (e) {
      return [];
    }
  }

  function initMap() {
    const map = L.map("map", { zoomControl: true });
    // Esri World Imagery: satellite/aerial imagery.
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    }).addTo(map);
    // A pane sandwiched between the tiles (z-index 200) and Leaflet's default
    // overlayPane (z-index 400, where every track/casing/marker lives) --
    // guarantees the selection halo always renders below every track, no
    // matter what order layers are added/rebuilt in.
    map.createPane("trackHighlightPane");
    map.getPane("trackHighlightPane").style.zIndex = 350;
    map.getPane("trackHighlightPane").style.pointerEvents = "none";
    // The moving hover-point marker (see showHoverMarker) needs to always sit
    // above every track/casing/halo -- those get reordered via bringToFront
    // as selection/dimming changes, which would otherwise bury a marker
    // that was added to the map earlier. A dedicated pane above Leaflet's
    // own markerPane (600)/tooltipPane (650) sidesteps DOM order entirely.
    // pointerEvents: none keeps the marker from stealing mousemove/mouseout
    // from whatever track hit-line is under the cursor.
    // A pane above the track/casing overlayPane (400) but below Leaflet's
    // markerPane (600) -- keeps the track start dots always on top of lines
    // but under every icon/POI/boundary marker.
    map.createPane("trackDotsPane");
    map.getPane("trackDotsPane").style.zIndex = 450;
    map.getPane("trackDotsPane").style.pointerEvents = "none";
    map.createPane("hoverPointPane");
    map.getPane("hoverPointPane").style.zIndex = 675;
    map.getPane("hoverPointPane").style.pointerEvents = "none";
    state.map = map;
    map.on("zoomend", recomputeOffsetLines);
    return map;
  }

  // ---- Map layers ----

  function segmentColorForMode(mode, surface, highway, grade) {
    if (mode === "surface") return SURFACE_COLORS[surface] || SURFACE_FALLBACK;
    if (mode === "highway") return HIGHWAY_COLORS[highway] || HIGHWAY_FALLBACK;
    if (mode === "gradient") return gradeColor(grade);
    return null;
  }

  // Every segment's casing is added first, in one pass, so it forms a solid
  // base the whole track sits on; the colored segments are then layered on
  // top in a second pass, newest-first-in-time so the oldest segment ends up
  // front-most (same "oldest on top" convention as tripTrackDrawOrder) --
  // otherwise each segment's own casing would land on top of the *previous*
  // segment's colored line at every joint, leaving a visible white notch at
  // every cap along the track.
  function buildSegmentGroup(trip, track, mode) {
    const grades = mode === "gradient" ? trackGradeSeries(track) : null;
    const surfaces = mode === "surface" ? trackCategorySeries(track, "surface") : null;
    const highways = mode === "highway" ? trackCategorySeries(track, "highway") : null;
    const group = L.layerGroup();
    const segments = [];
    for (let i = 1; i < track.points.length; i++) {
      const prev = track.points[i - 1];
      const cur = track.points[i];
      const color = segmentColorForMode(
        mode,
        surfaces ? surfaces[i - 1] : undefined,
        highways ? highways[i - 1] : undefined,
        grades ? grades[i - 1] : undefined
      );
      segments.push({ prev, cur, color, latlngs: [[prev.lat, prev.lon], [cur.lat, cur.lon]] });
    }
    segments.forEach(s => {
      group.addLayer(L.polyline(s.latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 0.9 }));
    });
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      const seg = L.polyline(s.latlngs, { color: s.color, weight: TRACK_WEIGHT, opacity: 0.9 });
      seg._trackLineWeight = TRACK_WEIGHT;
      group.addLayer(seg);
    }
    segments.forEach(s => {
      const hitLine = L.polyline(s.latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
      hitLine._isHitLine = true;
      attachTrackHandlers(hitLine, trip, track, [s.prev, s.cur]);
      group.addLayer(hitLine);
    });
    return group;
  }

  // Wires up a track's mouseover/mousemove/click handling on its invisible
  // wide hit-line (see TRACK_HIT_WEIGHT) -- the visible casing+colored line
  // are only a few px wide and too thin to reliably hover/click, so hovering
  // and clicking are always driven by the dedicated hit-line instead: it
  // shows the day's tooltip and drops a halo under it as either the
  // persistent selection highlight or a preview of it, keeps the elevation
  // chart's crosshair in sync, and drills down a level on click.
  //
  // Which level hover/click act on follows the trip that's currently active
  // (if any), not just the track's own trip: for the active trip's own
  // tracks, hovering/clicking always targets that specific track/day -- it's
  // the one already drilled into, so there's nowhere shallower to go. For
  // every other track -- including any/all of them at the "all trips" level,
  // where no trip is active yet -- hovering/clicking targets the whole trip
  // instead, since jumping straight to one of its days would skip the trip
  // overview entirely.
  function attachTrackHandlers(hitLine, trip, track, points) {
    const tooltipHtml = tripMarkerTooltipHtml(trip, trackSidebarDayNumber(track), track.start_t, track.activity);
    const tooltipOpts = { sticky: true, direction: "top", offset: [0, -10], className: "trip-marker-tooltip-wrap" };
    const isActiveTrip = () => state.activeTripId === trip.id;
    // Anchors the tooltip to the closest point on this hit-line's own run of
    // points rather than the raw cursor position, so it sticks to the track
    // itself instead of hovering wherever the (wide, invisible) hit-line
    // happens to be under the mouse.
    const closestOnSeg = (latlng) => closestPointOnPolyline(latlng, points);
    // mousemove fires far more often than the screen can repaint, and the
    // handler's own work (re-syncing the elevation chart's active point,
    // which triggers a full Chart.js redraw) is too heavy to redo on every
    // single event -- doing so made the tooltip visibly lag behind the
    // cursor. Coalescing to one flush per animation frame keeps only the
    // latest position and matches the actual paint rate.
    let pendingLatLng = null, rafScheduled = false;
    const flushMouseMove = () => {
      rafScheduled = false;
      if (!pendingLatLng) return;
      const latlng = pendingLatLng;
      pendingLatLng = null;
      moveHoverTooltip(closestOnSeg(latlng));
      onTrackHover(trip, track, latlng);
    };
    hitLine.on("mouseover", (e) => {
      if (isActiveTrip()) showTrackHoverHighlight(track.id);
      else showTripHoverHighlight(trip.id);
      state.hoverTooltipOnLayer = true;
      showHoverTooltip(closestOnSeg(e.latlng), tooltipHtml, tooltipOpts);
    });
    hitLine.on("mouseout", () => {
      pendingLatLng = null;
      clearTrackHoverHighlight();
      clearChartHover();
      state.hoverTooltipOnLayer = false;
      hideHoverTooltip();
    });
    hitLine.on("mousemove", (e) => {
      pendingLatLng = e.latlng;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushMouseMove);
      }
    });
    hitLine.on("click", () => {
      if (isActiveTrip()) selectDay(trip.id, track.id, { recenter: false });
      else selectTrip(trip.id, { recenter: false });
    });
  }

  function buildDayLayers(trip, track) {
    const dayLatLngs = track.points.map(p => [p.lat, p.lon]);
    // Kept detached from the map, purely so fitBounds/highlight code
    // elsewhere can still call .getBounds()/.getLatLngs() on one object for
    // the whole track, regardless of how many run-pieces it's split into
    // below for rendering.
    const mainLine = L.polyline(dayLatLngs);

    const group = L.layerGroup();
    const runs = splitDayRuns(track.points);
    runs.forEach(run => {
      const runPoints = track.points.slice(run.start, run.end + 1);
      const latlngs = runPoints.map(p => [p.lat, p.lon]);
      // Casing stays solid even though the line above it is dashed by
      // activity -- it reads as a continuous colored-dash "tube" rather than
      // a broken line, so the track is always easy to follow at a glance.
      if (!run.shared) {
        const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: TRACK_CASING_WEIGHT, opacity: 0.9 });
        const line = L.polyline(latlngs, {
          color: trip._color, weight: TRACK_WEIGHT, opacity: 0.9,
          dashArray: ACTIVITY_DASH[track.activity] || null,
        });
        line._trackLineWeight = TRACK_WEIGHT;
        const hitLine = L.polyline(latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
        hitLine._isHitLine = true;
        attachTrackHandlers(hitLine, trip, track, runPoints);
        group.addLayer(casing);
        group.addLayer(line);
        group.addLayer(hitLine);
      } else {
        // A stretch shared with another trip: this trip's line is drawn
        // thinner and offset a few pixels to one side (see
        // laneOffsetForPoint/OFFSET_LINE_REGISTRY) instead of painting
        // directly over the other trip's line for the same road/path -- the
        // shared casing is drawn a bit wider to comfortably underlie every
        // trip's offset line here, not just this one.
        const casing = L.polyline(latlngs, { color: "#f7f2e4", weight: SHARED_CASING_WEIGHT, opacity: 0.9 });
        const line = L.polyline(latlngs, {
          color: trip._color, weight: SHARED_LANE_WEIGHT, opacity: 0.95,
          dashArray: ACTIVITY_DASH[track.activity] || null,
        });
        line._trackLineWeight = SHARED_LANE_WEIGHT;
        const hitLine = L.polyline(latlngs, { color: "#000", weight: TRACK_HIT_WEIGHT, opacity: 0 });
        hitLine._isHitLine = true;
        attachTrackHandlers(hitLine, trip, track, runPoints);
        group.addLayer(casing);
        group.addLayer(line);
        group.addLayer(hitLine);
        const offsetsPx = runPoints.map(p => laneOffsetForPoint(trip._buildIndex, p.near));
        registerOffsetLine(line, latlngs, offsetsPx);
        registerOffsetLine(hitLine, latlngs, offsetsPx);
      }
    });

    return { day: group, mainLine, segmentGroups: {} };
  }

  // One icon per POI, created once and never swapped: `setIcon()` replaces
  // the marker's DOM node, which can desync Leaflet's hover listeners from
  // the new element and leave a pin stuck open. Instead both the resting dot
  // and the full signpost pin are always in the DOM, and CSS classes on the
  // (stable) icon element -- "expanded" on hover, "highlighted" when opened --
  // decide which one is visible.
  function poiMarkerIcon(poi, color) {
    const glyph = poiIconHtml(poi);
    return L.divIcon({
      className: "poi-marker",
      html: `
        <div style="--poi-color: ${color}">
          <div class="poi-marker-dot"></div>
          <div class="poi-divicon">
            <div class="poi-divicon-outer"></div>
            <div class="poi-divicon-inner"></div>
            <span class="poi-glyph">${glyph}</span>
          </div>
        </div>
      `,
      iconSize: [42, 48],
      iconAnchor: [21, 48],
      popupAnchor: [0, -48],
    });
  }

  // Only one hover-expanded pin at a time: expanding a new one always
  // collapses whichever was previously hover-expanded first.
  function setHoveredPoiMarker(marker) {
    if (state.hoveredPoiMarker && state.hoveredPoiMarker !== marker) {
      const prevEl = state.hoveredPoiMarker.getElement();
      if (prevEl) prevEl.classList.remove("expanded");
    }
    state.hoveredPoiMarker = marker;
    const el = marker.getElement();
    if (el) el.classList.add("expanded");
  }
  function clearHoveredPoiMarker(marker) {
    const el = marker.getElement();
    if (el) el.classList.remove("expanded");
    if (state.hoveredPoiMarker === marker) state.hoveredPoiMarker = null;
  }

  function groupForMode(trackId, mode) {
    const layers = state.dayLayers[trackId];
    if (mode === "trip") return layers.day;
    if (!layers.segmentGroups[mode]) {
      const { trip, track } = state.trackById[trackId];
      layers.segmentGroups[mode] = buildSegmentGroup(trip, track, mode);
    }
    return layers.segmentGroups[mode];
  }

  // Which color-mode group a track is actually showing on the map right now.
  // Defaults to "trip" -- the group every track starts in at load -- since a
  // track only ever gets switched to the surface/highway/gradient coloring
  // while it's part of the current charted selection (see applyColorMode).
  function currentModeForTrack(trackId) {
    const layers = state.dayLayers[trackId];
    return (layers && layers._currentMode) || "trip";
  }

  // Only the specifically selected day (same scope as chartedTrackIds/the
  // selection halo) ever shows the surface/highway/gradient coloring; every
  // other track -- including the rest of a trip selected without a day --
  // always stays in its own trip's identity color, no matter what
  // "Colora tracce per" is set to.
  function applyColorMode() {
    const charted = new Set(chartedTrackIds());
    Object.keys(state.dayLayers).forEach(trackId => {
      const targetMode = charted.has(trackId) ? state.colorMode : "trip";
      const layers = state.dayLayers[trackId];
      const current = currentModeForTrack(trackId);
      if (current === targetMode) return;
      const oldGroup = groupForMode(trackId, current);
      const newGroup = groupForMode(trackId, targetMode);
      if (state.map.hasLayer(oldGroup)) state.map.removeLayer(oldGroup);
      newGroup.addTo(state.map);
      layers._currentMode = targetMode;
    });
    updateTrackDimming();
  }

  // ---- Sidebar: zoomable trips/days timeline ----

  // Downsamples by index, not by scanning -- O(maxN) regardless of the
  // source array's length, since tracks can carry tens of thousands of points.
  function sampleArray(arr, maxN) {
    if (arr.length <= maxN) return arr;
    const step = arr.length / maxN;
    const out = [];
    for (let i = 0; i < maxN; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }

  // Drawn as if with a chisel nib held at 45° ("\") rather than a flat
  // plotted line: segments running parallel to the nib go thin, segments
  // crossing it go thick, giving the profile a hand-drawn hachure feel.
  function sparklineSvg(points, w = 100, h = 28) {
    const eles = sampleArray(points, 40).map(p => p.ele).filter(e => e != null);
    if (eles.length < 2) return "";
    const min = Math.min(...eles), max = Math.max(...eles);
    const range = max - min || 1;
    const step = w / (eles.length - 1);
    const pad = 1, usableH = h - pad * 2;
    const xy = eles.map((e, i) => [i * step, h - pad - ((e - min) / range) * usableH]);
    const NIB_ANGLE = Math.PI / 4, MIN_W = 1, MAX_W = 2.6;
    const segs = [];
    for (let i = 1; i < xy.length; i++) {
      const [x0, y0] = xy[i - 1], [x1, y1] = xy[i];
      const theta = Math.atan2(y1 - y0, x1 - x0);
      const sw = MIN_W + (MAX_W - MIN_W) * Math.abs(Math.sin(theta - NIB_ANGLE));
      segs.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke-width="${sw.toFixed(2)}"/>`);
    }
    return `<svg class="tl-spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><g fill="none" stroke="currentColor" stroke-linecap="round">${segs.join("")}</g></svg>`;
  }

  // Route shape thumbnail: normalizes lat/lon into a small square, correcting
  // for longitude compression at the given latitude (1° lon != 1° lat) so the
  // shape isn't stretched.
  function routeThumbnailSvg(points, size = 40) {
    const samples = sampleArray(points, 60);
    if (samples.length < 2) return "";
    const avgLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
    const lonScale = Math.cos(avgLat * Math.PI / 180);
    const xs = samples.map(p => p.lon * lonScale);
    const ys = samples.map(p => -p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const scale = (size - 6) / span;
    const pts = samples.map((p, i) => `${(3 + (xs[i] - minX) * scale).toFixed(1)},${(3 + (ys[i] - minY) * scale).toFixed(1)}`).join(" ");
    return `<svg class="tl-thumb-svg" viewBox="0 0 ${size} ${size}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function tripAllPoints(trip) {
    return [].concat(...trip.tracks.map(t => t.points));
  }

  // Three selection levels, always derivable from activeTripId/activeDayId
  // rather than tracked separately, so they can never drift out of sync.
  function currentLevel() {
    if (state.activeDayId) return "track";
    if (state.activeTripId) return "trip";
    return "all";
  }

  // Display order for the All Trips list, per state.tripSort -- independent
  // of each trip's permanent color rank (assigned once, ascending, at load).
  // Ascending-order base comparators (smallest/oldest first); the actual
  // sort direction is applied on top via state.tripSortDir, which flips on
  // re-clicking the already-active sort button.
  const TRIP_SORTERS = {
    date: (a, b) => (a.summary.seed_date || "").localeCompare(b.summary.seed_date || ""),
    distance: (a, b) => a.summary.total_distance_m - b.summary.total_distance_m,
    gain: (a, b) => a.summary.total_ele_gain - b.summary.total_ele_gain,
    days: (a, b) => a.summary.num_days - b.summary.num_days,
  };
  // Trips default to newest-first; tracks default to oldest-first (day 1
  // first) since that's the natural way to read a single trip's itinerary.
  const TRIP_SORT_DEFAULT_DIR = { date: -1, distance: -1, gain: -1, days: -1 };
  const TRACK_SORT_DEFAULT_DIR = { date: 1, distance: -1, gain: -1, days: -1 };

  function sortedTrips() {
    const cmp = TRIP_SORTERS[state.tripSort] || TRIP_SORTERS.date;
    return [...state.trips].sort((a, b) => cmp(a, b) * state.tripSortDir);
  }

  // Same sort keys as the trip list, applied to a single trip's tracks --
  // "days" (Durata) maps to each track's own time duration instead of the
  // trip's day count, since a track has no "number of days" of its own.
  const TRACK_SORTERS = {
    date: (a, b) => (a.start_t || "").localeCompare(b.start_t || ""),
    distance: (a, b) => a.distance_m - b.distance_m,
    gain: (a, b) => a.ele_gain - b.ele_gain,
    days: (a, b) => a.duration_s - b.duration_s,
  };
  function sortedTracks(trip) {
    const cmp = TRACK_SORTERS[state.tripSort] || TRACK_SORTERS.date;
    return [...trip.tracks].sort((a, b) => cmp(a, b) * state.tripSortDir);
  }

  function renderBreadcrumb() {
    const nav = document.getElementById("breadcrumb");
    const level = currentLevel();
    const trip = state.activeTripId ? state.tripById[state.activeTripId] : null;
    const track = trip && state.activeDayId ? trip.tracks.find(t => t.id === state.activeDayId) : null;

    // The app title itself is the root crumb (click -> selectAll), so no
    // separate "Viaggi" segment is needed here -- it'd just repeat the title.
    document.getElementById("tripTitle").classList.toggle("crumb-current", level === "all");

    // The picker panel header echoes the same "where am I" context at every
    // level, including the root (a placeholder title, no back button since
    // there's nowhere further up). The trip name jumps straight to the trip
    // (useful from the track level); the back button always goes all the
    // way back to the full trip list.
    document.getElementById("pickerBack").hidden = !trip;
    document.getElementById("pickerContextLabel").innerHTML = trip
      ? `<button class="picker-context-trip" data-trip-id="${trip.id}">${trip.name}</button><span class="picker-context-date">${fmtDateRange(trip.summary.start_t, trip.summary.end_t)}</span>`
      : "Tutti i viaggi";

    let html = "";
    if (trip) {
      html += `<span class="crumb-sep">›</span>`;
      if (track) {
        html += `<button class="crumb" data-level="trip" data-trip-id="${trip.id}" title="Torna al percorso intero">${trip.name}</button>`;
      } else {
        html += `<span class="crumb crumb-current" aria-current="true" style="--crumb-color:${trip._color}">${trip.name}</span>`;
      }
    }
    if (track) {
      html += `<span class="crumb-sep">›</span><button class="crumb crumb-current" data-level="trip" data-trip-id="${trip.id}" aria-current="true" title="Torna al percorso intero" style="--crumb-color:${trip._color}">${track.name}</button>`;
    }
    nav.innerHTML = html;

    nav.querySelectorAll(".crumb[data-level]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.dataset.level === "all") selectAll();
        else if (btn.dataset.level === "trip") selectTrip(btn.dataset.tripId);
      });
    });
  }

  function renderTripSort() {
    const el = document.getElementById("tripSort");
    el.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.sort === state.tripSort));
  }

  function renderPicker() {
    renderTripSort();
    const list = document.getElementById("pickerList");
    list.innerHTML = "";

    if (state.activeTripId) {
      const trip = state.tripById[state.activeTripId];

      sortedTracks(trip).forEach(track => {
        const li = document.createElement("li");
        li.className = "timeline-row" + (state.activeDayId === track.id ? " active" : "");
        li.innerHTML = `
          <div class="tl-thumb" style="color:${trip._color}">${routeThumbnailSvg(track.points)}</div>
          <div class="tl-main">
            <div class="tl-title">${dayIconHtml(track)} ${track._dayNumber}. Giorno ${toRoman(realDayNumber(trip.summary.start_t, track.start_t) ?? trackSidebarDayNumber(track))}, ${fmtDate(track.start_t, false)} <span class="tl-title-activity">– ${ACTIVITY_LABELS[track.activity] || track.activity}</span></div>
            <div class="tl-stats tl-stats-day">${fmtKmRound(track.distance_m)} · +${fmtM(track.ele_gain, false)}/-${fmtM(track.ele_loss)} · ${fmtDuration(track.duration_s)}</div>
            <div class="tl-spark" style="color:${trip._color}">${sparklineSvg(track.points)}</div>
          </div>
          <div class="tl-leaf" title="Seleziona questa tappa">●</div>`;
        li.addEventListener("click", () => {
          if (state.activeDayId === track.id) selectTrip(trip.id);
          else selectDay(trip.id, track.id);
        });
        list.appendChild(li);
      });
    } else {
      sortedTrips().forEach(trip => {
        const li = document.createElement("li");
        li.className = "timeline-row" + (state.activeTripId === trip.id ? " active" : "");
        li.innerHTML = `
          <div class="tl-thumb" style="color:${trip._color}">${routeThumbnailSvg(tripAllPoints(trip))}</div>
          <div class="tl-main">
            <div class="tl-title">${trip._buildIndex + 1}. ${trip.name} <span class="tl-title-activity">(${trip.summary.num_days} gg)</span></div>
            <div class="tl-stats">${fmtDateRange(trip.summary.start_t, trip.summary.end_t)} · ${fmtKmRound(trip.summary.total_distance_m)} · +${fmtM(trip.summary.total_ele_gain)}</div>
            <div class="tl-spark" style="color:${trip._color}">${sparklineSvg(tripAllPoints(trip))}</div>
            <div class="activity-tally tl-activity-tally">${activityTallyHtml(trip.tracks)}</div>
          </div>
          <div class="tl-chev">›</div>`;
        li.addEventListener("click", () => selectTrip(trip.id));
        list.appendChild(li);
      });
    }
  }

  function fitBoundsForTracks(tracks) {
    const bounds = [];
    tracks.forEach(track => {
      const layers = state.dayLayers[track.id];
      if (layers && layers.mainLine.getBounds().isValid()) bounds.push(layers.mainLine.getBounds());
    });
    if (!bounds.length) return;
    let b = bounds[0];
    bounds.slice(1).forEach(x => { b = b.extend(x); });
    state.map.fitBounds(b, { padding: [30, 30] });
  }

  // Backs the map's own recenter button -- refits to whatever's currently
  // selected (day, trip, or everything at the "all trips" level), the same
  // framing selectDay/selectTrip/selectAll would apply themselves, just
  // triggered on demand instead of automatically.
  function recenterMap() {
    if (state.activeDayId) {
      const trip = state.tripById[state.activeTripId];
      const track = trip.tracks.find(t => t.id === state.activeDayId);
      fitBoundsForTracks([track]);
    } else if (state.activeTripId) {
      fitBoundsForTracks(state.tripById[state.activeTripId].tracks);
    } else {
      fitBoundsForTracks(visibleTracks());
    }
  }

  // The track(s) backing the halo/color-mode scoping -- just the one
  // selected day. Selecting a trip alone (no day picked) shows no halo and
  // no forced color-mode coloring, same as the default "nothing selected"
  // view.
  function chartedTrackIds() {
    return state.activeDayId ? [state.activeDayId] : [];
  }

  // The track(s) that stay full-opacity (everything else dims): the whole
  // active trip, whether or not a specific day within it is picked.
  function dimmedTrackIds() {
    if (!state.activeTripId) return [];
    const trip = state.tripById[state.activeTripId];
    return trip ? trip.tracks.map(t => t.id) : [];
  }

  // Shared white halo builder for both the persistent selection highlight
  // and the transient per-track hover highlight below -- same look, just
  // different lifetimes and (in the hover case) a slightly narrower weight
  // so it doesn't read as "this is now selected".
  function trackHaloLayer(trackId, weight) {
    const layers = state.dayLayers[trackId];
    if (!layers) return null;
    return L.polyline(layers.mainLine.getLatLngs(), {
      pane: "trackHighlightPane",
      color: "#ffffff",
      weight,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
  }

  function updateSelectionHighlight() {
    if (!state.selectionHighlight) state.selectionHighlight = L.layerGroup().addTo(state.map);
    state.selectionHighlight.clearLayers();
    chartedTrackIds().forEach(trackId => {
      const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
      if (halo) halo.addTo(state.selectionHighlight);
    });
    // A click that changes the selection can fire while the cursor is still
    // sitting on the hit-line it just selected -- clear any stale hover
    // halo so it doesn't linger under/alongside the new selection halo.
    clearTrackHoverHighlight();
    updateTrackDimming();
    updateDotWeights();
  }

  // Once a trip is active, every track outside it fades out so the active
  // trip pops against the rest of the map -- applies to whichever
  // color-mode group is currently shown for each track, casing included, so
  // dimming stays correct across "Colora tracce per" switches too. Picking a
  // specific day within the trip only narrows the halo/color-mode (see
  // chartedTrackIds), not the dimming: the rest of that trip's tracks stay
  // at full opacity too.
  function updateTrackDimming() {
    const charted = new Set(dimmedTrackIds());
    const dimActive = charted.size > 0;
    const selectedTrackId = state.activeDayId || null;
    Object.keys(state.dayLayers).forEach(trackId => {
      const isCharted = !dimActive || charted.has(trackId);
      const opacity = isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY;
      const isSelectedTrack = trackId === selectedTrackId;
      const group = groupForMode(trackId, currentModeForTrack(trackId));
      group.eachLayer(layer => {
        if (!layer.setStyle) return;
        // The invisible wide hit-line (see TRACK_HIT_WEIGHT) must always
        // stay fully transparent -- it has nothing to do with the
        // charted/dimmed distinction being applied here -- but it still
        // needs to be brought to front along with its casing/line below, or
        // else the click/hover area ends up buried under the now-topmost
        // casing/line and only the hit-line's margin outside them stays
        // clickable.
        if (!layer._isHitLine) {
          const weight = layer._trackLineWeight !== undefined
            ? (isSelectedTrack ? SELECTED_TRACK_WEIGHT : layer._trackLineWeight)
            : undefined;
          layer.setStyle(weight !== undefined ? { opacity, weight } : { opacity });
        }
        // Charted tracks draw above every dimmed one (casing, line, then
        // hit-line, in creation order), so the selected trip/day is never
        // hidden under an unrelated track it happens to cross.
        if (isCharted && dimActive && layer.bringToFront) layer.bringToFront();
      });
      const dot = state.startDotByTrackId[trackId];
      if (dot) dot.setStyle({ opacity: isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY / 2, fillOpacity: isCharted ? FULL_TRACK_OPACITY : DIMMED_TRACK_OPACITY / 2 });
    });
  }

  // Brings a track's casing+line (in whichever color mode is currently
  // shown) to the top of the map's drawing order, so it isn't hidden under
  // some other track it happens to cross.
  function bringTrackToFront(trackId) {
    const group = groupForMode(trackId, currentModeForTrack(trackId));
    group.eachLayer(layer => { if (layer.bringToFront) layer.bringToFront(); });
  }

  // A trip's tracks are always drawn oldest-day-on-top (so a later/further
  // day's line never buries the earlier one where they overlap). Returns
  // tracks in bottom-to-top drawing order (last element ends up on top).
  function tripTrackDrawOrder(trip) {
    return [...trip.tracks].reverse();
  }

  // Markers (POI dots, trip start/end, per-day activity signs) don't respect
  // DOM/add order for stacking the way SVG paths do -- bringToFront doesn't
  // work on them -- so their relative order is instead forced with a big
  // enough zIndexOffset per rank, overriding Leaflet's own latitude-based
  // auto z-index. `rank` follows the same "oldest wins" convention as
  // tripTrackDrawOrder: 0 = bottom-most, higher = further to the front.
  // Every trip's markers additionally sit in their own reserved band of the
  // range, ordered by trip._buildIndex, so newer trips' markers always beat
  // older trips' -- the same "newest trip on top" rule tracks/casings get
  // for free from their add order.
  const MARKER_TRIP_RANK_UNIT = 1e8;
  const MARKER_ITEM_RANK_UNIT = 1e5;
  function markerZIndexOffset(trip, rank) {
    return trip._buildIndex * MARKER_TRIP_RANK_UNIT + rank * MARKER_ITEM_RANK_UNIT;
  }

  // A track's rank among its own trip's days -- day 1 (oldest) ranks highest
  // (front-most).
  function dayRank(trip, trackIndex) {
    return trip.tracks.length - 1 - trackIndex;
  }

  // Same idea as dayRank, but for a trip's POIs (which aren't tied to one
  // particular day) -- ranked by their own order in trip.pois, assumed
  // chronological like everything else here.
  function poiRank(trip, poiIndex) {
    return trip.pois.length - 1 - poiIndex;
  }

  // Transient per-track halo shown only while hovering that track (any run
  // of it, or its casing) -- exactly the persistent selection's look, just
  // cleared on mouseout instead of sticking around.
  // Sets each dot's stroke weight to match its track's current halo state:
  // enlarged when the track has a selection or hover halo, resting otherwise.
  function updateDotWeights(hoveredTrackIds = new Set()) {
    const selected = new Set(chartedTrackIds());
    Object.entries(state.startDotByTrackId).forEach(([trackId, dot]) => {
      const hasHalo = selected.has(trackId) || hoveredTrackIds.has(trackId);
      dot.setStyle({ weight: hasHalo ? 2 * (TRACK_CASING_WEIGHT - TRACK_WEIGHT) : 2 });
    });
  }

  function showTrackHoverHighlight(trackId) {
    if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
    state.hoverHighlight.clearLayers();
    const halo = trackHaloLayer(trackId, SELECTION_HIGHLIGHT_WEIGHT);
    if (halo) halo.addTo(state.hoverHighlight);
    bringTrackToFront(trackId);
    updateDotWeights(new Set([trackId]));
  }
  // Same, but for every track of a whole trip at once -- used when hovering
  // a track that isn't (yet) the active trip's own, so the halo previews
  // "clicking this selects the trip" rather than pretending to single out
  // just the one day under the cursor.
  function showTripHoverHighlight(tripId) {
    if (!state.hoverHighlight) state.hoverHighlight = L.layerGroup().addTo(state.map);
    state.hoverHighlight.clearLayers();
    state.tripById[tripId].tracks.forEach(track => {
      const halo = trackHaloLayer(track.id, SELECTION_HIGHLIGHT_WEIGHT);
      if (halo) halo.addTo(state.hoverHighlight);
      bringTrackToFront(track.id);
    });
    updateDotWeights(new Set(state.tripById[tripId].tracks.map(t => t.id)));
  }
  function clearTrackHoverHighlight() {
    if (state.hoverHighlight) state.hoverHighlight.clearLayers();
    // Hovering briefly raised some other track above the current
    // selection -- once the hover ends, restore the selected trip/day back
    // on top.
    updateDotWeights();
    updateTrackDimming();
  }

  // The footer shows one of two things depending on level: a single trip's
  // (or day's) elevation chart -- which POIs, photos and day boundaries are
  // now drawn directly onto, see drawChart -- or, at the All Trips level
  // where no single elevation profile applies, the Gantt-style calendar
  // overview (renderAllTripsTimelineStrip).
  function showTripLevelFooter() {
    document.getElementById("elevationChartWrap").classList.remove("hidden");
    document.getElementById("dayTimelineStrip").classList.add("hidden");
    document.getElementById("colorModeToggle").classList.remove("hidden");
    if (state.chart) state.chart.resize();
  }
  function showAllTripsFooter() {
    document.getElementById("elevationChartWrap").classList.add("hidden");
    document.getElementById("dayTimelineStrip").classList.remove("hidden");
    document.getElementById("colorModeToggle").classList.add("hidden");
  }

  // Waypoints (trip POIs) only make sense in the context of a single trip --
  // at the "all trips" level they'd just be a wall of overlapping pins with
  // no way to tell which trip each belongs to, so only the active trip's
  // group (if any) stays on the map -- and only while the headbar's POI
  // toggle is on.
  function updatePoiMarkerVisibility() {
    Object.entries(state.poiLayerGroups).forEach(([tripId, group]) => {
      const shouldShow = state.poisVisible && tripId === state.activeTripId;
      const isShown = state.map.hasLayer(group);
      if (shouldShow && !isShown) group.addTo(state.map);
      else if (!shouldShow && isShown) state.map.removeLayer(group);
    });
  }

  // Mirrors updatePoiMarkerVisibility for the trip start/end and per-day
  // activity-start markers: same "only the active trip" scoping, gated on
  // the headbar's own start/end toggle instead of the POI one.
  function updateTripMarkerVisibility() {
    [state.tripBoundaryGroups, state.activityMarkerGroups].forEach(groups => {
      Object.entries(groups).forEach(([tripId, group]) => {
        const shouldShow = state.startsVisible && tripId === state.activeTripId;
        const isShown = state.map.hasLayer(group);
        if (shouldShow && !isShown) group.addTo(state.map);
        else if (!shouldShow && isShown) state.map.removeLayer(group);
      });
    });
  }

  // The footer's info row at the All Trips level -- without this it just
  // kept showing whatever single trip/day was last charted, stale and
  // misleading once you'd backed all the way out.
  function renderAllTripsFooterInfo() {
    const trips = state.trips;
    const totalDistance = trips.reduce((sum, t) => sum + t.summary.total_distance_m, 0);
    const totalGain = trips.reduce((sum, t) => sum + t.summary.total_ele_gain, 0);
    const totalDays = trips.reduce((sum, t) => sum + t.summary.num_days, 0);
    const totalPois = trips.reduce((sum, t) => sum + t.summary.num_pois, 0);
    document.getElementById("elevationDayInfo").innerHTML = `
      <span><b>Tutti i viaggi</b></span>
      <span>${trips.length} viaggi</span>
      <span>${fmtKmRound(totalDistance)}</span>
      <span>+${fmtM(totalGain, false)}</span>
      <span>${totalDays} gg</span>
      <span>${totalPois} POI</span>
    `;
  }

  function selectAll() {
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
    updatePoiMarkerVisibility();
    updateTripMarkerVisibility();
    updatePhotoMarkerVisibility();
    applyColorMode();
  }

  // `recenter` is false for clicks originating on the map itself (a track
  // line, or a day's activity-start marker) -- the user is already looking
  // right at the spot they clicked, so re-fitting the view would just yank
  // it out from under them. Sidebar/breadcrumb/footer-triggered selection
  // (the default) still frames the newly selected trip/day.
  function selectTrip(tripId, { recenter = true } = {}) {
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
    updatePoiMarkerVisibility();
    updateTripMarkerVisibility();
    updatePhotoMarkerVisibility();
    applyColorMode();
  }

  function selectDay(tripId, dayId, { recenter = true } = {}) {
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
    updatePoiMarkerVisibility();
    updateTripMarkerVisibility();
    updatePhotoMarkerVisibility();
    applyColorMode();
  }

  function switchColorMode(mode) {
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

  // Every track on the map -- the legend's percentages are a breakdown of
  // these, matching what's actually shown (every trip/day is always visible).
  function visibleTracks() {
    return [].concat(...state.trips.map(trip => trip.tracks));
  }

  // Distance-weighted percent breakdown of `keyFn(track, pointIndex)` across
  // every segment of the given tracks (each segment counted by its own length,
  // so it's a true share of distance, not of point count).
  function categoryPercents(tracks, keyFn) {
    const totals = {};
    let total = 0;
    tracks.forEach(track => {
      for (let i = 1; i < track.points.length; i++) {
        const distM = track.points[i].dist - track.points[i - 1].dist;
        const key = keyFn(track, i - 1);
        totals[key] = (totals[key] || 0) + distM;
        total += distM;
      }
    });
    const percents = {};
    for (const key in totals) percents[key] = total > 0 ? (totals[key] / total) * 100 : 0;
    return percents;
  }

  // Builds the <div class="legend-item"> rows for a categorical legend:
  // sorted by descending share, "unknown" pinned last (if present), and any
  // row that rounds to 0% dropped -- rounds first so a category that reads
  // as "0%" never lingers in the list. The gradient legend opts out of that
  // drop (dropZero: false): its buckets are a fixed, known-in-advance set
  // (unlike surface/highway, discovered from whatever's actually in the
  // data), so the steepest buckets should stay visible as a reference even
  // when nothing in the current view is that steep.
  function legendItemRows(items, { sortByPct = true, dropZero = true } = {}) {
    let rows = items.map(it => ({ ...it, pct: Math.round(it.pct) }));
    if (dropZero) rows = rows.filter(it => it.pct > 0);
    if (sortByPct) rows = rows.sort((a, b) => (Number(!!a.isUnknown) - Number(!!b.isUnknown)) || (b.pct - a.pct));
    return rows.map(it => `
        <div class="legend-item" data-legend-type="${it.type}" data-legend-key="${it.key}" data-legend-color="${it.color}">
          <span class="swatch" style="background:${it.color}"></span>
          ${it.label} <span class="legend-pct">${it.pct}%</span>
        </div>`).join("");
  }

  // Renders exactly one legend section for the given mode ("trip", "surface",
  // "highway", "gradient", or anything else to get all three category
  // legends stacked). This is only ever fed the Esplora-dati panel's own
  // exploreLegendMode -- never state.colorMode -- so browsing this legend
  // never touches the map/chart's real color mode (see switchColorMode).
  function renderLegend(mode) {
    const el = document.getElementById("modeLegend");

    const tracks = visibleTracks();

    if (mode === "trip") {
      const activityPct = categoryPercents(tracks, track => track.activity || "other");
      el.innerHTML = `
        <div class="legend-group-title">Tracce</div>` +
        legendItemRows(Object.keys(activityPct).map(a => ({
          color: ACTIVITY_COLORS[a] || ACTIVITY_COLORS.other, label: ACTIVITY_LABELS[a] || a, pct: activityPct[a], type: "activity", key: a,
        })));
      return;
    }

    const surfaces = new Set();
    tracks.forEach(t => trackCategorySeries(t, "surface").forEach(s => { if (s) surfaces.add(s); }));
    const surfacePct = categoryPercents(tracks, (track, i) => trackCategorySeries(track, "surface")[i] || "unknown");
    const surfaceHtml = `
      <div class="legend-group-title">Fondo</div>` +
      legendItemRows([...surfaces].map(s => ({
        color: SURFACE_COLORS[s] || SURFACE_FALLBACK, label: SURFACE_LABELS[s] || s, pct: surfacePct[s] || 0, type: "surface", key: s,
      })).concat([{ color: SURFACE_FALLBACK, label: "Sconosciuto", pct: surfacePct.unknown || 0, isUnknown: true, type: "surface", key: "unknown" }]));

    const gradePct = categoryPercents(tracks, (track, i) => gradeColor(trackGradeSeries(track)[i]));
    const gradientHtml = `
      <div class="legend-group-title">Pendenza</div>
      <div class="legend-grade-pcts">${legendItemRows(GRADE_BUCKETS.map(b => ({
        color: b.color, label: b.label, pct: gradePct[b.color] || 0, type: "gradient", key: b.color,
      })), { sortByPct: false, dropZero: false })}</div>`;

    const highways = new Set();
    tracks.forEach(t => trackCategorySeries(t, "highway").forEach(h => { if (h) highways.add(h); }));
    const highwayPct = categoryPercents(tracks, (track, i) => trackCategorySeries(track, "highway")[i] || "unknown");
    const highwayHtml = `
      <div class="legend-group-title">Tipo strada</div>` +
      legendItemRows([...highways].map(h => ({
        color: HIGHWAY_COLORS[h] || HIGHWAY_FALLBACK, label: HIGHWAY_LABELS[h] || h, pct: highwayPct[h] || 0, type: "highway", key: h,
      })).concat([{ color: HIGHWAY_FALLBACK, label: "Sconosciuto", pct: highwayPct.unknown || 0, isUnknown: true, type: "highway", key: "unknown" }]));

    el.innerHTML = mode === "surface" ? surfaceHtml
      : mode === "highway" ? highwayHtml
      : mode === "gradient" ? gradientHtml
      : surfaceHtml + highwayHtml + gradientHtml;

    el.querySelectorAll(".legend-item").forEach(item => {
      item.addEventListener("click", () => {
        const wasActive = item.classList.contains("active");
        el.querySelectorAll(".legend-item.active").forEach(i => i.classList.remove("active"));
        if (wasActive) {
          clearLegendHover();
        } else {
          item.classList.add("active");
          setLegendHover(item.dataset.legendType, item.dataset.legendKey, item.dataset.legendColor);
        }
      });
    });
  }

  // Which legend the Esplora-dati panel is browsing right now -- its own
  // piece of UI state, deliberately independent of state.colorMode (the
  // real color mode driving the map/chart, switched only by the footer's
  // #colorModeToggle). Clicking these tabs must never call switchColorMode.
  let exploreLegendMode = "trip";

  function renderExploreLegend() {
    document.querySelectorAll("#exploreLegendTabs button").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === exploreLegendMode);
    });
    renderLegend(exploreLegendMode);
  }

  // ---- Level-aware summary (All Trips / Trip / Track) ----

  // Steepest downhill/uphill grade reached anywhere across the trip's tracks
  // -- reuses the same cached, smoothed per-track grade series as the
  // gradient color mode, so this is just a min/max scan over already-computed data.
  function tripGradeMinMax(trip) {
    let min = Infinity, max = -Infinity;
    trip.tracks.forEach(track => {
      trackGradeSeries(track).forEach(g => {
        if (g < min) min = g;
        if (g > max) max = g;
      });
    });
    return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max };
  }

  // ---- POIs ----

  function addPoiMarkers(trip) {
    const group = L.layerGroup();
    const markers = [];
    trip.pois.forEach((poi, i) => {
      const marker = L.marker([poi.lat, poi.lon], {
        icon: poiMarkerIcon(poi, trip._color),
        zIndexOffset: markerZIndexOffset(trip, poiRank(trip, i)),
      });
      marker.addTo(group);
      marker.on("click", () => openPoiByIndex(trip.id, i, true));
      marker.on("mouseover", () => setHoveredPoiMarker(marker));
      marker.on("mouseout", () => clearHoveredPoiMarker(marker));
      markers.push(marker);
    });
    state.poiMarkers[trip.id] = markers;
    state.poiLayerGroups[trip.id] = group;
  }

  // Initial bearing (degrees, 0 = north, clockwise) from p1 to p2 -- used to
  // orient the trip-start triangle so its tip points at the first day's
  // destination.
  function bearingDeg(lat1, lon1, lat2, lon2) {
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Straight-line bearing from the track's start to its actual destination
  // (the first track's last point), not just its initial heading -- the
  // triangle should point at where the first day ends up, even if the road
  // curves along the way.
  function trackStartBearing(track) {
    const points = track.points;
    const p0 = points[0];
    const target = points[points.length - 1];
    if (target === p0) return 0;
    return bearingDeg(p0.lat, p0.lon, target.lat, target.lon);
  }

  // A track whose start and end sit within 40m of each other is an
  // out-and-back/loop -- its start-to-end bearing is meaningless (often just
  // GPS noise), so its marker drops the directional notch/corner entirely
  // and its hover compass spins instead of pointing anywhere.
  const ROUND_TRIP_THRESHOLD_M = 60;
  function isRoundTripTrack(track) {
    const points = track.points;
    const p0 = points[0], pEnd = points[points.length - 1];
    return haversineM(p0.lat, p0.lon, pEnd.lat, pEnd.lon) <= ROUND_TRIP_THRESHOLD_M;
  }

  // Builds the divIcon for a trip/day marker, shown (like POIs) only while
  // its trip is the selected one, with the full light-fill/colored-stroke
  // treatment. `shape` is "triangle" (the trip's own first day only -- an
  // equilateral triangle, apex pointing at that day's destination), "square"
  // (every other day's start, with the day's cardinal number inside -- a
  // rounded square with one sharp corner pointing the same way), or "ring"
  // (trip end -- a double-stroke orienteering-style control circle, no
  // number/direction). Hovering a triangle/square further turns it into a
  // compass -- "N" mark plus a needle -- pointing the same direction as its
  // own permanent shape, see .trip-marker-needle/-compass-n in CSS.
  // The hover compass's needle is a classic double-ended "lancetta", after
  // res/original/compass_needle.svg: a bowtie of two triangles sharing a
  // full-width waist at the pivot -- solid front/north half, and a back/
  // south half that's the same solid triangle with a smaller white triangle
  // inset on top, so it reads as an outlined/hollow tail instead of a solid
  // one. `bearing` sets the fixed heading
  // via a plain rotate; the wobble on hover (.trip-marker-needle-wobble in
  // CSS, a damped-oscillation keyframe animation) is a separate nested
  // rotation so it adds on top of that heading instead of overriding it.
  // `roundTrip` swaps the fixed heading for a slow, indefinite spin (see
  // .trip-marker-needle-spin in CSS) -- there's no destination bearing to
  // point at, so the needle keeps turning instead of pointing anywhere.
  function compassNeedleHtml(bearing, roundTrip) {
    const rotateClass = roundTrip ? " trip-marker-needle-spin" : "";
    const rotateStyle = roundTrip ? "" : ` style="transform: rotate(${bearing}deg);"`;
    return `<div class="trip-marker-needle-rotate${rotateClass}"${rotateStyle}>
      <div class="trip-marker-needle-wobble">
        <svg class="trip-marker-needle-svg" viewBox="-3 -11 6 22">
          <path class="trip-marker-needle-north" d="M -3,0 L 3,0 L 0,-11 Z"></path>
          <path class="trip-marker-needle-south" d="M 3,0 L -3,0 L 0,11 Z"></path>
          <path class="trip-marker-needle-south-inset" d="M 2,0 L -2,0 L 0,7.3 Z"></path>
        </svg>
      </div>
      </div>`;
  }

  function tripMarkerIcon(shape, color, { dayNumber, bearing, roundTrip } = {}) {
    const size = 30;
    const half = size / 2;
    const shapeClass = shape === "ring" ? "trip-marker-ring"
      : shape === "triangle" ? "trip-marker-triangle" : "trip-marker-square";
    let inner;
    if (shape === "ring") {
      inner = `<div class="trip-marker-ring-core"></div>`;
    } else if (shape === "triangle") {
      // No day-number label -- the trip start is always day 1, so instead
      // its apex (the direction point) gets a small colored triangle of its
      // own to draw the eye there -- unless it's a round trip, where there's
      // no destination for the apex to point at, so that dot is dropped and
      // the shape is left unrotated.
      const triangleStyle = roundTrip ? "" : ` style="transform: rotate(${bearing}deg);"`;
      const tip = roundTrip ? "" : `<div class="trip-marker-triangle-tip"></div>`;
      inner = `<div class="trip-marker-triangle-rotate"${triangleStyle}>
        <div class="trip-marker-triangle-shape trip-marker-triangle-outer"></div>
        <div class="trip-marker-triangle-shape trip-marker-triangle-inner"></div>
        ${tip}
        </div>
        <div class="trip-marker-compass-dial"></div>
        <div class="trip-marker-compass-n">N</div>
        ${compassNeedleHtml(bearing, roundTrip)}`;
    } else {
      // Sharp corner sits at 225deg (down-left) before any rotation, so
      // +135deg brings it to due north -- the extra +bearing then swings it
      // to point at the day's destination, same convention as the triangle.
      // A round trip has no destination to point the corner at, so it's
      // rendered as a plain, unrotated rounded square instead (no notch).
      const squareStyle = roundTrip ? "" : ` style="transform: rotate(${bearing + 135}deg);"`;
      const squareOuterStyle = roundTrip ? ` style="border-radius: 50%;"` : "";
      const squareInnerStyle = roundTrip ? ` style="border-radius: 50%;"` : "";
      inner = `<div class="trip-marker-square-rotate"${squareStyle}>
        <div class="trip-marker-square-shape trip-marker-square-outer"${squareOuterStyle}></div>
        <div class="trip-marker-square-shape trip-marker-square-inner"${squareInnerStyle}></div>
        </div>
        <div class="trip-marker-compass-dial"></div>
        <div class="trip-marker-compass-n">N</div>
        ${compassNeedleHtml(bearing, roundTrip)}
        <div class="trip-marker-label">${dayNumber}</div>`;
    }
    return L.divIcon({
      // Leaflet's own hover/click listeners live on this outer icon element
      // (fixed at iconSize, never transformed) rather than on the inner
      // `.trip-marker-triangle`/`.trip-marker-square`/`.trip-marker-ring`
      // div it wraps -- see the CSS ":hover" rules keyed off
      // "trip-marker-hit" for why that separation matters.
      className: "trip-marker-hit",
      html: `<div class="trip-marker ${shapeClass}" style="--marker-color:${color}">${inner}</div>`,
      iconSize: [size, size],
      iconAnchor: [half, half],
      popupAnchor: [0, -half],
    });
  }

  const ROMAN_NUMERALS = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  function toRoman(n) {
    let out = "";
    for (const [value, symbol] of ROMAN_NUMERALS) {
      while (n >= value) { out += symbol; n -= value; }
    }
    return out;
  }

  // The "day" number as it reads in the sidebar picker, not the track's
  // cardinal position -- most track names already embed one ("Day 6",
  // "Giorno II"), and a single calendar day can hold more than one track
  // (e.g. a hike and a bike leg the same day), so the picker's own number
  // can repeat or skip ahead of the plain 1-based track count. Falls back to
  // that cardinal count for trips whose tracks aren't named with a day
  // number at all.
  function trackSidebarDayNumber(track) {
    const match = track.name && track.name.match(/\d+/);
    return match ? parseInt(match[0], 10) : track._dayNumber;
  }

  // Hover content for a trip/day sign: which trip and day it is, its date,
  // and the activity (with icon) for that day -- moved off the marker
  // itself and into this tooltip so the map only shows the plain sign
  // shapes. Accented in the trip's own color so it reads as "belonging" to
  // that trip's markers even before you notice which sign you're hovering.
  // (Which way a day heads is shown by the marker's own triangle shape on
  // the map instead of duplicated here.)
  //
  // `poiList`, when given (only for the fixed tooltip pinned over a
  // selected POI, see showMilestone -- never on plain hover), is the
  // day's own POIs as `{ poi, index }` pairs, appended below a rule so the
  // signpost also reads as "here's everything else this day passes".
  function tripMarkerTooltipHtml(trip, dayNumber, dateIso, activity, poiList) {
    const iconSrc = ACTIVITY_ICON[activity];
    const label = ACTIVITY_LABELS[activity] || activity;
    const realDay = realDayNumber(trip.summary.start_t, dateIso);
    const poiListHtml = poiList && poiList.length ? `
      <div class="tmt-poi-list">
        ${poiList.map(({ poi, index }) => `
          <div class="tmt-poi${index === state.selectedPoiIndex ? " tmt-poi-selected" : ""}">
            <span class="tmt-poi-icon">${poiIconHtml(poi)}</span><span class="tmt-poi-name">${poi.name || "(senza nome)"}</span>
          </div>`).join("")}
      </div>` : "";
    return `<div class="trip-marker-tooltip" style="--marker-color:${trip._color}">
      <div class="tmt-trip">${trip.name}</div>
      <div class="tmt-day">Giorno ${toRoman(realDay != null ? realDay : dayNumber)}</div>
      <div class="tmt-date">${fmtDate(dateIso)}</div>
      <div class="tmt-activity">${iconSrc ? `<img class="tmt-icon" src="${iconSrc}">` : ""}<span>${label}</span></div>
      ${poiListHtml}
    </div>`;
  }

  // Every trip/track/marker hover tooltip on the map shares this single
  // L.tooltip instance instead of each layer binding its own -- with dozens
  // of colored track segments all bound separately, moving the mouse across
  // segment boundaries could leave the previous segment's tooltip fading out
  // while the next one fades in, showing a visible ghost/trace. Reusing one
  // instance and just repositioning + rewriting its content sidesteps that.
  const HOVER_TOOLTIP_CLOSE_DELAY_MS = 100;
  const HOVER_TOOLTIP_FADE_MS = 100;

  function clearHoverTooltipTimers() {
    if (state.hoverTooltipCloseTimer) { clearTimeout(state.hoverTooltipCloseTimer); state.hoverTooltipCloseTimer = null; }
    if (state.hoverTooltipRemoveTimer) { clearTimeout(state.hoverTooltipRemoveTimer); state.hoverTooltipRemoveTimer = null; }
  }
  // Projects `latlng` onto the segment a-b (plain lat/lon space -- fine at
  // the scale of a single track segment) so the hover tooltip can stick to
  // the track itself instead of the raw cursor position.
  function closestPointOnSegment(latlng, aLat, aLon, bLat, bLon) {
    const dLat = bLat - aLat, dLon = bLon - aLon;
    const lenSq = dLat * dLat + dLon * dLon;
    let t = lenSq === 0 ? 0 : ((latlng.lat - aLat) * dLat + (latlng.lng - aLon) * dLon) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return L.latLng(aLat + t * dLat, aLon + t * dLon);
  }
  // Same, but over every consecutive pair in a multi-point run (the day-view
  // hit-lines cover a whole run, not just one segment).
  function closestPointOnPolyline(latlng, points) {
    let best = null, bestDist = Infinity;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const cand = closestPointOnSegment(latlng, a.lat, a.lon, b.lat, b.lon);
      const d = (cand.lat - latlng.lat) ** 2 + (cand.lng - latlng.lng) ** 2;
      if (d < bestDist) { bestDist = d; best = cand; }
    }
    return best || latlng;
  }
  function showHoverTooltip(latlng, html, opts) {
    // Cancel any pending close/fade from a moment ago -- e.g. crossing straight
    // from one track segment into the next shouldn't restart the tooltip.
    clearHoverTooltipTimers();
    state.hoverTooltipAnchor = latlng;
    if (!state.hoverTooltip) {
      state.hoverTooltip = L.tooltip(opts).setLatLng(latlng).setContent(html);
      state.hoverTooltip.addTo(state.map);
    } else {
      state.hoverTooltip.options.direction = opts.direction;
      state.hoverTooltip.options.offset = opts.offset;
      state.hoverTooltip.options.sticky = !!opts.sticky;
      state.hoverTooltip.setContent(html);
      state.hoverTooltip.setLatLng(latlng);
      if (!state.map.hasLayer(state.hoverTooltip)) state.hoverTooltip.addTo(state.map);
    }
    state.hoverTooltipFading = false;
    // Leaflet's own tooltip default (0.9) gets reasserted on every addTo(),
    // so force it back to fully opaque rather than relying on CSS to win
    // against that inline style.
    state.hoverTooltip.setOpacity(1);
  }
  function moveHoverTooltip(latlng) {
    // Once the fade-out has started the tooltip is on its way out, so it
    // should hold still rather than hop to wherever the mouse ends up next.
    if (state.hoverTooltip && !state.hoverTooltipFading) {
      state.hoverTooltip.setLatLng(latlng);
    }
  }
  function hideHoverTooltip() {
    if (!state.hoverTooltip) return;
    clearHoverTooltipTimers();
    state.hoverTooltipCloseTimer = setTimeout(() => {
      state.hoverTooltipFading = true;
      state.hoverTooltip.setOpacity(0);
      state.hoverTooltipRemoveTimer = setTimeout(() => {
        state.map.removeLayer(state.hoverTooltip);
      }, HOVER_TOOLTIP_FADE_MS);
    }, HOVER_TOOLTIP_CLOSE_DELAY_MS);
  }


  // The trip's own start and end get their own markers (distinct from the
  // resting-dot/hover-pin POIs) since they're landmarks worth seeing at a
  // glance, not something you hover to discover -- hovering them further
  // reveals which day/date/activity they mark (and, for a start, which way
  // that day heads). When the trip loops back on itself, start and end are
  // (near enough) the same point, so both markers are stacked right there
  // instead of picking one -- the circle and ring are different enough
  // shapes that the overlap still reads fine. Like POIs, only shown (in
  // full detail: light fill + colored stroke) while their trip is selected
  // -- see updateTripMarkerVisibility.
  function addTripBoundaryMarkers(trip) {
    const firstTrack = trip.tracks[0], lastTrack = trip.tracks[trip.tracks.length - 1];
    const first = firstTrack.points[0], last = lastTrack.points[lastTrack.points.length - 1];

    const endMarker = L.marker([last.lat, last.lon], {
      icon: tripMarkerIcon("ring", trip._color),
      zIndexOffset: markerZIndexOffset(trip, dayRank(trip, trip.tracks.length - 1)),
    });
    const startMarker = L.marker([first.lat, first.lon], {
      icon: tripMarkerIcon("triangle", trip._color, { dayNumber: firstTrack._dayNumber, bearing: trackStartBearing(firstTrack), roundTrip: isRoundTripTrack(firstTrack) }),
      zIndexOffset: markerZIndexOffset(trip, dayRank(trip, 0)),
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
    startMarker.on("mouseover", () => {
      showTrackHoverHighlight(firstTrack.id);
      state.hoverTooltipOnLayer = true;
      showHoverTooltip(
        startMarker.getLatLng(),
        tripMarkerTooltipHtml(trip, trackSidebarDayNumber(firstTrack), firstTrack.start_t, firstTrack.activity),
        { direction: "top", offset: [0, -15], className: "trip-marker-tooltip-wrap" }
      );
    });
    startMarker.on("mouseout", () => { clearTrackHoverHighlight(); state.hoverTooltipOnLayer = false; hideHoverTooltip(); });
    endMarker.on("click", () => openBoundaryMilestone(trip.id, "end"));
    startMarker.on("click", () => openBoundaryMilestone(trip.id, "start"));

    const group = L.layerGroup([endMarker, startMarker]);
    state.tripBoundaryGroups[trip.id] = group;
  }

  // A small sign at the start of every day *after* the first (day 1's start
  // already has the trip's own circle "start" marker, so adding another
  // sign right on top of it would just be clutter) -- lets you see where
  // each day hands off to the next; hover to see which day/date/activity,
  // and which way it heads.
  function addActivityStartMarkers(trip) {
    const markers = [];
    trip.tracks.forEach((track, idx) => {
      if (idx === 0) return;
      if (!ACTIVITY_ICON[track.activity]) return;
      const p = track.points[0];
      const marker = L.marker([p.lat, p.lon], {
        icon: tripMarkerIcon("square", trip._color, { dayNumber: track._dayNumber, bearing: trackStartBearing(track), roundTrip: isRoundTripTrack(track) }),
        zIndexOffset: markerZIndexOffset(trip, dayRank(trip, idx)),
      });
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
      marker.on("click", () => selectDay(trip.id, track.id, { recenter: false }));
      markers.push(marker);
    });
    const group = L.layerGroup(markers);
    state.activityMarkerGroups[trip.id] = group;
  }

  // A plain dot at every track's own start (including day 1's, unlike
  // addActivityStartMarkers above) -- styled like the track itself, a
  // casing-ringed dot in the trip's color, so there's always a visible
  // anchor at each day's start even underneath the fancier icon pins.
  // Unlike the trip-boundary/activity-icon marker groups, these stay on the
  // map unconditionally -- at every trip and every level, including the All
  // Trips overview -- rather than being scoped to the active trip. Returned
  // rather than added directly: the map has no view/zoom yet when trips are
  // first built (that only happens once selectAll's fitBounds runs, at the
  // end of main()), and Leaflet's Path renderer throws if a circleMarker is
  // added before then -- so the caller adds the combined group to the map
  // only once the view is established. Non-interactive: it's purely
  // decorative, sitting between the track lines and the icon/POI markers,
  // and shouldn't steal hover/click from either.
  function trackStartDots(trip) {
    return trip.tracks.map(track => {
      const p = track.points[0];
      const dot = L.circleMarker([p.lat, p.lon], {
        radius: TRACK_WEIGHT-1,
        color: "#f7f2e4",
        weight: 4,
        fillColor: trip._color,
        fillOpacity: 1,
        opacity: FULL_TRACK_OPACITY,
        interactive: false,
        pane: "trackDotsPane",
        className: "track-start-dot",
      });
      state.startDotByTrackId[track.id] = dot;
      return dot;
    });
  }

  function openBoundaryMilestone(tripId, end) {
    const milestones = computeTripMilestones(state.tripById[tripId]);
    const idx = end === "start" ? 0 : milestones.length - 1;
    showMilestone(tripId, milestones, idx, true);
  }

  function renderPoiListFor(tripId) {
    state.activePoiTripId = tripId;
    const trip = state.tripById[tripId];
    document.getElementById("poiListLabel").textContent = `Punti di interesse`;
    const ul = document.getElementById("poiList");
    ul.innerHTML = "";
    document.getElementById("poiCount").textContent = trip.pois.length;
    if (state.navIndex >= 0) closePoi();
    trip.pois.forEach((poi, i) => {
      const li = document.createElement("li");
      li.className = "poi-item";
      li.innerHTML = `<span class="icon">${poiIconHtml(poi)}</span><span class="poi-name">${poi.name || "(senza nome)"}</span>`;
      li.addEventListener("click", () => openPoiByIndex(tripId, i, true));
      ul.appendChild(li);
    });
  }

  // Opens a real POI by its index in trip.pois, building the signpost
  // prev/next list for the whole trip in original GPX order.
  function openPoiByIndex(tripId, index, pan) {
    const trip = state.tripById[tripId];
    if (!trip.pois[index]) return;
    const milestones = computeTripMilestones(trip);
    const idx = milestones.findIndex(m => m.kind === "poi" && m.poiIndex === index);
    showMilestone(tripId, milestones, idx, pan);
  }

  function navigatePoi(delta) {
    if (!state.navTripId || state.navIndex < 0) return;
    const newIdx = state.navIndex + delta;
    if (newIdx < 0 || newIdx >= state.navMilestones.length) return;
    showMilestone(state.navTripId, state.navMilestones, newIdx, true);
  }

  function showMilestone(tripId, milestones, idx, pan) {
    const trip = state.tripById[tripId];
    const m = milestones[idx];

    // Unhighlight whatever POI marker was previously shown, and drop any boundary marker.
    if (state.selectedPoiIndex >= 0 && state.activePoiTripId) {
      const prevMarker = state.poiMarkers[state.activePoiTripId][state.selectedPoiIndex];
      const prevEl = prevMarker && prevMarker.getElement();
      if (prevEl) prevEl.classList.remove("highlighted");
    }
    if (state.navBoundaryMarker) { state.map.removeLayer(state.navBoundaryMarker); state.navBoundaryMarker = null; }
    state.selectedPoiIndex = -1;
    state.activePoiTripId = null;
    removePoiSignTooltip();

    state.navTripId = tripId;
    state.navMilestones = milestones;
    state.navIndex = idx;

    let lat, lon, titleHtml, extraHtml;
    if (m.kind === "poi") {
      const poi = trip.pois[m.poiIndex];
      state.activePoiTripId = tripId;
      state.selectedPoiIndex = m.poiIndex;
      const marker = state.poiMarkers[tripId][m.poiIndex];
      const markerEl = marker.getElement();
      if (markerEl) markerEl.classList.add("highlighted");
      lat = poi.lat; lon = poi.lon;
      titleHtml = `${poiIconHtml(poi)} ${poi.name || "(senza nome)"}`;
      const note = stripHashTags(poi.cmt || poi.desc || "");
      extraHtml = `
        ${note ? `<button class="poi-note-btn" id="poiNoteBtn">📝 Leggi la nota</button>` : ""}
        ${poi.ele != null ? `<div class="poi-ele">Altitudine: ${Math.round(poi.ele)} m</div>` : ""}
      `;
      if (pan) state.map.panTo([lat, lon]);
      document.getElementById("poiDetailBody").innerHTML = `<div class="poi-title">${titleHtml}</div>${extraHtml}`;
      if (note) {
        document.getElementById("poiNoteBtn").addEventListener("click", () => openNoteModal(titleHtml, note));
      }
      showPoiSignTooltip(trip, poi, marker.getLatLng());
    } else {
      lat = m.lat; lon = m.lon;
      titleHtml = `${boundaryIconHtml(m.end)} ${m.end === "start" ? "Partenza" : "Arrivo"}`;
      extraHtml = `
        <div class="poi-cmt">${trip.name}</div>
        ${m.ele != null ? `<div class="poi-ele">Altitudine: ${Math.round(m.ele)} m</div>` : ""}
      `;
      state.navBoundaryMarker = L.circleMarker([lat, lon], {
        radius: 7, color: "#f7f2e4", weight: 2, fillColor: "#ab2328", fillOpacity: 1,
      }).addTo(state.map);
      if (pan) state.map.panTo([lat, lon]);
      document.getElementById("poiDetailBody").innerHTML = `<div class="poi-title">${titleHtml}</div>${extraHtml}`;
    }

    document.getElementById("poiNavRow").classList.remove("hidden");
    updateNavButtons(trip, milestones, idx);
    if (state.chart) state.chart.update();
  }

  // The day-sign tooltip (see tripMarkerTooltipHtml), pinned open over the
  // selected POI for as long as its bottom card is -- unlike the plain
  // hover version, this one is never opened/closed by mouseover/mouseout,
  // only by showMilestone/closePoi, and it stays fixed at the POI's own
  // latlng rather than tracking the cursor (`sticky` left unset, same as
  // the trip start/end markers' own tooltip).
  function showPoiSignTooltip(trip, poi, latlng) {
    const track = nearestTrackForPoi(trip, poi).track;
    const html = tripMarkerTooltipHtml(
      trip, trackSidebarDayNumber(track), track.start_t, track.activity, poisForTrack(trip, track)
    );
    state.poiSignTooltip = L.tooltip({
      direction: "top", offset: [0, -18], className: "trip-marker-tooltip-wrap", permanent: true, interactive: false,
    }).setLatLng(latlng).setContent(html);
    state.poiSignTooltip.addTo(state.map);
  }

  function removePoiSignTooltip() {
    if (state.poiSignTooltip) { state.map.removeLayer(state.poiSignTooltip); state.poiSignTooltip = null; }
  }

  function openNoteModal(titleHtml, note) {
    document.getElementById("noteModalTitle").innerHTML = titleHtml;
    document.getElementById("noteModalBody").textContent = note;
    const angle = (Math.random() * 1 + 1) * (Math.random() < 0.5 ? -1 : 1); // +-1-2deg
    document.getElementById("noteModalPaper").style.transform = `rotate(${angle.toFixed(2)}deg)`;
    document.getElementById("noteModal").classList.remove("hidden");
  }

  function closeNoteModal() {
    document.getElementById("noteModal").classList.add("hidden");
  }

  function updateNavButtons(trip, milestones, idx) {
    const prevBtn = document.getElementById("poiPrev");
    const nextBtn = document.getElementById("poiNext");
    const prevLabel = prevBtn.querySelector(".poi-side-nav-label");
    const prevDist = prevBtn.querySelector(".poi-side-nav-dist");
    const nextLabel = nextBtn.querySelector(".poi-side-nav-label");
    const nextDist = nextBtn.querySelector(".poi-side-nav-dist");

    if (idx > 0) {
      const sign = findNextSign(trip, milestones, idx, -1);
      prevLabel.textContent = sign ? milestoneShortLabel(trip, sign) : "";
      prevDist.textContent = sign ? fmtSignDistKm((milestones[idx].dist - sign.dist) / 1000) : "";
      prevBtn.classList.remove("disabled");
    } else {
      prevBtn.classList.add("disabled");
    }

    if (idx < milestones.length - 1) {
      const sign = findNextSign(trip, milestones, idx, 1);
      nextLabel.textContent = sign ? milestoneShortLabel(trip, sign) : "";
      nextDist.textContent = sign ? fmtSignDistKm((sign.dist - milestones[idx].dist) / 1000) : "";
      nextBtn.classList.remove("disabled");
    } else {
      nextBtn.classList.add("disabled");
    }
  }

  function closePoi() {
    if (state.selectedPoiIndex >= 0 && state.activePoiTripId) {
      const prevMarker = state.poiMarkers[state.activePoiTripId][state.selectedPoiIndex];
      const prevEl = prevMarker && prevMarker.getElement();
      if (prevEl) prevEl.classList.remove("highlighted");
    }
    if (state.navBoundaryMarker) { state.map.removeLayer(state.navBoundaryMarker); state.navBoundaryMarker = null; }
    removePoiSignTooltip();
    state.selectedPoiIndex = -1;
    state.activePoiTripId = null;
    state.navTripId = null;
    state.navMilestones = [];
    state.navIndex = -1;
    document.getElementById("poiNavRow").classList.add("hidden");
    if (state.chart) state.chart.update();
  }

  // ---- Photos ----

  function photoIcon(thumbUrl) {
    return L.divIcon({
      className: "",
      html: `<div class="photo-divicon" style="background-image:url('${thumbUrl.replace(/'/g, "%27")}')"></div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22],
    });
  }

  // Photos are grouped into one marker-cluster layer per trip -- like the
  // POI layers, only the active trip's group is ever on the map, since a
  // wall of photos from every trip at once would be meaningless clutter.
  function buildPhotoLayers(photos) {
    const byTrip = {};
    for (const photo of photos) {
      if (!photo.trip_id) continue;
      (byTrip[photo.trip_id] || (byTrip[photo.trip_id] = [])).push(photo);
    }
    const groups = {};
    for (const [tripId, tripPhotos] of Object.entries(byTrip)) {
      tripPhotos.sort((a, b) => (a.t || "").localeCompare(b.t || ""));
      const group = L.markerClusterGroup({ maxClusterRadius: 60, spiderfyOnMaxZoom: true });
      tripPhotos.forEach((photo, i) => {
        const marker = L.marker([photo.lat, photo.lon], { icon: photoIcon(photo.thumb) });
        marker.on("click", () => openPhoto(tripId, i));
        group.addLayer(marker);
      });
      groups[tripId] = group;
    }
    return { byTrip, groups };
  }

  function activePhotos() {
    return (state.activeTripId && state.photosByTrip[state.activeTripId]) || [];
  }

  function openPhoto(tripId, index) {
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

  function resetPresentationZoom() {
    state.presZoom = 1; state.presTx = 0; state.preTy = 0;
    state.presBaseZoom = 1; state.presLevel = 0;
    document.getElementById("photoPresentationImg").style.transform = "";
  }

  function clampPresTx() {
    const img = document.getElementById("photoPresentationImg");
    const vw = window.innerWidth, vh = window.innerHeight;
    const ir = img.naturalWidth / img.naturalHeight;
    const containedW = ir > vw / vh ? vw : vh * ir;
    const maxTx = Math.max(0, containedW * state.presZoom / 2 - vw / 2);
    state.presTx = Math.max(-maxTx, Math.min(maxTx, state.presTx));
  }

  // Apply the current presLevel (0=fit-h, 1=fit-w) to the presentation overlay.
  // Sets presZoom/presBaseZoom, panorama class, cursor class, and transform.
  function applyPresentationLevel(img) {
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

  function setPresentationSrc(src) {
    const img = document.getElementById("photoPresentationImg");
    const el = document.getElementById("photoPresentation");
    el.classList.remove("panorama", "tall-fit");
    el.scrollLeft = 0; el.scrollTop = 0;
    resetPresentationZoom();
    img.onload = () => { if (img.naturalWidth > 0) applyPresentationLevel(img); };
    img.src = src;
    if (img.complete && img.naturalWidth > 0) img.onload();
  }

  function closePhoto() {
    state.selectedPhotoIndex = -1;
    document.getElementById("photoLightbox").classList.add("hidden");
    closePresentation();
  }

  function openPresentation() {
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

  function closePresentation() {
    state.presentationOpen = false;
    resetPresentationZoom();
    const el = document.getElementById("photoPresentation");
    el.classList.add("hidden");
    el.classList.remove("panorama", "tall-fit", "ui-active", "dragging", "zoom-in-next", "zoom-out-next");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function setPhotosVisible(visible) {
    state.photosVisible = visible;
    updatePhotoMarkerVisibility();
  }

  // Mirrors updatePoiMarkerVisibility: only the active trip's photo group
  // stays on the map, and only while the "show photos" toggle is on.
  function updatePhotoMarkerVisibility() {
    Object.entries(state.photoGroupsByTrip).forEach(([tripId, group]) => {
      const shouldShow = state.photosVisible && tripId === state.activeTripId;
      const isShown = state.map.hasLayer(group);
      if (shouldShow && !isShown) group.addTo(state.map);
      else if (!shouldShow && isShown) state.map.removeLayer(group);
    });
  }

  // ---- Elevation chart ----

  const dayBoundaryPlugin = {
    id: "dayBoundaries",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.dayBoundaries;
      const boundaries = opts && opts.boundaries;
      if (!boundaries || !boundaries.length) return;
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.strokeStyle = "rgba(169,130,76,0.7)";
      ctx.lineWidth = 1;
      ctx.font = "10px Jost, sans-serif";
      ctx.fillStyle = "rgba(140,105,60,0.95)";
      boundaries.forEach(b => {
        const x = scales.x.getPixelForValue(b.x);
        if (x < chartArea.left || x > chartArea.right) return;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.save();
        ctx.translate(x + 3, chartArea.top + 10);
        ctx.fillText(b.label, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    },
  };

  // Click/hover on a day boundary line jumps to that day (renderWholeTripChart
  // is the only caller that ever passes boundaries; renderDayChart passes
  // none, so this is a no-op at the single-day level). `thresholdPx` is
  // generous since the line itself is only 1px wide.
  function nearestDayBoundary(chart, offsetX, thresholdPx = 6) {
    const opts = chart.options.plugins && chart.options.plugins.dayBoundaries;
    const boundaries = opts && opts.boundaries;
    if (!boundaries || !boundaries.length) return null;
    let best = null, bestDist = Infinity;
    boundaries.forEach(b => {
      const x = chart.scales.x.getPixelForValue(b.x);
      const dist = Math.abs(x - offsetX);
      if (dist < bestDist) { bestDist = dist; best = b; }
    });
    return bestDist <= thresholdPx ? best : null;
  }

  // Draws the POI's emoji icon above its point on the altitude line, but only
  // while it's hovered -- the point itself stays a plain small dot otherwise.
  // Dashed crosshair through whatever is currently "of interest": the hovered
  // point if any, else the POI currently open in the signpost card (if it's
  // plotted on this chart).
  const crosshairPlugin = {
    id: "crosshair",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.crosshair;
      if (!opts) return;
      let x, y;

      // Directly-hovered POI takes priority (exact snap to its position),
      // then whatever Chart's own "index" hover naturally found (i.e. the
      // nearest point on the elevation line under the cursor), then the
      // signpost card's currently-open POI as a fallback.
      if (chart._hoverPoi) {
        const meta = chart.getDatasetMeta(chart._hoverPoi.datasetIndex);
        const point = meta.data[chart._hoverPoi.index];
        if (point) { x = point.x; y = point.y; }
      } else if (chart._hoverPhoto) {
        const meta = chart.getDatasetMeta(chart._hoverPhoto.datasetIndex);
        const point = meta.data[chart._hoverPhoto.index];
        if (point) { x = point.x; y = point.y; }
      }

      if (x === undefined) {
        const active = chart.getActiveElements ? chart.getActiveElements() : [];
        if (active.length) {
          const meta = chart.getDatasetMeta(active[0].datasetIndex);
          const point = meta.data[active[0].index];
          if (point) { x = point.x; y = point.y; }
        }
      }

      if (x === undefined && opts.poiPoints) {
        const idx = opts.poiPoints.findIndex(p => isSelectedPoiPoint(p));
        if (idx !== -1) {
          const meta = chart.getDatasetMeta(1);
          const point = meta.data[idx];
          if (point) { x = point.x; y = point.y; }
        }
      }
      if (x === undefined) return;

      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = "rgba(140,105,60,0.6)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };

  // Thickens the elevation line itself, in place, exactly where the hovered
  // sidebar legend entry occurs -- not a flat strip elsewhere, so it reads as
  // "this line, but just the matching bits". If the segment's own current
  // color (whatever the active color mode is showing there) doesn't already
  // match the hover color, a white halo is drawn underneath first so the
  // highlight doesn't just blend into an adjacent, differently-colored bit
  // of line.
  // The elevation-line data index currently "of interest" -- whatever's
  // hovered directly on the chart, or hovered on the map via onTrackHover
  // (both go through setActiveElements), matching crosshairPlugin's own
  // priority order minus the signpost-POI fallback (a POI hover shouldn't
  // brighten the area fill).
  function chartHoverIndex(chart) {
    if (chart._hoverPoi || chart._hoverPhoto) return null;
    const active = chart.getActiveElements ? chart.getActiveElements() : [];
    const el = active.find(a => a.datasetIndex === 0);
    return el ? el.index : null;
  }

  function legendCategoryMatches(type, key, p) {
    if (type === "surface") return (p.surface || "unknown") === key;
    if (type === "highway") return (p.highway || "unknown") === key;
    if (type === "gradient") return gradeColor(p.grade || 0) === key;
    return false;
  }

  const legendHighlightPlugin = {
    id: "legendHighlight",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.legendHighlight;
      const chartPoints = opts && opts.chartPoints;
      const hover = chart._legendHover;
      if (!chartPoints || !hover) return;

      const ownColor = segmentColorFn(chartPoints);
      const segments = [];
      let needsHalo = false;
      for (let i = 0; i < chartPoints.length - 1; i++) {
        if (!legendCategoryMatches(hover.type, hover.key, chartPoints[i])) continue;
        segments.push(i);
        if (ownColor({ p0DataIndex: i, p1DataIndex: i + 1 }) !== hover.color) needsHalo = true;
      }
      if (!segments.length) return;

      const { ctx, scales, chartArea } = chart;

      // The fill highlight itself is handled by the dataset's own
      // `segment.backgroundColor` (bumping alpha for matching segments) --
      // that's Chart.js's native continuous-shape fill, so it has no seams.
      // Drawing separate overlapping quads here instead produced visible
      // vertical stripes at each segment boundary from the anti-aliased edges
      // double-stacking alpha.

      const drawPass = (width, color, yFor) => {
        ctx.save();
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        segments.forEach(i => {
          const p0 = chartPoints[i], p1 = chartPoints[i + 1];
          ctx.beginPath();
          ctx.moveTo(scales.x.getPixelForValue(p0.distKm), yFor(p0));
          ctx.lineTo(scales.x.getPixelForValue(p1.distKm), yFor(p1));
          ctx.stroke();
        });
        ctx.restore();
      };
      const onPathY = (p) => scales.y.getPixelForValue(p.ele);
      const baselineY = () => chartArea.bottom;

      if (needsHalo) drawPass(LEGEND_HIGHLIGHT_HALO_WIDTH, "#f7f2e4", onPathY);
      drawPass(LEGEND_HIGHLIGHT_WIDTH, hover.color, onPathY);
      // Also restated along the bottom (y=0) axis, so the highlighted
      // stretch is visible at a glance without following the line's climbs.
      drawPass(LEGEND_HIGHLIGHT_WIDTH, hover.color, baselineY);
    },
  };

  function setChartLegendHover(type, key, color) {
    if (!state.chart) return;
    state.chart._legendHover = { type, key, color };
    state.chart.draw();
  }
  function clearChartLegendHover() {
    if (!state.chart) return;
    state.chart._legendHover = null;
    state.chart.draw();
  }

  // Same idea on the map: a white halo + colored overlay drawn only over the
  // segments of the currently-visible tracks that match the hovered legend
  // category, as a temporary layer removed again on mouseleave.
  function legendMapMatches(type, key, track, pointIndex) {
    if (type === "surface") return (trackCategorySeries(track, "surface")[pointIndex] || "unknown") === key;
    if (type === "highway") return (trackCategorySeries(track, "highway")[pointIndex] || "unknown") === key;
    if (type === "gradient") return gradeColor(trackGradeSeries(track)[pointIndex]) === key;
    return false;
  }

  function setMapLegendHover(type, key, color) {
    clearMapLegendHover();
    const segments = [];
    visibleTracks().forEach(track => {
      for (let i = 1; i < track.points.length; i++) {
        if (!legendMapMatches(type, key, track, i - 1)) continue;
        segments.push([[track.points[i - 1].lat, track.points[i - 1].lon], [track.points[i].lat, track.points[i].lon]]);
      }
    });
    if (!segments.length) return;
    const group = L.layerGroup([
      L.polyline(segments, { color: "#f7f2e4", weight: LEGEND_HIGHLIGHT_HALO_WIDTH, opacity: 0.95 }),
      L.polyline(segments, { color, weight: LEGEND_HIGHLIGHT_WIDTH, opacity: 1 }),
    ]);
    group.addTo(state.map);
    state.mapLegendHighlight = group;
  }
  function clearMapLegendHover() {
    if (state.mapLegendHighlight) { state.map.removeLayer(state.mapLegendHighlight); state.mapLegendHighlight = null; }
  }

  function setLegendHover(type, key, color) {
    setChartLegendHover(type, key, color);
    setMapLegendHover(type, key, color);
  }
  function clearLegendHover() {
    clearChartLegendHover();
    clearMapLegendHover();
  }

  const poiIconHoverPlugin = {
    id: "poiIconHover",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.poiIconHover;
      const poiPoints = opts && opts.poiPoints;
      const el = chart._hoverPoi;
      if (!poiPoints || !el) return;
      const p = poiPoints[el.index];
      if (!p) return;
      const meta = chart.getDatasetMeta(el.datasetIndex);
      const point = meta.data[el.index];
      if (!point) return;
      const { x, y } = point;
      const glyph = poiIconGlyph(p);

      const { ctx } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#f7f2e4";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#ab2328";
      ctx.stroke();
      ctx.font = "16px 'Material Symbols Outlined', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, x, y - 16);
      ctx.restore();
    },
  };

  // Same enlarge-on-hover treatment as poiIconHoverPlugin, but for the photo
  // markers (teal ring instead of red, camera glyph instead of the POI's).
  const photoIconHoverPlugin = {
    id: "photoIconHover",
    afterDatasetsDraw(chart) {
      const el = chart._hoverPhoto;
      if (!el) return;
      const meta = chart.getDatasetMeta(el.datasetIndex);
      const point = meta.data[el.index];
      if (!point) return;
      const { x, y } = point;

      const { ctx } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y - 16, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#f7f2e4";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#1f4d47";
      ctx.stroke();
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📷", x, y - 16);
      ctx.restore();
    },
  };

  // Highest point, lowest point, and the two steepest spots on the profile
  // (by |gradient|, at least a bit apart from each other so they don't both
  // land on the same climb/descent).
  function findKeyPoints(chartPoints) {
    if (!chartPoints.length) return null;
    let maxP = null, minP = null;
    chartPoints.forEach(p => {
      if (p.ele == null) return;
      if (!maxP || p.ele > maxP.ele) maxP = p;
      if (!minP || p.ele < minP.ele) minP = p;
    });

    const totalKm = chartPoints[chartPoints.length - 1].distKm;
    const minSepKm = Math.max(totalKm * 0.03, 0.2);
    // Consumer GPS elevation can be off by tens of meters; over a short
    // stretch that reads as an absurd grade (100%+) that isn't real terrain.
    // Anything beyond a generous real-world cap is almost certainly noise,
    // not a genuine steep section, so it's excluded from consideration.
    const REALISTIC_GRADE_CAP = 45;
    const bySteepness = chartPoints
      .filter(p => p.grade != null && Math.abs(p.grade) <= REALISTIC_GRADE_CAP)
      .slice()
      .sort((a, b) => Math.abs(b.grade) - Math.abs(a.grade));
    const steep = [];
    for (const p of bySteepness) {
      if (steep.length >= 2) break;
      if (steep.every(s => Math.abs(s.distKm - p.distKm) >= minSepKm)) steep.push(p);
    }
    return { maxP, minP, steep };
  }

  // Marks the highest/lowest elevation and the two steepest points on the
  // graph with a small tick + dot + label, like the signposts do on the map.
  const keyPointsPlugin = {
    id: "keyPoints",
    afterDatasetsDraw(chart) {
      const opts = chart.options.plugins && chart.options.plugins.keyPoints;
      const chartPoints = opts && opts.chartPoints;
      if (!chartPoints || !chartPoints.length) return;
      if (chart._keyPointsCacheRef !== chartPoints) {
        chart._keyPointsCache = findKeyPoints(chartPoints);
        chart._keyPointsCacheRef = chartPoints;
      }
      const kp = chart._keyPointsCache;
      if (!kp) return;

      const { ctx, chartArea, scales } = chart;
      const drawMark = (p, label, color) => {
        if (!p) return;
        const x = scales.x.getPixelForValue(p.distKm);
        const y = scales.y.getPixelForValue(p.ele);
        if (x < chartArea.left || x > chartArea.right) return;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, chartArea.bottom);
        ctx.lineTo(x, chartArea.bottom - 8);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#f7f2e4";
        ctx.stroke();

        const labelBelow = y - 10 < chartArea.top + 10;
        ctx.font = "10px Jost, sans-serif";
        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = labelBelow ? "top" : "bottom";
        ctx.fillText(label, x, labelBelow ? y + 10 : y - 10);
        ctx.restore();
      };

      drawMark(kp.maxP, `▲ ${Math.round(kp.maxP.ele)} m`, "#7f1d1d");
      drawMark(kp.minP, `▼ ${Math.round(kp.minP.ele)} m`, "#1f4d47");
      kp.steep.forEach(p => drawMark(p, `${p.grade > 0 ? "+" : ""}${Math.round(p.grade)}%`, gradeColor(p.grade)));
    },
  };

  function segmentColorFn(chartPoints) {
    return (ctx) => {
      const p0 = chartPoints[ctx.p0DataIndex];
      const p1 = chartPoints[ctx.p1DataIndex];
      if (!p0) return "#888";
      if (state.colorMode === "surface") return SURFACE_COLORS[p0.surface] || SURFACE_FALLBACK;
      if (state.colorMode === "highway") return HIGHWAY_COLORS[p0.highway] || HIGHWAY_FALLBACK;
      if (state.colorMode === "gradient") return gradeColor(p0.grade || 0);
      return p0.color || "#e01b24";
    };
  }

  // Is this altitude-chart POI point the one currently open in the signpost
  // card? Used to make it stand out on the graph, not just on the map.
  function isSelectedPoiPoint(p) {
    return !!p && state.activePoiTripId === p.tripId && state.selectedPoiIndex === p.poiIndex;
  }

  // Custom HTML tooltip (Chart.js's own canvas-rendered one can't do a
  // flex header with the altitude pinned top-right, or per-line color
  // swatches matching the legend, so this replaces it entirely).
  function renderChartTooltip(context, chartPoints, poiPoints, photoPoints) {
    const tooltipEl = document.getElementById("chartTooltip");
    const tooltip = context.tooltip;
    const dp = tooltip && tooltip.dataPoints && tooltip.dataPoints[0];
    if (!tooltip || tooltip.opacity === 0 || !dp) {
      tooltipEl.classList.add("hidden");
      return;
    }

    const titleEl = tooltipEl.querySelector(".chart-tooltip-title");
    const eleEl = tooltipEl.querySelector(".chart-tooltip-ele");
    const bodyEl = tooltipEl.querySelector(".chart-tooltip-body");

    if (dp.dataset.isPoiLayer) {
      const p = poiPoints[dp.dataIndex];
      const poi = state.tripById[p.tripId].pois[p.poiIndex];
      titleEl.textContent = `${poiIconGlyph(poi)} ${poi.name || "(senza nome)"}`;
      eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
      bodyEl.innerHTML = "";
    } else if (dp.dataset.isPhotoLayer) {
      const p = photoPoints[dp.dataIndex];
      const photo = state.photosByTrip[p.tripId][p.photoIndex];
      titleEl.textContent = `📷 ${photo.filename}`;
      eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
      bodyEl.innerHTML = "";
    } else {
      const p = chartPoints[dp.dataIndex];
      titleEl.textContent = `${Math.round(dp.parsed.x)} km`;
      eleEl.textContent = `${Math.round(dp.parsed.y)} m`;
      const lines = [];
      if (p) {
        if (p.surface) lines.push({ color: SURFACE_COLORS[p.surface] || SURFACE_FALLBACK, text: `Fondo: ${SURFACE_LABELS[p.surface] || p.surface}` });
        if (p.highway) lines.push({ color: HIGHWAY_COLORS[p.highway] || HIGHWAY_FALLBACK, text: `Tipo: ${HIGHWAY_LABELS[p.highway] || p.highway}` });
        if (p.grade != null) lines.push({ color: gradeColor(p.grade), text: `Pendenza: ${p.grade > 0 ? "+" : ""}${Math.round(p.grade)}%` });
      }
      bodyEl.innerHTML = lines.map(l => `
        <div class="chart-tooltip-line"><span class="swatch" style="background:${l.color}"></span>${l.text}</div>
      `).join("");
    }

    tooltipEl.classList.remove("hidden");

    const wrap = document.getElementById("elevationChartWrap");
    const canvasRect = document.getElementById("elevationChart").getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - wrapRect.left;
    const canvasOffsetY = canvasRect.top - wrapRect.top;

    let left = canvasOffsetX + tooltip.caretX + 12;
    const maxLeft = wrap.clientWidth - tooltipEl.offsetWidth - 4;
    if (left > maxLeft) left = canvasOffsetX + tooltip.caretX - tooltipEl.offsetWidth - 12;
    if (left < 0) left = 4;

    let top = canvasOffsetY + tooltip.caretY - tooltipEl.offsetHeight - 10;
    if (top < 0) top = canvasOffsetY + tooltip.caretY + 14;

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  function drawChart(chartPoints, poiPoints, photoPoints, options) {
    const ctx = document.getElementById("elevationChart").getContext("2d");
    state.chartPoints = chartPoints;
    const dayRanges = new Map();
    chartPoints.forEach((p, i) => {
      const idx = p.dayIndex ?? 0;
      if (!dayRanges.has(idx)) dayRanges.set(idx, { start: i, end: i });
      else dayRanges.get(idx).end = i;
    });
    state.chartDayRanges = dayRanges;
    const data = chartPoints.map(p => ({ x: p.distKm, y: p.ele }));
    const xMax = chartPoints.length ? chartPoints[chartPoints.length - 1].distKm : undefined;

    if (state.chart) state.chart.destroy();
    document.getElementById("chartTooltip").classList.add("hidden");

    const borderColorFn = segmentColorFn(chartPoints);

    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [
          {
            data,
            segment: {
              borderColor: (segCtx) => borderColorFn(segCtx),
              backgroundColor: (segCtx) => {
                const hover = state.chart && state.chart._legendHover;
                if (hover && legendCategoryMatches(hover.type, hover.key, chartPoints[segCtx.p0DataIndex])) {
                  return hover.color + "cc";
                }
                const hoverIdx = state.chart ? chartHoverIndex(state.chart) : null;
                if (hoverIdx != null && (segCtx.p0DataIndex === hoverIdx || segCtx.p1DataIndex === hoverIdx)) {
                  return borderColorFn(segCtx) + "cc";
                }
                return borderColorFn(segCtx) + "55";
              },
            },
            borderColor: (c) => {
              const p = chartPoints[0];
              return state.colorMode === "surface" ? (SURFACE_COLORS[p && p.surface] || SURFACE_FALLBACK) : (p && p.color) || "#e01b24";
            },
            backgroundColor: (c) => {
              const p = chartPoints[0];
              const base = state.colorMode === "surface" ? (SURFACE_COLORS[p && p.surface] || SURFACE_FALLBACK) : (p && p.color) || "#e01b24";
              return base + "55";
            },
            fill: true,
            pointRadius: 0,
            borderWidth: 2,
            tension: 0.1,
            order: 1,
          },
          {
            isPoiLayer: true,
            data: poiPoints.map(p => ({ x: p.x, y: p.y })),
            showLine: false,
            pointRadius: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 6 : 3,
            pointHoverRadius: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 6 : 3,
            pointBackgroundColor: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? "#d79a1e" : "#ab2328",
            pointBorderColor: "#f7f2e4",
            pointBorderWidth: (c) => isSelectedPoiPoint(poiPoints[c.dataIndex]) ? 2 : 0,
            order: 0,
          },
          {
            isPhotoLayer: true,
            data: photoPoints.map(p => ({ x: p.x, y: p.y })),
            showLine: false,
            pointRadius: 4,
            pointHoverRadius: 4,
            pointStyle: "rectRounded",
            pointBackgroundColor: "#1f4d47",
            pointBorderColor: "#f7f2e4",
            pointBorderWidth: 1,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        // "index" mode matches datasets by shared array position, not by actual
        // x-value -- fine for the single line dataset, but meaningless for the
        // much-shorter POI dataset. POI hover/click is hit-tested separately
        // below (geometrically, via "nearest"+intersect) instead of relying on
        // the elements this mode reports.
        interaction: { mode: "index", intersect: false },
        plugins: Object.assign({
          legend: { display: false },
          crosshair: { poiPoints },
          poiIconHover: { poiPoints },
          photoIconHover: { photoPoints },
          keyPoints: { chartPoints },
          legendHighlight: { chartPoints },
          tooltip: {
            enabled: false,
            external: (context) => renderChartTooltip(context, chartPoints, poiPoints, photoPoints),
          },
        }, options.plugins || {}),
        scales: {
          x: {
            type: "linear", min: 0, max: xMax, title: { display: true, text: "km", padding: { top: 0, bottom: 0 }, font: { lineHeight: 1 } },
            ticks: { maxTicksLimit: 10 },
            grid: { display: true, drawOnChartArea: false, drawTicks: true, tickLength: 6, tickColor: "#8a6530" },
          },
          y: {
            title: { display: true, text: "m" },
            grid: { display: true, drawOnChartArea: false, drawTicks: true, tickLength: 6, tickColor: "#8a6530" },
          },
        },
        onHover: (evt, elements, chart) => {
          // POI/photo hover is tracked separately from Chart's own
          // active-element state (which "index" mode uses for the line)
          // instead of overwriting it -- setActiveElements() here would
          // otherwise wipe out the line's hover tracking on every
          // mousemove that isn't exactly over a marker, breaking the
          // crosshair/tooltip while hovering the line itself.
          const hits = chart.getElementsAtEventForMode(evt.native, "nearest", { intersect: true }, false);
          const poiHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPoiLayer);
          const photoHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPhotoLayer);
          const boundaryHit = nearestDayBoundary(chart, evt.native.offsetX);
          chart.canvas.style.cursor = (poiHits.length || photoHits.length || boundaryHit) ? "pointer" : "";
          chart._hoverPoi = poiHits.length ? poiHits[0] : null;
          chart._hoverPhoto = photoHits.length ? photoHits[0] : null;
          if (poiHits.length) {
            chart.tooltip.setActiveElements(poiHits, { x: evt.native.offsetX, y: evt.native.offsetY });
          } else if (photoHits.length) {
            chart.tooltip.setActiveElements(photoHits, { x: evt.native.offsetX, y: evt.native.offsetY });
          }
          chart.draw();

          const lineHit = elements.find(el => {
            const ds = chart.data.datasets[el.datasetIndex];
            return !ds.isPoiLayer && !ds.isPhotoLayer;
          });
          if (lineHit) {
            const p = chartPoints[lineHit.index];
            if (p) showHoverMarker(p.lat, p.lon);
          } else if (!elements.length) {
            clearMapHover();
          }
        },
        onClick: (evt, elements, chart) => {
          const hits = chart.getElementsAtEventForMode(evt.native, "nearest", { intersect: true }, false);
          const poiHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPoiLayer);
          if (poiHits.length) {
            const p = poiPoints[poiHits[0].index];
            openPoiByIndex(p.tripId, p.poiIndex, true);
            return;
          }
          const photoHits = hits.filter(el => chart.data.datasets[el.datasetIndex].isPhotoLayer);
          if (photoHits.length) {
            const p = photoPoints[photoHits[0].index];
            openPhoto(p.tripId, p.photoIndex);
            return;
          }
          const boundaryHit = nearestDayBoundary(chart, evt.native.offsetX);
          // Deferred: selectDay() rebuilds (destroys + recreates) this very
          // chart instance -- doing that synchronously from inside its own
          // onClick would have Chart.js's internal event dispatch keep
          // running against an already-destroyed chart right after.
          if (boundaryHit) setTimeout(() => selectDay(state.activeTripId, boundaryHit.trackId), 0);
        },
      },
      plugins: [dayBoundaryPlugin, keyPointsPlugin, legendHighlightPlugin, crosshairPlugin, poiIconHoverPlugin, photoIconHoverPlugin],
    });
  }

  // Shared by the day-view and whole-trip footer info rows: the same
  // back-button + date-range "context" component used in the picker panel,
  // followed by view-specific stats. Same semantics as the picker panel too:
  // the arrow always goes all the way back to all trips, while the trip
  // name jumps straight to that trip (a no-op from the whole-trip view
  // itself, but the meaningful "up one level" step from a day view).
  function renderFooterBackInfo(trip, dateRange, extraHtml) {
    document.getElementById("elevationDayInfo").innerHTML = `
      <span class="picker-context">
        <button class="picker-back" id="footerBackBtn" aria-label="Torna a tutti i viaggi" title="Torna a tutti i viaggi">←</button>
        <button class="picker-context-trip" id="footerBackLabel">${trip.name}</button>
        <span class="picker-context-date">${dateRange}</span>
      </span>
      ${extraHtml}
    `;
    document.getElementById("footerBackBtn").addEventListener("click", () => selectAll());
    document.getElementById("footerBackLabel").addEventListener("click", () => selectTrip(trip.id));
  }

  function renderDayChart(trip, track) {
    const grades = trackGradeSeries(track);
    const surfaces = trackCategorySeries(track, "surface");
    const highways = trackCategorySeries(track, "highway");
    const chartPoints = track.points.map((p, i) => ({
      distKm: p.dist / 1000, ele: p.ele, lat: p.lat, lon: p.lon,
      surface: surfaces[i], highway: highways[i], color: trip._color, dayIndex: 0, grade: grades[i],
    }));
    const gradeMin = grades.length ? Math.min(...grades) : 0;
    const gradeMax = grades.length ? Math.max(...grades) : 0;

    renderFooterBackInfo(trip, fmtDateRange(trip.summary.start_t, trip.summary.end_t), `
      <span>${dayIconHtml(track)} <b>${track.name}</b></span>
      <span>${fmtKmRound(track.distance_m)}</span>
      <span>+${fmtM(track.ele_gain)} / -${fmtM(track.ele_loss)}</span>
      <span>${track.ele_min != null ? Math.round(track.ele_min) + "–" + Math.round(track.ele_max) + " m" : ""}</span>
      <span>${Math.round(gradeMin)}% / +${Math.round(gradeMax)}%</span>
      <span>${fmtDuration(track.duration_s)}</span>
    `);

    const poiPoints = poiChartPointsForTrack(trip, track, 0);
    const photoPoints = photoChartPointsForTrack(trip, track, 0);
    drawChart(chartPoints, poiPoints, photoPoints, { plugins: { dayBoundaries: { boundaries: [] } } });
  }

  function renderWholeTripChart(trip) {
    let offsetKm = 0;
    const boundaries = [];
    const chartPoints = [];
    const poiPoints = [];
    const photoPoints = [];
    const seenPoiIndex = new Set();
    trip.tracks.forEach((track, idx) => {
      if (idx > 0) boundaries.push({ x: offsetKm, label: track.name, trackId: track.id });
      const grades = trackGradeSeries(track);
      const surfaces = trackCategorySeries(track, "surface");
      const highways = trackCategorySeries(track, "highway");
      track.points.forEach((p, i) => {
        chartPoints.push({
          distKm: offsetKm + p.dist / 1000, ele: p.ele, lat: p.lat, lon: p.lon,
          surface: surfaces[i], highway: highways[i], color: trip._color, dayIndex: idx, grade: grades[i],
        });
      });
      // A POI is only plotted once, on the day track it's closest to overall
      // (relevant when consecutive days' tracks pass near the same spot).
      poiChartPointsForTrack(trip, track, offsetKm).forEach(pp => {
        if (seenPoiIndex.has(pp.poiIndex)) return;
        seenPoiIndex.add(pp.poiIndex);
        poiPoints.push(pp);
      });
      photoPoints.push(...photoChartPointsForTrack(trip, track, offsetKm));
      offsetKm += track.distance_m / 1000;
    });

    const s = trip.summary;
    const eleMin = Math.min(...trip.tracks.map(t => t.ele_min));
    const eleMax = Math.max(...trip.tracks.map(t => t.ele_max));
    const grade = tripGradeMinMax(trip);
    renderFooterBackInfo(trip, fmtDateRange(s.start_t, s.end_t), `
      <span>${fmtKmRound(s.total_distance_m)}</span>
      <span>+${fmtM(s.total_ele_gain)} / -${fmtM(s.total_ele_loss)}</span>
      <span>${Math.round(eleMin)}–${Math.round(eleMax)} m</span>
      <span>${Math.round(grade.min)}% / +${Math.round(grade.max)}%</span>
      <span>${s.num_days} giorni</span>
    `);

    drawChart(chartPoints, poiPoints, photoPoints, { plugins: { dayBoundaries: { boundaries } } });
  }

  // Rough on-screen text width, used only to decide whether two labels
  // would collide -- doesn't need to be exact, just in the right ballpark.
  const _tlMeasureCtx = document.createElement("canvas").getContext("2d");
  function timelineTextWidthPx(text, font) {
    _tlMeasureCtx.font = font;
    return _tlMeasureCtx.measureText(text).width;
  }

  // Picks a readable month step (1/2/3/6/12/24/36 months) for a calendar
  // axis spanning [minMs, maxMs], aiming for roughly targetCount ticks, then
  // returns each tick's timestamp + a label ("Mag" mid-year, "Gen '24" or
  // just the year at a year boundary, depending on how coarse the step is).
  function monthTicksForRange(minMs, maxMs, targetCount) {
    const start = new Date(minMs);
    const end = new Date(maxMs);
    const totalMonths = Math.max((end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1, 1);
    const STEPS = [1, 2, 3, 6, 12, 24, 36];
    const step = STEPS.find(s => totalMonths / s <= targetCount) || STEPS[STEPS.length - 1];
    const cursor = new Date(start.getFullYear(), Math.floor(start.getMonth() / step) * step, 1);
    const ticks = [];
    while (cursor.getTime() <= end.getTime()) {
      const isYearStart = cursor.getMonth() === 0;
      const monthLabel = cursor.toLocaleDateString("it-IT", { month: "short" }).replace(/^./, c => c.toUpperCase());
      const label = step >= 12 ? String(cursor.getFullYear())
        : isYearStart ? `${monthLabel} '${String(cursor.getFullYear()).slice(2)}` : monthLabel;
      ticks.push({ ms: cursor.getTime(), label, isYearStart });
      cursor.setMonth(cursor.getMonth() + step);
    }
    return ticks;
  }

  // Lanes for a Gantt-style row of [leftPx, rightPx] bars, each with a name
  // label that sits beside it (to the right, or to the left if it would run
  // off the right edge) rather than inside -- so the label's own footprint,
  // not just the bar's, is what has to clear before two trips share a lane.
  function layoutGanttBarRows(items, widthPx) {
    const GAP = 6;
    items.forEach(it => {
      const fitsRight = it.rightPx + GAP + it.labelWidthPx <= widthPx;
      it.labelSide = fitsRight ? "right" : "left";
      it.occStart = fitsRight ? it.leftPx : Math.max(it.leftPx - GAP - it.labelWidthPx, 0);
      it.occEnd = fitsRight ? it.rightPx + GAP + it.labelWidthPx : it.rightPx;
    });
    const rowEnd = [];
    items.slice().sort((a, b) => a.occStart - b.occStart).forEach(it => {
      let row = 0;
      while (rowEnd[row] != null && rowEnd[row] > it.occStart) row++;
      rowEnd[row] = it.occEnd;
      it.row = row;
    });
    return rowEnd.length;
  }

  // The footer's Timeline view at the All Trips level: a real Gantt-style
  // calendar-time chart. A month/year axis runs along the bottom (trips
  // with real GPX timestamps get a bar spanning their true start-end range;
  // trips with no timestamps at all, only a fallback seed_date, get a small
  // dot instead, since there's no real duration to show honestly), and each
  // trip lands in the first free lane above the baseline with its name
  // printed in full beside the bar.
  function renderAllTripsTimelineStrip() {
    const wrap = document.getElementById("dayTimelineStrip");
    const trips = state.trips;
    if (!trips.length) { wrap.innerHTML = ""; return; }

    const panel = document.getElementById("elevationPanel");
    const header = document.getElementById("elevationHeader");
    // The strip itself may be the hidden tab right now (display:none, size
    // 0), so measure its always-visible ancestor instead.
    const widthPx = (panel.clientWidth - 20) || 800;
    const heightPx = (panel.clientHeight - header.offsetHeight - 8) || 160;

    const toMs = (iso) => iso ? new Date(iso).getTime() : null;
    const spans = trips.map(trip => {
      const s = trip.summary;
      const start = toMs(s.start_t) || toMs(s.seed_date);
      const end = toMs(s.end_t) || start;
      return { trip, start, end, isPoint: !s.start_t };
    });
    const globalMin = Math.min(...spans.map(sp => sp.start));
    const globalMax = Math.max(...spans.map(sp => sp.end));
    const span = Math.max(globalMax - globalMin, 1);
    const toX = (ms) => ((ms - globalMin) / span) * widthPx;

    const AXIS_LABEL_H = 16;
    const baselineY = heightPx - AXIS_LABEL_H - 6;

    const items = spans.map(({ trip, start, end, isPoint }) => {
      const leftPx = toX(start);
      // A trip bar is exactly as long as its real span -- only the tiny
      // undated "point" trips get an artificial fixed width.
      const rightPx = isPoint ? leftPx + 11 : Math.max(toX(end), leftPx + 3);
      const labelWidthPx = timelineTextWidthPx(trip.name, "600 11px sans-serif");
      return { trip, isPoint, leftPx, rightPx, labelWidthPx };
    });
    const numRows = layoutGanttBarRows(items, widthPx);
    const rowH = Math.min(22, Math.max(baselineY - 8, 20) / numRows);
    const barH = Math.max(8, rowH - 8);

    // Month grid: faint vertical lines across the full height, with a tick
    // label sitting just under the baseline -- a real scale to read trip
    // lengths against, instead of a bare undated line.
    const ticks = monthTicksForRange(globalMin, globalMax, 8);
    const gridHtml = ticks.map(t => {
      const leftPct = (toX(t.ms) / widthPx * 100).toFixed(2);
      return `
        <div class="dts-axis-grid${t.isYearStart ? " dts-axis-grid-year" : ""}" style="left:${leftPct}%"></div>
        <div class="dts-axis-tick-label" style="left:${leftPct}%;top:${baselineY + 6}px">${t.label}</div>`;
    }).join("");

    const barsHtml = items.map(({ trip, isPoint, leftPx, rightPx, row }) => {
      const bottom = baselineY - row * rowH;
      if (isPoint) {
        return `<button class="dts-gantt-point" style="left:${leftPx.toFixed(1)}px;top:${(bottom - barH / 2).toFixed(1)}px;background:${trip._color}" data-trip-id="${trip.id}" title="${trip.name}"></button>`;
      }
      return `<button class="dts-gantt-bar" style="left:${leftPx.toFixed(1)}px;width:${(rightPx - leftPx).toFixed(1)}px;top:${(bottom - barH).toFixed(1)}px;height:${barH}px;background:${trip._color}" data-trip-id="${trip.id}" title="${trip.name}"></button>`;
    }).join("");

    const labelsHtml = items.map(({ trip, leftPx, rightPx, row, labelSide }) => {
      const y = baselineY - row * rowH - barH / 2;
      const x = labelSide === "right" ? rightPx + 6 : leftPx - 6;
      const transform = labelSide === "right" ? "translateY(-50%)" : "translate(-100%, -50%)";
      return `<button class="dts-gantt-label" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;transform:${transform}" data-trip-id="${trip.id}">${trip.name}</button>`;
    }).join("");

    wrap.innerHTML = `
      <div class="dts-axis-baseline" style="top:${baselineY}px"></div>
      ${gridHtml}${barsHtml}${labelsHtml}`;

    wrap.querySelectorAll(".dts-gantt-bar, .dts-gantt-point, .dts-gantt-label").forEach(btn => {
      btn.addEventListener("click", () => selectTrip(btn.dataset.tripId));
    });
  }

  function showHoverMarker(lat, lon) {
    if (!state.hoverMarker) {
      state.hoverMarker = L.circleMarker([lat, lon], {
        pane: "hoverPointPane", interactive: false,
        radius: 6, color: "#fbf4e5", weight: 2, fillColor: "#d79a1e", fillOpacity: 1,
      }).addTo(state.map);
    } else {
      state.hoverMarker.setLatLng([lat, lon]);
      if (!state.map.hasLayer(state.hoverMarker)) state.hoverMarker.addTo(state.map);
    }
  }
  function clearMapHover() {
    if (state.hoverMarker) state.map.removeLayer(state.hoverMarker);
  }

  function onTrackHover(trip, track, latlng) {
    const isCharted = state.activeDayId === track.id ||
      (state.activeDayId === null && state.activeTripId === trip.id);
    if (!isCharted) return;
    const pts = state.chartPoints;
    const dayIndex = trip.tracks.findIndex(t => t.id === track.id);
    const range = state.chartDayRanges && state.chartDayRanges.get(dayIndex);
    const scanStart = range ? range.start : 0;
    const scanEnd = range ? range.end : pts.length - 1;
    let bestIdx = scanStart, bestDist = Infinity;
    for (let i = scanStart; i <= scanEnd; i++) {
      const p = pts[i];
      const d = (p.lat - latlng.lat) ** 2 + (p.lon - latlng.lng) ** 2;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (state.chart) {
      state.chart.setActiveElements([{ datasetIndex: 0, index: bestIdx }]);
      state.chart.tooltip.setActiveElements([{ datasetIndex: 0, index: bestIdx }], { x: 0, y: 0 });
      state.chart.update("none");
    }
    const p = pts[bestIdx];
    if (p) showHoverMarker(p.lat, p.lon);
  }

  function clearChartHover() {
    if (state.chart) {
      state.chart.setActiveElements([]);
      state.chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      state.chart.update();
    }
    clearMapHover();
  }

  // ---- Wiring ----

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
        exploreLegendMode = btn.dataset.mode;
        renderExploreLegend();
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
      updateTripMarkerVisibility();
      return state.startsVisible;
    });
    wireHeadbarToggle("togglePois", () => {
      state.poisVisible = !state.poisVisible;
      updatePoiMarkerVisibility();
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

      window.addEventListener("mouseup", () => {
        if (!dragActive) return;
        const wasDrag = didDrag;
        dragActive = false;
        el.classList.remove("dragging");
        if (!wasDrag && state.presentationOpen && img.naturalWidth > 0) {
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

  function themeChartDefaults() {
    // Always themed for light mode -- this viewer intentionally ignores the
    // visitor's system dark-mode preference.
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = "'Jost', 'Futura', 'Century Gothic', Avenir, sans-serif";
    Chart.defaults.color = "#6b5636";
    Chart.defaults.borderColor = "#b99a5e";
    Chart.defaults.plugins.tooltip.backgroundColor = "#f1e4c4";
    Chart.defaults.plugins.tooltip.titleColor = "#241a12";
    Chart.defaults.plugins.tooltip.bodyColor = "#241a12";
    Chart.defaults.plugins.tooltip.borderColor = "#8a6530";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 8;
    Chart.defaults.plugins.tooltip.cornerRadius = 2;
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

    let startDots = [];
    trips.forEach(trip => {
      tripTrackDrawOrder(trip).forEach(track => {
        const layers = buildDayLayers(trip, track);
        state.dayLayers[track.id] = layers;
        layers.day.addTo(map);
      });
      addPoiMarkers(trip);
      addTripBoundaryMarkers(trip);
      addActivityStartMarkers(trip);
      startDots = startDots.concat(trackStartDots(trip));
    });

    renderExploreLegend();
    wireUi();
    showAllTripsFooter();

    if (trips.length) {
      selectAll();
    } else {
      map.setView([46, 11], 10);
    }
    // The map has no zoom until the first setView/fitBounds above -- now
    // that it does, position every shared-route offset line for real, and
    // it's finally safe to add the per-day start dots (Leaflet's Path
    // renderer throws if a circleMarker is added before the map has one).
    recomputeOffsetLines();
    L.layerGroup(startDots).addTo(map);

    const photos = await loadPhotos();
    const togglePhotosBtn = document.getElementById("togglePhotos");
    togglePhotosBtn.classList.toggle("hidden", photos.length === 0);
    if (photos.length) {
      togglePhotosBtn.classList.add("active");
      togglePhotosBtn.setAttribute("aria-pressed", "true");
      const { byTrip, groups } = buildPhotoLayers(photos);
      state.photosByTrip = byTrip;
      state.photoGroupsByTrip = groups;
      updatePhotoMarkerVisibility();
    }
  }

  main();
})();
