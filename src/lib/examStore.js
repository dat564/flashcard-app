// Lưu đề do người dùng nhập + lịch sử làm bài. Tách riêng khỏi tiến độ flashcard
// (IndexedDB "toeic-recall-exam"; không dùng được thì tự chuyển sang localStorage).
const DB_NAME = "toeic-recall-exam";
const LS_KEY = "toeic-recall-exam-v1";
const MAX_ATTEMPTS = 400;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Không có IndexedDB"));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("sets")) db.createObjectStore("sets"); // key = id đề
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv"); // "attempts", "mistakes"
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  dbp.catch(() => {
    dbp = null;
  });
  return dbp;
}
const wrap = (rq) =>
  new Promise((res, rej) => {
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
const done = (tx) =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = tx.onabort = () => rej(tx.error);
  });

const readLocal = () => {
  try {
    return { sets: {}, kv: {}, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return { sets: {}, kv: {} };
  }
};
const writeLocal = (o) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  } catch {
    /* đầy bộ nhớ thì thôi */
  }
};

async function db() {
  try {
    return await open();
  } catch {
    return null;
  }
}

export async function loadExamData() {
  const d = await db();
  if (!d) {
    const l = readLocal();
    return { sets: Object.values(l.sets), attempts: l.kv.attempts || [], mistakes: l.kv.mistakes || {} };
  }
  const tx = d.transaction(["sets", "kv"], "readonly");
  const [sets, attempts, mistakes] = await Promise.all([
    wrap(tx.objectStore("sets").getAll()),
    wrap(tx.objectStore("kv").get("attempts")),
    wrap(tx.objectStore("kv").get("mistakes")),
  ]);
  return { sets, attempts: attempts || [], mistakes: mistakes || {} };
}

export async function saveSet(set) {
  const d = await db();
  if (!d) {
    const l = readLocal();
    l.sets[set.id] = set;
    return writeLocal(l);
  }
  const tx = d.transaction("sets", "readwrite");
  tx.objectStore("sets").put(set, set.id);
  await done(tx);
}

export async function deleteSet(id) {
  const d = await db();
  if (!d) {
    const l = readLocal();
    delete l.sets[id];
    return writeLocal(l);
  }
  const tx = d.transaction("sets", "readwrite");
  tx.objectStore("sets").delete(id);
  await done(tx);
}

async function putKv(key, value) {
  const d = await db();
  if (!d) {
    const l = readLocal();
    l.kv[key] = value;
    return writeLocal(l);
  }
  const tx = d.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await done(tx);
}
export const saveAttempts = (list) => putKv("attempts", list.slice(-MAX_ATTEMPTS));
export const saveMistakes = (map) => putKv("mistakes", map);

// Sao lưu / khôi phục (đề nhập + lịch sử + câu sai) dưới dạng một file JSON
export async function exportExamBackup() {
  const { sets, attempts, mistakes } = await loadExamData();
  return {
    format: "toeic-recall-exam-backup",
    version: 1,
    exportedAt: Date.now(),
    sets: sets.filter((s) => s.source !== "builtin"),
    attempts,
    mistakes,
  };
}

// Gộp (không ghi đè): đề trùng id giữ bản đang có; lần làm bài trùng thời điểm bị bỏ
export function mergeExamBackup(cur, b) {
  const sets = [...cur.sets];
  for (const s of b.sets || []) if (!sets.some((x) => x.id === s.id)) sets.push(s);
  const seen = new Set(cur.attempts.map((a) => a.t));
  const attempts = [...cur.attempts, ...(b.attempts || []).filter((a) => !seen.has(a.t))]
    .sort((x, y) => x.t - y.t)
    .slice(-MAX_ATTEMPTS);
  const mistakes = { ...(b.mistakes || {}), ...cur.mistakes };
  return { sets, attempts, mistakes };
}

export function closeExamStore() {
  dbp?.then((d) => d.close()).catch(() => {});
  dbp = null;
}
