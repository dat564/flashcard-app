// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

// Chỉ giả lập phần trình duyệt mà jsdom không có
vi.stubGlobal("matchMedia", (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.matchMedia = globalThis.matchMedia;
window.scrollTo = () => {};
vi.stubGlobal("Audio", class { play() { return Promise.resolve(); } pause() {} addEventListener() {} });

describe("App — smoke test (nối nhắc học & mục tiêu tuần)", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("màn hình học hiện dải tuần; tab Thống kê có panel Nhắc học", async () => {
    const { loadWords } = await import("../src/lib/words");
    const { initStorage } = await import("../src/lib/storage");
    await loadWords();
    await initStorage();
    const { default: App } = await import("../src/App.jsx");
    render(<App />);

    // Màn hình học: dải tuần với mục tiêu mặc định 5 ngày
    expect(await screen.findByText(/Tuần này: 0\/5 ngày/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /Tiến độ học tuần này/ })).toBeTruthy();

    // Tab Thống kê: panel mới + dải tuần thứ hai
    const statsTab = screen.getAllByRole("button").find((b) => /thống kê/i.test(b.textContent || ""));
    expect(statsTab).toBeTruthy();
    fireEvent.click(statsTab);
    await waitFor(() => expect(screen.getByText(/Nhắc học & mục tiêu tuần/)).toBeTruthy());
    expect(screen.getByRole("checkbox", { name: /Nhắc tôi học mỗi ngày/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Thêm lời nhắc vào lịch/ })).toBeTruthy();
    expect(screen.getAllByText(/Tuần này: 0\/5 ngày/).length).toBeGreaterThanOrEqual(1);
  }, 60000);
});
