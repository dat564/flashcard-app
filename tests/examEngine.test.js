// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { loadWords } from "../src/lib/words";
import {
  applyMistakes,
  buildMiniTest,
  fmtTime,
  lookupWord,
  makeAttempt,
  pickUnits,
  scoreAttempt,
  sentenceAround,
  summarizeAttempts,
} from "../src/lib/examEngine";

beforeAll(async () => {
  await loadWords();
});

const unit = (id, part, n = 1, answers = []) => ({
  id,
  part,
  questions: Array.from({ length: n }, (_, i) => ({
    id: `${id}/q${i + 1}`,
    options: ["a", "b", "c", "d"],
    answer: answers[i] ?? 0,
    tags: [`tag-${part}`],
  })),
});
const first = () => 0; // rnd cố định → thứ tự xáo trộn ổn định

describe("pickUnits", () => {
  const units = [unit("a", 5), unit("b", 5), unit("c", 5), unit("d", 6)];
  it("chỉ lấy đúng Part và dừng khi đủ số câu", () => {
    const r = pickUnits({ units, part: 5, target: 2, rnd: first });
    expect(r).toHaveLength(2);
    expect(r.every((u) => u.part === 5)).toBe(true);
  });
  it("ưu tiên đề chưa làm, rồi đề từng sai, rồi đề đã làm đúng", () => {
    const r = pickUnits({
      units,
      part: 5,
      target: 3,
      seen: new Set(["a", "b"]),
      mistakeUnits: new Set(["b"]),
      rnd: first,
    });
    expect(r.map((u) => u.id)).toEqual(["c", "b", "a"]);
  });
  it("luôn lấy ít nhất một đơn vị dù đơn vị dài hơn target", () => {
    expect(pickUnits({ units: [unit("x", 7, 5)], part: 7, target: 2 })).toHaveLength(1);
  });
  it("không có đề thì trả mảng rỗng", () => {
    expect(pickUnits({ units, part: 2 })).toEqual([]);
  });
});

describe("buildMiniTest", () => {
  it("xếp theo thứ tự Part 1→7 và bỏ qua Part không có đề", () => {
    const us = [unit("r", 7, 3), unit("l", 2), unit("m", 5)];
    const r = buildMiniTest(us, { rnd: first });
    expect(r.map((u) => u.part)).toEqual([2, 5, 7]);
  });
});

describe("scoreAttempt", () => {
  const us = [unit("a", 5, 1, [1]), unit("b", 3, 2, [0, 2])];
  it("đếm đúng, sai, chưa trả lời theo Part và theo dạng câu", () => {
    const s = scoreAttempt(us, { "a/q1": 1, "b/q1": 3 }); // đúng, sai, bỏ trống
    expect(s.total).toBe(3);
    expect(s.correct).toBe(1);
    expect(s.answered).toBe(2);
    expect(s.wrong).toEqual(["b/q1"]);
    expect(s.perPart[5]).toEqual({ n: 1, c: 1 });
    expect(s.perPart[3]).toEqual({ n: 2, c: 0 });
    expect(s.tags["tag-3"]).toEqual([0, 2]);
  });
  it("makeAttempt ghi part = 0 khi trộn nhiều Part", () => {
    expect(makeAttempt({ units: us, answers: {}, secs: 12.4, mode: "test", title: "x" }).part).toBe(0);
    expect(makeAttempt({ units: [us[0]], answers: {}, secs: 1, mode: "practice", title: "x" }).part).toBe(5);
  });
});

describe("applyMistakes", () => {
  const us = [unit("a", 5, 1, [1])];
  it("sai thì thêm, đúng thì bỏ, chưa trả lời thì giữ nguyên", () => {
    let m = applyMistakes({}, us, { "a/q1": 0 }, 10);
    expect(m["a/q1"]).toEqual({ unitId: "a", t: 10 });
    expect(applyMistakes(m, us, {}, 11)["a/q1"]).toBeDefined();
    expect(applyMistakes(m, us, { "a/q1": 1 }, 12)["a/q1"]).toBeUndefined();
  });
});

describe("summarizeAttempts", () => {
  it("cộng dồn theo Part và tìm dạng câu yếu (cần ≥ 4 câu)", () => {
    const att = [
      { perPart: { 5: { n: 6, c: 3 } }, tags: { Giới_từ: [1, 4], Khác: [2, 2] } },
      { perPart: { 5: { n: 4, c: 4 } }, tags: { Giới_từ: [0, 2] } },
    ];
    const s = summarizeAttempts(att);
    expect(s.perPart[5]).toMatchObject({ n: 10, c: 7 });
    expect(s.total).toBe(10);
    expect(s.weakTags.map((t) => t.tag)).toEqual(["Giới_từ"]);
    expect(s.weakTags[0].acc).toBeCloseTo(1 / 6);
  });
  it("không có dữ liệu thì không lỗi", () => {
    expect(summarizeAttempts([]).total).toBe(0);
  });
});

describe("tra từ", () => {
  it("tìm được dạng gốc của từ biến hình", () => {
    expect(lookupWord("garages")?.word).toBe("garage");
    expect(lookupWord("Abandoning,")?.word).toBe("abandon");
  });
  it("từ không có trong kho thì null", () => {
    expect(lookupWord("zzzqx")).toBeNull();
    expect(lookupWord("123")).toBeNull();
  });
  it("lấy câu chứa từ", () => {
    const t = "First sentence here. The garage is open! Last one.";
    expect(sentenceAround(t, t.indexOf("garage"))).toBe("The garage is open!");
    expect(sentenceAround(t, 2)).toBe("First sentence here.");
  });
});

describe("fmtTime", () => {
  it("định dạng m:ss", () => {
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(0)).toBe("0:00");
  });
});
