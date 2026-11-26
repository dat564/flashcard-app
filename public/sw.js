/* Service worker: chạy offline.
 *  - Trang (điều hướng): ưu tiên mạng, mất mạng thì dùng bản đã lưu.
 *  - JS/CSS/icon (file có hash, ít đổi): lưu rồi dùng lại, cập nhật ngầm.
 *  - Audio: lưu dần khi nghe (cache-first), có hỗ trợ Range cho Safari.
 *  - Nhắc học khi app đóng (Periodic Background Sync) và mở app khi bấm vào thông báo.
 * Đổi VERSION để buộc người dùng tải lại bản mới.
 */
const VERSION = "v7";
const SHELL = `toeic-shell-${VERSION}`;
const AUDIO = "toeic-audio-v2"; // v2: bỏ cache cũ có thể chứa phản hồi không phải audio
const SCOPE = self.registration.scope;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll(
          ["", "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"].map(
            (p) => new Request(SCOPE + p, { cache: "reload" })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("toeic-shell-") && k !== SHELL)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Trả về 206 từ bản đã lưu (Safari đòi vậy khi phát audio/video)
async function rangeFrom(res, rangeHeader) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  const start = m && m[1] ? parseInt(m[1], 10) : 0;
  const end = m && m[2] ? Math.min(parseInt(m[2], 10), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
    },
  });
}

// Chỉ coi là audio hợp lệ khi thành công, đúng loại nội dung và không rỗng
// (một số host trả trang HTML với mã 200 cho file không tồn tại; không được cache thứ đó)
const isAudio = (res) =>
  !!res &&
  res.ok &&
  /^(audio\/|application\/octet-stream)/i.test(res.headers.get("Content-Type") || "") &&
  Number(res.headers.get("Content-Length") || 1000) > 500;

async function audioFetch(req) {
  const cache = await caches.open(AUDIO);
  const key = new Request(req.url); // bỏ header Range khi tra cache
  let res = await cache.match(key);
  if (res && !isAudio(res)) {
    await cache.delete(key); // bản lưu hỏng: bỏ và tải lại
    res = undefined;
  }
  if (!res) {
    try {
      res = await fetch(key); // luôn tải đủ file để lưu
    } catch {
      return Response.error();
    }
    if (!isAudio(res)) {
      // Trả lỗi 404 để phần tử audio báo lỗi ngay (app sẽ chuyển sang giọng trình duyệt)
      return new Response(null, { status: 404, statusText: "Not Found" });
    }
    cache.put(key, res.clone());
  }
  const range = req.headers.get("range");
  return range ? rangeFrom(res, range) : res;
}

async function pageFetch(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(SCOPE, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || (await cache.match(SCOPE)) || Response.error();
  }
}

async function assetFetch(req) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(req);
  const net = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // API từ điển... để trình duyệt tự xử lý
  if (req.mode === "navigate") return e.respondWith(pageFetch(req));
  if (url.pathname.endsWith(".mp3")) return e.respondWith(audioFetch(req));
  e.respondWith(assetFetch(req));
});

/* ---------- Nhắc học khi app đã đóng ----------
 * Chỉ chạy ở trình duyệt có Periodic Background Sync (Chrome/Edge, app đã cài); giờ chạy do trình duyệt
 * quyết định nên có thể lệch. iPhone/Safari không hỗ trợ — khi đó dùng lời nhắc qua lịch (.ics).
 * Logic quyết định PHẢI giống reminderDecision() trong src/lib/reminder.js
 * (tests/reminder.test.js chạy cùng các ca kiểm thử cho cả hai).
 */
const REMIND_TAG = "study-reminder";
const REMIND_WINDOW_MIN = 4 * 60;
const lastKey = () => `${location.origin}/__reminder__/last-notified`;
const dayKey = (d) => d.toLocaleDateString("en-CA");
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? "" : s).trim());
  if (!m) return null;
  return +m[1] > 23 || +m[2] > 59 ? null : +m[1] * 60 + +m[2];
};

// Đọc cài đặt, thống kê và số thẻ đến hạn từ IndexedDB của app.
// Nếu DB chưa tồn tại thì HỦY việc tạo (tránh tạo DB rỗng làm app không dựng được kho dữ liệu).
function readAppState(now) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open("toeic-recall-db");
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      try {
        req.transaction.abort();
      } catch {
        /* bỏ qua */
      }
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(["meta", "cards"], "readonly");
        const metaReq = tx.objectStore("meta").get("main");
        const cardsReq = tx.objectStore("cards").getAll();
        tx.oncomplete = () => {
          db.close();
          const meta = metaReq.result || {};
          let due = 0;
          for (const c of cardsReq.result || []) if (c && c.dueAt && c.dueAt <= now) due++;
          resolve({ settings: meta.settings || {}, stats: meta.stats || {}, due });
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
}

function shouldRemind(now, reminder, stats, last) {
  if (!reminder || reminder.enabled !== true) return null;
  const day = dayKey(now);
  if (last === day) return null;
  const a = stats && stats[day];
  if (a && (a.reviewed || 0) + (a.practiced || 0) > 0) return null;
  const start = parseTime(reminder.time);
  const from = start == null ? 20 * 60 : start;
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < from || mins >= Math.min(from + REMIND_WINDOW_MIN, 24 * 60)) return null;
  return day;
}

async function runReminder() {
  const now = new Date();
  const st = await readAppState(now.getTime());
  if (!st) return;
  const reminder = st.settings.reminder;
  if (reminder && reminder.enabled === true && reminder.badge !== false && self.navigator && self.navigator.setAppBadge) {
    try {
      await (st.due > 0 ? self.navigator.setAppBadge(st.due) : self.navigator.clearAppBadge());
    } catch {
      /* bỏ qua */
    }
  }
  if (typeof Notification !== "undefined" && Notification.permission !== "granted") return;
  const cache = await caches.open("toeic-reminder");
  const prev = await cache.match(lastKey());
  const day = shouldRemind(now, reminder, st.stats, prev ? (await prev.text()).trim() : "");
  if (!day) return;
  await cache.put(lastKey(), new Response(day)); // ghi trước khi hiện để không nhắc đúp với trang
  await self.registration.showNotification("Đến giờ ôn từ vựng TOEIC", {
    body:
      st.due > 0
        ? `Hôm nay có ${st.due} thẻ đến hạn ôn. Học một phiên ngắn nhé!`
        : "Hôm nay bạn chưa học. Học vài từ mới để giữ nhịp nhé!",
    icon: SCOPE + "icon-192.png",
    badge: SCOPE + "icon-192.png",
    tag: "study-reminder",
    lang: "vi",
    data: { url: SCOPE },
  });
}

self.addEventListener("periodicsync", (e) => {
  if (e.tag === REMIND_TAG) e.waitUntil(runReminder());
});

// Bấm vào thông báo: đưa cửa sổ app đang mở lên trước, chưa mở thì mở app
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || SCOPE;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.startsWith(SCOPE) && "focus" in c) return c.focus();
      return self.clients.openWindow(target);
    })
  );
});
