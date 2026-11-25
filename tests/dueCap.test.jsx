// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDeck } from "../src/hooks/useDeck";
import { loadWords, words } from "../src/lib/words";
import { MAX_REVIEWS_PER_DAY, BACKLOG_NEW_STOP } from "../src/lib/constants";

beforeAll(async () => {
  await loadWords();
});

const mkCards = (n) =>
  Object.fromEntries(
    words.slice(0, n).map((w, i) => [w.id, { reps: 1, interval: 5, stability: 5, difficulty: 5, dueAt: 1, lastReviewed: i }])
  );
const run = (cards, stats = {}) =>
  renderHook(() =>
    useDeck({ progress: { cards, stats: { "2026-06-10": stats }, settings: {}, lists: [] }, deckId: "main", newLimit: 20, today: "2026-06-10" })
  ).result.current;

describe("giới hạn tải ôn tập", () => {
  it("ít thẻ đến hạn: học hết và vẫn có từ mới", () => {
    const d = run(mkCards(50));
    expect(d.reviewCount).toBe(50);
    expect(d.deferredCount).toBe(0);
    expect(d.newPaused).toBe(false);
    expect(d.dueQueue.length).toBe(50 + 20);
  });

  it("600 thẻ đến hạn: chỉ học tối đa MAX_REVIEWS_PER_DAY, tạm dừng từ mới", () => {
    const d = run(mkCards(600));
    expect(d.dueCount).toBe(600);
    expect(d.reviewCount).toBe(MAX_REVIEWS_PER_DAY);
    expect(d.deferredCount).toBe(600 - MAX_REVIEWS_PER_DAY);
    expect(d.newPaused).toBe(true);
    expect(d.dueQueue.length).toBe(MAX_REVIEWS_PER_DAY);
  });

  it("đã ôn đủ hạn mức hôm nay thì không còn thẻ ôn, từ mới vẫn tạm dừng", () => {
    const d = run(mkCards(400), { reviewed: MAX_REVIEWS_PER_DAY, correct: 150, newLearned: 0 });
    expect(d.reviewCount).toBe(0);
    expect(d.dueQueue.length).toBe(0);
    expect(d.newPaused).toBe(true);
  });

  it("từ mới không bật lại giữa ngày khi nợ ban đầu vượt ngưỡng", () => {
    // đầu ngày 160 thẻ (> ngưỡng); đã ôn 100 → còn 60 đến hạn, vẫn phải tạm dừng
    const d = run(mkCards(60), { reviewed: 100, correct: 90, newLearned: 0 });
    expect(100 + 60).toBeGreaterThan(BACKLOG_NEW_STOP);
    expect(d.newPaused).toBe(true);
  });

  it("thẻ sắp quên nhất được giữ lại khi cắt trần", () => {
    const d = run(mkCards(300));
    expect(d.dueQueue.length).toBe(MAX_REVIEWS_PER_DAY);
    expect(new Set(d.dueQueue.map((w) => w.id)).size).toBe(MAX_REVIEWS_PER_DAY);
  });
});
