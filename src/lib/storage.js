import { STORE } from "./constants";
import { openDb, wrap, txDone } from "./db";

/* ---------- Lưu trữ tiến độ ----------
 * Chính: IndexedDB (thẻ lưu riêng từng bản ghi → mỗi lần chấm chỉ ghi thẻ thay đổi).
 * Dự phòng: localStorage (khi IndexedDB không dùng được, ví dụ một số chế độ riêng tư).
 * `await initStorage()` phải chạy một lần trước khi render App (xem main.jsx);
 * sau đó loadProgress() đồng bộ như trước.
 */
const REVIEWS_LS = "toeic-recall-reviews-v1";
const REVIEWS_LS_MAX = 20000;

export const freshProgress = () => ({
  cards: {},
  stats: {},
  lists: [],
  settings: { newPerDay: 20 },
  createdAt: Date.now(),
});

let db = null;
let backend = "local"; // "idb" | "local"
let cache = null; // bản tiến độ nạp lúc khởi động
let persisted = { cards: new Map(), meta: "" }; // ảnh chụp những gì đã ghi vào IndexedDB
let queue = Promise.resolve(); // ghi tuần tự, không chồng lệnh
let lastError = null;

const readLocal = () => {
  try {
    return { ...freshProgress(), ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return freshProgress();
  }
};
const hasLocal = () => {
  try {
    return !!localStorage.getItem(STORE);
  } catch {
    return false;
  }
};
const splitProgress = (p) => {
  const { cards = {}, ...meta } = p;
  return { cards, meta };
};
const snapshot = (p) => {
  const { cards, meta } = splitProgress(p);
  return { cards: new Map(Object.entries(cards)), meta: JSON.stringify(meta) };
};

async function writeAll(p) {
  const { cards, meta } = splitProgress(p);
  const tx = db.transaction(["cards", "meta"], "readwrite");
  const cs = tx.objectStore("cards");
  cs.clear();
  for (const [id, c] of Object.entries(cards)) cs.put(c, id);
  tx.objectStore("meta").put(meta, "main");
  await txDone(tx);
}

async function readAll() {
  const tx = db.transaction(["cards", "meta"], "readonly");
  const cs = tx.objectStore("cards");
  const [keys, vals, meta] = await Promise.all([
    wrap(cs.getAllKeys()),
    wrap(cs.getAll()),
    wrap(tx.objectStore("meta").get("main")),
  ]);
  if (!meta) return null;
  const cards = {};
  keys.forEach((k, i) => (cards[k] = vals[i]));
  return { ...freshProgress(), ...meta, cards };
}

// Khởi động: mở IndexedDB, nạp tiến độ; nếu chưa có thì chuyển dữ liệu cũ từ localStorage sang.
// Không bao giờ ném lỗi: thất bại thì tự dùng localStorage.
export async function initStorage() {
  try {
    db = await openDb();
    let p = await readAll();
    let written = true; // p đã nằm trong IndexedDB?
    if (!p) {
      p = hasLocal() ? readLocal() : freshProgress();
      written = hasLocal();
      if (hasLocal()) {
        await writeAll(p);
        const check = await readAll(); // đọc lại để chắc chắn đã ghi đủ rồi mới xóa bản cũ
        if (!check || Object.keys(check.cards).length !== Object.keys(p.cards).length)
          throw new Error("Chuyển dữ liệu sang IndexedDB không đầy đủ");
        try {
          localStorage.removeItem(STORE);
        } catch {
          /* bỏ qua */
        }
      }
    }
    cache = p;
    // Lần chạy đầu chưa có gì trong IndexedDB: để ảnh chụp rỗng thì lần lưu đầu tiên mới ghi cả meta
    persisted = written ? snapshot(p) : { cards: new Map(), meta: "" };
    backend = "idb";
    navigator.storage?.persist?.();
  } catch (e) {
    lastError = e;
    try {
      db?.close();
    } catch {
      /* bỏ qua */
    }
    db = null;
    backend = "local";
    cache = readLocal();
  }
  return backend;
}

export const storageInfo = () => ({ backend, lastError });

export function loadProgress() {
  return cache || readLocal();
}

async function doSave(p) {
  const { cards, meta } = splitProgress(p);
  const metaJson = JSON.stringify(meta);
  const puts = [];
  const dels = [];
  for (const [id, c] of Object.entries(cards))
    if (persisted.cards.get(id) !== c) puts.push([id, c]); // thẻ đổi → object mới
  for (const id of persisted.cards.keys()) if (!(id in cards)) dels.push(id);
  const metaChanged = metaJson !== persisted.meta;
  if (!puts.length && !dels.length && !metaChanged) return;

  const tx = db.transaction(["cards", "meta"], "readwrite");
  const cs = tx.objectStore("cards");
  for (const [id, c] of puts) cs.put(c, id);
  for (const id of dels) cs.delete(id);
  if (metaChanged) tx.objectStore("meta").put(meta, "main");
  await txDone(tx);

  // chỉ cập nhật ảnh chụp sau khi ghi thành công (lỗi thì lần lưu sau sẽ ghi lại)
  for (const [id, c] of puts) persisted.cards.set(id, c);
  for (const id of dels) persisted.cards.delete(id);
  if (metaChanged) persisted.meta = metaJson;
}

export function saveProgress(p) {
  if (backend !== "idb" || !db) {
    try {
      localStorage.setItem(STORE, JSON.stringify(p));
    } catch (e) {
      lastError = e;
    }
    return Promise.resolve();
  }
  const run = () =>
    doSave(p).catch((e) => {
      lastError = e;
    });
  queue = queue.then(run, run);
  return queue;
}

/* ---------- Nhật ký ôn (cho tối ưu FSRS và thống kê tỉ lệ nhớ thực tế) ----------
 * Mỗi lượt chấm thẻ thật (không phải luyện tập / lượt hỏi lại): {c: id thẻ, t: ms, g: 1 | 3, n?: 1 | 0}
 * n = 1: lần học đầu tiên của thẻ mới; n = 0: ôn lại thẻ đã học. Dòng cũ không có n.
 */
const rowOf = (r) => ({
  c: String(r.c),
  t: r.t,
  g: r.g,
  ...(r.n === 0 || r.n === 1 ? { n: r.n } : {}),
});
const readLocalReviews = () => {
  try {
    return JSON.parse(localStorage.getItem(REVIEWS_LS) || "[]");
  } catch {
    return [];
  }
};
const writeLocalReviews = (list) => {
  try {
    localStorage.setItem(REVIEWS_LS, JSON.stringify(list.slice(-REVIEWS_LS_MAX)));
  } catch (e) {
    lastError = e;
  }
};

export async function logReview(entry) {
  try {
    if (backend === "idb" && db) {
      const tx = db.transaction("reviews", "readwrite");
      tx.objectStore("reviews").add(rowOf(entry));
      await txDone(tx);
    } else {
      const list = readLocalReviews();
      list.push(rowOf(entry));
      writeLocalReviews(list);
    }
  } catch (e) {
    lastError = e; // không bao giờ làm gián đoạn việc học
  }
}

// Hoàn tác lượt chấm vừa rồi → bỏ dòng nhật ký tương ứng
export async function removeReview(c, t) {
  try {
    if (backend === "idb" && db) {
      const tx = db.transaction("reviews", "readwrite");
      const s = tx.objectStore("reviews");
      const rows = await wrap(s.index("t").getAll(t));
      for (const r of rows) if (r.c === String(c)) s.delete(r.seq);
      await txDone(tx);
    } else {
      writeLocalReviews(readLocalReviews().filter((r) => !(r.c === String(c) && r.t === t)));
    }
  } catch (e) {
    lastError = e;
  }
}

export async function getReviews() {
  try {
    if (backend === "idb" && db) {
      const rows = await wrap(db.transaction("reviews", "readonly").objectStore("reviews").getAll());
      return rows.map(rowOf).sort((a, b) => a.t - b.t);
    }
    return readLocalReviews().sort((a, b) => a.t - b.t);
  } catch (e) {
    lastError = e;
    return [];
  }
}

// Nhập nhật ký từ file sao lưu, bỏ dòng trùng (cùng thẻ + cùng thời điểm). Trả về số dòng mới.
export async function importReviews(list) {
  const valid = (Array.isArray(list) ? list : []).filter(
    (r) => r && r.c != null && Number.isFinite(r.t) && (r.g === 1 || r.g === 3)
  );
  if (!valid.length) return 0;
  const have = new Set((await getReviews()).map((r) => `${r.c}:${r.t}`));
  const fresh = valid.filter((r) => !have.has(`${r.c}:${r.t}`));
  try {
    if (backend === "idb" && db) {
      const tx = db.transaction("reviews", "readwrite");
      const s = tx.objectStore("reviews");
      for (const r of fresh) s.add(rowOf(r));
      await txDone(tx);
    } else {
      writeLocalReviews([...readLocalReviews(), ...fresh.map(rowOf)]);
    }
  } catch (e) {
    lastError = e;
    return 0;
  }
  return fresh.length;
}

export async function clearReviews() {
  try {
    if (backend === "idb" && db) {
      const tx = db.transaction("reviews", "readwrite");
      tx.objectStore("reviews").clear();
      await txDone(tx);
    } else {
      localStorage.removeItem(REVIEWS_LS);
    }
  } catch (e) {
    lastError = e;
  }
}

// Dùng cho test: đưa module về trạng thái ban đầu
export function __resetStorageForTests() {
  try {
    db?.close();
  } catch {
    /* bỏ qua */
  }
  db = null;
  backend = "local";
  cache = null;
  persisted = { cards: new Map(), meta: "" };
  queue = Promise.resolve();
  lastError = null;
}

// Gộp 2 bản tiến độ (khi nhập file): mỗi từ giữ bản ôn gần nhất;
// thống kê từng ngày lấy số lớn hơn; danh sách riêng gộp theo id.
export function mergeProgress(a, b) {
  const reset = Math.max(a.resetAt || 0, b.resetAt || 0);
  const resetDay = reset ? new Date(reset).toLocaleDateString("en-CA") : "";
  const cards = {};
  for (const src of [a.cards || {}, b.cards || {}]) {
    for (const [id, c] of Object.entries(src)) {
      if ((c.lastReviewed || 0) < reset) continue;
      if (!cards[id] || (c.lastReviewed || 0) > (cards[id].lastReviewed || 0))
        cards[id] = c;
    }
  }
  const stats = {};
  for (const src of [a.stats || {}, b.stats || {}]) {
    for (const [d, s] of Object.entries(src)) {
      if (resetDay && d < resetDay) continue;
      const m = stats[d] || {
        reviewed: 0,
        correct: 0,
        newLearned: 0,
        practiced: 0,
      };
      stats[d] = {
        reviewed: Math.max(m.reviewed, s.reviewed || 0),
        correct: Math.max(m.correct, s.correct || 0),
        newLearned: Math.max(m.newLearned, s.newLearned || 0),
        practiced: Math.max(m.practiced || 0, s.practiced || 0),
        ...(m.known || s.known ? { known: Math.max(m.known || 0, s.known || 0) } : {}),
      };
    }
  }
  const lists = [...(a.lists || [])];
  for (const l of b.lists || [])
    if (!lists.some((x) => x.id === l.id)) lists.push(l);
  return {
    ...a,
    cards,
    stats,
    lists,
    settings: { ...(b.settings || {}), ...(a.settings || {}) },
    resetAt: reset || undefined,
  };
}

// Tải file sao lưu JSON về máy; trả về mốc thời gian xuất.
// `reviews` là nhật ký ôn (từ getReviews()) để mang theo sang máy khác.
export function downloadBackup(progress, dayKey, reviews = []) {
  const lastExportAt = Date.now();
  const data = {
    ...progress,
    lastExportAt,
    app: "toeic-recall",
    version: 3,
    reviews,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `toeic-recall-${dayKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return lastExportAt;
}
