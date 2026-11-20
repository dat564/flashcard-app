// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReminder } from "../src/hooks/useReminder";

const TODAY = "2026-11-19"; // thứ Năm
const DAY = 86400000;
let reg;
let badge;

function stubBrowser({ permission = "granted", withBadge = true } = {}) {
  reg = {
    showNotification: vi.fn(async () => {}),
    periodicSync: { register: vi.fn(async () => {}), unregister: vi.fn(async () => {}) },
  };
  vi.stubGlobal("Notification", { permission });
  Object.defineProperty(navigator, "serviceWorker", { value: { getRegistration: async () => reg }, configurable: true });
  badge = { set: vi.fn(async () => {}), clear: vi.fn(async () => {}) };
  if (withBadge) {
    Object.defineProperty(navigator, "setAppBadge", { value: badge.set, configurable: true });
    Object.defineProperty(navigator, "clearAppBadge", { value: badge.clear, configurable: true });
  } else {
    delete navigator.setAppBadge;
    delete navigator.clearAppBadge;
  }
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });

const prog = (over = {}) => ({
  cards: {},
  stats: {},
  settings: { reminder: { enabled: true, time: "20:00" } },
  ...over,
});

function setup(progress, extra = {}) {
  const setProgress = vi.fn();
  const setToast = vi.fn();
  const hook = renderHook((p) => useReminder({ progress: p, setProgress, today: TODAY, setToast }), {
    initialProps: progress,
    ...extra,
  });
  return { ...hook, setProgress, setToast };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 19, 20, 30)); // 20:30 thứ Năm
  localStorage.clear();
  stubBrowser();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useReminder — thông báo khi trang đang mở", () => {
  it("quá giờ nhắc và chưa học: nhắc ĐÚNG một lần dù bộ đếm chạy nhiều vòng", async () => {
    const cards = { a: { dueAt: Date.now() - 1000 }, b: { dueAt: Date.now() - 5 }, c: { dueAt: Date.now() + DAY } };
    setup(prog({ cards }));
    await flush();
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
    const [title, opts] = reg.showNotification.mock.calls[0];
    expect(title).toBe("Đến giờ ôn từ vựng TOEIC");
    expect(opts.body).toContain("2 thẻ");
    expect(opts.tag).toBe("study-reminder");
    for (let i = 0; i < 6; i++) await act(async () => void (await vi.advanceTimersByTimeAsync(30000)));
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("toeic-recall-last-notified")).toBe(TODAY);
  });

  it("hôm nay đã học: không nhắc", async () => {
    setup(prog({ stats: { [TODAY]: { reviewed: 4 } } }));
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
  });

  it("đã nhắc hôm nay (ví dụ do service worker): không nhắc lại", async () => {
    localStorage.setItem("toeic-recall-last-notified", TODAY);
    setup(prog());
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
  });

  it("chưa được cấp quyền: không nhắc", async () => {
    stubBrowser({ permission: "default" });
    setup(prog());
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
  });

  it("tắt nhắc: không nhắc, không đăng ký đồng bộ nền", async () => {
    setup(prog({ settings: { reminder: { enabled: false, time: "20:00" } } }));
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
    expect(reg.periodicSync.register).not.toHaveBeenCalled();
  });

  it("chưa tới giờ: chờ, tới giờ thì nhắc", async () => {
    vi.setSystemTime(new Date(2026, 10, 19, 19, 58));
    setup(prog());
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3 * 60 * 1000)));
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
  });

  it("đổi giờ nhắc trong cài đặt có hiệu lực ngay", async () => {
    vi.setSystemTime(new Date(2026, 10, 19, 20, 30));
    const { rerender } = setup(prog({ settings: { reminder: { enabled: true, time: "22:00" } } }));
    await flush();
    expect(reg.showNotification).not.toHaveBeenCalled();
    rerender(prog({ settings: { reminder: { enabled: true, time: "20:15" } } }));
    await flush();
    expect(reg.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe("useReminder — đồng bộ nền & huy hiệu", () => {
  it("bật nhắc + có quyền: đăng ký đồng bộ nền định kỳ; tắt thì hủy", async () => {
    const { rerender } = setup(prog());
    await flush();
    expect(reg.periodicSync.register).toHaveBeenCalledWith("study-reminder", { minInterval: 3 * 3600 * 1000 });
    rerender(prog({ settings: { reminder: { enabled: false } } }));
    await flush();
    expect(reg.periodicSync.unregister).toHaveBeenCalledWith("study-reminder");
  });

  it("huy hiệu = số thẻ đến hạn; cập nhật khi số thẻ đổi", async () => {
    const mk = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { dueAt: Date.now() - 1000 }]));
    const { rerender } = setup(prog({ cards: mk(5) }));
    await flush();
    expect(badge.set).toHaveBeenLastCalledWith(5);
    rerender(prog({ cards: mk(2) }));
    await flush();
    expect(badge.set).toHaveBeenLastCalledWith(2);
    rerender(prog({ cards: {} }));
    await flush();
    expect(badge.clear).toHaveBeenCalled();
  });

  it("tắt huy hiệu hoặc tắt nhắc thì xóa huy hiệu", async () => {
    const cards = { a: { dueAt: Date.now() - 1 } };
    setup(prog({ cards, settings: { reminder: { enabled: true, time: "20:00", badge: false } } }));
    await flush();
    expect(badge.set).not.toHaveBeenCalled();
    expect(badge.clear).toHaveBeenCalled();
  });

  it("trình duyệt không có Badging API: không lỗi", async () => {
    stubBrowser({ withBadge: false });
    expect(() => setup(prog({ cards: { a: { dueAt: 1 } } }))).not.toThrow();
    await flush();
  });
});

describe("useReminder — mục tiêu tuần", () => {
  // tuần 16–22/11; mục tiêu 3 ngày
  const stats = (days) => Object.fromEntries(days.map((d) => [`2026-11-${d}`, { reviewed: 5 }]));

  it("chưa đạt: không chúc mừng", async () => {
    const { setToast, setProgress, result } = setup(prog({ stats: stats([16, 17]), settings: { weeklyGoal: 3 } }));
    await flush();
    expect(setToast).not.toHaveBeenCalled();
    expect(setProgress).not.toHaveBeenCalled();
    expect(result.current.week).toMatchObject({ done: 2, goal: 3, reached: false });
  });

  it("đạt mục tiêu: chúc mừng và ghi nhớ tuần đã chúc mừng", async () => {
    const { setToast, setProgress } = setup(prog({ stats: stats([16, 17, 19]), settings: { weeklyGoal: 3 } }));
    await flush();
    expect(setToast).toHaveBeenCalledTimes(1);
    expect(setToast.mock.calls[0][0]).toContain("Đạt mục tiêu tuần");
    const next = setProgress.mock.calls[0][0]({ settings: { weeklyGoal: 3 } });
    expect(next.settings.goalCelebrated).toBe("2026-11-16");
  });

  it("tuần này đã chúc mừng rồi: không chúc mừng lại", async () => {
    const { setToast } = setup(prog({ stats: stats([16, 17, 19]), settings: { weeklyGoal: 3, goalCelebrated: "2026-11-16" } }));
    await flush();
    expect(setToast).not.toHaveBeenCalled();
  });

  it("tuần mới lại được chúc mừng", async () => {
    vi.setSystemTime(new Date(2026, 10, 24, 10, 0)); // thứ Ba tuần sau
    const mk = renderHook(
      (p) => useReminder({ progress: p, setProgress: vi.fn(), today: "2026-11-24", setToast: vi.fn() }),
      { initialProps: prog({ stats: { "2026-11-23": { reviewed: 1 }, "2026-11-24": { reviewed: 1 } }, settings: { weeklyGoal: 2, goalCelebrated: "2026-11-16" } }) }
    );
    await flush();
    expect(mk.result.current.week.weekStart).toBe("2026-11-23");
    expect(mk.result.current.week.reached).toBe(true);
  });
});
