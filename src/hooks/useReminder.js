import { useEffect, useMemo, useRef } from "react";
import {
  countDue,
  normalizeReminder,
  reminderDecision,
  weekProgress,
} from "../lib/reminder";
import {
  getLastNotified,
  setBadge,
  setLastNotified,
  showReminder,
  syncPeriodic,
} from "../lib/reminderRuntime";

const CHECK_MS = 30 * 1000;

// Nhắc học + huy hiệu số thẻ đến hạn + chúc mừng đạt mục tiêu tuần.
// (Khi app đóng hẳn, việc nhắc do service worker đảm nhiệm — xem public/sw.js.)
export function useReminder({ progress, setProgress, today, setToast }) {
  const reminder = normalizeReminder(progress.settings?.reminder);
  const due = useMemo(() => countDue(progress.cards, Date.now()), [progress.cards, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Luôn đọc được trạng thái mới nhất trong bộ đếm giờ mà không phải tạo lại nó
  const latest = useRef({});
  latest.current = { stats: progress.stats, reminder, due };

  // 1) Huy hiệu trên biểu tượng app = số thẻ đến hạn
  useEffect(() => {
    setBadge(reminder.enabled && reminder.badge ? due : 0);
  }, [reminder.enabled, reminder.badge, due]);

  // 2) Nhắc khi trang đang mở hoặc ở nền
  useEffect(() => {
    if (!reminder.enabled) return undefined;
    let stopped = false;
    const check = async () => {
      if (stopped || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const { stats, reminder: r, due: n } = latest.current;
      const last = await getLastNotified();
      const d = reminderDecision({ now: Date.now(), reminder: r, stats, lastNotified: last });
      if (!d.notify || stopped) return;
      await setLastNotified(d.day); // ghi trước khi hiện để không nhắc đúp với service worker
      try {
        await showReminder(n);
      } catch {
        /* bỏ qua */
      }
    };
    check();
    const id = setInterval(check, CHECK_MS);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reminder.enabled, reminder.time]);

  // 3) Cho service worker nhắc cả khi đóng app (nếu trình duyệt hỗ trợ)
  useEffect(() => {
    syncPeriodic(reminder.enabled && typeof Notification !== "undefined" && Notification.permission === "granted");
  }, [reminder.enabled]);

  // 4) Chúc mừng đạt mục tiêu tuần (một lần cho mỗi tuần)
  const week = useMemo(
    () => weekProgress(progress.stats, today, progress.settings?.weeklyGoal),
    [progress.stats, today, progress.settings?.weeklyGoal]
  );
  const celebrated = progress.settings?.goalCelebrated;
  useEffect(() => {
    if (!week.reached || celebrated === week.weekStart) return;
    setToast?.(`Đạt mục tiêu tuần: ${week.done}/${week.goal} ngày học! 🎉`);
    setProgress((p) => ({ ...p, settings: { ...p.settings, goalCelebrated: week.weekStart } }));
  }, [week.reached, week.weekStart, celebrated]); // eslint-disable-line react-hooks/exhaustive-deps

  return { week, due, reminder };
}
