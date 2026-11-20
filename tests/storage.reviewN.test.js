// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { initStorage, logReview, getReviews, importReviews, __resetStorageForTests } from "../src/lib/storage";

beforeEach(() => {
  __resetStorageForTests();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
});

for (const backend of ["IndexedDB", "localStorage (dự phòng)"]) {
  describe(`trường n của nhật ký — ${backend}`, () => {
    beforeEach(async () => {
      if (backend !== "IndexedDB") delete globalThis.indexedDB;
      await initStorage();
    });

    it("ghi và đọc lại n = 1 (học mới) và n = 0 (ôn lại)", async () => {
      await logReview({ c: 1, t: 1, g: 3, n: 1 });
      await logReview({ c: 1, t: 2, g: 1, n: 0 });
      expect(await getReviews()).toEqual([
        { c: "1", t: 1, g: 3, n: 1 },
        { c: "1", t: 2, g: 1, n: 0 },
      ]);
    });
    it("dòng cũ không có n vẫn nguyên vẹn (không thêm trường)", async () => {
      await logReview({ c: 5, t: 9, g: 3 });
      expect(await getReviews()).toEqual([{ c: "5", t: 9, g: 3 }]);
    });
    it("giá trị n lạ bị bỏ", async () => {
      await logReview({ c: 5, t: 9, g: 3, n: 7 });
      expect(await getReviews()).toEqual([{ c: "5", t: 9, g: 3 }]);
    });
    it("nhập từ file sao lưu giữ nguyên n", async () => {
      const added = await importReviews([{ c: 2, t: 20, g: 1, n: 0 }, { c: 3, t: 30, g: 3, n: 1 }, { c: 4, t: 40, g: 3 }]);
      expect(added).toBe(3);
      expect(await getReviews()).toEqual([
        { c: "2", t: 20, g: 1, n: 0 },
        { c: "3", t: 30, g: 3, n: 1 },
        { c: "4", t: 40, g: 3 },
      ]);
    });
  });
}
