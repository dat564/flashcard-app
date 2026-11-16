import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  nextSchedule,
  insertRelearn,
  isHard,
  fmtInterval,
  statusOf,
  retrievability,
  configureSrs,
  getRetention,
  getWeights,
  validWeights,
} from "../src/lib/srs";
import { DAY, MAX_DAYS, FSRS_RETENTION } from "../src/lib/constants";
import { startOfDay } from "../src/lib/utils";
import { default_w } from "ts-fsrs";

const NOW = new Date(2026, 5, 10, 15, 30).getTime(); // 10/06/2026 15:30 giờ máy
const days = (n) => startOfDay(NOW + n * DAY);

// Ôn thẻ đúng vào ngày đến hạn, lần lượt theo danh sách đánh giá
function run(ratings, start) {
  let card = start;
  let t = NOW;
  const out = [];
  for (const r of ratings) {
    card = { ...nextSchedule(card, r, t), lastReviewed: t };
    out.push(card);
    t = card.dueAt + 9 * 3600 * 1000; // 9h sáng ngày đến hạn
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  configureSrs({ retention: FSRS_RETENTION, weights: null });
});
afterEach(() => vi.useRealTimers());

describe("nextSchedule — nhớ (FSRS)", () => {
  it("thẻ mới: nhớ lần đầu hẹn vài ngày, hẹn vào 0h của ngày đến hạn", () => {
    const c = nextSchedule(undefined, "good", NOW);
    expect(c.interval).toBeGreaterThanOrEqual(2);
    expect(c.interval).toBeLessThanOrEqual(4);
    expect(c.dueAt).toBe(days(c.interval));
    expect(c.reps).toBe(1);
    expect(c.status).toBe("review");
    expect(c.stability).toBeGreaterThan(0);
    expect(c.difficulty).toBeGreaterThanOrEqual(1);
    expect(c.difficulty).toBeLessThanOrEqual(10);
  });

  it("nhớ liên tiếp: khoảng ôn tăng dần và tính bằng số nguyên ngày", () => {
    const seq = run(["good", "good", "good", "good"]);
    const iv = seq.map((c) => c.interval);
    for (let i = 1; i < iv.length; i++) expect(iv[i]).toBeGreaterThan(iv[i - 1]);
    expect(iv.every(Number.isInteger)).toBe(true);
    expect(seq.map((c) => c.reps)).toEqual([1, 2, 3, 4]);
  });

  it("không vượt quá MAX_DAYS", () => {
    const seq = run(Array(12).fill("good"));
    expect(Math.max(...seq.map((c) => c.interval))).toBeLessThanOrEqual(MAX_DAYS);
    expect(seq.at(-1).interval).toBe(MAX_DAYS);
  });

  it("ôn trễ (quá hạn) thì ổn định tăng nhiều hơn ôn đúng hạn", () => {
    const [first] = run(["good"]);
    const onTime = nextSchedule(first, "good", first.dueAt);
    const late = nextSchedule(first, "good", first.dueAt + 10 * DAY);
    expect(late.stability).toBeGreaterThan(onTime.stability);
  });
});

describe("nextSchedule — chưa nhớ", () => {
  it("hẹn ngày mai, reset reps, tăng lapses, thẻ mới vẫn hẹn ngày mai", () => {
    const learned = run(["good", "good", "good"]).at(-1);
    const c = nextSchedule(learned, "again", learned.dueAt + 9 * 3600 * 1000);
    expect(c.interval).toBe(1);
    expect(c.dueAt).toBe(startOfDay(learned.dueAt + 9 * 3600 * 1000 + DAY));
    expect(c.reps).toBe(0);
    expect(c.lapses).toBe(1);
    expect(c.status).toBe("learning");
    expect(nextSchedule(undefined, "again", NOW)).toMatchObject({ interval: 1, lapses: 1, reps: 0 });
  });

  it("quên làm giảm ổn định và tăng độ khó", () => {
    const learned = run(["good", "good", "good"]).at(-1);
    const t = learned.dueAt + 9 * 3600 * 1000;
    const c = nextSchedule(learned, "again", t);
    expect(c.stability).toBeLessThan(learned.stability);
    expect(c.difficulty).toBeGreaterThan(learned.difficulty);
  });

  it("từ hay quên giãn lịch chậm hơn từ luôn nhớ", () => {
    const steady = run(["good", "good", "good", "good", "good"]).at(-1);
    const shaky = run(["good", "again", "good", "again", "good"]).at(-1);
    expect(shaky.interval).toBeLessThan(steady.interval);
    expect(shaky.lapses).toBe(2);
  });

  it("là hàm thuần: không sửa thẻ gốc", () => {
    const frozen = Object.freeze({ ...run(["good"])[0] });
    expect(() => nextSchedule(frozen, "again", NOW)).not.toThrow();
  });
});

describe("thẻ cũ (lịch SM-2) được chuyển sang FSRS", () => {
  const legacy = {
    dueAt: days(-1),
    reps: 4,
    interval: 14,
    ease: 2.5,
    lapses: 0,
    status: "review",
    lastReviewed: NOW - 15 * DAY,
  };

  it("nhớ: khoảng ôn dài hơn khoảng cũ, các trường FSRS được tạo", () => {
    const c = nextSchedule(legacy, "good", NOW);
    expect(c.interval).toBeGreaterThan(14);
    expect(c.stability).toBeGreaterThan(14);
    expect(c.reps).toBe(5);
  });

  it("quên: hẹn ngày mai", () => {
    expect(nextSchedule(legacy, "again", NOW).interval).toBe(1);
  });

  it("thẻ cũ có ease thấp (khó) giãn chậm hơn thẻ ease cao (dễ)", () => {
    const hard = nextSchedule({ ...legacy, ease: 1.4 }, "good", NOW);
    const easy = nextSchedule({ ...legacy, ease: 2.9 }, "good", NOW);
    expect(hard.interval).toBeLessThan(easy.interval);
  });

  it("thiếu lastReviewed / ease vẫn xử lý được", () => {
    const c = nextSchedule({ dueAt: 1, reps: 1, interval: 3 }, "good", NOW);
    expect(Number.isFinite(c.interval)).toBe(true);
    expect(c.interval).toBeGreaterThan(0);
  });
});

describe("mức nhớ mục tiêu & retrievability", () => {
  it("mức cao hơn → khoảng ôn ngắn hơn", () => {
    configureSrs({ retention: 0.8 });
    const low = run(["good", "good", "good"]).at(-1).interval;
    configureSrs({ retention: 0.95 });
    const high = run(["good", "good", "good"]).at(-1).interval;
    expect(high).toBeLessThan(low);
  });

  it("giới hạn trong khoảng cho phép và đọc lại được", () => {
    configureSrs({ retention: 0.5 });
    expect(getRetention()).toBe(0.8);
    configureSrs({ retention: 0.99 });
    expect(getRetention()).toBe(0.97);
    configureSrs({ retention: 0.9 });
    expect(getRetention()).toBe(0.9);
  });

  it("xác suất nhớ giảm theo thời gian và gần 90% đúng hạn", () => {
    const c = { ...run(["good", "good"]).at(-1) };
    const onDue = retrievability(c, c.lastReviewed + c.interval * DAY);
    expect(onDue).toBeGreaterThan(0.85);
    expect(onDue).toBeLessThan(0.95);
    const later = retrievability(c, c.lastReviewed + (c.interval + 30) * DAY);
    expect(later).toBeLessThan(onDue);
    expect(retrievability(undefined)).toBe(0);
  });
});

describe("tham số FSRS cá nhân", () => {
  const custom = () => {
    const w = Array.from(default_w);
    w[2] = 5; // nhớ lần đầu: độ bền ban đầu cao hơn mặc định
    return w;
  };

  it("áp dụng tham số riêng thì lịch thay đổi, bỏ đi thì trở lại mặc định", () => {
    const base = nextSchedule(undefined, "good", NOW).interval;
    configureSrs({ weights: custom() });
    expect(getWeights()).toEqual(custom());
    const mine = nextSchedule(undefined, "good", NOW).interval;
    expect(mine).toBeGreaterThan(base);
    configureSrs({ weights: null });
    expect(getWeights()).toBeNull();
    expect(nextSchedule(undefined, "good", NOW).interval).toBe(base);
  });

  it("tham số không hợp lệ bị bỏ qua (dùng mặc định)", () => {
    expect(validWeights([1, 2, 3])).toBe(false);
    expect(validWeights(Array(21).fill(NaN))).toBe(false);
    expect(validWeights(null)).toBe(false);
    expect(validWeights(custom())).toBe(true);
    configureSrs({ weights: [1, 2, 3] });
    expect(getWeights()).toBeNull();
  });

  it("đổi mức nhớ mục tiêu vẫn giữ tham số riêng", () => {
    configureSrs({ retention: 0.9, weights: custom() });
    configureSrs({ retention: 0.95, weights: custom() });
    expect(getWeights()).toEqual(custom());
    expect(getRetention()).toBe(0.95);
  });
});

describe("insertRelearn", () => {
  it("chèn sau 3 thẻ kế tiếp", () => {
    expect(insertRelearn(["a", "b", "c", "d", "e", "f"], 0, "a")).toEqual([
      "a", "b", "c", "d", "a", "e", "f",
    ]);
  });

  it("còn ít thẻ thì chèn vào cuối phiên", () => {
    expect(insertRelearn(["a", "b", "c"], 1, "b")).toEqual(["a", "b", "c", "b"]);
    expect(insertRelearn(["a"], 0, "a")).toEqual(["a", "a"]);
  });

  it("tôn trọng tham số gap và không sửa mảng gốc", () => {
    const s = ["a", "b", "c", "d"];
    expect(insertRelearn(s, 0, "a", 1)).toEqual(["a", "b", "a", "c", "d"]);
    expect(s).toEqual(["a", "b", "c", "d"]);
  });
});

describe("isHard / statusOf / fmtInterval", () => {
  it("từ khó: sai ≥ 3 lần và chưa nhớ liền 3 lần", () => {
    expect(isHard({ lapses: 3, reps: 0 })).toBe(true);
    expect(isHard({ lapses: 3, reps: 3 })).toBe(false);
    expect(isHard({ lapses: 2, reps: 0 })).toBe(false);
    expect(isHard(undefined)).toBe(false);
  });

  it("trạng thái thẻ", () => {
    expect(statusOf(undefined)).toBe("new");
    expect(statusOf({ dueAt: NOW - 1 })).toBe("due");
    expect(statusOf({ dueAt: NOW + DAY })).toBe("learning");
  });

  it("định dạng khoảng ôn", () => {
    expect(fmtInterval(1)).toBe("1 ngày");
    expect(fmtInterval(14)).toBe("14 ngày");
    expect(fmtInterval(60)).toBe("2 tháng");
    expect(fmtInterval(365)).toBe("1 năm");
    expect(fmtInterval(0.5)).toBe("12 giờ");
  });
});
