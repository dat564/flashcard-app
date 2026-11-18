// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { renderHook } from "@testing-library/react";
import { loadWords, words } from "../src/lib/words";
import { levelOf, zOf, orderNewWords, LEVEL_CUTS } from "../src/lib/levels";
import { useDeck } from "../src/hooks/useDeck";
import { mixKey } from "../src/lib/utils";

beforeAll(async () => {
  await loadWords();
});

describe("levelOf", () => {
  it("chia mức theo ngưỡng Zipf", () => {
    expect(LEVEL_CUTS).toEqual([5.0, 4.4]);
    expect(levelOf({ z: 7.2 })).toBe(1);
    expect(levelOf({ z: 5.0 })).toBe(1);
    expect(levelOf({ z: 4.99 })).toBe(2);
    expect(levelOf({ z: 4.4 })).toBe(2);
    expect(levelOf({ z: 4.39 })).toBe(3);
    expect(levelOf({ z: 2.1 })).toBe(3);
  });
  it("thiếu dữ liệu: coi là Trung cấp, không lỗi", () => {
    for (const w of [{}, { z: null }, { z: NaN }, { z: "5" }, undefined]) expect(levelOf(w)).toBe(2);
    expect(zOf({})).toBe(4.4);
  });
});

describe("dữ liệu từ vựng có độ phổ biến", () => {
  it("mọi từ đều có z hợp lệ", () => {
    for (const w of words) {
      expect(typeof w.z, w.word).toBe("number");
      expect(w.z).toBeGreaterThan(0);
      expect(w.z).toBeLessThan(8.5);
    }
  });
  it("ba mức đều đủ lớn (không dồn một mức)", () => {
    const n = { 1: 0, 2: 0, 3: 0 };
    words.forEach((w) => n[levelOf(w)]++);
    expect(n[1] + n[2] + n[3]).toBe(words.length);
    for (const l of [1, 2, 3]) expect(n[l]).toBeGreaterThan(700);
  });
});

describe("orderNewWords", () => {
  it("'phổ biến trước': nhóm 0,5 Zipf giảm dần, ổn định và không sửa mảng gốc", () => {
    const input = [...words];
    const a = orderNewWords(input, "common");
    const b = orderNewWords(input, "common");
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
    expect(input.map((w) => w.id)).toEqual(words.map((w) => w.id));
    const band = (w) => Math.floor(zOf(w) * 2);
    for (let i = 1; i < a.length; i++) expect(band(a[i])).toBeLessThanOrEqual(band(a[i - 1]));
  });

  it("toàn bộ từ Cơ bản được học trước các mức còn lại", () => {
    const a = orderNewWords(words, "common");
    const basics = words.filter((w) => levelOf(w) === 1).length;
    expect(a.slice(0, basics).every((w) => levelOf(w) === 1)).toBe(true);
    expect(a.slice(basics).some((w) => levelOf(w) === 1)).toBe(false);
  });

  it("trong cùng nhóm các từ được trộn (không theo bảng chữ cái)", () => {
    const first = orderNewWords(words, "common").slice(0, 60).map((w) => w.word.toLowerCase());
    expect(first).not.toEqual([...first].sort());
  });

  it("'ngẫu nhiên' = trộn ổn định toàn bộ, khác 'phổ biến trước'", () => {
    const r = orderNewWords(words, "random");
    expect(r.map((w) => w.id)).toEqual([...words].sort((a, b) => mixKey(a.id) - mixKey(b.id)).map((w) => w.id));
    expect(r.slice(0, 50).map((w) => w.id)).not.toEqual(orderNewWords(words, "common").slice(0, 50).map((w) => w.id));
  });
});

describe("useDeck — thứ tự từ mới", () => {
  const run = (settings, cards = {}, deckId = "main", lists = []) =>
    renderHook(() =>
      useDeck({ progress: { cards, stats: {}, settings, lists }, deckId, newLimit: 20, today: "2026-06-10" })
    ).result.current;

  it("mặc định học từ phổ biến trước", () => {
    const d = run({});
    const firstLevels = d.newWords.slice(0, 20).map(levelOf);
    expect(firstLevels.every((l) => l === 1)).toBe(true);
    expect(d.dueQueue.slice(0, 20).map((w) => w.id)).toEqual(d.newWords.slice(0, 20).map((w) => w.id));
  });

  it("đổi sang ngẫu nhiên thì thứ tự thay đổi", () => {
    const a = run({ newOrder: "common" }).newWords.slice(0, 30).map((w) => w.id);
    const b = run({ newOrder: "random" }).newWords.slice(0, 30).map((w) => w.id);
    expect(a).not.toEqual(b);
  });

  it("từ đã học không xuất hiện lại trong danh sách từ mới", () => {
    const d0 = run({});
    const learned = d0.newWords.slice(0, 5);
    const cards = Object.fromEntries(learned.map((w) => [w.id, { reps: 1, dueAt: Date.now() + 864e5 }]));
    const d1 = run({}, cards);
    expect(d1.newWords.some((w) => cards[w.id])).toBe(false);
    expect(d1.newWords[0].id).toBe(d0.newWords[5].id);
  });

  it("danh sách riêng giữ nguyên thứ tự người dùng nhập", () => {
    const mine = [{ id: "m1", word: "zebra", meaning: "x" }, { id: "m2", word: "apple", meaning: "y" }];
    const d = run({}, {}, "L1", [{ id: "L1", name: "Của tôi", words: mine }]);
    expect(d.newWords.map((w) => w.word)).toEqual(["zebra", "apple"]);
  });
});
