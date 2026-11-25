import { fsrs, generatorParameters, createEmptyCard, Rating, State, default_w } from "ts-fsrs";
import {
  DAY,
  MAX_DAYS,
  FSRS_RETENTION,
  RETENTION_MIN,
  RETENTION_MAX,
  RELEARN_GAP,
  KNOWN_DAYS,
  HARD_LAPSES,
  HARD_REPS,
} from "./constants";
import { startOfDay } from "./utils";

export function dueAt(card) {
  return !card || !card.dueAt ? 0 : card.dueAt;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ---------- FSRS ----------
 * App chỉ có 2 mức đánh giá: "again" (Chưa nhớ) → Rating.Again, "good" (Đã nhớ) → Rating.Good.
 * Học 1 lần/ngày nên tắt bước học ngắn (enable_short_term = false): khoảng ôn luôn tính bằng NGÀY.
 * Không dùng fuzz để số ngày hiện dưới nút luôn đúng với kết quả thật.
 */
let retention = FSRS_RETENTION;
let weights = null; // null = tham số mặc định; mảng 21 số = tham số đã tối ưu cho người dùng
const build = () =>
  fsrs(
    generatorParameters({
      ...(weights ? { w: weights } : {}),
      request_retention: retention,
      maximum_interval: MAX_DAYS,
      enable_fuzz: false,
      enable_short_term: false,
    })
  );
let scheduler = build();

// Tham số tối ưu hợp lệ: đúng 21 số hữu hạn
export const validWeights = (w) =>
  Array.isArray(w) && w.length === default_w.length && w.every((x) => Number.isFinite(x));

// Đổi mức nhớ mục tiêu (0,80 – 0,97) và/hoặc tham số FSRS cá nhân (`weights`; null/không hợp lệ = mặc định).
// Gọi lại với cùng giá trị thì không làm gì.
export function configureSrs({ retention: r, weights: w } = {}) {
  const v = clamp(Number(r) || FSRS_RETENTION, RETENTION_MIN, RETENTION_MAX);
  const nw = validWeights(w) ? w.map(Number) : null;
  const same =
    v === retention &&
    (nw === null ? weights === null : weights !== null && nw.every((x, i) => x === weights[i]));
  if (same) return;
  retention = v;
  weights = nw;
  scheduler = build();
}
export const getRetention = () => retention;
export const getWeights = () => (weights ? [...weights] : null);

// Thẻ cũ (lịch kiểu SM-2: interval + ease) chưa có stability/difficulty:
// stability ≈ khoảng ôn đã hẹn (FSRS định nghĩa đó là số ngày để xác suất nhớ còn 90%),
// difficulty suy từ ease (ease 3,0 → 1 dễ nhất, ease 1,3 → 10 khó nhất).
const legacyDifficulty = (ease) =>
  clamp(1 + ((3 - (ease || 2.5)) / 1.7) * 9, 1, 10);

// Số ngày lịch đã trôi qua từ lần ôn trước (tính theo ngày dương lịch, không theo giờ)
const elapsedDays = (c, now) => {
  if (!c.lastReviewed) return Math.max(0, c.interval || 0);
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(c.lastReviewed)) / DAY));
};

function toFsrsCard(c, now) {
  if (!c) return createEmptyCard(new Date(now));
  const elapsed = elapsedDays(c, now);
  const known = c.stability > 0;
  return {
    due: new Date(dueAt(c) || now),
    stability: known ? c.stability : Math.max(1, c.interval || 1),
    difficulty: known ? c.difficulty : legacyDifficulty(c.ease),
    elapsed_days: elapsed,
    scheduled_days: c.interval || 0,
    learning_steps: 0,
    reps: c.reps || 0,
    lapses: c.lapses || 0,
    state: State.Review,
    // đặt đúng "elapsed" ngày trước thời điểm chấm để FSRS tính cùng số ngày với lịch
    last_review: new Date(now - elapsed * DAY),
  };
}

// Xác suất nhớ hiện tại của thẻ (0–1); thẻ chưa học trả về 0.
export function retrievability(card, now = Date.now()) {
  if (!card) return 0;
  return scheduler.get_retrievability(toFsrsCard(card, now), new Date(now), false);
}

// Lịch ôn sau khi chấm thẻ. Trả về các trường lưu vào tiến độ:
//   dueAt (0h của ngày đến hạn), interval (ngày), reps (số lần nhớ LIÊN TIẾP),
//   lapses (số lần bấm "Chưa nhớ"), status, stability, difficulty, state (của FSRS).
export function nextSchedule(card, rating, now = Date.now()) {
  const c = card || {};
  // "Đã biết từ này": hẹn thẳng KNOWN_DAYS ngày, thẻ được coi là dễ (difficulty thấp)
  if (rating === "known") {
    const g = scheduler.next(toFsrsCard(card, now), new Date(now), Rating.Good).card;
    return {
      dueAt: startOfDay(now + KNOWN_DAYS * DAY),
      reps: (c.reps || 0) + 1,
      interval: KNOWN_DAYS,
      lapses: c.lapses || 0,
      status: "review",
      stability: KNOWN_DAYS,
      difficulty: Math.min(g.difficulty, 3),
      state: g.state,
    };
  }
  const again = rating === "again";
  const next = scheduler.next(
    toFsrsCard(card, now),
    new Date(now),
    again ? Rating.Again : Rating.Good
  ).card;
  // Quên → luôn gặp lại vào ngày mai (FSRS không có bước học ngắn nên có thể hẹn 2–3 ngày);
  // trạng thái ghi nhớ (stability/difficulty) vẫn do FSRS tính. Trần MAX_DAYS vì FSRS có thể làm tròn lên 1 ngày.
  const interval = again ? 1 : clamp(next.scheduled_days, 1, MAX_DAYS);
  return {
    dueAt: startOfDay(now + interval * DAY),
    reps: again ? 0 : (c.reps || 0) + 1,
    interval,
    lapses: (c.lapses || 0) + (again ? 1 : 0),
    status: again ? "learning" : "review",
    stability: next.stability,
    difficulty: next.difficulty,
    state: next.state,
  };
}

// Thẻ "Chưa nhớ" được hỏi lại ĐÚNG MỘT LẦN sau RELEARN_GAP thẻ trong cùng phiên
// (hoặc ở cuối phiên nếu không còn đủ thẻ). Trả về mảng mới, không sửa mảng cũ.
export function insertRelearn(session, index, id, gap = RELEARN_GAP) {
  const at = Math.min(session.length, index + 1 + gap);
  return [...session.slice(0, at), id, ...session.slice(at)];
}

// "Từ khó": bấm "Chưa nhớ" ≥ 3 lần và chưa nhớ liền 3 lần sau đó.
export const isHard = (c) =>
  !!c && (c.lapses || 0) >= HARD_LAPSES && (c.reps || 0) < HARD_REPS;

export function fmtInterval(days) {
  const min = days * 1440;
  if (min < 60) return `${Math.max(1, Math.round(min))} phút`;
  if (min < 1440) return `${Math.round(min / 60)} giờ`;
  const d = Math.round(days);
  return d >= 365 ? "1 năm" : d >= 30 ? `${Math.round(d / 30)} tháng` : `${d} ngày`;
}

export function statusOf(card, now = Date.now()) {
  return !card ? "new" : dueAt(card) <= now ? "due" : "learning";
}
export const STATUS_LABEL = {
  new: "Chưa học",
  due: "Đến hạn",
  learning: "Đã lên lịch",
};
