// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

// Audio giả: ghi lại mọi lần phát
const plays = [];
const made = []; // mọi phần tử Audio đã tạo
let behavior = "ok"; // "ok" | "reject" | "hang"
class FakeAudio {
  constructor(src = "") {
    made.push(this);
    this.src = src;
    this.currentTime = 0;
    this.paused = true;
    this.listeners = {};
  }
  addEventListener(t, f) {
    (this.listeners[t] ||= []).push(f);
  }
  removeEventListener() {}
  play() {
    this.paused = false;
    plays.push(this.src);
    if (behavior === "reject") return Promise.reject(new Error("NotSupportedError"));
    if (behavior === "hang") return new Promise(() => {});
    if (behavior === "abortable")
      // đúng như trình duyệt thật: pause() khi play() chưa bắt đầu → AbortError
      return new Promise((_, rej) => (this._abort = () => rej(new DOMException("aborted", "AbortError"))));
    queueMicrotask(() => this.onplaying?.());
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this._abort?.();
    this._abort = null;
  }
  load() {}
}
vi.stubGlobal("Audio", FakeAudio);

import { loadWords, words } from "../src/lib/words";
import { audioEls } from "../src/lib/audio";
import { useStudySession } from "../src/hooks/useStudySession";
import { useSpeech } from "../src/hooks/useSpeech";

let WORDS;
const spoken = [];
beforeEach(async () => {
  plays.length = 0;
  made.length = 0;
  audioEls.clear(); // phần tử tải sẵn của test trước không được lọt sang test sau
  spoken.length = 0;
  behavior = "ok";
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(t) { this.text = t; } });
  localStorage.clear();
  await loadWords();
  WORDS = words.slice(0, 5);
  window.speechSynthesis = { cancel() {}, speak: (u) => spoken.push(u.text), getVoices: () => [], addEventListener() {}, removeEventListener() {} };
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 10, 10, 0));
});
afterEach(() => vi.useRealTimers());

function setup() {
  return renderHook(() => {
    const [progress, setProgress] = useState({ cards: {}, stats: {}, settings: {} });
    const speech = useSpeech();
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
      today: "2026-06-10",
      speech,
      deckId: "main",
      newLimit: 20,
      tab: "study",
      setTab: () => {},
      setToast: () => {},
    });
    return { study, speech };
  });
}

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};
const rate = async (r, k) => {
  act(() => r.current.study.commit(k));
  await flush();
};

describe("phát âm khi thẻ lặp lại (hỏi lại)", () => {
  it("thẻ hỏi lại tự đọc lại, và nút loa vẫn phát được", async () => {
    const { result } = setup();
    await flush();
    act(() => result.current.study.startStudy("due"));
    await flush();
    const first = WORDS[0].word;
    const slug = (w) => w.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const countOf = (w) => plays.filter((u) => u.includes(`/${slug(w)}.mp3`)).length;
    expect(countOf(first)).toBe(1); // đọc lúc bắt đầu

    await rate(result, "again"); // thẻ 1: Chưa nhớ → sẽ hỏi lại
    await rate(result, "good");
    await rate(result, "good");
    await rate(result, "good"); // sau 3 thẻ khác, thẻ 1 được hỏi lại
    await flush();
    // bây giờ thẻ hỏi lại (thẻ 1) đang hiện
    expect(result.current.study.current.id).toBe(WORDS[0].id);
    expect(result.current.study.relearning).toBe(true);
    const before = countOf(first);
    expect(before).toBeGreaterThanOrEqual(2); // đã tự đọc lại khi hiện lần 2

    // bấm nút loa
    act(() => result.current.speech.speak(first));
    await flush();
    expect(countOf(first)).toBe(before + 1);
  });

  it("mỗi lần đọc dùng phần tử Audio mới (không dùng lại phần tử đã phát)", async () => {
    const { result } = setup();
    await flush();
    const w = WORDS[0].word;
    act(() => result.current.speech.speak(w));
    await flush();
    act(() => result.current.speech.speak(w));
    await flush();
    act(() => result.current.speech.speak(w));
    await flush();
    const url = plays.filter((u) => u.includes("/" + w + ".mp3"));
    expect(url.length).toBe(3);
    const els = made.filter((a) => a.src.includes("/" + w + ".mp3"));
    expect(new Set(els).size).toBe(els.length); // không phần tử nào bị dùng lại
    expect(spoken).toEqual([]); // không phải chuyển sang giọng trình duyệt
  });

  it("file lỗi: tự chuyển sang giọng trình duyệt", async () => {
    const { result } = setup();
    await flush();
    behavior = "reject";
    act(() => result.current.speech.speak(WORDS[1].word));
    await flush();
    expect(spoken).toContain(WORDS[1].word);
  });

  it("file treo (không bắt đầu phát): sau ~1,5 giây chuyển sang giọng trình duyệt", async () => {
    const { result } = setup();
    await flush();
    behavior = "hang";
    act(() => result.current.speech.speak(WORDS[2].word));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(spoken).not.toContain(WORDS[2].word);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(spoken).toContain(WORDS[2].word);
  });

  it("phần tử báo lỗi (error event) cũng chuyển sang giọng trình duyệt", async () => {
    const { result } = setup();
    await flush();
    behavior = "hang"; // phát không bao giờ bắt đầu, chỉ có sự kiện error
    const w = WORDS[4].word;
    act(() => result.current.speech.speak(w));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50); // đủ để phần tử được tạo, chưa tới 1,5 giây
    });
    const a = made.find((el) => el.src.includes("/" + w + ".mp3") && el.onerror);
    expect(a).toBeTruthy();
    expect(spoken).not.toContain(w);
    act(() => a.onerror());
    expect(spoken).toContain(w);
  });
});

// ---------- Bất biến "một lần đọc = một giọng" ----------
describe("mỗi lần bấm chỉ được nghe MỘT giọng", () => {
  // Phát bằng Audio giả có thể điều khiển từng sự kiện; trả về {spoken, el}
  async function speakWord(idx, drive, mode = "hang") {
    const { result } = setup();
    await flush();
    audioEls.clear();
    spoken.length = 0;
    made.length = 0;
    plays.length = 0;
    behavior = mode; // play() không tự phát: test tự bắn sự kiện
    const w = WORDS[idx].word;
    act(() => result.current.speech.speak(w));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const el = made.find((a) => a.src.includes("/" + w + ".mp3") && a.onerror);
    expect(el).toBeTruthy();
    await drive(el);
    return { w, el };
  }

  it("lỗi tải: cả sự kiện error lẫn play() bị từ chối → giọng trình duyệt chỉ đọc 1 lần", async () => {
    const { w } = await speakWord(0, async (el) => {
      act(() => el.onerror());
      act(() => el.onerror());
    });
    expect(spoken.filter((t) => t === w)).toHaveLength(1);
  });

  it("quá 1,5 giây: chuyển giọng trình duyệt đúng 1 lần dù pause() làm play() bị từ chối", async () => {
    const { w, el } = await speakWord(1, async () => {}, "abortable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(spoken.filter((t) => t === w)).toHaveLength(1);
    expect(el.paused).toBe(true);
  });

  it("mp3 đến muộn sau khi đã đọc bằng giọng trình duyệt: mp3 bị chặn, không chồng giọng", async () => {
    const { w, el } = await speakWord(2, async () => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600); // hết 1,5 giây → giọng trình duyệt
      });
    });
    expect(spoken.filter((t) => t === w)).toHaveLength(1);
    el.paused = false;
    act(() => el.onplaying()); // mp3 cuối cùng cũng bắt đầu
    expect(el.paused).toBe(true); // bị dừng lại ngay
    expect(spoken.filter((t) => t === w)).toHaveLength(1);
  });

  it("mp3 đã phát: không bao giờ chuyển giọng trình duyệt (kể cả error/timer đến sau)", async () => {
    const { w, el } = await speakWord(3, async (el) => {
      act(() => el.onplaying());
    });
    act(() => el.onerror());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(spoken.filter((t) => t === w)).toHaveLength(0);
  });

  it("lần bấm mới thay lần cũ: lần cũ đến muộn không được đọc", async () => {
    const { result } = setup();
    await flush();
    audioEls.clear();
    spoken.length = 0;
    behavior = "hang";
    act(() => result.current.speech.speak(WORDS[0].word));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const old = made.find((a) => a.src.includes("/" + WORDS[0].word + ".mp3") && a.onerror);
    act(() => result.current.speech.speak(WORDS[1].word));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    // chỉ từ mới (lần bấm sau) được phép rơi về giọng trình duyệt; từ cũ phải im
    expect(spoken).not.toContain(WORDS[0].word);
    act(() => old.onerror?.());
    expect(spoken).not.toContain(WORDS[0].word);
  });
});
