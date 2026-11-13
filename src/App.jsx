import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FolderOpen,
  Layers,
  Library,
  Plus,
  RotateCcw,
  Search,
  Shuffle,
  Trash2,
  Upload,
  Volume2,
  X,
  Undo2,
  Flame,
  Target,
  Pencil,
  Sun,
  Moon,
  Monitor,
  Download,
} from "lucide-react";
import { parseVocabFile } from "./vocabImport";
import "./App.css";

// Gộp mọi file trong src/data/words/*.json, bỏ từ/ID trùng.
const wordModules = import.meta.glob("./data/words/*.json", { eager: true });
const words = (() => {
  const seenWord = new Set(),
    seenId = new Set(),
    out = [];
  for (const key of Object.keys(wordModules).sort()) {
    const list = wordModules[key].default || wordModules[key];
    for (const w of list) {
      const k = w.word.trim().toLowerCase();
      if (seenWord.has(k) || seenId.has(w.id)) continue;
      seenWord.add(k);
      seenId.add(w.id);
      out.push(w);
    }
  }
  return out;
})();

const STORE = "toeic-recall-v1";
const VOICE_KEY = "toeic-recall-voice",
  RATE_KEY = "toeic-recall-rate",
  MODE_KEY = "toeic-recall-voice-mode",
  AUTO_KEY = "toeic-recall-auto-speak-v2", // v2: mặc định BẬT (khóa cũ đã lỡ lưu "tắt")
  THEME_KEY = "toeic-recall-theme",
  AUDIO_STORE = "toeic-recall-audio-v1";
const QUIZ_LEN = 10; // số câu mỗi lượt "điền từ"

// Áp giao diện đã lưu ngay khi tải để không bị nháy sáng → tối
try {
  const t = localStorage.getItem(THEME_KEY);
  if (t === "light" || t === "dark")
    document.documentElement.setAttribute("data-theme", t);
} catch {
  /* bỏ qua */
}
function setMeta(name, content) {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.name = name;
    document.head.appendChild(m);
  }
  m.content = content;
}
const DAY = 86400000;
const PRACTICE_MAX = 50; // mỗi lượt "ôn ngẫu nhiên" tối đa bấy nhiêu thẻ
const SWIPE_AT = 110; // kéo quá ngưỡng này (px) thì tính là đã chọn
// Màn hình nhỏ thì ngưỡng thấp hơn (22% chiều rộng) để vuốt nhẹ tay cũng ăn
const swipeAt = () => Math.min(SWIPE_AT, window.innerWidth * 0.22);
const EASE_BACK = "transform .32s cubic-bezier(.2,.9,.3,1.15)";
const EASE_OUT = "transform .24s cubic-bezier(.3,.7,.4,1)";
const todayKey = () => new Date().toLocaleDateString("en-CA");
const freshProgress = () => ({
  cards: {},
  stats: {},
  lists: [],
  settings: { newPerDay: 20 },
  createdAt: Date.now(),
});
const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
const metaOf = (w) => [w.pos, w.ipa].filter(Boolean).join("  ·  ");

function loadProgress() {
  try {
    return {
      ...freshProgress(),
      ...JSON.parse(localStorage.getItem(STORE) || "{}"),
    };
  } catch {
    return freshProgress();
  }
}
function dueAt(card) {
  return !card || !card.dueAt ? 0 : card.dueAt;
}

// Lịch ôn (học 1 lần/ngày): thẻ đến hạn theo NGÀY, nên hôm đó học lúc nào cũng gặp lại.
//   "Chưa nhớ" -> ôn lại vào ngày mai.
//   "Đã nhớ"   -> 3 ngày, 7 ngày, 14 ngày, rồi nhân ~2.2 mỗi lần (tối đa 180 ngày).
const AGAIN_DAYS = 1;
const MAX_DAYS = 180;
const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
function nextSchedule(card, rating) {
  const now = Date.now();
  const c = card || {};
  let reps = c.reps || 0,
    interval = c.interval || 0,
    lapses = c.lapses || 0;
  if (rating === "again") {
    return {
      dueAt: startOfDay(now + AGAIN_DAYS * DAY),
      reps: 0,
      interval: AGAIN_DAYS,
      ease: c.ease || 2.5,
      lapses: lapses + 1,
      status: "learning",
    };
  }
  interval =
    reps === 0
      ? 3
      : reps === 1
      ? 7
      : reps === 2
      ? 14
      : Math.min(MAX_DAYS, Math.max(14, interval) * 2.2);
  interval = Math.round(interval);
  reps += 1;
  return {
    dueAt: startOfDay(now + interval * DAY),
    reps,
    interval,
    ease: c.ease || 2.5,
    lapses,
    status: "review",
  };
}
// "Từ khó": từng bấm "Chưa nhớ" từ 3 lần trở lên và chưa nhớ liền 3 lần sau đó.
// Khi nhớ liền 3 lần (reps ≥ 3) thì tự hết khó.
const HARD_LAPSES = 3;
const HARD_REPS = 3;
const isHard = (c) =>
  !!c && (c.lapses || 0) >= HARD_LAPSES && (c.reps || 0) < HARD_REPS;

/* ---------- chuỗi ngày, bản đồ nhiệt, dự báo ---------- */
const dayKeyOf = (d) => d.toLocaleDateString("en-CA");
const activityOf = (s) => (s ? (s.reviewed || 0) + (s.practiced || 0) : 0);
function calcStreaks(stats = {}) {
  const keys = Object.keys(stats)
    .filter((k) => activityOf(stats[k]) > 0)
    .sort();
  let best = 0,
    run = 0,
    prev = null;
  for (const k of keys) {
    run =
      prev && Math.round((new Date(k) - new Date(prev)) / DAY) === 1
        ? run + 1
        : 1;
    best = Math.max(best, run);
    prev = k;
  }
  // chuỗi hiện tại: tính lùi từ hôm nay (hôm nay chưa học thì tính từ hôm qua, chưa mất chuỗi)
  let cur = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!activityOf(stats[dayKeyOf(d)])) d.setDate(d.getDate() - 1);
  while (activityOf(stats[dayKeyOf(d)]) > 0) {
    cur++;
    d.setDate(d.getDate() - 1);
  }
  return { cur, best };
}
// 13 tuần gần nhất, mỗi cột một tuần (T2 → CN)
function buildHeatmap(stats = {}, weeks = 13) {
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const wd = (t.getDay() + 6) % 7;
  const start = new Date(t);
  start.setDate(t.getDate() - wd - 7 * (weeks - 1));
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKeyOf(d);
    out.push({ key, n: d > t ? -1 : activityOf(stats[key]) });
  }
  return out;
}
const heatLevel = (n) =>
  n < 0 ? "x" : n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4;
// Số thẻ đến hạn trong 7 ngày tới (hôm nay gồm cả thẻ quá hạn)
function buildForecast(cards = {}, days = 7) {
  const base = startOfDay(Date.now());
  const out = Array.from({ length: days }, (_, i) => ({
    i,
    n: 0,
    t: base + i * DAY,
  }));
  for (const c of Object.values(cards)) {
    if (!c || !c.dueAt) continue;
    const idx = Math.max(0, Math.round((c.dueAt - base) / DAY));
    if (idx < days) out[idx].n++;
  }
  return out;
}

function fmtInterval(days) {
  const min = days * 1440;
  if (min < 60) return `${Math.max(1, Math.round(min))} phút`;
  if (min < 1440) return `${Math.round(min / 60)} giờ`;
  const d = Math.round(days);
  return d >= 30 ? `${Math.round(d / 30)} tháng` : `${d} ngày`;
}

/* ---------- Giọng đọc ---------- */
// Chấm điểm giọng tiếng Anh: ưu tiên en-US, giọng "Natural/Online" của Edge, rồi Google US English (Chrome).
function scoreVoice(v) {
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
const pickVoice = (voices, saved) =>
  voices.find((v) => v.voiceURI === saved) ||
  [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ||
  null;

// Giọng người thật (cùng một file âm thanh trên mọi trình duyệt). Chỉ có cho từ đơn; thiếu thì dùng giọng trình duyệt.
// URL âm thanh được nhớ trong localStorage nên lần sau không phải hỏi mạng nữa.
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
async function getHumanAudio(word) {
  const key = word.toLowerCase().trim();
  if (localAudio.has(key)) return `/audio/${audioSlug(key)}.mp3`;
  if (audioCache.has(key)) return audioCache.get(key);
  if (!/^[a-z'-]+$/i.test(key)) {
    setAudioCache(key, null);
    return null;
  }
  if (audioInflight.has(key)) return audioInflight.get(key); // gộp các lần hỏi trùng
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
// Tải sẵn file âm thanh của các thẻ sắp tới để bấm/đọc là phát ngay, không chờ mạng
const audioEls = new Map();
function preloadAudio(word) {
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
// "Mở khóa" âm thanh ở lần chạm đầu tiên: trình duyệt (nhất là iOS Safari) chỉ cho tự phát tiếng
// sau khi người dùng đã tương tác, nên phát thử một đoạn im lặng ngay trong cú chạm.
let audioUnlocked = false;
function unlockAudio() {
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

/* ---------- Điền từ vào câu ---------- */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pluralOf = (w) =>
  /(s|x|z|ch|sh)$/.test(w)
    ? w + "es"
    : /[^aeiou]y$/.test(w)
    ? w.slice(0, -1) + "ies"
    : w + "s";
const pastOf = (w) =>
  /e$/.test(w)
    ? w + "d"
    : /[^aeiou]y$/.test(w)
    ? w.slice(0, -1) + "ied"
    : w + "ed";
const ingOf = (w) =>
  /ie$/.test(w)
    ? w.slice(0, -2) + "ying"
    : /[^e]e$/.test(w)
    ? w.slice(0, -1) + "ing"
    : w + "ing";
const FORMS = { base: (w) => w, s: pluralOf, ed: pastOf, ing: ingOf };
// từ tận cùng phụ-nguyên-phụ (plan, submit...) khi chia -ed/-ing phải nhân đôi phụ âm; không đoán được nên bỏ khỏi đáp án nhiễu
const safeFor = (kind, w) =>
  kind === "base" ||
  kind === "s" ||
  (!w.includes(" ") && !/[^aeiou][aeiou][^aeiouwxy]$/.test(w));
// Tìm trong câu ví dụ đúng từ đó (hoặc dạng số nhiều / -ed / -ing) để khoét thành chỗ trống
function makeBlank(w) {
  const ex = w.example;
  const base = (w.word || "").trim().toLowerCase();
  if (!ex || !base || /[()/]/.test(base)) return null;
  for (const kind of ["base", "s", "ed", "ing"]) {
    if (kind !== "base" && base.includes(" ")) break;
    const re = new RegExp(
      "(^|[^A-Za-z])(" + escapeRe(FORMS[kind](base)) + ")(?![A-Za-z])",
      "i"
    );
    const m = re.exec(ex);
    if (m) {
      const start = m.index + m[1].length;
      return {
        kind,
        before: ex.slice(0, start),
        after: ex.slice(start + m[2].length),
        shown: m[2],
      };
    }
  }
  return null;
}
// 3 đáp án nhiễu: cùng từ loại, cùng số chữ, chia cùng dạng với đáp án
function pickDistractors(answer, kind, pos, pool, sentenceLower) {
  const wc = answer.trim().split(/\s+/).length;
  const lower = answer.toLowerCase();
  const cand = shuffle(
    pool.filter((d) => {
      const dw = (d.word || "").trim().toLowerCase();
      return (
        dw &&
        dw !== lower &&
        !/[()/]/.test(dw) &&
        dw.split(/\s+/).length === wc &&
        safeFor(kind, dw)
      );
    })
  );
  const same = cand.filter((d) => d.pos && d.pos === pos);
  const rest = cand.filter((d) => !(d.pos && d.pos === pos));
  const out = [];
  const seen = new Set([lower]);
  for (const d of [...same, ...rest]) {
    const form = FORMS[kind](d.word.trim().toLowerCase());
    if (seen.has(form) || sentenceLower.includes(form)) continue;
    seen.add(form);
    out.push(form);
    if (out.length === 3) break;
  }
  return out;
}

const RATINGS = [
  { key: "again", label: "Chưa nhớ", Icon: X },
  { key: "good", label: "Đã nhớ", Icon: Check },
];

// Gộp 2 bản tiến độ (khi nhập file): mỗi từ giữ bản ôn gần nhất; thống kê từng ngày lấy số lớn hơn; danh sách riêng gộp theo id.
function mergeProgress(a, b) {
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

export default function App() {
  const [progress, setProgress] = useState(loadProgress);
  const [tab, setTab] = useState("study");
  const [direction, setDirection] = useState("en-vi");
  const [showAnswer, setShowAnswer] = useState(false);
  const [session, setSession] = useState([]);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(100);
  const [newLimit, setNewLimit] = useState(progress.settings?.newPerDay || 20);
  const [deckId, setDeckId] = useState(progress.settings?.activeDeck || "main");
  const [toast, setToast] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openList, setOpenList] = useState(null);
  const [practice, setPractice] = useState(false); // luyện tập: không đổi lịch ôn
  const [lastSession, setLastSession] = useState(null); // {deckId, ids} để "học lại phiên vừa rồi"
  const [undo, setUndo] = useState(null); // trạng thái trước khi chấm thẻ gần nhất
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem(AUTO_KEY) !== "0"
  );
  const [quiz, setQuiz] = useState(null); // lượt "điền từ vào câu"
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "auto"
  );
  const [sysDark, setSysDark] = useState(
    () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  const [installEvt, setInstallEvt] = useState(null);
  const [installed, setInstalled] = useState(
    () =>
      !!window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone === true
  );
  const spokenRef = useRef(""); // thẻ đã tự đọc, để không đọc lặp
  const speakSeq = useRef(0); // đánh số lần đọc để bỏ qua lần cũ đến muộn
  // vuốt thẻ (không dùng state: ghi thẳng vào DOM để không re-render khi kéo)
  const dragRef = useRef(null);
  const stageRef = useRef(null);
  const swipeRef = useRef(null);
  const dxRef = useRef(0);
  const rafRef = useRef(0);
  const leavingRef = useRef(null);
  // giọng đọc
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(
    () => localStorage.getItem(VOICE_KEY) || ""
  );
  const [rate, setRate] = useState(
    () => +(localStorage.getItem(RATE_KEY) || 0.9)
  );
  const [voiceMode, setVoiceMode] = useState(
    () => localStorage.getItem(MODE_KEY) || "human"
  );
  const audioRef = useRef(null);
  const today = todayKey();

  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
    // Ghi localStorage lúc rảnh: stringify cả 3600 thẻ ngay khi chấm điểm sẽ làm khựng animation
    const save = () =>
      localStorage.setItem(STORE, JSON.stringify(progressRef.current));
    const t = setTimeout(() => {
      if (window.requestIdleCallback)
        window.requestIdleCallback(save, { timeout: 2000 });
      else save();
    }, 700);
    return () => clearTimeout(t);
  }, [progress]);
  useEffect(() => {
    const flush = () =>
      localStorage.setItem(STORE, JSON.stringify(progressRef.current));
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem(VOICE_KEY, voiceURI);
    localStorage.setItem(RATE_KEY, String(rate));
    localStorage.setItem(MODE_KEY, voiceMode);
    localStorage.setItem(AUTO_KEY, autoSpeak ? "1" : "0");
  }, [voiceURI, rate, voiceMode, autoSpeak]);
  // Mở khóa âm thanh ở lần chạm / phím đầu tiên trên trang
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener("pointerdown", h, { once: true });
    window.addEventListener("keydown", h, { once: true });
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("keydown", h);
    };
  }, []);
  // Giao diện sáng/tối
  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const dark = theme === "dark" || (theme === "auto" && sysDark);
    setMeta("theme-color", dark ? "#0f1120" : "#ffffff");
  }, [theme, sysDark]);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const h = (e) => setSysDark(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);
  // PWA: manifest, biểu tượng, service worker, nút cài đặt
  useEffect(() => {
    const addLink = (rel, href) => {
      if (document.head.querySelector(`link[rel="${rel}"]`)) return;
      const l = document.createElement("link");
      l.rel = rel;
      l.href = href;
      document.head.appendChild(l);
    };
    addLink("manifest", "/manifest.webmanifest");
    addLink("apple-touch-icon", "/apple-touch-icon.png");
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("mobile-web-app-capable", "yes");
    setMeta("apple-mobile-web-app-title", "TOEIC Recall");
    setMeta("apple-mobile-web-app-status-bar-style", "default");
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content))
      vp.content += ", viewport-fit=cover";
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onBip = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const installApp = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };
  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    navigator.storage?.persist?.();
  }, []); // xin trình duyệt không tự xóa dữ liệu khi thiếu dung lượng
  useEffect(() => {
    // danh sách giọng nạp muộn trên Chrome/Edge, phải nghe sự kiện voiceschanged
    const sy = window.speechSynthesis;
    if (!sy) return;
    const load = () =>
      setVoices(sy.getVoices().filter((v) => scoreVoice(v) >= 0));
    load();
    sy.addEventListener?.("voiceschanged", load);
    return () => sy.removeEventListener?.("voiceschanged", load);
  }, []);

  const speakBrowser = (text) => {
    const sy = window.speechSynthesis;
    if (!sy) return;
    sy.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voices, voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "en-US";
    u.rate = rate;
    sy.speak(u);
  };
  // Phát ngay nếu âm thanh đã được tải sẵn; chưa có thì hỏi từ điển (kết quả được nhớ lại).
  // Chờ quá 0,8 giây thì đọc tạm bằng giọng trình duyệt (file vẫn tải ngầm để lần sau phát ngay).
  const speak = (text) => {
    const seq = ++speakSeq.current;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    if (voiceMode !== "human") return speakBrowser(text);
    const key = text.toLowerCase().trim();
    const play = (a) => {
      try {
        a.currentTime = 0;
      } catch {
        /* chưa tải xong metadata */
      }
      a.playbackRate = rate;
      audioRef.current = a;
      a.play().catch(() => {
        if (seq === speakSeq.current) speakBrowser(text);
      });
    };
    const el = audioEls.get(key);
    if (el) return play(el);
    Promise.race([
      getHumanAudio(text),
      new Promise((r) => setTimeout(() => r("__slow__"), 800)),
    ]).then((url) => {
      if (seq !== speakSeq.current) return; // đã có lần đọc mới hơn
      if (!url || url === "__slow__") return speakBrowser(text);
      const a = new Audio(url);
      audioEls.set(key, a);
      play(a);
    });
  };

  /* ---------- dữ liệu của bộ từ đang học ---------- */
  const cards = progress.cards || {};
  const lists = progress.lists || [];
  const deckList =
    deckId === "main" ? null : lists.find((l) => l.id === deckId) || null;
  const isMain = !deckList;
  const deck = deckList ? deckList.words : words;
  const wordById = useMemo(() => {
    const m = new Map(words.map((w) => [w.id, w]));
    lists.forEach((l) => l.words.forEach((w) => m.set(w.id, w)));
    return m;
  }, [lists]);
  const todayStats = progress.stats?.[today] || {
    reviewed: 0,
    correct: 0,
    newLearned: 0,
  };
  const isLearned = (w) => (cards[w.id]?.reps || 0) > 0;
  const learnedCount = words.reduce((n, w) => n + (isLearned(w) ? 1 : 0), 0);
  const nowMs = Date.now();
  const dueWords = deck.filter(
    (w) => cards[w.id] && dueAt(cards[w.id]) <= nowMs
  );
  const newWords = deck.filter((w) => !cards[w.id]);
  const remainingNew = isMain
    ? Math.max(0, newLimit - (todayStats.newLearned || 0))
    : Infinity; // danh sách riêng: học hết, không giới hạn
  const dueQueue = useMemo(
    () => [...dueWords, ...newWords.slice(0, remainingNew)],
    [progress, today, newLimit, deckId]
  );
  const current = session[index] ? wordById.get(session[index]) : null;
  const dueCount = dueWords.length;
  const deckLearned = deck.filter(isLearned).length;
  const practiceCount = deck.reduce((n, w) => n + (cards[w.id] ? 1 : 0), 0);
  const lastIds =
    lastSession && lastSession.deckId === deckId
      ? lastSession.ids.filter((id) => wordById.has(id))
      : [];
  const hardIds = deck.filter((w) => isHard(cards[w.id])).map((w) => w.id);
  const streak = useMemo(() => calcStreaks(progress.stats), [progress.stats]);
  const heat = useMemo(
    () => (tab === "stats" ? buildHeatmap(progress.stats) : []),
    [tab, progress.stats]
  );
  const forecast = useMemo(
    () => (tab === "stats" ? buildForecast(progress.cards) : []),
    [tab, progress.cards]
  );
  const fcMax = Math.max(1, ...forecast.map((f) => f.n));
  const hardTotal =
    tab === "stats" ? Object.values(cards).filter(isHard).length : 0;
  const blankPool = useMemo(
    () => deck.map((w) => ({ w, b: makeBlank(w) })).filter((x) => x.b),
    [deck]
  );
  const progressPct = Math.round((learnedCount / words.length) * 100);
  const accuracy = todayStats.reviewed
    ? Math.round((todayStats.correct / todayStats.reviewed) * 100)
    : 0;

  const filtered = useMemo(() => {
    if (tab !== "library") return [];
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return words.filter((w) => {
      const match =
        !q ||
        [w.word, w.meaning, w.example, w.ipa].some((v) =>
          (v || "").toLowerCase().includes(q)
        );
      if (!match) return false;
      const c = cards[w.id];
      if (filter === "hard") return isHard(c);
      const status = !c ? "new" : dueAt(c) <= now ? "due" : "learning";
      return filter === "all" || status === filter;
    });
  }, [tab, query, filter, cards]);

  /* ---------- vuốt thẻ ---------- */
  // Ghi thẳng vào DOM (không re-render): thẻ, bóng ở rìa, và thẻ phía sau nhô lên
  const paint = (d, transition = "none") => {
    const el = swipeRef.current,
      st = stageRef.current;
    if (!el || !st) return;
    el.style.transition = transition;
    el.style.transform = `translate(${d}px, ${Math.abs(d) * 0.02}px) rotate(${
      d * 0.035
    }deg)`;
    const p = Math.min(1, Math.abs(d) / swipeAt());
    st.style.setProperty("--yes", d > 0 ? p : 0);
    st.style.setProperty("--no", d < 0 ? p : 0);
    st.style.setProperty("--lift", p);
  };
  const resetSwipe = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    dxRef.current = 0;
    dragRef.current = null;
    leavingRef.current = null;
    paint(0);
  };
  // Thẻ mới đã lên hình: dọn trạng thái vuốt. Chạy trước khi trình duyệt vẽ nên không bị nháy.
  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    dxRef.current = 0;
    dragRef.current = null;
    leavingRef.current = null;
    const st = stageRef.current;
    if (st)
      ["--yes", "--no", "--lift"].forEach((k) => st.style.setProperty(k, 0));
  }, [index, session]);

  const setRating = (rating) => {
    if (!current) return;
    const old = cards[current.id];
    const scheduled = nextSchedule(old, rating);
    // chụp lại trạng thái trước khi chấm để có thể hoàn tác
    setUndo({
      session,
      index,
      id: current.id,
      old,
      day: progress.stats?.[today],
      today,
      practice,
    });
    setProgress((p) => {
      const st = { ...(p.stats || {}) };
      const day = {
        ...(st[today] || { reviewed: 0, correct: 0, newLearned: 0 }),
      };
      if (practice) {
        // luyện tập: chỉ ghi nhận hoạt động (để tính chuỗi ngày), không đổi lịch ôn
        day.practiced = (day.practiced || 0) + 1;
        st[today] = day;
        return { ...p, stats: st };
      }
      day.reviewed += 1;
      if (rating !== "again") day.correct += 1;
      if (!old && typeof current.id === "number") day.newLearned += 1; // chỉ từ kho chung tính vào hạn mức từ mới/ngày
      st[today] = day;
      return {
        ...p,
        cards: {
          ...(p.cards || {}),
          [current.id]: { ...scheduled, lastReviewed: Date.now() },
        },
        stats: st,
      };
    });
    // thẻ "Chưa nhớ" chỉ được hẹn ôn lại ngày mai, không hỏi lại trong phiên này
    const next = index + 1;
    if (next >= session.length) {
      setSession([]);
      setIndex(0);
      setShowAnswer(false);
      setToast("Hoàn thành lượt học! 🎉");
    } else {
      setIndex(next);
      setShowAnswer(false);
    }
  };
  // Hoàn tác thẻ vừa chấm: trả lại lịch ôn, thống kê và vị trí trong phiên
  const undoLast = () => {
    if (!undo || leavingRef.current) return;
    const u = undo;
    setProgress((p) => {
      const st = { ...(p.stats || {}) };
      if (u.day) st[u.today] = u.day;
      else delete st[u.today];
      if (u.practice) return { ...p, stats: st };
      const cs = { ...(p.cards || {}) };
      if (u.old) cs[u.id] = u.old;
      else delete cs[u.id];
      return { ...p, cards: cs, stats: st };
    });
    setUndo(null);
    setSession(u.session);
    setIndex(u.index);
    setShowAnswer(false);
    setTab("study");
    setToast("Đã hoàn tác thẻ vừa rồi");
  };
  // Bay thẻ ra khỏi màn hình (thẻ kế tiếp nhô lên cùng lúc) rồi mới ghi kết quả
  const commit = (rating) => {
    if (leavingRef.current || !current) return;
    leavingRef.current = rating;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    paint(
      (rating === "good" ? 1 : -1) * Math.max(700, window.innerWidth),
      EASE_OUT
    );
    // Thẻ kế tiếp đã hiện sẵn phía sau: đọc luôn ngay lúc vuốt, không đợi thẻ bay xong
    if (autoSpeak && enVi) {
      const nid = session[index + 1];
      const nw = nid != null ? wordById.get(nid) : null;
      if (nw) {
        spokenRef.current = `${nid}-${index + 1}`;
        speak(nw.word);
      }
    }
    setTimeout(() => setRating(rating), 240);
  };
  const onPointerDown = (e) => {
    if (leavingRef.current || e.target.closest("button")) return;
    dragRef.current = {
      x: e.clientX,
      moved: false,
      lx: e.clientX,
      lt: performance.now(),
      v: 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const s = dragRef.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (!s.moved && Math.abs(d) < 8) return;
    s.moved = true;
    dxRef.current = d;
    // vận tốc (px/ms) để nhận ra cú "búng" nhanh dù kéo chưa tới ngưỡng
    const now = performance.now();
    const dt = now - s.lt;
    if (dt > 0) {
      s.v = s.v * 0.6 + ((e.clientX - s.lx) / dt) * 0.4;
      s.lx = e.clientX;
      s.lt = now;
    }
    if (!rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint(dxRef.current);
      });
  };
  const onPointerUp = (e) => {
    const s = dragRef.current;
    dragRef.current = null;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (!s) return;
    if (e.type === "pointercancel") return paint(0, EASE_BACK);
    if (!s.moved) return setShowAnswer((v) => !v); // chạm nhẹ = lật thẻ
    const d = dxRef.current;
    const fling =
      Math.abs(s.v) > 0.5 &&
      Math.abs(d) > 30 &&
      Math.sign(s.v) === Math.sign(d);
    if (Math.abs(d) >= swipeAt() || fling) commit(d > 0 ? "good" : "again");
    else paint(0, EASE_BACK);
  };

  // mode: "due" (hôm nay) | "more" (học thêm từ mới) | "learned" (ôn ngẫu nhiên từ đã học)
  //       | "last" (học lại phiên vừa rồi) | "all" (ôn cả danh sách)
  // "due" và "more" tính vào lịch ôn; các chế độ còn lại chỉ là luyện tập, không đổi lịch.
  const startStudy = (mode = "due") => {
    let ids;
    if (mode === "more")
      ids = newWords
        .slice(0, Math.min(newLimit, newWords.length))
        .map((w) => w.id);
    else if (mode === "learned")
      ids = shuffle(deck.filter((w) => cards[w.id]).map((w) => w.id)).slice(
        0,
        PRACTICE_MAX
      );
    else if (mode === "last") ids = shuffle(lastIds);
    else if (mode === "all") ids = shuffle(deck.map((w) => w.id));
    else if (mode === "hard") ids = shuffle(hardIds);
    else ids = dueQueue.map((w) => w.id);
    if (!ids.length) return;
    // Đang trong cú chạm của người dùng: mở khóa âm thanh và tải sẵn vài từ đầu
    unlockAudio();
    ids.slice(0, 3).forEach((id) => preloadAudio(wordById.get(id)?.word));
    if (mode !== "last") setLastSession({ deckId, ids });
    setUndo(null);
    spokenRef.current = "";
    // Đọc luôn từ đầu tiên ngay trong cú chạm (iOS chỉ cho phát tiếng ở đây)
    const first = wordById.get(ids[0]);
    if (autoSpeak && direction === "en-vi" && first) {
      spokenRef.current = `${ids[0]}-0`;
      speak(first.word);
    }
    setPractice(
      mode === "learned" || mode === "last" || mode === "all" || mode === "hard"
    );
    setSession(ids);
    setIndex(0);
    setShowAnswer(false);
    resetSwipe();
    setTab("study");
  };
  const endSession = () => {
    setUndo(null);
    setQuiz(null);
    setSession([]);
    setIndex(0);
    setShowAnswer(false);
    resetSwipe();
  };
  const chooseDeck = (id) => {
    setDeckId(id);
    setProgress((p) => ({ ...p, settings: { ...p.settings, activeDeck: id } }));
    endSession();
  };

  /* ---------- điền từ vào câu ---------- */
  const startQuiz = () => {
    unlockAudio();
    if (!blankPool.length) {
      setToast("Bộ từ này chưa có câu ví dụ chứa từ để điền chỗ trống.");
      return;
    }
    // ưu tiên từ đã học, thiếu thì lấy thêm từ chưa học
    const learned = shuffle(blankPool.filter((x) => cards[x.w.id]));
    const fresh = shuffle(blankPool.filter((x) => !cards[x.w.id]));
    const pool = deck.length >= 30 ? deck : [...deck, ...words];
    const items = [];
    for (const { w, b } of [...learned, ...fresh]) {
      const cap = /^[A-Z]/.test(b.shown);
      const fix = (s) => (cap ? s.charAt(0).toUpperCase() + s.slice(1) : s);
      const ds = pickDistractors(
        b.shown,
        b.kind,
        w.pos,
        pool,
        (b.before + b.after).toLowerCase()
      );
      if (ds.length < 2) continue;
      items.push({
        id: w.id,
        w,
        before: b.before,
        after: b.after,
        answer: b.shown,
        options: shuffle([b.shown, ...ds.map(fix)]),
      });
      if (items.length >= QUIZ_LEN) break;
    }
    if (!items.length) {
      setToast("Chưa tạo được câu hỏi cho bộ từ này.");
      return;
    }
    endSession();
    setQuiz({ items, i: 0, picked: null, score: 0, wrong: [] });
    setTab("study");
  };
  const pickOption = (k) => {
    if (!quiz || quiz.picked != null) return;
    const it = quiz.items[quiz.i];
    const ok = it.options[k] === it.answer;
    setQuiz((q) => ({
      ...q,
      picked: k,
      score: q.score + (ok ? 1 : 0),
      wrong: ok ? q.wrong : [...q.wrong, it],
    }));
    // ghi nhận hoạt động trong ngày (tính vào chuỗi ngày), không đổi lịch ôn
    setProgress((p) => {
      const st = { ...(p.stats || {}) };
      const day = {
        ...(st[today] || { reviewed: 0, correct: 0, newLearned: 0 }),
      };
      day.practiced = (day.practiced || 0) + 1;
      st[today] = day;
      return { ...p, stats: st };
    });
    if (autoSpeak) speak(it.w.word);
  };
  const nextQuiz = () =>
    setQuiz((q) =>
      q.i + 1 >= q.items.length
        ? { ...q, done: true }
        : { ...q, i: q.i + 1, picked: null }
    );
  const endQuiz = () => setQuiz(null);
  useEffect(() => {
    if (!quiz || quiz.done || tab !== "study") return;
    const onKey = (e) => {
      if (e.target.matches?.("input, select, textarea")) return;
      const it = quiz.items[quiz.i];
      if (quiz.picked == null) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= it.options.length) pickOption(n - 1);
      } else if (
        e.key === "Enter" ||
        e.code === "Space" ||
        e.key === "ArrowRight"
      ) {
        e.preventDefault();
        nextQuiz();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quiz, tab]);

  /* ---------- dữ liệu / sao lưu ---------- */
  const resetProgress = () => {
    if (
      confirm(
        "Xóa toàn bộ lịch sử học và bắt đầu lại? (Các danh sách từ riêng của bạn vẫn được giữ.)"
      )
    ) {
      setProgress((p) => ({ ...freshProgress(), lists: p.lists || [] }));
      endSession();
    }
  };
  const exportProgress = () => {
    const data = {
      ...progress,
      lastExportAt: Date.now(),
      app: "toeic-recall",
      version: 2,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `toeic-recall-${today}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setProgress((p) => ({ ...p, lastExportAt: data.lastExportAt }));
    setToast("Đã tải file sao lưu.");
  };
  const importProgress = (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const v = JSON.parse(reader.result);
        if (!v || typeof v.cards !== "object") throw Error();
        setProgress((p) => mergeProgress(p, v)); // luôn gộp: giữ bản ôn gần nhất của từng từ
        endSession();
        setToast("Đã nhập và gộp dữ liệu học.");
      } catch {
        alert("File tiến độ không hợp lệ.");
      }
      input.value = "";
    };
    reader.readAsText(file);
  };

  /* ---------- danh sách từ riêng ---------- */
  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { words: ws, skipped } = await parseVocabFile(file);
      if (!ws.length)
        throw new Error(
          "Không đọc được từ nào. Hãy kiểm tra file có dạng: Từ vựng | Phiên âm | Từ loại | Nghĩa."
        );
      const id = "L" + Date.now().toString(36);
      const name =
        uploadName.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
      const list = {
        id,
        name,
        createdAt: Date.now(),
        words: ws.map((w, i) => ({ id: `${id}:${i}`, ...w })),
      };
      setProgress((p) => ({ ...p, lists: [...(p.lists || []), list] }));
      setUploadName("");
      setOpenList(id);
      setToast(
        `Đã thêm ${ws.length} từ vào "${name}"${
          skipped ? ` (bỏ qua ${skipped} dòng lỗi)` : ""
        }`
      );
    } catch (e) {
      alert(e.message || "Không đọc được file.");
    } finally {
      setUploading(false);
    }
  };
  const deleteList = (l) => {
    if (!confirm(`Xóa danh sách "${l.name}" và tiến độ học của nó?`)) return;
    setProgress((p) => {
      const c = { ...(p.cards || {}) };
      l.words.forEach((w) => delete c[w.id]);
      return {
        ...p,
        cards: c,
        lists: (p.lists || []).filter((x) => x.id !== l.id),
      };
    });
    if (deckId === l.id) chooseDeck("main");
    setOpenList(null);
  };

  /* ---------- phím tắt ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (
        tab !== "study" ||
        !current ||
        e.target.matches?.("input, select, textarea")
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        setShowAnswer((v) => !v);
      }
      if (e.key === "ArrowLeft" || e.key === "1") commit("again");
      if (e.key === "ArrowRight" || e.key === "2") commit("good");
      if (e.key === "p" || e.key === "P") speak(current.word);
      if (e.key === "z" || e.key === "Z") undoLast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    tab,
    current,
    showAnswer,
    index,
    session,
    progress,
    voices,
    voiceURI,
    rate,
    voiceMode,
    undo,
  ]);
  // Tải sẵn âm thanh của thẻ hiện tại + 3 thẻ kế tiếp (chưa vào phiên thì tải đầu hàng đợi)
  useEffect(() => {
    if (voiceMode !== "human") return;
    if (current)
      for (let k = 0; k <= 3; k++)
        preloadAudio(wordById.get(session[index + k])?.word);
    else dueQueue.slice(0, 3).forEach((w) => preloadAudio(w.word));
  }, [current?.id, index, voiceMode]);

  const enVi = direction === "en-vi";
  // Tự đọc: Anh → Việt đọc ngay khi thẻ hiện; Việt → Anh đọc khi lật ra đáp án
  useEffect(() => {
    if (!autoSpeak || tab !== "study" || !current || !enVi) return;
    const key = `${current.id}-${index}`;
    if (spokenRef.current === key) return; // đã đọc lúc vuốt / lúc bấm bắt đầu
    spokenRef.current = key;
    speak(current.word);
  }, [current?.id, index, autoSpeak, enVi, tab]);
  useEffect(() => {
    if (!autoSpeak || tab !== "study" || !current || enVi || !showAnswer)
      return;
    speak(current.word);
  }, [showAnswer]);
  const sessionPct = session.length
    ? Math.round((index / session.length) * 100)
    : 0;

  const soundBtn = (text) => (
    <button
      className="sound"
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
    >
      <Volume2 size={18} /> Nghe phát âm
    </button>
  );
  const frontOf = (w) =>
    enVi ? (
      <>
        <div className="word">{w.word}</div>
        <div className="meta">{metaOf(w)}</div>
        {soundBtn(w.word)}
      </>
    ) : (
      <div className="word vi">{w.meaning}</div>
    );
  const backOf = (w) =>
    enVi ? (
      <>
        <div className="meaning">{w.meaning}</div>
        {w.example && <div className="example">{w.example}</div>}
        <div className="meta small">
          {w.word}
          {w.pos ? `  ·  ${w.pos}` : ""}
        </div>
      </>
    ) : (
      <>
        <div className="word">{w.word}</div>
        <div className="meta">{metaOf(w)}</div>
        {w.example && <div className="example">{w.example}</div>}
        {soundBtn(w.word)}
      </>
    );

  const qi = quiz && !quiz.done ? quiz.items[quiz.i] : null;
  const qAnswered = !!qi && quiz.picked != null;
  const qRight = qAnswered && qi.options[quiz.picked] === qi.answer;
  const quizView =
    quiz &&
    (quiz.done ? (
      <div className="start">
        <div className="start-icon">
          <Check size={30} />
        </div>
        <h2>
          {quiz.score}/{quiz.items.length} câu đúng
        </h2>
        <p>
          {quiz.score === quiz.items.length
            ? "Tuyệt vời! Bạn làm đúng hết."
            : "Xem lại các câu sai bên dưới rồi thử lượt khác nhé."}
        </p>
        {quiz.wrong.length > 0 && (
          <div className="q-wrong">
            {quiz.wrong.map((it) => (
              <div className="q-wrong-item" key={it.id}>
                <div className="q-sent">
                  {it.before}
                  <b>{it.answer}</b>
                  {it.after}
                </div>
                <small>
                  {it.w.word} · {it.w.meaning}
                </small>
              </div>
            ))}
          </div>
        )}
        <button className="primary" onClick={startQuiz}>
          Làm lượt khác
        </button>
        <button className="link-btn" onClick={endQuiz}>
          Về trang chính
        </button>
      </div>
    ) : (
      <>
        <div className="session-bar">
          <div className="track">
            <i
              style={{
                width: `${Math.round((quiz.i / quiz.items.length) * 100)}%`,
              }}
            />
          </div>
          <span className="count">
            {quiz.i + 1} / {quiz.items.length}
          </span>
          <span className="chip">{quiz.score} đúng</span>
          <button className="icon-btn sm" title="Kết thúc" onClick={endQuiz}>
            <X size={16} />
          </button>
        </div>
        <div className="q-card">
          <span className="q-tag">Điền từ vào chỗ trống</span>
          <p className="q-sent">
            {qi.before}
            <span className={`blank ${qAnswered ? "filled" : ""}`}>
              {qAnswered ? qi.answer : "\u00a0"}
            </span>
            {qi.after}
          </p>
          <div className="q-opts">
            {qi.options.map((o, k) => {
              const state = !qAnswered
                ? ""
                : o === qi.answer
                ? "right"
                : k === quiz.picked
                ? "wrong"
                : "dim";
              return (
                <button
                  key={k}
                  className={`opt ${state}`}
                  onClick={() => pickOption(k)}
                  disabled={qAnswered}
                >
                  <kbd>{k + 1}</kbd>
                  {o}
                </button>
              );
            })}
          </div>
          {qAnswered && (
            <div className={`q-fb ${qRight ? "ok" : "no"}`}>
              <b>{qRight ? "Chính xác!" : "Chưa đúng."}</b>
              <div>
                <strong>{qi.w.word}</strong>
                {metaOf(qi.w) ? `  ·  ${metaOf(qi.w)}` : ""} — {qi.w.meaning}
              </div>
              <div className="q-fb-actions">
                <button
                  className="sound"
                  onClick={() => speakBrowser(qi.before + qi.answer + qi.after)}
                >
                  <Volume2 size={16} /> Nghe câu
                </button>
                <button className="sound" onClick={() => speak(qi.w.word)}>
                  <Volume2 size={16} /> Nghe từ
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="actions">
          {qAnswered ? (
            <button className="primary q-next" onClick={nextQuiz}>
              {quiz.i + 1 >= quiz.items.length ? "Xem kết quả" : "Câu tiếp"}
            </button>
          ) : (
            <p className="gesture-hint" style={{ margin: 0 }}>
              Chọn đáp án (hoặc bấm phím 1–4)
            </p>
          )}
        </div>
      </>
    ));

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <span className="logo">
            <Brain size={20} />
          </span>
          <b>TOEIC Recall</b>
        </div>
        <nav className="tabs" aria-label="Điều hướng">
          <button
            className={tab === "study" ? "on" : ""}
            onClick={() => setTab("study")}
          >
            <Layers size={17} />
            <span>Học</span>
          </button>
          <button
            className={tab === "library" ? "on" : ""}
            onClick={() => setTab("library")}
          >
            <Library size={17} />
            <span>Kho từ</span>
          </button>
          <button
            className={tab === "mine" ? "on" : ""}
            onClick={() => setTab("mine")}
          >
            <FolderOpen size={17} />
            <span>Từ của tôi</span>
          </button>
          <button
            className={tab === "stats" ? "on" : ""}
            onClick={() => setTab("stats")}
          >
            <BarChart3 size={17} />
            <span>Thống kê</span>
          </button>
        </nav>
        <div className="nav-right">
          <button
            className="icon-btn"
            title={`Giao diện: ${
              theme === "auto" ? "tự động" : theme === "light" ? "sáng" : "tối"
            } (bấm để đổi)`}
            onClick={() =>
              setTheme((t) =>
                t === "auto" ? "light" : t === "light" ? "dark" : "auto"
              )
            }
          >
            {theme === "dark" ? (
              <Moon size={18} />
            ) : theme === "light" ? (
              <Sun size={18} />
            ) : (
              <Monitor size={18} />
            )}
          </button>
        </div>
      </header>

      <main className="main">
        {tab === "study" && (
          <section className="study">
            {quiz ? (
              quizView
            ) : session.length > 0 && current ? (
              <>
                <div className="session-bar">
                  <div className="track">
                    <i style={{ width: `${sessionPct}%` }} />
                  </div>
                  <span className="count">
                    {index + 1} / {session.length}
                  </span>
                  <button
                    className="chip btn"
                    onClick={() => {
                      setDirection((v) => (v === "en-vi" ? "vi-en" : "en-vi"));
                      setShowAnswer(false);
                    }}
                  >
                    <ArrowLeftRight size={14} />
                    {enVi ? "Anh → Việt" : "Việt → Anh"}
                  </button>
                  <button
                    className="icon-btn sm"
                    title="Hoàn tác thẻ vừa rồi (Z)"
                    onClick={undoLast}
                    disabled={!undo}
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    className="icon-btn sm"
                    title="Kết thúc phiên"
                    onClick={endSession}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="stage" ref={stageRef}>
                  {/* thẻ phía sau đứng trước trong DOM để khi lên làm thẻ chính, React giữ nguyên node (không nháy) */}
                  {[index + 1, index]
                    .filter((i) => session[i] != null)
                    .map((i) => {
                      const w = wordById.get(session[i]);
                      if (!w) return null;
                      const top = i === index;
                      const hard = isHard(cards[w.id]);
                      const badge = hard
                        ? "hard"
                        : practice
                        ? "practice"
                        : cards[w.id]
                        ? "review"
                        : "new";
                      const label = hard
                        ? "Từ khó"
                        : practice
                        ? "Luyện tập"
                        : cards[w.id]
                        ? "Ôn tập"
                        : "Từ mới";
                      return (
                        <div
                          key={`${session[i]}-${i}`}
                          className={`swipe ${top ? "top" : "behind"}`}
                          ref={top ? swipeRef : null}
                          onPointerDown={top ? onPointerDown : undefined}
                          onPointerMove={top ? onPointerMove : undefined}
                          onPointerUp={top ? onPointerUp : undefined}
                          onPointerCancel={top ? onPointerUp : undefined}
                        >
                          <div
                            className={`flip ${
                              top && showAnswer ? "flipped" : ""
                            }`}
                          >
                            <div className="flip-inner">
                              <div className="face front">
                                <span className={`badge ${badge}`}>
                                  {label}
                                </span>
                                {frontOf(w)}
                                <div className="flip-hint">Chạm để lật thẻ</div>
                              </div>
                              <div className="face back">
                                <span className={`badge ${badge}`}>
                                  {label}
                                </span>
                                {backOf(w)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                  {/* bóng nằm sau thẻ, chữ nằm trên thẻ nên không bị che */}
                  <div className="glow no" aria-hidden />
                  <div className="glow yes" aria-hidden />
                  <div className="mark no" aria-hidden>
                    <X size={34} strokeWidth={3} />
                    <span>CHƯA NHỚ</span>
                  </div>
                  <div className="mark yes" aria-hidden>
                    <Check size={34} strokeWidth={3} />
                    <span>ĐÃ NHỚ</span>
                  </div>
                </div>

                <div className="actions">
                  <div className="rating">
                    {RATINGS.map((r) => (
                      <button
                        key={r.key}
                        className={`rate ${r.key}`}
                        onClick={() => commit(r.key)}
                      >
                        <b>
                          <r.Icon size={18} /> {r.label}
                        </b>
                        <small>
                          {r.key === "again" ? "← " : ""}
                          {practice
                            ? "Không đổi lịch ôn"
                            : `${fmtInterval(
                                nextSchedule(cards[current.id], r.key).interval
                              )} nữa`}
                          {r.key === "good" ? " →" : ""}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="gesture-hint">
                  Vuốt thẻ sang <b className="g">phải = đã nhớ</b> · sang{" "}
                  <b className="r">trái = chưa nhớ</b>
                  <span className="kb-hint"> · Space để lật</span>
                </p>
              </>
            ) : (
              <div className="start">
                <div className="start-brand">
                  <span className="logo">
                    <Brain size={20} />
                  </span>
                  <b>TOEIC Recall</b>
                </div>
                <div className="deck-select">
                  <select
                    aria-label="Chọn bộ từ"
                    value={deckId}
                    onChange={(e) =>
                      e.target.value === "__add__"
                        ? setTab("mine")
                        : chooseDeck(e.target.value)
                    }
                  >
                    <option value="main">Kho chung · {words.length} từ</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} · {l.words.length} từ
                      </option>
                    ))}
                    <option value="__add__">＋ Thêm danh sách mới…</option>
                  </select>
                  <ChevronDown size={18} />
                </div>
                <div className="hero">
                  <div className="start-icon">
                    <Check size={30} />
                  </div>
                  <h2>
                    {dueQueue.length === 0
                      ? "Hôm nay bạn đã xong!"
                      : "Sẵn sàng học chưa?"}
                  </h2>
                  {dueQueue.length === 0 ? (
                    <p>
                      Không còn thẻ nào đến hạn. Quay lại ngày mai để ôn tiếp,
                      hoặc học thêm ngay bên dưới nếu bạn còn hứng.
                    </p>
                  ) : (
                    <div className="hero-nums">
                      <div>
                        <strong>{dueCount}</strong>
                        <span>thẻ đến hạn</span>
                      </div>
                      <div>
                        <strong>
                          {Math.min(remainingNew, newWords.length)}
                        </strong>
                        <span>từ mới</span>
                      </div>
                    </div>
                  )}
                  <button
                    className="primary"
                    onClick={() => startStudy()}
                    disabled={dueQueue.length === 0}
                  >
                    {dueQueue.length === 0 ? "Đã hoàn thành" : "Bắt đầu học"}
                  </button>
                </div>
                {blankPool.length > 0 && (
                  <button className="mode-btn" onClick={startQuiz}>
                    <Pencil size={16} /> Điền từ vào câu (kiểu Part 5)
                  </button>
                )}
                {((dueQueue.length === 0 && newWords.length > 0) ||
                  lastIds.length > 0 ||
                  practiceCount > 0 ||
                  !isMain) && (
                  <div className="more-box">
                    <div className="more-title">
                      {dueQueue.length === 0
                        ? "Muốn học thêm?"
                        : "Hoặc luyện tập thêm"}
                    </div>
                    <div className="more-actions">
                      {dueQueue.length === 0 && newWords.length > 0 && (
                        <button
                          className="more-btn strong"
                          onClick={() => startStudy("more")}
                        >
                          <Plus size={16} /> Học thêm{" "}
                          {Math.min(newLimit, newWords.length)} từ mới
                        </button>
                      )}
                      {hardIds.length > 0 && (
                        <button
                          className="more-btn hard"
                          onClick={() => startStudy("hard")}
                        >
                          <Target size={15} /> Ôn {hardIds.length} từ khó
                        </button>
                      )}
                      {lastIds.length > 0 && (
                        <button
                          className="more-btn"
                          onClick={() => startStudy("last")}
                        >
                          <RotateCcw size={15} /> Học lại phiên vừa rồi ·{" "}
                          {lastIds.length} thẻ
                        </button>
                      )}
                      {practiceCount > 0 && (
                        <button
                          className="more-btn"
                          onClick={() => startStudy("learned")}
                        >
                          <Shuffle size={15} /> Ôn ngẫu nhiên{" "}
                          {Math.min(PRACTICE_MAX, practiceCount)} từ đã học
                        </button>
                      )}
                      {!isMain && (
                        <button
                          className="more-btn"
                          onClick={() => startStudy("all")}
                        >
                          <Library size={15} /> Ôn lại cả danh sách ·{" "}
                          {deck.length} từ
                        </button>
                      )}
                    </div>
                    <div className="more-note">
                      “Học thêm từ mới” được tính vào lịch ôn. Các chế độ còn
                      lại chỉ để luyện tập, không làm thay đổi lịch ôn.
                    </div>
                  </div>
                )}
                {undo && (
                  <button className="link-btn" onClick={undoLast}>
                    <Undo2 size={14} /> Hoàn tác thẻ vừa rồi
                  </button>
                )}
                <div className="mini-stats">
                  <div>
                    <strong>{streak.cur}</strong>
                    <span>Ngày liên tiếp</span>
                  </div>
                  <div>
                    <strong>{dueCount}</strong>
                    <span>Đến hạn</span>
                  </div>
                  <div>
                    <strong>{todayStats.reviewed || 0}</strong>
                    <span>Đã ôn hôm nay</span>
                  </div>
                  <div>
                    <strong>
                      {deckLearned}/{deck.length}
                    </strong>
                    <span>Đã làm quen</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "library" && (
          <section className="page">
            <h1>Kho từ vựng</h1>
            <div className="toolbar">
              <div className="search">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setShown(100);
                  }}
                  placeholder="Tìm từ, nghĩa hoặc câu ví dụ..."
                />
              </div>
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setShown(100);
                }}
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="new">Chưa học</option>
                <option value="due">Đến hạn ôn</option>
                <option value="learning">Đã lên lịch</option>
                <option value="hard">Từ khó</option>
              </select>
            </div>
            <div className="table">
              <div className="table-sum">
                Hiển thị <b>{filtered.length}</b> / {words.length} từ
              </div>
              {filtered.slice(0, shown).map((w) => {
                const c = cards[w.id];
                const status = !c
                  ? "new"
                  : dueAt(c) <= Date.now()
                  ? "due"
                  : "learning";
                return (
                  <div className="row" key={w.id}>
                    <div className="row-word">
                      <b>
                        {w.word}
                        {isHard(c) && <em className="hard-tag">khó</em>}
                      </b>
                      <small>{metaOf(w)}</small>
                    </div>
                    <span className="row-mean">{w.meaning}</span>
                    <i className={`status ${status}`}>
                      {status === "new"
                        ? "Chưa học"
                        : status === "due"
                        ? "Đến hạn"
                        : "Đã lên lịch"}
                    </i>
                    <button
                      className="icon-btn sm"
                      title="Nghe từ"
                      onClick={() => speak(w.word)}
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                );
              })}
              {filtered.length > shown && (
                <button
                  className="more"
                  onClick={() => setShown((s) => s + 200)}
                >
                  Xem thêm {Math.min(200, filtered.length - shown)} từ
                </button>
              )}
              {filtered.length === 0 && (
                <div className="no-results">
                  Không tìm thấy từ phù hợp. Thử từ khóa khác hoặc đổi bộ lọc.
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "mine" && (
          <section className="page">
            <h1>Từ của tôi</h1>
            <label
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleUpload(e.dataTransfer.files?.[0]);
              }}
            >
              <Upload size={26} />
              <b>
                {uploading
                  ? "Đang đọc file…"
                  : "Chọn hoặc kéo thả file từ vựng vào đây"}
              </b>
              <span>
                .docx (bảng: Từ vựng | Phiên âm | Từ loại | Nghĩa, hoặc mỗi dòng
                “Bench /bentʃ/ (n) ghế dài”), .csv, .tsv, .txt
              </span>
              <input
                type="file"
                hidden
                accept=".docx,.csv,.tsv,.txt"
                onChange={(e) => {
                  handleUpload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <div className="search">
                <input
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="Tên danh sách (không bắt buộc, mặc định lấy tên file)"
                />
              </div>
            </div>

            {lists.length === 0 && (
              <div className="no-results">
                Chưa có danh sách nào. Danh sách riêng học tách biệt hoàn toàn
                với kho chung 3600 từ.
              </div>
            )}
            {lists.map((l) => {
              const due = l.words.filter(
                (w) => cards[w.id] && dueAt(cards[w.id]) <= Date.now()
              ).length;
              const learned = l.words.filter(isLearned).length;
              const open = openList === l.id;
              return (
                <div className="list-card" key={l.id}>
                  <div className="list-head">
                    <div>
                      <b>{l.name}</b>
                      <small>
                        {l.words.length} từ · {learned} đã làm quen · {due} đến
                        hạn · tạo{" "}
                        {new Date(l.createdAt).toLocaleDateString("vi-VN")}
                      </small>
                    </div>
                    <div className="list-actions">
                      <button
                        className="solid"
                        onClick={() => {
                          chooseDeck(l.id);
                          setTab("study");
                        }}
                      >
                        Học danh sách này
                      </button>
                      <button
                        className="secondary"
                        onClick={() => setOpenList(open ? null : l.id)}
                      >
                        {open ? "Ẩn" : "Xem từ"}
                      </button>
                      <button
                        className="icon-btn sm"
                        title="Xóa danh sách"
                        onClick={() => deleteList(l)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div className="table inner">
                      {l.words.slice(0, 300).map((w) => (
                        <div className="row" key={w.id}>
                          <div className="row-word">
                            <b>{w.word}</b>
                            <small>{metaOf(w)}</small>
                          </div>
                          <span className="row-mean">{w.meaning}</span>
                          <i
                            className={`status ${
                              !cards[w.id]
                                ? "new"
                                : dueAt(cards[w.id]) <= Date.now()
                                ? "due"
                                : "learning"
                            }`}
                          >
                            {!cards[w.id]
                              ? "Chưa học"
                              : dueAt(cards[w.id]) <= Date.now()
                              ? "Đến hạn"
                              : "Đã lên lịch"}
                          </i>
                          <button
                            className="icon-btn sm"
                            title="Nghe từ"
                            onClick={() => speak(w.word)}
                          >
                            <Volume2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {tab === "stats" && (
          <section className="page">
            <h1>Thống kê & cài đặt</h1>
            <div className="stat-grid">
              <div className="stat">
                <BookOpen size={18} />
                <strong>{words.length}</strong>
                <span>Tổng số từ (kho chung)</span>
              </div>
              <div className="stat">
                <Check size={18} />
                <strong>{learnedCount}</strong>
                <span>Đã học ({progressPct}%)</span>
              </div>
              <div className="stat">
                <Clock3 size={18} />
                <strong>{dueCount}</strong>
                <span>
                  Đến hạn ôn ({isMain ? "kho chung" : "danh sách này"})
                </span>
              </div>
              <div className="stat">
                <CalendarDays size={18} />
                <strong>{todayStats.reviewed || 0}</strong>
                <span>Lượt ôn hôm nay</span>
              </div>
              <div className="stat">
                <Target size={18} />
                <strong>{hardTotal}</strong>
                <span>Từ khó</span>
              </div>
            </div>
            <div className="panels">
              <div className="panel">
                <h3>Tiến độ tổng</h3>
                <div className="track big">
                  <i style={{ width: `${progressPct}%` }} />
                </div>
                <p className="muted">
                  {learnedCount}/{words.length} từ đã học · độ nhớ tốt hôm nay{" "}
                  {accuracy}%
                </p>
                <h3>Từ mới mỗi ngày (kho chung)</h3>
                <div className="goal">
                  <span>Tối đa</span>
                  <b>{newLimit} từ</b>
                </div>
                <input
                  className="range"
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={newLimit}
                  onChange={(e) => {
                    setNewLimit(+e.target.value);
                    setProgress((p) => ({
                      ...p,
                      settings: { ...p.settings, newPerDay: +e.target.value },
                    }));
                  }}
                />
              </div>
              <div className="panel">
                <h3>Giọng đọc</h3>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={autoSpeak}
                    onChange={(e) => setAutoSpeak(e.target.checked)}
                  />
                  <span>Tự đọc từ khi hiện thẻ</span>
                </label>
                <p className="muted">
                  Một số trình duyệt (nhất là trên iPhone) chỉ cho tự phát âm
                  sau khi bạn đã chạm vào trang.
                </p>
                <label className="field">
                  Nguồn phát âm
                  <select
                    value={voiceMode}
                    onChange={(e) => setVoiceMode(e.target.value)}
                  >
                    <option value="human">
                      Giọng người thật (giống nhau trên Edge và Chrome)
                    </option>
                    <option value="browser">Giọng của trình duyệt</option>
                  </select>
                </label>
                <label className="field">
                  Giọng trình duyệt (dùng cho cụm từ và khi thiếu âm thanh)
                  <select
                    value={voiceURI}
                    onChange={(e) => setVoiceURI(e.target.value)}
                    disabled={!voices.length}
                  >
                    <option value="">
                      Tự động ({pickVoice(voices, "")?.name || "mặc định"})
                    </option>
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="goal">
                  <span>Tốc độ đọc</span>
                  <b>{rate.toFixed(2)}x</b>
                </div>
                <input
                  className="range"
                  type="range"
                  min="0.6"
                  max="1.2"
                  step="0.05"
                  value={rate}
                  onChange={(e) => setRate(+e.target.value)}
                />
                <div
                  className="data-actions"
                  style={{ flexDirection: "row", flexWrap: "wrap" }}
                >
                  <button className="solid" onClick={() => speak("agenda")}>
                    Nghe thử từ “agenda”
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      speakBrowser(
                        "Please review the agenda before the meeting."
                      )
                    }
                  >
                    Nghe thử giọng trình duyệt
                  </button>
                </div>
                <p className="muted">
                  Edge có giọng “Online (Natural)” tự nhiên nhất; Chrome thường
                  dùng “Google US English”. Hai trình duyệt có bộ giọng khác
                  nhau nên chế độ “người thật” là cách để nghe giống nhau ở cả
                  hai.
                </p>
              </div>
              <div className="panel wide">
                <h3>Giao diện</h3>
                <div className="seg">
                  {[
                    ["auto", "Tự động", Monitor],
                    ["light", "Sáng", Sun],
                    ["dark", "Tối", Moon],
                  ].map(([k, label, Ic]) => (
                    <button
                      key={k}
                      className={theme === k ? "on" : ""}
                      onClick={() => setTheme(k)}
                    >
                      <Ic size={15} /> {label}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  “Tự động” theo cài đặt sáng/tối của thiết bị.
                </p>
                <h3>Cài thành ứng dụng</h3>
                {installed ? (
                  <p className="muted">
                    Bạn đang dùng bản đã cài. Dữ liệu học vẫn nằm trên máy này
                    nên mở được cả khi mất mạng.
                  </p>
                ) : installEvt ? (
                  <button className="solid" onClick={installApp}>
                    <Download size={15} /> Cài ứng dụng
                  </button>
                ) : isIOS ? (
                  <p className="muted">
                    Trên iPhone/iPad: mở bằng Safari, bấm nút Chia sẻ (ô vuông
                    có mũi tên) rồi chọn “Thêm vào Màn hình chính”. Mở từ biểu
                    tượng đó, app chạy toàn màn hình, không còn thanh Safari và
                    không bị vuốt-quay-lại.
                  </p>
                ) : (
                  <p className="muted">
                    Trên Chrome/Edge: bấm biểu tượng cài đặt ở cuối thanh địa
                    chỉ, hoặc menu ⋮ → “Cài đặt ứng dụng”. (Nút cài chỉ hiện
                    trên bản đã deploy, không hiện khi chạy dev.)
                  </p>
                )}
              </div>
              <div className="panel wide">
                <div className="streak-head">
                  <div className="streak-big">
                    <Flame size={22} />
                    <strong>{streak.cur}</strong> ngày liên tiếp
                  </div>
                  <span className="muted">Dài nhất: {streak.best} ngày</span>
                </div>
                <div className="heat-wrap">
                  <div className="heat-days" aria-hidden>
                    <span>T2</span>
                    <span />
                    <span>T4</span>
                    <span />
                    <span>T6</span>
                    <span />
                    <span>CN</span>
                  </div>
                  <div className="heat">
                    {heat.map((c) => (
                      <i
                        key={c.key}
                        className={`cell l${heatLevel(c.n)}`}
                        title={c.n < 0 ? "" : `${c.key}: ${c.n} lượt`}
                      />
                    ))}
                  </div>
                </div>
                <h3>Dự báo 7 ngày tới</h3>
                <div className="forecast">
                  {forecast.map((f) => (
                    <div className="fc" key={f.i}>
                      <span className="fc-n">{f.n}</span>
                      <div className="fc-bar">
                        <i
                          style={{
                            height: `${Math.max(4, (f.n / fcMax) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {f.i === 0
                          ? "Hôm nay"
                          : f.i === 1
                          ? "Mai"
                          : new Date(f.t).toLocaleDateString("vi-VN", {
                              weekday: "short",
                            })}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Hôm nay gồm cả thẻ đã quá hạn. Tính trên toàn bộ kho chung và
                  các danh sách riêng.
                </p>
              </div>
              <div className="panel wide">
                <h3>Dữ liệu & sao lưu</h3>
                <p className="muted">
                  Tiến độ và các danh sách từ riêng được lưu ngay trong trình
                  duyệt của bạn (localStorage), chỉ trên máy và trình duyệt này,
                  không gửi lên máy chủ nào. Xóa dữ liệu duyệt web, dùng chế độ
                  ẩn danh hoặc đổi máy sẽ làm mất dữ liệu, nên hãy xuất file sao
                  lưu định kỳ. Cài đặt giọng đọc được lưu riêng cho từng trình
                  duyệt.
                </p>
                <p className="muted">
                  {progress.lastExportAt
                    ? `Sao lưu gần nhất: ${new Date(
                        progress.lastExportAt
                      ).toLocaleString("vi-VN")}`
                    : "Bạn chưa sao lưu lần nào."}
                </p>
                <div className="data-actions">
                  <button className="secondary" onClick={exportProgress}>
                    Xuất tiến độ (JSON)
                  </button>
                  <label className="secondary">
                    Nhập tiến độ (JSON)
                    <input
                      type="file"
                      accept="application/json"
                      onChange={importProgress}
                      hidden
                    />
                  </label>
                  <button className="danger" onClick={resetProgress}>
                    <RotateCcw size={15} /> Xóa toàn bộ tiến độ
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
          <button onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
