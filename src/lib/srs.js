import {
  DAY,
  AGAIN_DAYS,
  MAX_DAYS,
  HARD_LAPSES,
  HARD_REPS,
} from "./constants";
import { startOfDay } from "./utils";

export function dueAt(card) {
  return !card || !card.dueAt ? 0 : card.dueAt;
}

// Lịch ôn (học 1 lần/ngày): thẻ đến hạn theo NGÀY.
//   "Chưa nhớ" -> ôn lại vào ngày mai.
//   "Đã nhớ"   -> 3, 7, 14 ngày, rồi nhân ~2.2 mỗi lần (tối đa 180 ngày).
export function nextSchedule(card, rating) {
  const now = Date.now();
  const c = card || {};
  let reps = c.reps || 0,
    interval = c.interval || 0;
  const lapses = c.lapses || 0;
  if (rating === "again") {
    return {
      dueAt: startOfDay(now + AGAIN_DAYS * DAY),
      reps: 0,
      interval: AGAIN_DAYS,
      ease: c.ease || 2.5,
      lapses: lapses + 1,
      status: "learning",
    };
  }
  interval =
    reps === 0
      ? 3
      : reps === 1
      ? 7
      : reps === 2
      ? 14
      : Math.min(MAX_DAYS, Math.max(14, interval) * 2.2);
  interval = Math.round(interval);
  reps += 1;
  return {
    dueAt: startOfDay(now + interval * DAY),
    reps,
    interval,
    ease: c.ease || 2.5,
    lapses,
    status: "review",
  };
}

// "Từ khó": bấm "Chưa nhớ" ≥ 3 lần và chưa nhớ liền 3 lần sau đó.
export const isHard = (c) =>
  !!c && (c.lapses || 0) >= HARD_LAPSES && (c.reps || 0) < HARD_REPS;

export function fmtInterval(days) {
  const min = days * 1440;
  if (min < 60) return `${Math.max(1, Math.round(min))} phút`;
  if (min < 1440) return `${Math.round(min / 60)} giờ`;
  const d = Math.round(days);
  return d >= 30 ? `${Math.round(d / 30)} tháng` : `${d} ngày`;
}

export function statusOf(card, now = Date.now()) {
  return !card ? "new" : dueAt(card) <= now ? "due" : "learning";
}
export const STATUS_LABEL = {
  new: "Chưa học",
  due: "Đến hạn",
  learning: "Đã lên lịch",
};
