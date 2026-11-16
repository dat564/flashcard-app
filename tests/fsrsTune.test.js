import { describe, it, expect } from "vitest";
import { fsrs, generatorParameters, createEmptyCard, Rating, default_w, clipParameters } from "ts-fsrs";
import {
  trace,
  lossOn,
  meanLoss,
  buildSequences,
  dataSummary,
  fitWeights,
  tune,
  MIN_REVIEWS,
} from "../src/lib/fsrsTune";

import { DAY, D0, simulateUser } from "./helpers";

// Chạy chuỗi (g, dt) qua bộ lên lịch THẬT của ts-fsrs, trả về (s, d, R) sau từng lượt
function referenceTrace(w, g, dt) {
  const f = fsrs(
    generatorParameters({ w, enable_fuzz: false, enable_short_term: false, request_retention: 0.9 })
  );
  let t = D0;
  let card = createEmptyCard(new Date(t));
  const rows = [];
  g.forEach((r, i) => {
    t += dt[i] * DAY;
    const R = i === 0 ? 1 : f.get_retrievability(card, new Date(t), false);
    card = f.next(card, new Date(t), r === 1 ? Rating.Again : r === 2 ? Rating.Hard : r === 3 ? Rating.Good : Rating.Easy).card;
    rows.push({ s: card.stability, d: card.difficulty, R });
  });
  return rows;
}

describe("mô hình trong fsrsTune khớp ts-fsrs", () => {
  const seqs = [
    { g: [3, 3, 3, 3, 3], dt: [0, 3, 14, 40, 120] },
    { g: [1, 3, 1, 3, 3, 1], dt: [0, 1, 1, 4, 10, 25] },
    { g: [3, 1, 1, 3, 3, 3], dt: [0, 2, 1, 1, 3, 9] },
    { g: [3, 2, 4, 3, 1, 3], dt: [0, 3, 8, 20, 50, 1] }, // có cả Khó/Dễ
    { g: [3, 3, 3], dt: [0, 0, 5] }, // hai lượt cùng ngày
  ];
  const weightSets = {
    "mặc định": Array.from(default_w),
    "lệch": clipParameters(
      Array.from(default_w).map((x, i) => (i === 20 ? x * 1.4 : x * (i % 2 ? 1.18 : 0.87))),
      0,
      false
    ),
  };
  for (const [name, w] of Object.entries(weightSets)) {
    it(`từng bước (s, d, R) giống ts-fsrs — tham số ${name}`, () => {
      for (const { g, dt } of seqs) {
        const mine = trace(w, g, dt);
        const ref = referenceTrace(w, g, dt);
        mine.forEach((m, i) => {
          expect(m.s).toBeCloseTo(ref[i].s, 4);
          expect(m.d).toBeCloseTo(ref[i].d, 4);
          expect(m.R).toBeCloseTo(ref[i].R, 6);
        });
      }
    });
  }

  it("lossOn bằng tổng log-loss tính tay trên chuỗi mẫu", () => {
    const w = Array.from(default_w);
    const g = [3, 3, 1, 3];
    const dt = [0, 3, 14, 1];
    const t = trace(w, g, dt);
    const expected = -Math.log(t[1].R) - Math.log(1 - t[2].R) - Math.log(t[3].R);
    const { sum, n } = lossOn(w, [{ g, dt }]);
    expect(n).toBe(3);
    expect(sum).toBeCloseTo(expected, 8);
  });

  it("lượt ôn cùng ngày (t = 0) không bị chấm điểm", () => {
    const { n } = lossOn(Array.from(default_w), [{ g: [3, 3, 3], dt: [0, 0, 4] }]);
    expect(n).toBe(1);
  });
});

describe("buildSequences / dataSummary", () => {
  const log = [
    { c: "1", t: D0, g: 3 },
    { c: "1", t: D0 + 3 * DAY + 3600000, g: 1 },
    { c: "1", t: D0 + 4 * DAY, g: 3 },
    { c: "2", t: D0 + DAY, g: 3 },
  ];
  it("gom theo thẻ, khoảng cách theo ngày dương lịch", () => {
    const s = buildSequences(log);
    const one = s.find((x) => x.id === "1");
    expect(one.g).toEqual([3, 1, 3]);
    expect(one.dt).toEqual([0, 3, 1]);
    expect(s.find((x) => x.id === "2").dt).toEqual([0]);
  });
  it("không phụ thuộc thứ tự dòng nhật ký", () => {
    expect(buildSequences([...log].reverse())).toEqual(buildSequences(log));
  });
  it("thống kê và điều kiện đủ dữ liệu", () => {
    const info = dataSummary(log);
    expect(info).toMatchObject({ reviews: 4, cards: 2, scored: 2, fails: 1, enough: false });
  });
});

describe("tune", () => {
  it("không đủ dữ liệu thì từ chối", () => {
    const r = tune([{ c: "1", t: D0, g: 3 }]);
    expect(r).toMatchObject({ ok: false, reason: "not-enough-data" });
  });

  it("người học có trí nhớ khác mặc định: tham số tối ưu dự đoán tốt hơn trên dữ liệu chưa thấy", () => {
    const trueW = clipParameters(
      Array.from(default_w).map((x, i) => (i === 8 ? x - 0.5 : i === 9 ? x + 0.25 : i === 11 ? x * 1.6 : x)),
      0,
      false
    );
    const log = simulateUser(trueW, 450, 150, 7);
    expect(log.length).toBeGreaterThan(MIN_REVIEWS);
    const r = tune(log, { steps: 60 });
    expect(r.ok).toBe(true);
    expect(r.improved).toBe(true);
    expect(r.lossTuned).toBeLessThan(r.lossDefault);
    expect(r.weights).toHaveLength(21);
    expect(r.weights.every(Number.isFinite)).toBe(true);
    // tham số tối ưu cũng phải tốt hơn mặc định trên TOÀN BỘ dữ liệu
    const all = buildSequences(log);
    expect(meanLoss(r.weights, all)).toBeLessThan(meanLoss(Array.from(default_w), all));
  }, 60000);

  it("người học đúng như mặc định: không đề nghị đổi", () => {
    const log = simulateUser(Array.from(default_w), 450, 150, 11);
    const r = tune(log, { steps: 60 });
    expect(r.ok).toBe(true);
    expect(r.improved).toBe(false);
  }, 60000);

  it("fitWeights luôn trả về tham số hợp lệ và báo tiến độ", () => {
    const log = simulateUser(Array.from(default_w), 120, 60, 3);
    const seen = [];
    const w = fitWeights(buildSequences(log), { steps: 10, onProgress: (f) => seen.push(f) });
    expect(w).toHaveLength(21);
    expect(w.every(Number.isFinite)).toBe(true);
    expect(seen.at(-1)).toBe(1);
  }, 60000);
});
