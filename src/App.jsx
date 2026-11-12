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
  Clock3,
  FolderOpen,
  Layers,
  Library,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Volume2,
  X,
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
  MODE_KEY = "toeic-recall-voice-mode";
const DAY = 86400000;
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
const audioCache = new Map();
async function getHumanAudio(word) {
  const key = word.toLowerCase().trim();
  if (audioCache.has(key)) return audioCache.get(key);
  if (!/^[a-z'-]+$/i.test(key)) {
    audioCache.set(key, null);
    return null;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
        key
      )}`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (r.status === 404) {
      audioCache.set(key, null);
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
    audioCache.set(key, url);
    return url;
  } catch {
    return null;
  }
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
      const m = stats[d] || { reviewed: 0, correct: 0, newLearned: 0 };
      stats[d] = {
        reviewed: Math.max(m.reviewed, s.reviewed || 0),
        correct: Math.max(m.correct, s.correct || 0),
        newLearned: Math.max(m.newLearned, s.newLearned || 0),
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
  }, [voiceURI, rate, voiceMode]);
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
  const speak = async (text) => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    if (voiceMode === "human") {
      const url = await getHumanAudio(text);
      if (url) {
        try {
          const a = new Audio(url);
          a.playbackRate = rate;
          audioRef.current = a;
          await a.play();
          return;
        } catch {
          /* dùng giọng trình duyệt */
        }
      }
    }
    speakBrowser(text);
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
    setProgress((p) => {
      const st = { ...(p.stats || {}) };
      const day = {
        ...(st[today] || { reviewed: 0, correct: 0, newLearned: 0 }),
      };
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

  const startStudy = (all = false) => {
    const ids = all
      ? shuffle(deck.map((w) => w.id))
      : dueQueue.map((w) => w.id);
    setSession(ids);
    setIndex(0);
    setShowAnswer(false);
    resetSwipe();
    setTab("study");
  };
  const endSession = () => {
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
  ]);
  useEffect(() => {
    if (current && voiceMode === "human") getHumanAudio(current.word);
  }, [current?.id, voiceMode]); // tải trước âm thanh

  const enVi = direction === "en-vi";
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
        <div className="nav-right" />
      </header>

      <main className="main">
        {tab === "study" && (
          <section className="study">
            {session.length > 0 && current ? (
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
                      const badge = cards[w.id] ? "review" : "new";
                      const label = cards[w.id] ? "Ôn tập" : "Từ mới";
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
                          {fmtInterval(
                            nextSchedule(cards[current.id], r.key).interval
                          )}{" "}
                          nữa{r.key === "good" ? " →" : ""}
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
                <div className="decks">
                  <button
                    className={`deck-chip ${isMain ? "on" : ""}`}
                    onClick={() => chooseDeck("main")}
                  >
                    Kho chung · {words.length}
                  </button>
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      className={`deck-chip ${deckId === l.id ? "on" : ""}`}
                      onClick={() => chooseDeck(l.id)}
                    >
                      {l.name} · {l.words.length}
                    </button>
                  ))}
                  <button
                    className="deck-chip add"
                    onClick={() => setTab("mine")}
                  >
                    <Upload size={14} /> Thêm danh sách
                  </button>
                </div>
                <div className="start-icon">
                  <Check size={30} />
                </div>
                <h2>
                  {dueQueue.length === 0
                    ? "Hôm nay bạn đã xong!"
                    : "Sẵn sàng học chưa?"}
                </h2>
                <p>
                  {dueQueue.length === 0
                    ? "Không còn thẻ nào đến hạn. Quay lại vào ngày mai để ôn tiếp."
                    : `${dueCount} thẻ đến hạn và ${Math.min(
                        remainingNew,
                        newWords.length
                      )} từ mới đang chờ bạn.`}
                </p>
                <button
                  className="primary"
                  onClick={() => startStudy()}
                  disabled={dueQueue.length === 0}
                >
                  {dueQueue.length === 0 ? "Đã hoàn thành" : "Bắt đầu học"}
                </button>
                {!isMain && (
                  <button className="link-btn" onClick={() => startStudy(true)}>
                    Ôn lại cả danh sách ({deck.length} từ)
                  </button>
                )}
                <div className="mini-stats">
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
                      <b>{w.word}</b>
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
