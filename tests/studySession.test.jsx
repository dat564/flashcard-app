// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

vi.mock("../src/lib/audio", () => ({
  preloadAudio: () => {},
  unlockAudio: () => {},
}));

import { useStudySession } from "../src/hooks/useStudySession";

const WORDS = [1, 2, 3, 4].map((id) => ({ id, word: `w${id}`, meaning: "x" }));
const TODAY = "2026-06-10";

// Dựng hook cùng state tiến độ thật, giống App.jsx
function setup(initial = {}) {
  return renderHook(() => {
    const [progress, setProgress] = useState({ cards: {}, stats: {}, ...initial });
    const wordById = new Map(WORDS.map((w) => [w.id, w]));
    const data = {
      cards: progress.cards,
      deck: WORDS,
      wordById,
      newWords: WORDS.filter((w) => !progress.cards[w.id]),
      dueQueue: WORDS.filter((w) => !progress.cards[w.id]),
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

// commit() chờ 240ms (hiệu ứng bay thẻ) rồi mới ghi kết quả
const rate = (r, k) => {
  act(() => r.current.study.commit(k));
  act(() => vi.advanceTimersByTime(300));
};
const ids = (r) => r.current.study.session;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useStudySession — hỏi lại thẻ sai", () => {
  it("thẻ sai quay lại sau 3 thẻ, lịch đã hẹn ngày mai ngay lần sai đầu", () => {
    const { result } = setup();
    act(() => result.current.study.startStudy("due"));
    expect(ids(result)).toEqual([1, 2, 3, 4]);

    rate(result, "again"); // thẻ 1 sai
    expect(ids(result)).toEqual([1, 2, 3, 4, 1]);
    expect(result.current.study.index).toBe(1);
    const c1 = result.current.progress.cards[1];
    expect(c1.lapses).toBe(1);
    expect(c1.reps).toBe(0);
    expect(c1.dueAt).toBeGreaterThan(Date.now());
  });

  it("nhớ ở lượt hỏi lại: hết phiên, KHÔNG đổi lịch và không đếm thêm thống kê", () => {
    const { result } = setup();
    act(() => result.current.study.startStudy("due"));
    rate(result, "again");
    const before = result.current.progress.cards[1];
    rate(result, "good");
    rate(result, "good");
    rate(result, "good");
    expect(result.current.study.current.id).toBe(1);
    expect(result.current.study.relearning).toBe(true);

    rate(result, "good");
    expect(ids(result)).toEqual([]); // hết phiên
    expect(result.current.progress.cards[1]).toEqual(before);
    const day = result.current.progress.stats[TODAY];
    expect(day.reviewed).toBe(4); // 4 thẻ, không tính lượt hỏi lại
    expect(day.correct).toBe(3);
    expect(day.newLearned).toBe(4);
  });

  it("chỉ hỏi lại 1 lần: sai tiếp ở lượt hỏi lại vẫn kết thúc, lịch giữ nguyên", () => {
    const { result } = setup();
    act(() => result.current.study.startStudy("due"));
    rate(result, "again");
    const before = result.current.progress.cards[1];
    rate(result, "good");
    rate(result, "good");
    rate(result, "good");
    expect(result.current.study.current.id).toBe(1);
    rate(result, "again"); // sai lần 2: KHÔNG hỏi thêm
    expect(ids(result)).toEqual([]);
    expect(result.current.progress.cards[1]).toEqual(before);
    expect(result.current.progress.cards[1].lapses).toBe(1);
    expect(result.current.progress.stats[TODAY].reviewed).toBe(4);
  });

  it("luyện tập không hỏi lại và không đổi lịch", () => {
    const learned = {
      cards: { 1: { reps: 2, interval: 3, ease: 2.5, lapses: 0, dueAt: 1 } },
    };
    const { result } = setup(learned);
    act(() => result.current.study.startStudy("learned"));
    expect(result.current.study.practice).toBe(true);
    rate(result, "again");
    expect(result.current.progress.cards[1].lapses).toBe(0);
    expect(ids(result)).toEqual([]);
  });

  it("hoàn tác thẻ sai: trả lại phiên, lịch và danh sách hỏi lại", () => {
    const { result } = setup();
    act(() => result.current.study.startStudy("due"));
    rate(result, "again");
    act(() => result.current.study.undoLast());
    expect(ids(result)).toEqual([1, 2, 3, 4]);
    expect(result.current.study.index).toBe(0);
    expect(result.current.progress.cards[1]).toBeUndefined();
    expect(result.current.progress.stats[TODAY]).toBeUndefined();
    expect(result.current.study.relearning).toBe(false);
  });
});
