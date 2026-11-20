// Tỉ lệ nhớ thực tế: trong các lượt ÔN LẠI thẻ đã học, bạn nhớ được bao nhiêu phần trăm.
// Dùng nhật ký ôn {c, t, g, n?}. Không tính: lần học đầu của từ mới, luyện tập, lượt hỏi lại trong phiên.
import { dayKeyOf, weekKeys } from "./reminder";

export const MIN_REVIEWS = 30; // ít hơn thì chưa kết luận
export const WEEKS_SHOWN = 8;

// Khoảng tin cậy Wilson 95% cho tỉ lệ ok/n (đáng tin hơn công thức thường khi n nhỏ)
export function wilson(ok, n, z = 1.96) {
  if (!n) return { lo: 0, hi: 1 };
  const p = ok / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const tally = (ok, n) => ({ n, ok, rate: n ? ok / n : null, ...wilson(ok, n) });

// Lọc ra các lượt ÔN LẠI (theo thứ tự thời gian), mỗi lượt: {t, ok}
//  - n === 0 → ôn lại; n === 1 → học lần đầu (bỏ)
//  - dòng cũ không có n: chỉ tính khi thẻ đó đã xuất hiện ở dòng trước (dòng đầu của thẻ có thể là
//    thẻ đã học từ trước khi có nhật ký nên không rõ → bỏ để không tính sai)
export function reviewOutcomes(log) {
  const seen = new Set();
  const out = [];
  for (const e of [...(log || [])].sort((a, b) => a.t - b.t)) {
    const prior = seen.has(e.c);
    seen.add(e.c);
    const isReview = e.n === 0 ? true : e.n === 1 ? false : prior;
    if (isReview && (e.g === 1 || e.g === 3)) out.push({ t: e.t, ok: e.g === 3 });
  }
  return out;
}

export function retentionStats(log, now = Date.now()) {
  const outs = reviewOutcomes(log);
  const within = (days) => outs.filter((o) => o.t > now - days * 86400000);
  const pack = (list) => tally(list.filter((o) => o.ok).length, list.length);

  // 8 tuần gần nhất (thứ Hai → Chủ nhật), tuần cũ nhất trước
  const thisMonday = weekKeys(dayKeyOf(now))[0];
  const [y, m, d] = thisMonday.split("-").map(Number);
  const starts = Array.from({ length: WEEKS_SHOWN }, (_, i) =>
    dayKeyOf(new Date(y, m - 1, d - 7 * (WEEKS_SHOWN - 1 - i)))
  );
  const byWeek = new Map(starts.map((k) => [k, []]));
  for (const o of outs) {
    const k = weekKeys(dayKeyOf(o.t))[0];
    if (byWeek.has(k)) byWeek.get(k).push(o);
  }
  return {
    d7: pack(within(7)),
    d30: pack(within(30)),
    all: pack(outs),
    weeks: starts.map((start) => ({ start, ...pack(byWeek.get(start)) })),
    firstAt: log && log.length ? Math.min(...log.map((e) => e.t)) : null,
    logged: log ? log.length : 0,
  };
}

// So tỉ lệ thực tế với mức nhớ mục tiêu (0–1). level: insufficient | below | ok | above
export function retentionVerdict({ ok, n, target }) {
  if (n < MIN_REVIEWS) return { level: "insufficient", need: MIN_REVIEWS - n };
  const rate = ok / n;
  const { lo, hi } = wilson(ok, n);
  if (hi < target) {
    // Thấp hơn mục tiêu một cách có ý nghĩa thống kê → gợi ý nâng mục tiêu bù phần thiếu (tối thiểu +2, tối đa +6 điểm)
    const gap = Math.min(0.06, Math.max(0.02, target - rate));
    return { level: "below", rate, lo, hi, suggest: Math.min(97, Math.round((target + gap) * 100)) };
  }
  if (lo > target) return { level: "above", rate, lo, hi };
  return { level: "ok", rate, lo, hi };
}
