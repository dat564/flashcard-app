// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import {
  initStorage,
  loadProgress,
  saveProgress,
  storageInfo,
  logReview,
  removeReview,
  getReviews,
  importReviews,
  clearReviews,
  __resetStorageForTests,
} from "../src/lib/storage";
import { openDb, wrap } from "../src/lib/db";
import { STORE } from "../src/lib/constants";

const card = (t, x = {}) => ({ lastReviewed: t, reps: 1, interval: 3, dueAt: t + 1, ...x });
// Đọc thẳng IndexedDB để kiểm tra những gì thực sự được ghi
async function dump() {
  const db = await openDb();
  const tx = db.transaction(["cards", "meta"], "readonly");
  const keys = await wrap(tx.objectStore("cards").getAllKeys());
  const meta = await wrap(tx.objectStore("meta").get("main"));
  db.close();
  return { keys: keys.sort(), meta };
}

beforeEach(() => {
  __resetStorageForTests();
  globalThis.indexedDB = new IDBFactory(); // DB sạch cho mỗi test
  localStorage.clear();
});

describe("initStorage + saveProgress (IndexedDB)", () => {
  it("lần đầu: dùng IndexedDB, tiến độ mới", async () => {
    expect(await initStorage()).toBe("idb");
    const p = loadProgress();
    expect(p.cards).toEqual({});
    expect(p.settings.newPerDay).toBe(20);
  });

  it("lưu rồi nạp lại ở lần khởi động sau", async () => {
    await initStorage();
    const p = { ...loadProgress(), cards: { 1: card(100), abc: card(200) }, settings: { newPerDay: 30, retention: 0.93 } };
    await saveProgress(p);
    __resetStorageForTests();
    await initStorage();
    const q = loadProgress();
    expect(Object.keys(q.cards).sort()).toEqual(["1", "abc"]);
    expect(q.cards[1].lastReviewed).toBe(100);
    expect(q.settings).toEqual({ newPerDay: 30, retention: 0.93 });
  });

  it("chỉ ghi thẻ thay đổi, xóa thẻ bị bỏ", async () => {
    await initStorage();
    const c1 = card(1), c2 = card(2), c3 = card(3);
    await saveProgress({ ...loadProgress(), cards: { 1: c1, 2: c2, 3: c3 } });

    // Spy: đếm số lệnh put vào store "cards"
    let puts = 0;
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) {
      if (this.name === "cards") puts++;
      return orig.apply(this, a);
    };
    try {
      const base = { ...loadProgress(), cards: { 1: c1, 2: c2, 3: c3 } };
      const c2b = card(99);
      await saveProgress({ ...base, cards: { ...base.cards, 2: c2b } }); // đổi 1 thẻ
      expect(puts).toBe(1);
      puts = 0;
      await saveProgress({ ...base, cards: { ...base.cards, 2: c2b } }); // không đổi gì
      expect(puts).toBe(0);
      puts = 0;
      const { 1: _drop, ...rest } = { ...base.cards, 2: c2b }; // xóa thẻ 1
      await saveProgress({ ...base, cards: rest });
      expect(puts).toBe(0);
    } finally {
      IDBObjectStore.prototype.put = orig;
    }
    expect((await dump()).keys).toEqual(["2", "3"]);
  });

  it("đổi meta (thống kê/cài đặt) mà không đụng thẻ", async () => {
    await initStorage();
    const base = { ...loadProgress(), cards: { 1: card(1) } };
    await saveProgress(base);
    await saveProgress({ ...base, stats: { "2026-06-01": { reviewed: 5 } } });
    expect((await dump()).meta.stats["2026-06-01"].reviewed).toBe(5);
    expect((await dump()).keys).toEqual(["1"]);
  });

  it("nhiều lệnh lưu liên tiếp không chồng lệnh, kết quả cuối đúng", async () => {
    await initStorage();
    const base = loadProgress();
    const saves = [];
    for (let i = 1; i <= 10; i++)
      saves.push(saveProgress({ ...base, cards: { 1: card(i) } }));
    await Promise.all(saves);
    __resetStorageForTests();
    await initStorage();
    expect(loadProgress().cards[1].lastReviewed).toBe(10);
  });
});

describe("chuyển dữ liệu từ localStorage", () => {
  const old = {
    cards: { 1: card(10), 2: card(20), 3: card(30) },
    stats: { "2026-05-01": { reviewed: 7, correct: 5, newLearned: 3 } },
    lists: [{ id: "l1", name: "Danh sách", words: [] }],
    settings: { newPerDay: 40 },
    createdAt: 1,
    lastExportAt: 555,
  };

  it("chuyển đủ dữ liệu, rồi xóa bản cũ", async () => {
    localStorage.setItem(STORE, JSON.stringify(old));
    expect(await initStorage()).toBe("idb");
    const p = loadProgress();
    expect(Object.keys(p.cards)).toHaveLength(3);
    expect(p.lists[0].id).toBe("l1");
    expect(p.lastExportAt).toBe(555);
    expect(localStorage.getItem(STORE)).toBeNull();
    // IndexedDB đã có dữ liệu thật
    const d = await dump();
    expect(d.keys).toEqual(["1", "2", "3"]);
    expect(d.meta.settings.newPerDay).toBe(40);
  });

  it("không chuyển lại khi IndexedDB đã có dữ liệu", async () => {
    await initStorage();
    await saveProgress({ ...loadProgress(), cards: { 9: card(9) } });
    __resetStorageForTests();
    localStorage.setItem(STORE, JSON.stringify(old)); // bản cũ còn sót
    await initStorage();
    expect(Object.keys(loadProgress().cards)).toEqual(["9"]);
  });
});

describe("dự phòng localStorage", () => {
  it("không có IndexedDB → dùng localStorage, vẫn lưu và nạp được", async () => {
    delete globalThis.indexedDB;
    expect(await initStorage()).toBe("local");
    expect(storageInfo().backend).toBe("local");
    const p = { ...loadProgress(), cards: { 1: card(5) } };
    await saveProgress(p);
    expect(JSON.parse(localStorage.getItem(STORE)).cards[1].lastReviewed).toBe(5);
    __resetStorageForTests();
    await initStorage();
    expect(loadProgress().cards[1].lastReviewed).toBe(5);
  });

  it("nhật ký ôn vẫn hoạt động ở chế độ dự phòng", async () => {
    delete globalThis.indexedDB;
    await initStorage();
    await logReview({ c: 1, t: 100, g: 3 });
    await logReview({ c: 2, t: 200, g: 1 });
    expect((await getReviews()).map((r) => r.c)).toEqual(["1", "2"]);
    await removeReview(2, 200);
    expect(await getReviews()).toEqual([{ c: "1", t: 100, g: 3 }]);
  });
});

describe("nhật ký ôn (IndexedDB)", () => {
  beforeEach(() => initStorage());

  it("ghi, đọc theo thời gian, hoàn tác", async () => {
    await logReview({ c: 5, t: 300, g: 3 });
    await logReview({ c: 5, t: 100, g: 1 });
    await logReview({ c: 6, t: 200, g: 3 });
    expect((await getReviews()).map((r) => r.t)).toEqual([100, 200, 300]);
    await removeReview(6, 200);
    expect((await getReviews()).map((r) => r.t)).toEqual([100, 300]);
    await removeReview(5, 999); // không tồn tại → không lỗi
    expect(await getReviews()).toHaveLength(2);
  });

  it("nhập: bỏ dòng trùng và dòng không hợp lệ", async () => {
    await logReview({ c: 1, t: 10, g: 3 });
    const added = await importReviews([
      { c: "1", t: 10, g: 3 }, // trùng
      { c: 2, t: 20, g: 1 },
      { c: 3, t: 30, g: 2 }, // g không hợp lệ
      { t: 40, g: 3 }, // thiếu c
      null,
    ]);
    expect(added).toBe(1);
    expect(await getReviews()).toHaveLength(2);
    expect(await importReviews("rác")).toBe(0);
  });

  it("xóa toàn bộ", async () => {
    await logReview({ c: 1, t: 1, g: 3 });
    await clearReviews();
    expect(await getReviews()).toEqual([]);
  });
});
