import { describe, it, expect } from "vitest";
import { makeBlank, buildBlankPool, buildQuizItems } from "../src/lib/quiz";

const w = (id, word, example, pos = "n.") => ({ id, word, example, pos, meaning: "x" });

describe("makeBlank", () => {
  it("khoét đúng từ gốc, giữ nguyên chữ hoa", () => {
    const b = makeBlank(w(1, "agenda", "The agenda was sent."));
    expect(b).toMatchObject({ kind: "base", shown: "agenda", before: "The ", after: " was sent." });
  });

  it("nhận dạng số nhiều, -ed, -ing", () => {
    expect(makeBlank(w(1, "report", "Two reports are due.")).kind).toBe("s");
    expect(makeBlank(w(2, "abandon", "They abandoned it.", "v.")).kind).toBe("ed");
    expect(makeBlank(w(3, "launch", "We are launching soon.", "v.")).kind).toBe("ing");
  });

  it("không khoét từ nằm trong từ khác", () => {
    expect(makeBlank(w(1, "act", "The factory is closed."))).toBeNull();
  });

  it("bỏ qua từ có ngoặc hoặc dấu gạch, ví dụ rỗng", () => {
    expect(makeBlank(w(1, "color (US)", "A color."))).toBeNull();
    expect(makeBlank(w(2, "a/b", "a/b test"))).toBeNull();
    expect(makeBlank(w(3, "word", ""))).toBeNull();
  });

  it("-ed/-ing của cụm từ không bị đoán", () => {
    expect(makeBlank(w(1, "pay off", "They paid off the loan.", "v."))).toBeNull();
  });
});

describe("buildQuizItems", () => {
  const deck = [
    w(1, "agenda", "The agenda was sent."),
    w(2, "budget", "The budget was approved."),
    w(3, "contract", "She signed the contract today."),
    w(4, "invoice", "Please pay the invoice now."),
    w(5, "venue", "The venue was booked."),
    w(6, "client", "Our client called."),
  ];

  it("mỗi câu có đúng 1 đáp án đúng trong các lựa chọn, không trùng nhau", () => {
    const pool = buildBlankPool(deck);
    const items = buildQuizItems({ blankPool: pool, deck, cards: {}, allWords: deck });
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.options).toContain(it.answer);
      expect(new Set(it.options.map((o) => o.toLowerCase())).size).toBe(it.options.length);
      expect(it.options.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("ưu tiên từ đã học", () => {
    const pool = buildBlankPool(deck);
    const cards = { 3: { reps: 1 } };
    for (let i = 0; i < 10; i++) {
      const items = buildQuizItems({ blankPool: pool, deck, cards, allWords: deck });
      expect(items[0].id).toBe(3);
    }
  });
});
