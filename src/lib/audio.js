import { AUDIO_STORE } from "./constants";
import { words } from "./words";

/* ---------- Chọn giọng trình duyệt ---------- */
// Ưu tiên en-US, giọng "Natural/Online" của Edge, rồi Google US English (Chrome).
export function scoreVoice(v) {
  const n = v.name || "",
    lang = (v.lang || "").replace("_", "-").toLowerCase();
  if (!lang.startsWith("en")) return -1;
  let s = lang === "en-us" ? 100 : 40;
  if (/natural/i.test(n)) s += 60;
  if (/online/i.test(n)) s += 20;
  if (/aria|jenny|guy|ava|andrew|emma|brian|michelle/i.test(n)) s += 15;
  if (/google us english/i.test(n)) s += 30;
  if (/samantha|alex|allison/i.test(n)) s += 20;
  return s;
}
export const pickVoice = (voices, saved) =>
  voices.find((v) => v.voiceURI === saved) ||
  [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ||
  null;

/* ---------- Giọng người thật ---------- */
const audioCache = new Map(); // từ -> url | null (null = từ điển không có)
try {
  for (const [k, v] of Object.entries(
    JSON.parse(localStorage.getItem(AUDIO_STORE) || "{}")
  ))
    audioCache.set(k, v || null);
} catch {
  /* bỏ qua */
}
let audioSaveTimer = 0;
const setAudioCache = (key, url) => {
  audioCache.set(key, url);
  clearTimeout(audioSaveTimer);
  audioSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        AUDIO_STORE,
        JSON.stringify(
          Object.fromEntries([...audioCache].map(([k, v]) => [k, v || ""]))
        )
      );
    } catch {
      /* đầy bộ nhớ thì thôi */
    }
  }, 1500);
};
const audioInflight = new Map();
const audioSlug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const localAudio = new Set(words.map((w) => w.word.trim().toLowerCase()));

export async function getHumanAudio(word) {
  const key = word.toLowerCase().trim();
  if (localAudio.has(key)) return `/audio/${audioSlug(key)}.mp3`;
  if (audioCache.has(key)) return audioCache.get(key);
  if (!/^[a-z'-]+$/i.test(key)) {
    setAudioCache(key, null);
    return null;
  }
  if (audioInflight.has(key)) return audioInflight.get(key);
  const job = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
          key
        )}`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (r.status === 404) {
        setAudioCache(key, null);
        return null;
      }
      if (!r.ok) return null;
      const auds = (await r.json())
        .flatMap((e) => e.phonetics || [])
        .map((p) => p.audio)
        .filter(Boolean);
      const url =
        auds.find((a) => /-us\./i.test(a)) ||
        auds.find((a) => /\bus\b/i.test(a)) ||
        auds[0] ||
        null;
      setAudioCache(key, url);
      return url;
    } catch {
      return null;
    }
  })();
  audioInflight.set(key, job);
  try {
    return await job;
  } finally {
    audioInflight.delete(key);
  }
}

// Tải sẵn file âm thanh của các thẻ sắp tới
export const audioEls = new Map();
export function preloadAudio(word) {
  if (!word) return;
  const key = word.toLowerCase().trim();
  if (audioEls.has(key)) return;
  getHumanAudio(word).then((url) => {
    if (!url || audioEls.has(key)) return;
    const a = new Audio();
    a.preload = "auto";
    a.src = url;
    audioEls.set(key, a);
    if (audioEls.size > 40) audioEls.delete(audioEls.keys().next().value);
  });
}

// "Mở khóa" âm thanh ở lần chạm đầu tiên (iOS Safari chỉ cho phát sau khi tương tác)
let audioUnlocked = false;
export function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    const a = new Audio(
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
    );
    a.volume = 0;
    a.play().catch(() => (audioUnlocked = false));
  } catch {
    audioUnlocked = false;
  }
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {
    /* bỏ qua */
  }
}
