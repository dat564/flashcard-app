import { describe, it, expect } from "vitest";
import { mixKey, shuffle, startOfDay } from "../src/lib/utils";

describe("mixKey", () => {
  it("ổn định: cùng id luôn ra cùng khóa", () => {
    expect(mixKey(123)).toBe(mixKey(123));
  });

  it("tách các id liền kề (không còn theo thứ tự bảng chữ cái)", () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    const sorted = [...ids].sort((a, b) => mixKey(a) - mixKey(b));
    let adjacent = 0;
    for (let i = 1; i < sorted.length; i++)
      if (Math.abs(sorted[i] - sorted[i - 1]) === 1) adjacent++;
    expect(adjacent).toBeLessThan(10); // ngẫu nhiên ~1 cặp; thứ tự gốc là 199
  });

  it("chấp nhận id không phải số", () => {
    expect(Number.isInteger(mixKey("abc"))).toBe(true);
  });
});

describe("shuffle / startOfDay", () => {
  it("shuffle giữ nguyên phần tử và không sửa mảng gốc", () => {
    const a = [1, 2, 3, 4, 5];
    const r = shuffle(a);
    expect([...r].sort()).toEqual(a);
    expect(a).toEqual([1, 2, 3, 4, 5]);
  });

  it("startOfDay về 0h", () => {
    const d = new Date(startOfDay(new Date(2026, 0, 5, 18, 45).getTime()));
    expect([d.getHours(), d.getMinutes(), d.getDate()]).toEqual([0, 0, 5]);
  });
});
