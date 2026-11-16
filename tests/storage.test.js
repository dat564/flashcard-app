import { describe, it, expect } from "vitest";
import { mergeProgress } from "../src/lib/storage";

const card = (t, extra = {}) => ({ lastReviewed: t, reps: 1, ...extra });

describe("mergeProgress", () => {
  it("mỗi từ giữ bản ôn gần nhất", () => {
    const a = { cards: { 1: card(100, { reps: 2 }), 2: card(500) } };
    const b = { cards: { 1: card(300, { reps: 5 }), 3: card(50) } };
    const m = mergeProgress(a, b);
    expect(m.cards[1].reps).toBe(5);
    expect(m.cards[2].lastReviewed).toBe(500);
    expect(m.cards[3].lastReviewed).toBe(50);
  });

  it("thống kê từng ngày lấy số lớn hơn", () => {
    const a = { stats: { "2026-06-01": { reviewed: 10, correct: 8, newLearned: 5 } } };
    const b = { stats: { "2026-06-01": { reviewed: 7, correct: 9, newLearned: 2, practiced: 4 } } };
    expect(mergeProgress(a, b).stats["2026-06-01"]).toEqual({
      reviewed: 10, correct: 9, newLearned: 5, practiced: 4,
    });
  });

  it("danh sách riêng gộp theo id, không nhân đôi", () => {
    const a = { lists: [{ id: "l1", words: [] }] };
    const b = { lists: [{ id: "l1", words: [1] }, { id: "l2", words: [] }] };
    const m = mergeProgress(a, b);
    expect(m.lists.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(m.lists[0].words).toEqual([]); // bản đang dùng được ưu tiên
  });

  it("bỏ dữ liệu cũ hơn mốc đặt lại (resetAt)", () => {
    const reset = new Date(2026, 5, 10).getTime();
    const a = { resetAt: reset, cards: { 1: card(reset + 10) } };
    const b = {
      cards: { 2: card(reset - 10) },
      stats: { "2026-06-01": { reviewed: 3 } },
    };
    const m = mergeProgress(a, b);
    expect(Object.keys(m.cards)).toEqual(["1"]);
    expect(m.stats["2026-06-01"]).toBeUndefined();
  });

  it("chịu được đầu vào thiếu trường", () => {
    expect(() => mergeProgress({}, {})).not.toThrow();
  });
});
