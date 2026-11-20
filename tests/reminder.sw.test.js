import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import vm from "vm";
import { IDBFactory } from "fake-indexeddb";
import { CASES, at } from "./reminderCases";
import { reminderDecision } from "../src/lib/reminder";

const SRC = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const SCOPE = "https://x.test/app/";
const DAY = 86400000;

class FakeCache {
  constructor() {
    this.m = new Map();
  }
  async match(req) {
    const r = this.m.get(typeof req === "string" ? req : req.url);
    return r ? r.clone() : undefined;
  }
  async put(req, res) {
    const b = await res.arrayBuffer();
    this.m.set(typeof req === "string" ? req : req.url, new Response(b, { status: res.status, headers: res.headers }));
  }
  async delete(req) {
    return this.m.delete(typeof req === "string" ? req : req.url);
  }
  async addAll() {}
}

// Tạo DB đúng cấu trúc của app (src/lib/db.js) trong một IDBFactory riêng rồi ghi dữ liệu
async function seed(factory, { settings, stats, due = 0, later = 2 }, nowMs) {
  vi.stubGlobal("indexedDB", factory);
  const { openDb, txDone } = await import("../src/lib/db");
  const db = await openDb();
  const tx = db.transaction(["cards", "meta"], "readwrite");
  tx.objectStore("meta").put({ settings: settings || {}, stats: stats || {}, lists: [] }, "main");
  for (let i = 0; i < due; i++) tx.objectStore("cards").put({ dueAt: nowMs - 1000, reps: 1 }, `d${i}`);
  for (let i = 0; i < later; i++) tx.objectStore("cards").put({ dueAt: nowMs + DAY, reps: 1 }, `l${i}`);
  await txDone(tx);
  db.close();
}

function makeSw({ factory, now, permission = "granted", last, clientsList = [] }) {
  const FIXED = now.getTime();
  class FakeDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [FIXED]));
    }
    static now() {
      return FIXED;
    }
  }
  const listeners = {};
  const cache = new FakeCache();
  if (last) cache.m.set("https://x.test/__reminder__/last-notified", new Response(last));
  const shown = [];
  const badge = { set: [], cleared: 0 };
  const opened = [];
  const sandbox = {
    self: {
      registration: { scope: SCOPE, showNotification: async (title, opts) => shown.push({ title, ...opts }) },
      addEventListener: (t, f) => (listeners[t] = f),
      skipWaiting() {},
      navigator: { setAppBadge: async (n) => badge.set.push(n), clearAppBadge: async () => badge.cleared++ },
      clients: {
        claim() {},
        matchAll: async () => clientsList,
        openWindow: async (u) => opened.push(u),
      },
    },
    indexedDB: factory,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    Notification: { permission },
    fetch: async () => new Response(""),
    Request,
    Response,
    URL,
    Date: FakeDate,
    location: { origin: "https://x.test" },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const periodic = async (tag = "study-reminder") => {
    let p = Promise.resolve();
    listeners.periodicsync({ tag, waitUntil: (x) => (p = x) });
    await p;
  };
  return { periodic, shown, badge, opened, cache, listeners };
}

afterEach(() => vi.unstubAllGlobals());

describe("service worker — nhắc học khi đóng app", () => {
  describe("cùng các ca kiểm thử với reminderDecision", () => {
    for (const c of CASES) {
      it(c.name, async () => {
        const now = at(c.now);
        const factory = new IDBFactory();
        await seed(factory, { settings: c.reminder === undefined ? {} : { reminder: c.reminder }, stats: c.stats, due: 3 }, now.getTime());
        const sw = makeSw({ factory, now, last: c.last });
        await sw.periodic();
        // Hai bản lặp lại logic phải cho cùng kết quả
        const app = reminderDecision({ now, reminder: c.reminder, stats: c.stats || {}, lastNotified: c.last || "" }).notify;
        expect(app).toBe(c.expect);
        expect(sw.shown.length > 0).toBe(c.expect);
      });
    }
  });

  const T = [2026, 11, 19, 21, 0];
  const ON = { reminder: { enabled: true, time: "20:00" } };

  it("nội dung nêu số thẻ đến hạn, đúng icon/tag/đường dẫn", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    await seed(factory, { settings: ON, due: 7 }, now.getTime());
    const sw = makeSw({ factory, now });
    await sw.periodic();
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]).toMatchObject({
      title: "Đến giờ ôn từ vựng TOEIC",
      tag: "study-reminder",
      icon: SCOPE + "icon-192.png",
      data: { url: SCOPE },
      lang: "vi",
    });
    expect(sw.shown[0].body).toContain("7 thẻ");
  });

  it("không có thẻ đến hạn: gợi ý học từ mới", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    await seed(factory, { settings: ON, due: 0 }, now.getTime());
    const sw = makeSw({ factory, now });
    await sw.periodic();
    expect(sw.shown[0].body).toContain("từ mới");
  });

  it("chỉ nhắc một lần mỗi ngày dù đồng bộ nền chạy nhiều lần", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    await seed(factory, { settings: ON, due: 2 }, now.getTime());
    const sw = makeSw({ factory, now });
    await sw.periodic();
    await sw.periodic();
    await sw.periodic();
    expect(sw.shown).toHaveLength(1);
    const saved = await sw.cache.match("https://x.test/__reminder__/last-notified");
    expect(await saved.text()).toBe("2026-11-19");
  });

  it("chưa được cấp quyền thông báo: không nhắc và không ghi 'đã nhắc'", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    await seed(factory, { settings: ON, due: 2 }, now.getTime());
    const sw = makeSw({ factory, now, permission: "denied" });
    await sw.periodic();
    expect(sw.shown).toHaveLength(0);
    expect(await sw.cache.match("https://x.test/__reminder__/last-notified")).toBeUndefined();
  });

  it("bỏ qua tag không phải của tính năng nhắc", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    await seed(factory, { settings: ON, due: 2 }, now.getTime());
    const sw = makeSw({ factory, now });
    await sw.periodic("tag-khac");
    expect(sw.shown).toHaveLength(0);
  });

  it("DB chưa có (người dùng chưa mở app): không lỗi, không nhắc, KHÔNG tạo DB rỗng", async () => {
    const now = at(T);
    const factory = new IDBFactory();
    const sw = makeSw({ factory, now });
    await expect(sw.periodic()).resolves.toBeUndefined();
    expect(sw.shown).toHaveLength(0);
    expect(await factory.databases()).toEqual([]);
  });

  describe("huy hiệu số thẻ đến hạn", () => {
    it("bật nhắc → đặt huy hiệu = số thẻ đến hạn (kể cả khi chưa tới giờ nhắc)", async () => {
      const now = at([2026, 11, 19, 9, 0]);
      const factory = new IDBFactory();
      await seed(factory, { settings: ON, due: 5 }, now.getTime());
      const sw = makeSw({ factory, now });
      await sw.periodic();
      expect(sw.badge.set).toEqual([5]);
      expect(sw.shown).toHaveLength(0);
    });
    it("không còn thẻ đến hạn → xóa huy hiệu", async () => {
      const now = at(T);
      const factory = new IDBFactory();
      await seed(factory, { settings: ON, due: 0 }, now.getTime());
      const sw = makeSw({ factory, now });
      await sw.periodic();
      expect(sw.badge.cleared).toBe(1);
      expect(sw.badge.set).toEqual([]);
    });
    it("tắt huy hiệu hoặc tắt nhắc → không đụng tới huy hiệu", async () => {
      for (const reminder of [{ enabled: true, time: "20:00", badge: false }, { enabled: false }]) {
        const now = at(T);
        const factory = new IDBFactory();
        await seed(factory, { settings: { reminder }, due: 4 }, now.getTime());
        const sw = makeSw({ factory, now });
        await sw.periodic();
        expect(sw.badge.set).toEqual([]);
        expect(sw.badge.cleared).toBe(0);
      }
    });
  });

  describe("bấm vào thông báo", () => {
    const click = (sw) => {
      let p = Promise.resolve();
      const n = { closed: false, data: { url: SCOPE }, close() { this.closed = true; } };
      sw.listeners.notificationclick({ notification: n, waitUntil: (x) => (p = x) });
      return p.then(() => n);
    };
    it("đưa cửa sổ app đang mở lên trước", async () => {
      const focused = [];
      const win = { url: SCOPE + "#stats", focus: async () => focused.push(1) };
      const other = { url: "https://khac.test/", focus: async () => focused.push("sai") };
      const sw = makeSw({ factory: new IDBFactory(), now: at(T), clientsList: [other, win] });
      const n = await click(sw);
      expect(n.closed).toBe(true);
      expect(focused).toEqual([1]);
      expect(sw.opened).toEqual([]);
    });
    it("chưa mở app thì mở cửa sổ mới", async () => {
      const sw = makeSw({ factory: new IDBFactory(), now: at(T), clientsList: [] });
      await click(sw);
      expect(sw.opened).toEqual([SCOPE]);
    });
  });
});
