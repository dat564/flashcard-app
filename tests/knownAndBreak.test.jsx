// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

vi.mock("../src/lib/audio", () => ({
  preloadAudio: () => {},
  unlockAudio: () => {},
}));

import { useStudySession } from "../src/hooks/useStudySession";
import { nextSchedule } from "../src/lib/srs";
import { shouldBreak } from "../src/lib/chunks";
import { KNOWN_DAYS, CHUNK_SIZE } from "../src/lib/constants";

const TODAY = "2026-06-10";
const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, word: `w${i + 1}`, meaning: "x" }));

function setup(n = 4) {
  const WORDS = mk(n);
  return renderHook(() => {
    const [progress, setProgress] = useState({ cards: {}, stats: {} });
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
      newLimit: 200,
      tab: "study",
      setTab: () => {},
      setToast: () => {},
    });
    return { progress, study };
  });
}
const rate = (r, k) => {
  act(() => r.current.study.commit(k));
  act(() => vi.advanceTimersByTime(300));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("nextSchedule — đã biết", () => {
  it("hẹn KNOWN_DAYS ngày, độ khó thấp, không tính là lần quên", () => {
    const s = nextSchedule(undefined, "known");
    expect(s.interval).toBe(KNOWN_DAYS);
    expect(s.lapses).toBe(0);
    expect(s.stability).toBe(KNOWN_DAYS);
    expect(s.difficulty).toBeLessThanOrEqual(3);
    expect(s.dueAt).toBeGreaterThan(Date.now() + (KNOWN_DAYS - 1) * 864e5);
  });
});

describe("useStudySession — nút Đã biết", () => {
  it("từ mới: ghi lịch 30 ngày, không hỏi lại, không ghi nhật ký, đếm known", () => {
    const { result } = setup(4);
    act(() => result.current.study.startStudy("due"));
    rate(result, "known");
    const c = result.current.progress.cards[1];
    expect(c.interval).toBe(KNOWN_DAYS);
    expect(result.current.study.session).toEqual([1, 2, 3, 4]); // không chèn thẻ hỏi lại
    const day = result.current.progress.stats[TODAY];
    expect(day.reviewed).toBe(1);
    expect(day.newLearned).toBe(1);
    expect(day.known).toBe(1);
  });

  it("thẻ đã có lịch (ôn lại) thì bỏ qua phím 'đã biết'", () => {
    const { result } = setup(4);
    act(() => result.current.study.startStudy("due"));
    rate(result, "good"); // thẻ 1 thành thẻ đã học
    act(() => result.current.study.startStudy("last")); // luyện tập
    const before = result.current.progress.cards[1];
    rate(result, "known");
    expect(result.current.progress.cards[1]).toEqual(before);
  });

  it("hoàn tác trả thẻ về trạng thái chưa học và bỏ đếm known", () => {
    const { result } = setup(4);
    act(() => result.current.study.startStudy("due"));
    rate(result, "known");
    act(() => result.current.study.undoLast());
    expect(result.current.progress.cards[1]).toBeUndefined();
    expect(result.current.progress.stats[TODAY]).toBeUndefined();
  });
});

describe("nghỉ giữa phiên", () => {
  it("shouldBreak chỉ bật ở bội số của CHUNK_SIZE và khi còn nhiều thẻ", () => {
    expect(shouldBreak(CHUNK_SIZE, 100)).toBe(true);
    expect(shouldBreak(CHUNK_SIZE, 5)).toBe(false);
    expect(shouldBreak(CHUNK_SIZE - 1, 100)).toBe(false);
    expect(shouldBreak(0, 100)).toBe(false);
  });

  it("hiện màn hình nghỉ sau CHUNK_SIZE thẻ, học tiếp thì chạy tiếp từ thẻ kế", () => {
    const { result } = setup(CHUNK_SIZE + 30);
    act(() => result.current.study.startStudy("due"));
    // lượt hỏi lại không tính vào 50 thẻ, nên bấm cho tới khi màn hình nghỉ hiện ra
    for (let i = 0; i < 90 && !result.current.study.pause; i++) rate(result, i % 5 === 0 ? "again" : "good");
    const p = result.current.study.pause;
    expect(p).toBeTruthy();
    expect(p.done).toBe(CHUNK_SIZE);
    expect(p.good + p.again).toBe(CHUNK_SIZE);
    // đang nghỉ: bấm chấm thẻ không có tác dụng
    const before = result.current.progress.stats[TODAY].reviewed;
    rate(result, "good");
    expect(result.current.progress.stats[TODAY].reviewed).toBe(before);

    act(() => result.current.study.resumeFromBreak());
    expect(result.current.study.pause).toBeNull();
    rate(result, "good");
    expect(result.current.progress.stats[TODAY].reviewed).toBe(before + 1);
  });

  it("'Nghỉ ở đây' cho xem tổng kết phần đã học và xóa trạng thái nghỉ", () => {
    const { result } = setup(CHUNK_SIZE + 30);
    act(() => result.current.study.startStudy("due"));
    for (let i = 0; i < CHUNK_SIZE; i++) rate(result, "good");
    act(() => result.current.study.finishEarly());
    expect(result.current.study.pause).toBeNull();
    expect(result.current.study.session).toEqual([]);
    expect(result.current.study.summary).toBeTruthy();
  });

  it("phiên ngắn (≤ CHUNK_SIZE + 10 thẻ) không bị chen màn hình nghỉ", () => {
    const { result } = setup(CHUNK_SIZE + 5);
    act(() => result.current.study.startStudy("due"));
    for (let i = 0; i < CHUNK_SIZE; i++) rate(result, "good");
    expect(result.current.study.pause).toBeNull();
  });
});
