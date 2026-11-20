// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

vi.mock("../src/lib/audio", () => ({ preloadAudio: () => {}, unlockAudio: () => {} }));

import { useStudySession } from "../src/hooks/useStudySession";
import { getReviews, __resetStorageForTests } from "../src/lib/storage";

const WORDS = [1, 2, 3, 4].map((id) => ({ id, word: `w${id}`, meaning: `nghĩa ${id}` }));
const TODAY = "2026-06-10";
const NOW = new Date(2026, 5, 10, 10, 0).getTime();
const learned = (id) => ({ reps: 2, interval: 3, lapses: 0, dueAt: NOW - 1000, lastReviewed: NOW - 3 * 86400000, stability: 3, difficulty: 5 });

// due: các id đã học và đang đến hạn (thẻ ôn lại); các từ còn lại là từ mới
function setup({ due = [] } = {}) {
  return renderHook(() => {
    const [progress, setProgress] = useState({ cards: Object.fromEntries(due.map((id) => [id, learned(id)])), stats: {} });
    const data = {
      cards: progress.cards,
      deck: WORDS,
      wordById: new Map(WORDS.map((w) => [w.id, w])),
      newWords: WORDS.filter((w) => !progress.cards[w.id]),
      dueQueue: [...WORDS.filter((w) => progress.cards[w.id] && progress.cards[w.id].dueAt <= Date.now()), ...WORDS.filter((w) => !progress.cards[w.id])],
      hardIds: [],
    };
    const study = useStudySession({
      data,
      progress,
      setProgress,
      today: TODAY,
      speech: { speak: () => {}, autoSpeak: false, voiceMode: "browser" },
      deckId: "main",
      newLimit: 20,
      tab: "study",
      setTab: () => {},
      setToast: () => {},
    });
    return { progress, study };
  });
}

const rate = (r, k, ms = 2000) => {
  act(() => vi.advanceTimersByTime(ms)); // thời gian "suy nghĩ" trước khi chấm
  act(() => r.current.study.commit(k));
  act(() => vi.advanceTimersByTime(300));
};
const start = (r, mode = "due") => act(() => r.current.study.startStudy(mode));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  __resetStorageForTests();
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("tổng kết phiên — hết phiên", () => {
  it("phiên toàn từ mới, một từ quên rồi nhớ lại khi được hỏi lại", () => {
    const { result } = setup();
    start(result);
    expect(result.current.study.summary).toBeNull();
    rate(result, "again"); // w1 quên
    rate(result, "good");
    rate(result, "good");
    rate(result, "good");
    expect(result.current.study.current.id).toBe(1); // hỏi lại
    expect(result.current.study.summary).toBeNull(); // chưa hết phiên
    rate(result, "good");
    const s = result.current.study.summary;
    expect(result.current.study.session).toEqual([]);
    expect(s).toMatchObject({
      early: false,
      practice: false,
      total: 4,
      good: 3,
      again: 1,
      newCount: 4,
      newGood: 3,
      reviewCount: 0,
      reviewRate: null,
      relearnTotal: 1,
      relearnGood: 1,
      forgot: [1],
    });
    expect(s.rate).toBeCloseTo(0.75);
    expect(s.seconds).toBeGreaterThanOrEqual(10); // 5 lượt, mỗi lượt ~2 giây
  });

  it("thẻ ôn lại (đã học) được tính là ôn lại, không phải từ mới", () => {
    const { result } = setup({ due: [1, 2] });
    start(result);
    expect(result.current.study.session.slice(0, 2)).toEqual([1, 2]);
    rate(result, "good");
    rate(result, "again");
    rate(result, "good"); // từ mới
    rate(result, "good"); // từ mới
    rate(result, "good"); // hỏi lại w2
    const s = result.current.study.summary;
    expect(s).toMatchObject({ total: 4, reviewCount: 2, reviewGood: 1, newCount: 2, forgot: [2] });
    expect(s.reviewRate).toBeCloseTo(0.5);
  });

  it("nhật ký ôn có trường n: 1 cho từ mới, 0 cho thẻ ôn lại; lượt hỏi lại không ghi", async () => {
    const { result } = setup({ due: [1] });
    start(result);
    rate(result, "again"); // w1 (ôn lại) quên
    rate(result, "good"); // w2 mới
    rate(result, "good");
    rate(result, "good");
    rate(result, "good"); // hỏi lại w1
    const log = await getReviews();
    expect(log).toHaveLength(4);
    expect(log.find((e) => e.c === "1")).toMatchObject({ g: 1, n: 0 });
    expect(log.filter((e) => e.n === 1)).toHaveLength(3);
  });
});

describe("tổng kết phiên — kết thúc sớm / luyện tập / hoàn tác", () => {
  it("bấm X sau khi đã chấm 2 thẻ: tổng kết phần đã học, đánh dấu kết thúc sớm", () => {
    const { result } = setup();
    start(result);
    rate(result, "good");
    rate(result, "again");
    act(() => result.current.study.finishEarly());
    expect(result.current.study.session).toEqual([]);
    expect(result.current.study.summary).toMatchObject({ early: true, total: 2, good: 1, again: 1, forgot: [2] });
  });

  it("bấm X khi chưa chấm thẻ nào: không có tổng kết", () => {
    const { result } = setup();
    start(result);
    act(() => result.current.study.finishEarly());
    expect(result.current.study.summary).toBeNull();
    expect(result.current.study.session).toEqual([]);
  });

  it("luyện tập: ghi nhận là luyện tập và không coi là từ mới", () => {
    const { result } = setup();
    start(result, "all"); // luyện cả kho, có từ chưa học
    rate(result, "good");
    rate(result, "again");
    rate(result, "good");
    rate(result, "good");
    const s = result.current.study.summary;
    expect(s).toMatchObject({ practice: true, mode: "all", total: 4, newCount: 0, reviewCount: 4, relearnTotal: 0 });
  });

  it("hoàn tác bỏ lượt vừa chấm khỏi tổng kết", () => {
    const { result } = setup();
    start(result);
    rate(result, "good");
    rate(result, "again"); // w2 quên
    act(() => result.current.study.undoLast()); // hoàn tác w2
    rate(result, "good"); // chấm lại w2: nhớ
    rate(result, "good");
    rate(result, "good");
    const s = result.current.study.summary;
    expect(s).toMatchObject({ total: 4, good: 4, again: 0, relearnTotal: 0, forgot: [] });
  });

  it("bấm Xong (dismissSummary) và bắt đầu phiên mới đều xóa tổng kết", () => {
    const { result } = setup();
    start(result);
    for (let i = 0; i < 4; i++) rate(result, "good");
    expect(result.current.study.summary).not.toBeNull();
    act(() => result.current.study.dismissSummary());
    expect(result.current.study.summary).toBeNull();

    start(result, "all");
    for (let i = 0; i < 4; i++) rate(result, "good");
    expect(result.current.study.summary).not.toBeNull();
    start(result, "all");
    expect(result.current.study.summary).toBeNull();
  });

  it("endSession() (đổi bộ từ, đặt lại tiến độ) không để lại tổng kết", () => {
    const { result } = setup();
    start(result);
    rate(result, "good");
    act(() => result.current.study.endSession());
    expect(result.current.study.summary).toBeNull();
  });
});
