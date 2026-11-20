// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const logs = { value: [] };
vi.mock("../src/lib/storage", () => ({ getReviews: () => Promise.resolve(logs.value) }));

import RetentionPanel from "../src/components/stats/RetentionPanel";

const DAY = 86400000;
const NOW = new Date(2026, 10, 19, 12, 0).getTime();

// n lượt ôn lại trong `daysAgo` ngày trước, ok lượt nhớ
const reviews = (n, ok, daysAgo, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ c: `c${offset + i}`, t: NOW - daysAgo * DAY - i * 1000, g: i < ok ? 3 : 1, n: 0 }));

function setup(settings = {}) {
  const setProgress = vi.fn();
  const { container } = render(<RetentionPanel progress={{ settings, stats: {} }} setProgress={setProgress} />);
  return { setProgress, container };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RetentionPanel", () => {
  it("chưa có nhật ký: báo chưa đủ dữ liệu", async () => {
    logs.value = [];
    setup();
    expect(await screen.findByText(/Chưa đủ dữ liệu: cần thêm 30 lượt/)).toBeTruthy();
    expect(screen.getAllByText("—").length).toBe(3);
  });

  it("hiện 3 ô 7 ngày / 30 ngày / tất cả với số lượt", async () => {
    logs.value = [...reviews(10, 9, 2), ...reviews(20, 10, 15, 100), ...reviews(10, 10, 90, 200)];
    setup();
    await screen.findByText("7 ngày (10 lượt)");
    expect(screen.getByText("30 ngày (30 lượt)")).toBeTruthy();
    expect(screen.getByText("Tất cả (40 lượt)")).toBeTruthy();
    expect(screen.getByText("90%", { selector: "strong" })).toBeTruthy(); // 7 ngày: 9/10
    expect(screen.getByText("63%", { selector: "strong" })).toBeTruthy(); // 30 ngày: 19/30
  });

  it("khớp mục tiêu: không có nút đổi", async () => {
    logs.value = reviews(100, 90, 5);
    setup();
    expect(await screen.findByText(/Khớp với mục tiêu 90%/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Đặt mức nhớ mục tiêu/ })).toBeNull();
  });

  it("thấp hơn mục tiêu: gợi ý và nút áp dụng đặt đúng mức", async () => {
    logs.value = reviews(100, 70, 5);
    const { setProgress } = setup({ newPerDay: 20 });
    expect(await screen.findByText(/Thấp hơn mục tiêu 90%/)).toBeTruthy();
    expect(screen.getByText(/tăng mức nhớ mục tiêu lên 96%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Đặt mức nhớ mục tiêu 96%" }));
    const next = setProgress.mock.calls[0][0]({ settings: { newPerDay: 20, retention: 0.9 } });
    expect(next.settings).toEqual({ newPerDay: 20, retention: 0.96 });
  });

  it("cao hơn mục tiêu: chỉ thông báo, không nút", async () => {
    logs.value = reviews(100, 99, 5);
    setup();
    expect(await screen.findByText(/Cao hơn mục tiêu 90%/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Đặt mức nhớ mục tiêu/ })).toBeNull();
  });

  it("dùng mức nhớ mục tiêu đã cài đặt để so sánh", async () => {
    logs.value = reviews(100, 90, 5);
    setup({ retention: 0.97 });
    expect(await screen.findByText(/Thấp hơn mục tiêu 97%/)).toBeTruthy();
  });

  it("đánh giá theo 30 ngày nếu đủ lượt, không thì theo toàn bộ nhật ký", async () => {
    logs.value = [...reviews(40, 36, 10), ...reviews(60, 20, 100, 500)];
    setup();
    expect(await screen.findByText(/30 ngày gần nhất/)).toBeTruthy();
    cleanup();
    logs.value = [...reviews(10, 9, 10), ...reviews(60, 54, 100, 500)];
    setup();
    expect(await screen.findByText(/toàn bộ nhật ký/)).toBeTruthy();
  });

  it("biểu đồ 8 tuần, tuần ít lượt bị làm mờ, có đường mục tiêu", async () => {
    logs.value = [...reviews(30, 27, 2), ...reviews(4, 4, 20, 300)];
    const { container } = setup();
    await screen.findByText(/Tính từ 34 lượt đã ghi/);
    const bars = container.querySelectorAll(".rbar");
    expect(bars).toHaveLength(8);
    expect(container.querySelectorAll(".rbar.faint").length).toBe(7); // chỉ tuần hiện tại có ≥ 10 lượt
    expect(container.querySelector(".target-line").style.getPropertyValue("--tp")).toBe("0.9");
    const last = bars[7];
    expect(last.getAttribute("title")).toMatch(/90% \(30 lượt\)/);
    expect(bars[0].getAttribute("title")).toMatch(/chưa có lượt ôn lại/);
  });

  it("chú thích nói rõ cái gì không được tính", async () => {
    logs.value = reviews(5, 5, 1);
    setup();
    expect(await screen.findByText(/Không tính lần học đầu của từ mới, luyện tập và lượt hỏi lại/)).toBeTruthy();
  });
});
