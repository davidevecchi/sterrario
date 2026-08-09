export function fmtKmRound(m) { return Math.round(m / 1000).toLocaleString("en-US") + " km"; }
export function fmtM(m, unit = true) { return Math.round(m).toLocaleString("en-US") + (unit ? " m" : ""); }
export function fmtSignDistKm(km) { return Math.round(Math.abs(km)) + " km"; }
export function fmtDuration(sec) {
  if (sec == null) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
// `withYear` defaults on so a lone date always reads unambiguously; range
// formatting below turns it off for whichever end would otherwise repeat
// a year already shown on the other end.
export function fmtDate(iso, withYear = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const base = d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return withYear ? `${base} '${String(d.getFullYear()).slice(-2)}` : base;
}
export function fmtDateRange(startIso, endIso) {
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
export function realDayNumber(tripStartIso, dateIso) {
  if (!tripStartIso || !dateIso) return null;
  const start = new Date(tripStartIso), date = new Date(dateIso);
  const msPerDay = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((dateUtc - startUtc) / msPerDay) + 1;
}

const ROMAN_NUMERALS = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function toRoman(n) {
  let out = "";
  for (const [value, symbol] of ROMAN_NUMERALS) {
    while (n >= value) { out += symbol; n -= value; }
  }
  return out;
}