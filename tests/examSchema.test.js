import { describe, it, expect } from "vitest";
import {
  answerIndex,
  csvToRaw,
  examCsvTemplate,
  examTemplate,
  normalizeSet,
  parseCsv,
  parseExamText,
  parseTranscript,
} from "../src/lib/examSchema";

const q = (extra = {}) => ({ text: "Q?", options: ["a", "b", "c", "d"], answer: "B", ...extra });

describe("answerIndex", () => {
  it("nhận chữ cái và số bắt đầu từ 1", () => {
    expect(answerIndex("a", 4)).toBe(0);
    expect(answerIndex("D", 4)).toBe(3);
    expect(answerIndex(2, 4)).toBe(1);
    expect(answerIndex("3", 4)).toBe(2);
  });
  it("ngoài phạm vi thì -1", () => {
    expect(answerIndex("E", 4)).toBe(-1);
    expect(answerIndex(0, 4)).toBe(-1);
    expect(answerIndex("", 4)).toBe(-1);
  });
});

describe("parseTranscript", () => {
  it("tách người nói", () => {
    expect(parseTranscript("Woman: Hi there\nMan: Hello")).toEqual([
      { speaker: "Woman", text: "Hi there" },
      { speaker: "Man", text: "Hello" },
    ]);
  });
  it("câu không có người nói", () => {
    expect(parseTranscript(["Where is it?"])).toEqual([{ speaker: "", text: "Where is it?" }]);
  });
});

describe("normalizeSet", () => {
  it("nhận file mẫu không lỗi", () => {
    const r = normalizeSet(examTemplate(), { fixedId: "t" });
    expect(r.errors).toEqual([]);
    expect(r.set.units).toHaveLength(5);
    expect(r.set.units[0].questions[0].id).toBe("t/u1/q1");
    expect(r.set.units[0].questions[0].answer).toBe(0);
  });
  it("bỏ đơn vị lỗi nhưng giữ đơn vị tốt", () => {
    const r = normalizeSet({ units: [{ part: 5, questions: [q()] }, { part: 9, questions: [q()] }, { part: 5, questions: [q({ answer: "Z" })] }] });
    expect(r.set.units).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(2); // một thông báo cho part sai, một (hoặc hơn) cho đáp án sai
  });
  it("Part nghe cần transcript hoặc audio; Part 6/7 cần đoạn văn", () => {
    expect(normalizeSet({ units: [{ part: 3, questions: [q()] }] }).set).toBeNull();
    expect(normalizeSet({ units: [{ part: 7, questions: [q()] }] }).set).toBeNull();
    expect(normalizeSet({ units: [{ part: 3, audio: "https://x/y.mp3", questions: [q()] }] }).set).not.toBeNull();
  });
  it("Part 2 cần đúng 3 đáp án trở lên", () => {
    const r = normalizeSet({ units: [{ part: 2, transcript: ["Hi?"], questions: [{ options: ["a", "b"], answer: "A" }] }] });
    expect(r.set).toBeNull();
  });
  it("ảnh không hợp lệ bị bỏ kèm cảnh báo", () => {
    const r = normalizeSet({ units: [{ part: 1, image: "javascript:alert(1)", transcript: ["x"], questions: [q()] }] });
    expect(r.set.units[0].image).toBe("");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("mảng đơn vị trần cũng được", () => {
    expect(normalizeSet([{ part: 5, questions: [q()] }]).set.units).toHaveLength(1);
  });
  it("sai cấu trúc thì báo lỗi", () => {
    expect(normalizeSet({ foo: 1 }).set).toBeNull();
    expect(normalizeSet(null).set).toBeNull();
  });
});

describe("CSV", () => {
  it("đọc dấu nháy kép, dấu phẩy và xuống dòng trong ô", () => {
    expect(parseCsv('a,b\n"x, y","l1\nl2"\n')).toEqual([["a", "b"], ["x, y", "l1\nl2"]]);
  });
  it("tự nhận dấu chấm phẩy và tab", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("các dòng cùng unit gộp thành một đơn vị", () => {
    const raw = csvToRaw(examCsvTemplate());
    const conv = raw.units.find((u) => u.part === "3");
    expect(conv.questions).toHaveLength(2);
  });
  it("file CSV mẫu nhập được", () => {
    const r = parseExamText(examCsvTemplate(), "mau.csv");
    expect(r.errors).toEqual([]);
    expect(r.set.units.map((u) => u.part)).toEqual([5, 2, 3]);
  });
});

describe("parseExamText", () => {
  it("JSON lỗi cú pháp thì báo lỗi, không ném ngoại lệ", () => {
    const r = parseExamText("{ not json", "x.json");
    expect(r.set).toBeNull();
    expect(r.errors[0]).toMatch(/cú pháp/);
  });
  it("lấy tên file làm tiêu đề dự phòng", () => {
    const r = parseExamText(JSON.stringify([{ part: 5, questions: [q()] }]), "de_thi_so_1.json");
    expect(r.set.title).toBe("de thi so 1");
  });
});
