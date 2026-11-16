// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { default_w } from "ts-fsrs";
import { simulateUser } from "./helpers";

const logs = { value: [] };
vi.mock("../src/lib/storage", () => ({
  getReviews: () => Promise.resolve(logs.value),
}));

import FsrsTuner from "../src/components/stats/FsrsTuner";

const trueW = Array.from(default_w).map((x, i) => (i === 8 ? x - 0.5 : i === 9 ? x + 0.25 : i === 11 ? x * 1.6 : x));

function setup(progress = { settings: {}, stats: {} }) {
  const setProgress = vi.fn();
  const setToast = vi.fn();
  render(<FsrsTuner progress={progress} setProgress={setProgress} setToast={setToast} />);
  return { setProgress, setToast };
}

beforeEach(() => cleanup());

describe("FsrsTuner (giao diện)", () => {
  it("chưa đủ dữ liệu: hiện số lượt đã ghi và khóa nút", async () => {
    logs.value = [{ c: "1", t: 1, g: 3 }];
    setup();
    await screen.findByText(/Đã ghi 1 lượt ôn trên 1 thẻ/);
    expect(screen.getByRole("button", { name: /Tối ưu theo lịch sử/ }).disabled).toBe(true);
  });

  it("đủ dữ liệu: chạy tối ưu, đề nghị và áp dụng tham số mới", async () => {
    logs.value = simulateUser(trueW, 450, 150, 7);
    const { setProgress, setToast } = setup();
    const btn = await screen.findByRole("button", { name: /Tối ưu theo lịch sử/ });
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);
    const apply = await screen.findByRole("button", { name: /Áp dụng tham số mới/ }, { timeout: 30000 });
    fireEvent.click(apply);

    expect(setProgress).toHaveBeenCalledTimes(1);
    const updater = setProgress.mock.calls[0][0];
    const next = updater({ settings: { newPerDay: 20 } });
    expect(next.settings.newPerDay).toBe(20); // giữ cài đặt khác
    expect(next.settings.fsrsWeights).toHaveLength(21);
    expect(next.settings.fsrsWeights.every(Number.isFinite)).toBe(true);
    expect(next.settings.fsrsTunedAt).toBeGreaterThan(0);
    expect(next.settings.fsrsTuneInfo.lossTuned).toBeLessThan(next.settings.fsrsTuneInfo.lossDefault);
    expect(setToast).toHaveBeenCalled();
  }, 60000);

  it("đang dùng tham số riêng: có nút quay về mặc định và xóa đúng các khóa", async () => {
    logs.value = [];
    const { setProgress } = setup({
      settings: { newPerDay: 15, fsrsWeights: Array.from(default_w), fsrsTunedAt: 1, fsrsTuneInfo: {} },
      stats: {},
    });
    fireEvent.click(await screen.findByRole("button", { name: /Quay về tham số mặc định/ }));
    const next = setProgress.mock.calls[0][0]({
      settings: { newPerDay: 15, fsrsWeights: [1], fsrsTunedAt: 1, fsrsTuneInfo: {} },
    });
    expect(next.settings).toEqual({ newPerDay: 15 });
  });
});
