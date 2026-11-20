// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const rt = vi.hoisted(() => ({
  downloadText: vi.fn(),
  showReminder: vi.fn(async () => {}),
  syncPeriodic: vi.fn(async () => true),
}));
vi.mock("../src/lib/reminderRuntime", () => rt);

import ReminderSettings from "../src/components/stats/ReminderSettings";
import { weekProgress } from "../src/lib/reminder";

const week = weekProgress({}, "2026-11-19", 5);

function notif(permission, onRequest) {
  const N = vi.fn();
  N.permission = permission;
  N.requestPermission = vi.fn(async () => {
    const r = onRequest ?? permission;
    N.permission = r;
    return r;
  });
  vi.stubGlobal("Notification", N);
  return N;
}

function setup(settings = {}, props = {}) {
  const setProgress = vi.fn();
  const setToast = vi.fn();
  render(
    <ReminderSettings
      progress={{ settings, stats: {} }}
      setProgress={setProgress}
      setToast={setToast}
      week={week}
      dueCount={9}
      {...props}
    />
  );
  const apply = (call = 0, base = { settings }) => setProgress.mock.calls[call][0](base);
  return { setProgress, setToast, apply };
}

beforeEach(() => {
  Object.values(rt).forEach((f) => f.mockClear());
  Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const toggle = () => screen.getByRole("checkbox", { name: /Nhắc tôi học mỗi ngày/ });

describe("ReminderSettings — bật nhắc", () => {
  it("chưa có quyền: xin quyền, được cấp thì bật và đăng ký đồng bộ nền", async () => {
    const N = notif("default", "granted");
    const { setProgress, setToast, apply } = setup();
    fireEvent.click(toggle());
    await waitFor(() => expect(setProgress).toHaveBeenCalled());
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    expect(apply().settings.reminder).toMatchObject({ enabled: true, time: "20:00" });
    expect(rt.syncPeriodic).toHaveBeenCalledWith(true);
    expect(setToast.mock.calls[0][0]).toContain("Đã bật nhắc học");
  });

  it("đã có quyền: không hỏi lại", async () => {
    const N = notif("granted");
    const { setProgress } = setup();
    fireEvent.click(toggle());
    await waitFor(() => expect(setProgress).toHaveBeenCalled());
    expect(N.requestPermission).not.toHaveBeenCalled();
  });

  it("bị từ chối: không bật và giải thích", async () => {
    notif("default", "denied");
    const { setProgress, setToast } = setup();
    fireEvent.click(toggle());
    await waitFor(() => expect(setToast).toHaveBeenCalled());
    expect(setToast.mock.calls[0][0]).toContain("quyền");
    expect(setProgress).not.toHaveBeenCalled();
  });

  it("không có Notification API: không bật, hướng dẫn dùng lịch", async () => {
    vi.stubGlobal("Notification", undefined);
    const { setProgress, setToast } = setup();
    expect(screen.getByText(/không hỗ trợ thông báo/)).toBeTruthy();
    fireEvent.click(toggle());
    await waitFor(() => expect(setToast).toHaveBeenCalled());
    expect(setProgress).not.toHaveBeenCalled();
  });

  it("tắt nhắc: ghi enabled=false và hủy đồng bộ nền", async () => {
    notif("granted");
    const { setProgress, apply } = setup({ reminder: { enabled: true, time: "21:15" } });
    fireEvent.click(toggle());
    await waitFor(() => expect(setProgress).toHaveBeenCalled());
    expect(apply(0, { settings: { reminder: { enabled: true, time: "21:15" } } }).settings.reminder).toMatchObject({ enabled: false, time: "21:15" });
    expect(rt.syncPeriodic).toHaveBeenCalledWith(false);
  });
});

describe("ReminderSettings — gợi ý theo thiết bị", () => {
  it("iPhone chưa cài lên Màn hình chính: hướng dẫn cài trước", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    vi.stubGlobal("Notification", undefined);
    setup();
    expect(screen.getByText(/Thêm vào Màn hình chính/)).toBeTruthy();
  });

  it("quyền bị chặn: nhắc mở cài đặt trình duyệt", () => {
    notif("denied");
    setup();
    expect(screen.getByText(/đang bị chặn/)).toBeTruthy();
  });

  it("nút gửi thử chỉ bật khi đã có quyền, và truyền số thẻ đến hạn", async () => {
    notif("default");
    const { unmount } = render(<div />);
    unmount();
    cleanup();
    setup();
    expect(screen.getByRole("button", { name: /Gửi thông báo thử/ }).disabled).toBe(true);
    cleanup();
    notif("granted");
    setup();
    const b = screen.getByRole("button", { name: /Gửi thông báo thử/ });
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    await waitFor(() => expect(rt.showReminder).toHaveBeenCalledWith(9));
  });

  it("ô huy hiệu chỉ hiện khi trình duyệt hỗ trợ Badging API", () => {
    notif("granted");
    setup();
    expect(screen.queryByText(/số thẻ đến hạn trên biểu tượng/)).toBeNull();
    cleanup();
    Object.defineProperty(navigator, "setAppBadge", { value: () => {}, configurable: true });
    setup();
    expect(screen.getByText(/số thẻ đến hạn trên biểu tượng/)).toBeTruthy();
    delete navigator.setAppBadge;
  });
});

describe("ReminderSettings — giờ, lịch, mục tiêu", () => {
  it("đổi giờ nhắc", () => {
    notif("granted");
    const { setProgress, apply } = setup({ reminder: { enabled: true, time: "20:00" } });
    fireEvent.change(screen.getByLabelText(/Giờ nhắc/), { target: { value: "07:45" } });
    expect(setProgress).toHaveBeenCalled();
    expect(apply(0, { settings: { reminder: { enabled: true, time: "20:00" } } }).settings.reminder.time).toBe("07:45");
  });

  it("tải file .ics đúng giờ đã chọn", () => {
    notif("granted");
    const { setToast } = setup({ reminder: { enabled: true, time: "07:30" } });
    fireEvent.click(screen.getByRole("button", { name: /Thêm lời nhắc vào lịch/ }));
    expect(rt.downloadText).toHaveBeenCalledTimes(1);
    const [name, text, type] = rt.downloadText.mock.calls[0];
    expect(name).toBe("toeic-recall-nhac-hoc.ics");
    expect(type).toContain("text/calendar");
    expect(text).toMatch(/DTSTART:\d{8}T073000/);
    expect(text).toContain("RRULE:FREQ=DAILY");
    expect(setToast).toHaveBeenCalled();
  });

  it("mục tiêu tuần: hiển thị và chỉnh được", () => {
    notif("granted");
    const { setProgress, apply } = setup({ weeklyGoal: 4 });
    expect(screen.getByText("4 ngày/tuần")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Mục tiêu số ngày học mỗi tuần/), { target: { value: "6" } });
    expect(setProgress).toHaveBeenCalled();
    expect(apply().settings.weeklyGoal).toBe(6);
  });

  it("mục tiêu tuần chưa đặt: mặc định 5 ngày", () => {
    notif("granted");
    setup({});
    expect(screen.getByText("5 ngày/tuần")).toBeTruthy();
    expect(screen.getByText(/Tuần này: 0\/5 ngày/)).toBeTruthy();
  });
});
