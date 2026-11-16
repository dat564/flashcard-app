import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calcStreaks, buildForecast, heatLevel, activityOf } from "../src/lib/stats";
import { dayKeyOf, startOfDay } from "../src/lib/utils";
import { DAY } from "../src/lib/constants";

const NOW = new Date(2026, 5, 10, 9, 0).getTime();
const key = (offset) => dayKeyOf(new Date(NOW + offset * DAY));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("calcStreaks", () => {
  it("chuỗi hiện tại tính cả hôm nay", () => {
    const stats = { [key(0)]: { reviewed: 5 }, [key(-1)]: { practiced: 3 }, [key(-2)]: { reviewed: 1 } };
    expect(calcStreaks(stats)).toEqual({ cur: 3, best: 3 });
  });

  it("hôm nay chưa học thì chuỗi tính từ hôm qua", () => {
    const stats = { [key(-1)]: { reviewed: 5 }, [key(-2)]: { reviewed: 5 } };
    expect(calcStreaks(stats).cur).toBe(2);
  });

  it("đứt chuỗi thì về 0 nhưng giữ kỷ lục", () => {
    const stats = { [key(-5)]: { reviewed: 1 }, [key(-4)]: { reviewed: 1 }, [key(-3)]: { reviewed: 1 } };
    expect(calcStreaks(stats)).toEqual({ cur: 0, best: 3 });
  });

  it("ngày không có hoạt động không làm tăng chuỗi", () => {
    expect(calcStreaks({ [key(0)]: { reviewed: 0 } })).toEqual({ cur: 0, best: 0 });
  });
});

describe("buildForecast", () => {
  it("thẻ quá hạn tính vào hôm nay, thẻ xa hơn 7 ngày bị bỏ", () => {
    const base = startOfDay(NOW);
    const cards = {
      a: { dueAt: base - 3 * DAY },
      b: { dueAt: base + DAY },
      c: { dueAt: base + DAY },
      d: { dueAt: base + 30 * DAY },
      e: {},
    };
    const f = buildForecast(cards);
    expect(f.map((x) => x.n)).toEqual([1, 2, 0, 0, 0, 0, 0]);
  });
});

describe("heatLevel / activityOf", () => {
  it("phân mức màu", () => {
    expect([-1, 0, 5, 20, 40, 80].map(heatLevel)).toEqual(["x", 0, 1, 2, 3, 4]);
  });
  it("activityOf cộng ôn + luyện tập", () => {
    expect(activityOf({ reviewed: 3, practiced: 2 })).toBe(5);
    expect(activityOf(undefined)).toBe(0);
  });
});
