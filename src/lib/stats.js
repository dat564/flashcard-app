import { DAY } from "./constants";
import { dayKeyOf, startOfDay } from "./utils";

export const activityOf = (s) => (s ? (s.reviewed || 0) + (s.practiced || 0) : 0);

export function calcStreaks(stats = {}) {
  const keys = Object.keys(stats)
    .filter((k) => activityOf(stats[k]) > 0)
    .sort();
  let best = 0,
    run = 0,
    prev = null;
  for (const k of keys) {
    run =
      prev && Math.round((new Date(k) - new Date(prev)) / DAY) === 1
        ? run + 1
        : 1;
    best = Math.max(best, run);
    prev = k;
  }
  // chuỗi hiện tại: tính lùi từ hôm nay (hôm nay chưa học thì tính từ hôm qua)
  let cur = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!activityOf(stats[dayKeyOf(d)])) d.setDate(d.getDate() - 1);
  while (activityOf(stats[dayKeyOf(d)]) > 0) {
    cur++;
    d.setDate(d.getDate() - 1);
  }
  return { cur, best };
}

// 13 tuần gần nhất, mỗi cột một tuần (T2 → CN)
export function buildHeatmap(stats = {}, weeks = 13) {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const wd = (t.getDay() + 6) % 7;
  const start = new Date(t);
  start.setDate(t.getDate() - wd - 7 * (weeks - 1));
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKeyOf(d);
    out.push({ key, n: d > t ? -1 : activityOf(stats[key]) });
  }
  return out;
}
export const heatLevel = (n) =>
  n < 0 ? "x" : n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;

// Số thẻ đến hạn trong 7 ngày tới (hôm nay gồm cả thẻ quá hạn)
export function buildForecast(cards = {}, days = 7) {
  const base = startOfDay(Date.now());
  const out = Array.from({ length: days }, (_, i) => ({
    i,
    n: 0,
    t: base + i * DAY,
  }));
  for (const c of Object.values(cards)) {
    if (!c || !c.dueAt) continue;
    const idx = Math.max(0, Math.round((c.dueAt - base) / DAY));
    if (idx < days) out[idx].n++;
  }
  return out;
}
