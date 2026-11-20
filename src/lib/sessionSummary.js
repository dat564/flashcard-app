// Tổng kết một phiên học: số liệu từ danh sách lượt chấm trong phiên.
import { DAY } from "./constants";
import { startOfDay } from "./utils";

export const IDLE_CAP_MS = 60 * 1000; // nghỉ quá 60 giây giữa hai thẻ thì chỉ tính 60 giây

// Thời gian học thực: cộng khoảng cách giữa các lượt chấm, mỗi khoảng tối đa IDLE_CAP_MS
// (để lúc bạn đi pha cà phê hay quên đóng app không bị tính là đang học).
export function activeSeconds(entries, startedAt, cap = IDLE_CAP_MS) {
  let prev = startedAt;
  let ms = 0;
  for (const e of entries) {
    ms += Math.min(cap, Math.max(0, e.t - prev));
    prev = e.t;
  }
  return Math.round(ms / 1000);
}

// entries: [{id, r: "again" | "good", isNew, pass: 1 | 2, t}]; pass 2 = lượt hỏi lại trong phiên
export function summarizeSession({ entries = [], startedAt, endedAt, practice = false, early = false, mode = "due" }) {
  const scored = entries.filter((e) => e.pass === 1);
  const good = scored.filter((e) => e.r === "good");
  const fresh = scored.filter((e) => e.isNew);
  const reviews = scored.filter((e) => !e.isNew);
  const reviewGood = reviews.filter((e) => e.r === "good").length;
  const relearn = entries.filter((e) => e.pass === 2);
  const forgot = [...new Set(scored.filter((e) => e.r === "again").map((e) => e.id))];
  return {
    mode,
    practice,
    early,
    startedAt,
    endedAt,
    total: scored.length,
    good: good.length,
    again: scored.length - good.length,
    rate: scored.length ? good.length / scored.length : null,
    newCount: fresh.length,
    newGood: fresh.filter((e) => e.r === "good").length,
    reviewCount: reviews.length,
    reviewGood,
    reviewRate: reviews.length ? reviewGood / reviews.length : null,
    relearnTotal: relearn.length,
    relearnGood: relearn.filter((e) => e.r === "good").length,
    forgot, // id các từ bấm "Chưa nhớ" ít nhất một lần (theo thứ tự gặp)
    seconds: activeSeconds(entries, startedAt),
  };
}

// Số thẻ đến hạn tính tới thời điểm `until`
export const countDueBy = (cards = {}, until) => {
  let n = 0;
  for (const c of Object.values(cards)) if (c && c.dueAt && c.dueAt <= until) n++;
  return n;
};

// Còn bao nhiêu thẻ đến hạn hôm nay, và bao nhiêu thẻ sẽ đến hạn thêm vào ngày mai
export function dueOutlook(cards, now = Date.now()) {
  const dueNow = countDueBy(cards, now);
  const endOfTomorrow = startOfDay(now + 2 * DAY) - 1;
  return { dueNow, dueTomorrow: Math.max(0, countDueBy(cards, endOfTomorrow) - dueNow) };
}

export const fmtDuration = (sec) => {
  if (sec < 60) return `${sec} giây`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} phút ${s} giây` : `${m} phút`;
};
