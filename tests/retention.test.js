import { describe, it, expect } from "vitest";
import { wilson, reviewOutcomes, retentionStats, retentionVerdict, MIN_REVIEWS, WEEKS_SHOWN } from "../src/lib/retention";

const DAY = 86400000;
const NOW = new Date(2026, 10, 19, 12, 0).getTime(); // thứ Năm 19/11/2026
const ago = (days, hours = 0) => NOW - days * DAY - hours * 3600000;

describe("wilson", () => {
  it("n = 0: không biết gì", () => expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1 }));
  it("giá trị mẫu đã biết", () => {
    const a = wilson(9, 10);
    expect(a.lo).toBeCloseTo(0.596, 2);
    expect(a.hi).toBeCloseTo(0.982, 2);
    const b = wilson(90, 100);
    expect(b.lo).toBeCloseTo(0.826, 2);
    expect(b.hi).toBeCloseTo(0.945, 2);
  });
  it("luôn trong [0,1] và bao quanh tỉ lệ; mẫu lớn thì hẹp hơn", () => {
    for (const [ok, n] of [[0, 5], [5, 5], [1, 40], [39, 40]]) {
      const { lo, hi } = wilson(ok, n);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(lo).toBeLessThanOrEqual(ok / n);
      expect(hi).toBeGreaterThanOrEqual(ok / n);
    }
    const w1 = wilson(90, 100);
    const w2 = wilson(900, 1000);
    expect(w2.hi - w2.lo).toBeLessThan(w1.hi - w1.lo);
  });
});

describe("reviewOutcomes — chỉ tính lượt ÔN LẠI", () => {
  it("n = 1 (học lần đầu) bị bỏ; n = 0 (ôn lại) được tính", () => {
    const out = reviewOutcomes([
      { c: "a", t: 1, g: 3, n: 1 },
      { c: "a", t: 2, g: 1, n: 0 },
      { c: "b", t: 3, g: 3, n: 0 }, // thẻ học từ trước khi có nhật ký: vẫn là ôn lại
    ]);
    expect(out).toEqual([{ t: 2, ok: false }, { t: 3, ok: true }]);
  });
  it("dòng cũ không có n: dòng đầu của thẻ bỏ, các dòng sau tính", () => {
    const out = reviewOutcomes([
      { c: "a", t: 1, g: 3 },
      { c: "a", t: 2, g: 3 },
      { c: "a", t: 3, g: 1 },
      { c: "b", t: 4, g: 1 },
    ]);
    expect(out).toEqual([{ t: 2, ok: true }, { t: 3, ok: false }]);
  });
  it("không phụ thuộc thứ tự dòng, bỏ g không hợp lệ", () => {
    const log = [
      { c: "a", t: 3, g: 3 },
      { c: "a", t: 1, g: 3 },
      { c: "a", t: 2, g: 2 }, // g lạ
    ];
    expect(reviewOutcomes(log)).toEqual([{ t: 3, ok: true }]);
  });
  it("trộn dòng mới và cũ của cùng một thẻ", () => {
    const out = reviewOutcomes([
      { c: "a", t: 1, g: 3 }, // cũ, không rõ → bỏ
      { c: "a", t: 2, g: 3, n: 0 },
    ]);
    expect(out).toEqual([{ t: 2, ok: true }]);
  });
  it("nhật ký rỗng / undefined", () => {
    expect(reviewOutcomes([])).toEqual([]);
    expect(reviewOutcomes(undefined)).toEqual([]);
  });
});

describe("retentionStats", () => {
  // 10 lượt ôn lại: 3 ngày trước (8 nhớ/2 quên), 20 ngày trước (5 nhớ/5 quên), 100 ngày trước (10 nhớ/0 quên)
  const rev = (t, ok, i) => ({ c: `x${i}`, t, g: ok ? 3 : 1, n: 0 });
  const log = [
    ...Array.from({ length: 10 }, (_, i) => rev(ago(3), i < 8, i)),
    ...Array.from({ length: 10 }, (_, i) => rev(ago(20), i < 5, i + 20)),
    ...Array.from({ length: 10 }, (_, i) => rev(ago(100), true, i + 40)),
    { c: "new1", t: ago(1), g: 3, n: 1 }, // học từ mới: không tính
  ];
  const s = retentionStats(log, NOW);

  it("các cửa sổ 7 ngày / 30 ngày / tất cả", () => {
    expect(s.d7).toMatchObject({ n: 10, ok: 8, rate: 0.8 });
    expect(s.d30).toMatchObject({ n: 20, ok: 13, rate: 0.65 });
    expect(s.all).toMatchObject({ n: 30, ok: 23 });
    expect(s.all.rate).toBeCloseTo(23 / 30);
  });
  it("khoảng tin cậy nằm quanh tỉ lệ", () => {
    expect(s.d30.lo).toBeLessThan(s.d30.rate);
    expect(s.d30.hi).toBeGreaterThan(s.d30.rate);
  });
  it("8 tuần gần nhất, cũ trước mới sau, tuần bắt đầu thứ Hai", () => {
    expect(s.weeks).toHaveLength(WEEKS_SHOWN);
    expect(s.weeks.at(-1).start).toBe("2026-11-16"); // tuần chứa 19/11
    expect(s.weeks[0].start).toBe("2026-09-28");
    const starts = s.weeks.map((w) => w.start);
    expect([...starts].sort()).toEqual(starts);
    // 3 ngày trước = 16/11 (thứ Hai) → tuần hiện tại; 20 ngày trước = 30/10 → tuần bắt đầu 26/10
    expect(s.weeks.at(-1)).toMatchObject({ n: 10, ok: 8 });
    expect(s.weeks.find((w) => w.start === "2026-10-26")).toMatchObject({ n: 10, ok: 5 });
    // 100 ngày trước nằm ngoài 8 tuần nhưng vẫn có trong "tất cả"
    expect(s.weeks.reduce((n, w) => n + w.n, 0)).toBe(20);
  });
  it("tuần không có lượt nào: rate = null", () => {
    expect(s.weeks[0]).toMatchObject({ n: 0, rate: null });
  });
  it("thông tin nhật ký", () => {
    expect(s.logged).toBe(31);
    expect(s.firstAt).toBe(ago(100));
  });
  it("nhật ký rỗng", () => {
    const e = retentionStats([], NOW);
    expect(e.all).toMatchObject({ n: 0, rate: null });
    expect(e.firstAt).toBeNull();
    expect(e.logged).toBe(0);
  });
});

describe("retentionVerdict", () => {
  it("chưa đủ lượt: báo còn thiếu bao nhiêu", () => {
    expect(retentionVerdict({ ok: 20, n: 25, target: 0.9 })).toEqual({ level: "insufficient", need: MIN_REVIEWS - 25 });
  });
  it("khớp mục tiêu (khoảng tin cậy chứa mục tiêu)", () => {
    expect(retentionVerdict({ ok: 85, n: 100, target: 0.9 }).level).toBe("ok");
    expect(retentionVerdict({ ok: 90, n: 100, target: 0.9 }).level).toBe("ok");
  });
  it("thấp hơn rõ rệt: gợi ý nâng mục tiêu, bù tối đa 6 điểm", () => {
    const v = retentionVerdict({ ok: 70, n: 100, target: 0.9 });
    expect(v).toMatchObject({ level: "below", suggest: 96 });
    expect(v.hi).toBeLessThan(0.9);
  });
  it("thấp hơn ít nhưng mẫu lớn: bù ít (tối thiểu 2 điểm)", () => {
    const v = retentionVerdict({ ok: 870, n: 1000, target: 0.9 });
    expect(v.level).toBe("below");
    expect(v.suggest).toBe(93);
  });
  it("gợi ý không vượt 97%", () => {
    expect(retentionVerdict({ ok: 900, n: 1000, target: 0.97 }).suggest).toBe(97);
  });
  it("cao hơn rõ rệt", () => {
    const v = retentionVerdict({ ok: 98, n: 100, target: 0.9 });
    expect(v.level).toBe("above");
    expect(v.lo).toBeGreaterThan(0.9);
  });
  it("mẫu nhỏ nhưng tỉ lệ thấp vẫn không kết luận vội (n < 30)", () => {
    expect(retentionVerdict({ ok: 5, n: 29, target: 0.9 }).level).toBe("insufficient");
  });
});
