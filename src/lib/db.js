// Lớp mỏng bọc IndexedDB (promise). Chỉ dùng cho lib/storage.js.
export const DB_NAME = "toeic-recall-db";
export const DB_VERSION = 1;

export function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Trình duyệt không có IndexedDB"));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      // thẻ: key = id từ (chuỗi), value = trạng thái ôn của thẻ
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards");
      // meta: key "main" = mọi thứ ngoài thẻ (thống kê, danh sách riêng, cài đặt...)
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      // reviews: nhật ký từng lượt ôn {seq, c: id thẻ, t: thời điểm, g: 1|3}; dùng để tối ưu FSRS
      if (!db.objectStoreNames.contains("reviews")) {
        const s = db.createObjectStore("reviews", { keyPath: "seq", autoIncrement: true });
        s.createIndex("t", "t");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB bị chặn bởi tab khác"));
  });
}

export const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Giao dịch bị hủy"));
  });
