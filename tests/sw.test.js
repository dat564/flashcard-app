import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import vm from "vm";

const SRC = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const URL_MP3 = "https://x.test/app/audio/abandon.mp3";
const MP3 = new Uint8Array(1000).map((_, i) => i % 251);

// Cache API giả (dùng Request/Response thật của Node)
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

function makeSw(network) {
  const stores = new Map();
  const listeners = {};
  const state = { netHits: 0 };
  const caches = {
    open: async (n) => (stores.has(n) ? stores.get(n) : (stores.set(n, new FakeCache()), stores.get(n))),
    keys: async () => [...stores.keys()],
    delete: async () => true,
  };
  const sandbox = {
    self: { registration: { scope: "https://x.test/app/" }, addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim() {} } },
    caches,
    fetch: async (req) => {
      state.netHits++;
      return network(req);
    },
    Request,
    Response,
    URL,
    location: { origin: "https://x.test" },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  const ask = async (headers = {}, url = URL_MP3) => {
    let p;
    listeners.fetch({ request: new Request(url, { headers }), respondWith: (x) => (p = x) });
    const res = await p;
    const body = new Uint8Array(await res.arrayBuffer());
    return { res, body, status: res.status };
  };
  return { ask, stores, state };
}

const okMp3 = () => new Response(MP3, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": "1000" } });

describe("service worker — audio", () => {
  let sw;
  beforeEach(() => (sw = makeSw(okMp3)));

  it("lần đầu và các lần lặp lại đều trả 206 đúng nội dung; chỉ tải mạng 1 lần", async () => {
    for (let i = 0; i < 4; i++) {
      const { res, body } = await sw.ask({ Range: "bytes=0-" });
      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 0-999/1000");
      expect(body.length).toBe(1000);
      expect(body[7]).toBe(MP3[7]);
    }
    expect(sw.state.netHits).toBe(1);
  });

  it("hỗ trợ Range giữa chừng và không có Range", async () => {
    await sw.ask({ Range: "bytes=0-" });
    const mid = await sw.ask({ Range: "bytes=500-" });
    expect(mid.status).toBe(206);
    expect(mid.body.length).toBe(500);
    expect(mid.body[0]).toBe(MP3[500]);
    const probe = await sw.ask({ Range: "bytes=0-1" });
    expect(probe.body.length).toBe(2);
    const full = await sw.ask();
    expect(full.status).toBe(200);
    expect(full.body.length).toBe(1000);
  });

  it("host trả HTML 200 cho file không có: trả 404, KHÔNG cache", async () => {
    const html = () => new Response("<html>SPA</html>".repeat(100), { status: 200, headers: { "Content-Type": "text/html" } });
    const sw2 = makeSw(html);
    expect((await sw2.ask({ Range: "bytes=0-" })).status).toBe(404);
    expect((await sw2.ask({ Range: "bytes=0-" })).status).toBe(404);
    expect(sw2.state.netHits).toBe(2); // không bị "đầu độc" cache: lần sau vẫn hỏi lại mạng
  });

  it("bản lưu hỏng (không phải audio) bị loại và tải lại", async () => {
    const cache = await (async () => {
      await sw.ask({ Range: "bytes=0-" }); // tạo cache v2
      return sw.stores.get("toeic-audio-v2");
    })();
    cache.m.set(URL_MP3, new Response("<html/>".repeat(200), { status: 200, headers: { "Content-Type": "text/html" } }));
    const { res, body } = await sw.ask({ Range: "bytes=0-" });
    expect(res.status).toBe(206);
    expect(body.length).toBe(1000);
    expect(sw.state.netHits).toBe(2);
  });

  it("mất mạng và chưa có trong cache: báo lỗi mạng (không treo)", async () => {
    const sw3 = makeSw(() => {
      throw new TypeError("offline");
    });
    const { res } = await sw3.ask({ Range: "bytes=0-" }).catch(() => ({ res: { type: "error" } }));
    expect(res.type).toBe("error");
  });

  it("dùng bộ nhớ audio mới (v2) để bỏ cache cũ có thể hỏng", () => {
    expect(SRC).toContain('"toeic-audio-v2"');
  });
});
