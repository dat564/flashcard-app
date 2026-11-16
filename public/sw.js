/* Service worker: chạy offline.
 *  - Trang (điều hướng): ưu tiên mạng, mất mạng thì dùng bản đã lưu.
 *  - JS/CSS/icon (file có hash, ít đổi): lưu rồi dùng lại, cập nhật ngầm.
 *  - Audio: lưu dần khi nghe (cache-first), có hỗ trợ Range cho Safari.
 * Đổi VERSION để buộc người dùng tải lại bản mới.
 */
const VERSION = "v4";
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
