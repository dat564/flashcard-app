import { describe, it, expect } from "vitest";
import { activeSeconds, summarizeSession, countDueBy, dueOutlook, fmtDuration, IDLE_CAP_MS } from "../src/lib/sessionSummary";

const DAY = 86400000;
const S = 1000;
const e = (id, r, t, extra = {}) => ({ id, r, isNew: false, pass: 1, t, ...extra });

describe("activeSeconds", () => {
  it("cộng khoảng cách giữa các lượt, khoảng đầu tính từ lúc bắt đầu", () => {
    expect(activeSeconds([e(1, "good", 5 * S), e(2, "good", 12 * S)], 0)).toBe(12);
  });
  it("nghỉ quá 60 giây chỉ tính 60 giây", () => {
    expect(IDLE_CAP_MS).toBe(60 * S);
    expect(activeSeconds([e(1, "good", 10 * S), e(2, "good", 10 * S + 30 * 60 * S)], 0)).toBe(10 + 60);
  });
  it("thời gian đảo ngược không làm âm", () => {
    expect(activeSeconds([e(1, "good", 5 * S), e(2, "good", 2 * S)], 0)).toBe(5);
  });
  it("không có lượt nào", () => expect(activeSeconds([], 0)).toBe(0));
});

describe("summarizeSession", () => {
  const entries = [
    e("a", "good", 1000, { isNew: true }),
    e("b", "again", 2000, { isNew: true }),
    e("c", "good", 3000),
    e("d", "again", 4000),
    e("e", "again", 5000),
    e("b", "good", 6000, { pass: 2 }), // hỏi lại: nhớ
    e("d", "again", 7000, { pass: 2 }), // hỏi lại: vẫn quên
  ];
  const s = summarizeSession({ entries, startedAt: 0, endedAt: 8000 });

  it("tổng số, nhớ/quên chỉ tính lượt chấm chính (pass 1)", () => {
    expect(s).toMatchObject({ total: 5, good: 2, again: 3 });
    expect(s.rate).toBeCloseTo(0.4);
  });
  it("tách từ mới và thẻ ôn lại", () => {
    expect(s).toMatchObject({ newCount: 2, newGood: 1, reviewCount: 3, reviewGood: 1 });
    expect(s.reviewRate).toBeCloseTo(1 / 3);
  });
  it("lượt hỏi lại tính riêng", () => {
    expect(s).toMatchObject({ relearnTotal: 2, relearnGood: 1 });
  });
  it("danh sách từ quên: không trùng, đúng thứ tự gặp", () => {
    expect(s.forgot).toEqual(["b", "d", "e"]);
  });
  it("thời gian học thực", () => expect(s.seconds).toBe(7));
  it("không có thẻ ôn lại → reviewRate = null; không có lượt nào → rate = null", () => {
    expect(summarizeSession({ entries: [e(1, "good", 1, { isNew: true })], startedAt: 0 }).reviewRate).toBeNull();
    expect(summarizeSession({ entries: [], startedAt: 0 }).rate).toBeNull();
  });
  it("mang theo cờ luyện tập / kết thúc sớm / chế độ", () => {
    const x = summarizeSession({ entries, startedAt: 0, practice: true, early: true, mode: "hard" });
    expect(x).toMatchObject({ practice: true, early: true, mode: "hard" });
  });
});

describe("dueOutlook / countDueBy", () => {
  const now = new Date(2026, 10, 19, 15, 0).getTime();
  const midnight = (n) => new Date(2026, 10, 19 + n, 0, 0).getTime();
  const cards = {
    overdue: { dueAt: midnight(-3) },
    today: { dueAt: midnight(0) },
    tomorrow1: { dueAt: midnight(1) },
    tomorrow2: { dueAt: midnight(1) },
    dayAfter: { dueAt: midnight(2) },
    noDue: {},
    nothing: null,
  };
  it("còn đến hạn hôm nay và thêm bao nhiêu thẻ đến hạn ngày mai", () => {
    expect(dueOutlook(cards, now)).toEqual({ dueNow: 2, dueTomorrow: 2 });
  });
  it("thẻ ngày kia không tính", () => {
    expect(countDueBy(cards, midnight(2) - 1)).toBe(4);
  });
  it("không có thẻ nào", () => {
    expect(dueOutlook({}, now)).toEqual({ dueNow: 0, dueTomorrow: 0 });
    expect(dueOutlook(undefined, now)).toEqual({ dueNow: 0, dueTomorrow: 0 });
  });
});

describe("fmtDuration", () => {
  it("định dạng", () => {
    expect(fmtDuration(0)).toBe("0 giây");
    expect(fmtDuration(45)).toBe("45 giây");
    expect(fmtDuration(60)).toBe("1 phút");
    expect(fmtDuration(125)).toBe("2 phút 5 giây");
  });
});
