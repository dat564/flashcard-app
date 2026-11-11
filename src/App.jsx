import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  Clock3,
  Layers,
  RotateCcw,
  Search,
  Volume2,
  X,
  ArrowLeftRight,
  BarChart3,
  Library,
} from "lucide-react";
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
import "./App.css";

const STORE = "toeic-recall-v1";
const DAY = 86400000;
const todayKey = () => new Date().toLocaleDateString("en-CA");
const freshProgress = () => ({
  cards: {},
  stats: {},
  settings: { newPerDay: 20 },
  createdAt: Date.now(),
});

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
function speak(word) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.88;
  window.speechSynthesis.speak(u);
}

const RATINGS = [
  { key: "again", label: "Chưa nhớ", n: 1, Icon: X },
  { key: "good", label: "Đã nhớ", n: 2, Icon: Check },
];

// Gộp 2 bản tiến độ (khi nhập file): mỗi từ giữ bản ôn gần nhất; thống kê từng ngày lấy số lớn hơn.
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
  return {
    ...a,
    cards,
    stats,
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
  const [toast, setToast] = useState("");
  const today = todayKey();
  const retried = useRef(new Set());

  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify(progress));
  }, [progress]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const cards = progress.cards || {};
  const todayStats = progress.stats?.[today] || {
    reviewed: 0,
    correct: 0,
    newLearned: 0,
  };
  const learnedCount = Object.keys(cards).filter(
    (id) => (cards[id].reps || 0) > 0
  ).length;
  const dueWords = words.filter(
    (w) => cards[w.id] && dueAt(cards[w.id]) <= Date.now()
  );
  const newWords = words.filter((w) => !cards[w.id]);
  const remainingNew = Math.max(0, newLimit - (todayStats.newLearned || 0));
  const dueQueue = useMemo(
    () => [...dueWords, ...newWords.slice(0, remainingNew)],
    [progress, today, newLimit]
  );
  const current = session[index]
    ? words.find((w) => w.id === session[index])
    : null;
  const dueCount = dueWords.length;
  const progressPct = Math.round((learnedCount / words.length) * 100);
  const accuracy = todayStats.reviewed
    ? Math.round((todayStats.correct / todayStats.reviewed) * 100)
    : 0;

  const filtered = words.filter((w) => {
    const q = query.trim().toLowerCase();
    const match =
      !q ||
      [w.word, w.meaning, w.example, w.ipa].some((v) =>
        (v || "").toLowerCase().includes(q)
      );
    const c = cards[w.id];
    const status = !c ? "new" : dueAt(c) <= Date.now() ? "due" : "learning";
    return match && (filter === "all" || status === filter);
  });

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
      if (!old) day.newLearned += 1;
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
    // thẻ "Chưa nhớ" được hỏi lại 1 lần ở cuối phiên (vẫn hẹn ôn lại ngày mai)
    const requeue = rating === "again" && !retried.current.has(current.id);
    if (requeue) retried.current.add(current.id);
    const queue = requeue ? [...session, current.id] : session;
    if (requeue) setSession(queue);
    const next = index + 1;
    if (next >= queue.length) {
      setSession([]);
      setIndex(0);
      setShowAnswer(false);
      setToast("Hoàn thành lượt học! 🎉");
    } else {
      setIndex(next);
      setShowAnswer(false);
    }
  };

  const startStudy = () => {
    retried.current = new Set();
    setSession(dueQueue.map((w) => w.id));
    setIndex(0);
    setShowAnswer(false);
    setTab("study");
  };
  const endSession = () => {
    setSession([]);
    setIndex(0);
    setShowAnswer(false);
  };
  const resetProgress = () => {
    if (confirm("Xóa toàn bộ lịch sử học và bắt đầu lại?")) {
      setProgress(freshProgress());
      endSession();
    }
  };
  const exportProgress = () => {
    const data = {
      ...progress,
      lastExportAt: Date.now(),
      app: "toeic-recall",
      version: 1,
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
  useEffect(() => {
    navigator.storage?.persist?.();
  }, []); // xin trình duyệt không tự xóa dữ liệu khi thiếu dung lượng

  useEffect(() => {
    const onKey = (e) => {
      if (tab !== "study" || !current) return;
      if (e.code === "Space") {
        e.preventDefault();
        setShowAnswer((v) => !v);
      }
      if (showAnswer && e.key === "1") setRating("again");
      if (showAnswer && e.key === "2") setRating("good");
      if (showAnswer && e.key === "ArrowLeft") setRating("again");
      if (showAnswer && e.key === "ArrowRight") setRating("good");
      if (e.key === "p" || e.key === "P") speak(current.word);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, current, showAnswer, index, session, progress]);

  const enVi = direction === "en-vi";
  const sessionPct = session.length
    ? Math.round((index / session.length) * 100)
    : 0;

  const Front =
    current &&
    (enVi ? (
      <>
        <div className="word">{current.word}</div>
        <div className="meta">
          {current.pos}
          {current.ipa ? `  ·  ${current.ipa}` : ""}
        </div>
        <button
          className="sound"
          onClick={(e) => {
            e.stopPropagation();
            speak(current.word);
          }}
        >
          <Volume2 size={18} /> Nghe phát âm
        </button>
      </>
    ) : (
      <div className="word vi">{current.meaning}</div>
    ));

  const Back =
    current &&
    (enVi ? (
      <>
        <div className="meaning">{current.meaning}</div>
        <div className="example">{current.example}</div>
        <div className="meta small">
          {current.word} · {current.pos}
        </div>
      </>
    ) : (
      <>
        <div className="word">{current.word}</div>
        <div className="meta">
          {current.pos}
          {current.ipa ? `  ·  ${current.ipa}` : ""}
        </div>
        <div className="example">{current.example}</div>
        <button
          className="sound"
          onClick={(e) => {
            e.stopPropagation();
            speak(current.word);
          }}
        >
          <Volume2 size={18} /> Nghe phát âm
        </button>
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

                <div
                  className={`flip ${showAnswer ? "flipped" : ""}`}
                  onClick={() => setShowAnswer((v) => !v)}
                  role="button"
                  tabIndex={0}
                  aria-label="Lật thẻ"
                >
                  <div className="flip-inner">
                    <div className="face front">
                      <span
                        className={`badge ${
                          cards[current.id] ? "review" : "new"
                        }`}
                      >
                        {cards[current.id] ? "Ôn tập" : "Từ mới"}
                      </span>
                      {Front}
                      <div className="flip-hint">
                        Nhấn Space hoặc bấm vào thẻ để xem đáp án
                      </div>
                    </div>
                    <div className="face back">
                      <span
                        className={`badge ${
                          cards[current.id] ? "review" : "new"
                        }`}
                      >
                        {cards[current.id] ? "Ôn tập" : "Từ mới"}
                      </span>
                      {Back}
                    </div>
                  </div>
                </div>

                <div className="actions">
                  {showAnswer ? (
                    <div className="rating">
                      {RATINGS.map((r) => (
                        <button
                          key={r.key}
                          className={`rate ${r.key}`}
                          onClick={() => setRating(r.key)}
                        >
                          <b>
                            <r.Icon size={18} /> {r.label}
                          </b>
                          <small>
                            {fmtInterval(
                              nextSchedule(cards[current.id], r.key).interval
                            )}
                          </small>
                          <kbd>{r.n}</kbd>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      className="reveal"
                      onClick={() => setShowAnswer(true)}
                    >
                      Hiện đáp án <kbd>Space</kbd>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="start">
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
                  onClick={startStudy}
                  disabled={dueQueue.length === 0}
                >
                  {dueQueue.length === 0 ? "Đã hoàn thành" : "Bắt đầu học"}
                </button>
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
                    <strong>{learnedCount}</strong>
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
                      <small>
                        {w.pos} · {w.ipa}
                      </small>
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

        {tab === "stats" && (
          <section className="page">
            <h1>Thống kê & cài đặt</h1>
            <div className="stat-grid">
              <div className="stat">
                <BookOpen size={18} />
                <strong>{words.length}</strong>
                <span>Tổng số từ</span>
              </div>
              <div className="stat">
                <Check size={18} />
                <strong>{learnedCount}</strong>
                <span>Đã học ({progressPct}%)</span>
              </div>
              <div className="stat">
                <Clock3 size={18} />
                <strong>{dueCount}</strong>
                <span>Đến hạn ôn</span>
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
                <h3>Từ mới mỗi ngày</h3>
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
                <h3>Dữ liệu & sao lưu</h3>
                <p className="muted">
                  Tiến độ được lưu ngay trong trình duyệt của bạn
                  (localStorage), chỉ trên máy và trình duyệt này, không gửi lên
                  máy chủ nào. Xóa dữ liệu duyệt web, dùng chế độ ẩn danh hoặc
                  đổi máy sẽ làm mất tiến độ, nên hãy xuất file sao lưu định kỳ.
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
