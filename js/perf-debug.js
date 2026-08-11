// ---- TEMPORARY hover-lag instrumentation -- remove once the bottleneck is found ----
// Wraps suspect hot-path functions with timing and logs an aggregated
// summary (avg/max/count per label) every 2s instead of once per frame,
// so hovering doesn't get its own console spam added on top of the lag
// being investigated.

const stats = new Map();

function record(label, ms) {
  let s = stats.get(label);
  if (!s) { s = { count: 0, total: 0, max: 0 }; stats.set(label, s); }
  s.count++;
  s.total += ms;
  if (ms > s.max) s.max = ms;
}

export function perfMark(label, fn) {
  const t0 = performance.now();
  const result = fn();
  record(label, performance.now() - t0);
  return result;
}

setInterval(() => {
  if (!stats.size) return;
  const rows = [...stats.entries()].map(([label, s]) =>
    `  ${label}: avg ${(s.total / s.count).toFixed(2)}ms  max ${s.max.toFixed(2)}ms  n=${s.count}`
  );
  console.log(`[perf]\n${rows.join("\n")}`);
  stats.clear();
}, 2000);
