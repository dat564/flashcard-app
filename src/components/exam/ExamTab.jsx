import { useMemo, useRef, useState } from "react";
import { BookOpen, Download, Headphones, Play, RotateCcw, Timer, Trash2, Upload } from "lucide-react";
import { useExamData } from "../../hooks/useExamData";
import {
  PARTS,
  LISTENING_PARTS,
  READING_PARTS,
  examTemplate,
  examCsvTemplate,
} from "../../lib/examSchema";
import {
  buildMiniTest,
  makeAttempt,
  pct,
  pickUnits,
  summarizeAttempts,
} from "../../lib/examEngine";
import ExamRunner from "./ExamRunner";
import ExamResult from "./ExamResult";
import WordSheet, { EXAM_LIST_ID } from "./WordSheet";

const PREF_KEY = "toeic-recall-exam-prefs";
const readPrefs = () => {
  try {
    return { mode: "practice", size: 10, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
  } catch {
    return { mode: "practice", size: 10 };
  }
};

function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ExamTab({ active, progress, setProgress, speech, setToast }) {
  const data = useExamData(active);
  const [prefs, setPrefs] = useState(readPrefs);
  const [view, setView] = useState({ name: "home" });
  const [word, setWord] = useState(null); // từ đang tra
  const [report, setReport] = useState(null); // kết quả lần nhập đề gần nhất
  const runId = useRef(0);
  const setPref = (patch) =>
    setPrefs((p) => {
      const n = { ...p, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(n));
      } catch {
        /* bỏ qua */
      }
      return n;
    });

  const seen = useMemo(() => new Set(data.attempts.flatMap((a) => a.units || [])), [data.attempts]);
  const mistakeUnits = useMemo(
    () => new Set(Object.values(data.mistakes).map((m) => m.unitId)),
    [data.mistakes]
  );
  const stats = useMemo(() => summarizeAttempts(data.attempts), [data.attempts]);
  const countByPart = useMemo(() => {
    const c = {};
    for (const u of data.units) c[u.part] = (c[u.part] || 0) + u.questions.length;
    return c;
  }, [data.units]);
  const mistakeCount = Object.keys(data.mistakes).length;

  const run = (units, mode, title) => {
    if (!units.length) return setToast("Chưa có câu hỏi phù hợp để làm.");
    runId.current++;
    setView({ name: "run", units, mode, title, id: runId.current });
  };
  const startPart = (part) =>
    run(
      pickUnits({ units: data.units, part, target: prefs.size, seen, mistakeUnits }),
      prefs.mode,
      `Part ${part}`
    );
  const startMini = () =>
    run(buildMiniTest(data.units, { seen, mistakeUnits }), "test", "Thi thử mini");
  const startReview = () =>
    run(
      pickUnits({ units: data.units.filter((u) => mistakeUnits.has(u.id)), target: prefs.size, seen: new Set(), mistakeUnits: new Set() }),
      "practice",
      "Ôn câu sai"
    );

  const finish = ({ answers, secs }) => {
    const { units, mode, title } = view;
    if (!Object.keys(answers).length) {
      setView({ name: "home" });
      return setToast("Bạn chưa trả lời câu nào nên chưa lưu kết quả.");
    }
    const attempt = makeAttempt({ units, answers, secs, mode, title });
    data.record(attempt, units, answers);
    // ghi nhận hoạt động trong ngày (tính vào chuỗi ngày), không đổi lịch ôn flashcard
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setProgress((p) => {
      const st = { ...(p.stats || {}) };
      const day = { ...(st[key] || { reviewed: 0, correct: 0, newLearned: 0 }) };
      day.practiced = (day.practiced || 0) + attempt.answered;
      st[key] = day;
      return { ...p, stats: st };
    });
    setView({ name: "result", units, answers, attempt });
  };

  const saveWord = (w) => {
    setProgress((p) => {
      const lists = p.lists || [];
      const entry = { id: `${EXAM_LIST_ID}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, ...w };
      const cur = lists.find((l) => l.id === EXAM_LIST_ID);
      if (cur) {
        if (cur.words.some((x) => x.word.toLowerCase() === w.word.toLowerCase())) return p;
        return { ...p, lists: lists.map((l) => (l.id === EXAM_LIST_ID ? { ...l, words: [...l.words, entry] } : l)) };
      }
      return { ...p, lists: [...lists, { id: EXAM_LIST_ID, name: "Từ trong đề thi", createdAt: Date.now(), words: [entry] }] };
    });
    setToast(`Đã lưu “${w.word}” vào danh sách Từ trong đề thi (tab Từ của tôi).`);
    setWord(null);
  };
  const onWord = (w, sentence) => setWord({ word: w, sentence });

  const handleImport = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const r = await data.importText(text, file.name);
      setReport({ name: file.name, ...r });
      if (r.ok) setToast(`Đã nhập “${r.set.title}”: ${r.set.units.reduce((s, u) => s + u.questions.length, 0)} câu.`);
    } catch (e) {
      setReport({ name: file.name, ok: false, errors: [e.message || "Không đọc được file."], warnings: [] });
    }
  };
  const handleBackupImport = async (file) => {
    if (!file) return;
    try {
      await data.importBackup(JSON.parse(await file.text()));
      setToast("Đã khôi phục dữ liệu luyện thi.");
    } catch (e) {
      alert(e.message || "Không đọc được file sao lưu.");
    }
  };

  const sheet = word && (
    <WordSheet entry={word} lists={progress.lists} onClose={() => setWord(null)} onSave={saveWord} speak={speech.speak} />
  );

  if (view.name === "run")
    return (
      <section className="page ex-page">
        <ExamRunner
          key={view.id}
          units={view.units}
          mode={view.mode}
          speech={speech}
          onFinish={finish}
          onExit={() => setView({ name: "home" })}
          onWord={onWord}
        />
        {sheet}
      </section>
    );

  if (view.name === "result") {
    const wrongUnits = view.units.filter((u) => u.questions.some((q) => view.answers[q.id] !== q.answer));
    return (
      <section className="page ex-page">
        <h1>Kết quả · {view.attempt.title}</h1>
        <ExamResult
          units={view.units}
          answers={view.answers}
          attempt={view.attempt}
          onHome={() => setView({ name: "home" })}
          onRetryWrong={() => run(wrongUnits, "practice", "Làm lại câu sai")}
          onWord={onWord}
        />
        {sheet}
      </section>
    );
  }

  const acc = pct(stats.correct, stats.total);
  const PartCard = ({ part }) => {
    const n = countByPart[part] || 0;
    const ps = stats.perPart[part];
    const a = pct(ps.recentC, ps.recentN);
    return (
      <button className="ex-part" disabled={!n || !data.ready} onClick={() => startPart(part)}>
        <b>Part {part}</b>
        <span>{PARTS[part].label}</span>
        <small>{n ? `${n} câu${a != null ? ` · gần đây ${a}%` : ""}` : "Chưa có đề"}</small>
      </button>
    );
  };

  return (
    <section className="page ex-page">
      <h1>Luyện thi TOEIC</h1>
      <p className="muted ex-sub">
        {stats.total
          ? `Đã làm ${stats.total} câu · đúng ${acc}%`
          : "Chọn một Part để bắt đầu. Bấm vào bất kỳ từ nào trong đề để tra và lưu vào flashcard."}
      </p>

      <div className="ex-prefs">
        <div className="seg" role="group" aria-label="Chế độ">
          <button className={prefs.mode === "practice" ? "on" : ""} onClick={() => setPref({ mode: "practice" })}>
            Luyện tập
          </button>
          <button className={prefs.mode === "test" ? "on" : ""} onClick={() => setPref({ mode: "test" })}>
            Thi thử
          </button>
        </div>
        <div className="seg" role="group" aria-label="Số câu">
          {[10, 20, 40].map((n) => (
            <button key={n} className={prefs.size === n ? "on" : ""} onClick={() => setPref({ size: n })}>
              ~{n} câu
            </button>
          ))}
        </div>
      </div>
      <p className="muted ex-hint">
        {prefs.mode === "practice" ? "Luyện tập: xem đáp án và giải thích ngay sau mỗi câu." : "Thi thử: chỉ chấm điểm ở cuối, không xem đáp án giữa chừng."}
      </p>

      <h3 className="ex-group">
        <Headphones size={16} /> Nghe (Listening)
      </h3>
      <div className="ex-parts">
        {LISTENING_PARTS.map((p) => (
          <PartCard key={p} part={p} />
        ))}
      </div>
      <h3 className="ex-group">
        <BookOpen size={16} /> Đọc (Reading)
      </h3>
      <div className="ex-parts ex-parts3">
        {READING_PARTS.map((p) => (
          <PartCard key={p} part={p} />
        ))}
      </div>

      <div className="ex-quick">
        <button className="primary" disabled={!data.units.length} onClick={startMini}>
          <Timer size={16} /> Thi thử mini
        </button>
        <button className="more" disabled={!mistakeCount} onClick={startReview}>
          <RotateCcw size={16} /> Ôn câu sai{mistakeCount ? ` (${mistakeCount})` : ""}
        </button>
      </div>

      {stats.weakTags.length > 0 && (
        <div className="panel ex-weak">
          <h3>Dạng câu cần luyện thêm</h3>
          {stats.weakTags.map((t) => (
            <div className="ex-row" key={t.tag}>
              <span>{t.tag}</span>
              <div className="ex-bar-mini">
                <i style={{ width: `${Math.round(t.acc * 100)}%` }} />
              </div>
              <b>{Math.round(t.acc * 100)}%</b>
            </div>
          ))}
        </div>
      )}

      <div className="panel ex-sets">
        <h3>Đề trong app</h3>
        {!data.ready && <p className="muted">Đang nạp đề…</p>}
        {data.sets.map((s) => (
          <div className="ex-set" key={s.id}>
            <div>
              <b>{s.title}</b>
              <small className="muted">
                {s.units.reduce((n, u) => n + u.questions.length, 0)} câu · Part{" "}
                {[...new Set(s.units.map((u) => u.part))].sort().join(", ")}
                {s.source === "builtin" ? " · có sẵn" : " · của bạn"}
              </small>
            </div>
            {s.source !== "builtin" && (
              <button
                className="icon-btn"
                aria-label="Xóa đề"
                onClick={() => confirm(`Xóa đề “${s.title}”?`) && data.removeSet(s.id)}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}

        <label className="dropzone ex-drop">
          <Upload size={18} />
          <span>Nhập đề của bạn (.json hoặc .csv)</span>
          <input type="file" accept=".json,.csv,.tsv,.txt" hidden onChange={(e) => handleImport(e.target.files?.[0]) || (e.target.value = "")} />
        </label>
        <div className="ex-links">
          <button className="link-btn" onClick={() => download("de-mau.json", JSON.stringify(examTemplate(), null, 2))}>
            <Download size={14} /> File mẫu JSON
          </button>
          <button className="link-btn" onClick={() => download("de-mau.csv", examCsvTemplate(), "text/csv")}>
            <Download size={14} /> File mẫu CSV
          </button>
        </div>
        {report && (
          <div className={`ex-report ${report.ok ? "ok" : "bad"}`}>
            <b>{report.ok ? `Đã nhập “${report.set.title}”` : `Không nhập được “${report.name}”`}</b>
            {[...(report.errors || []), ...(report.warnings || [])].slice(0, 6).map((m, k) => (
              <p key={k}>• {m}</p>
            ))}
            <button className="link-btn" onClick={() => setReport(null)}>
              Đóng
            </button>
          </div>
        )}
        <div className="ex-links">
          <button
            className="link-btn"
            onClick={async () => download("luyen-thi-sao-luu.json", JSON.stringify(await data.exportBackup()))}
          >
            <Download size={14} /> Sao lưu đề &amp; kết quả
          </button>
          <label className="link-btn">
            <Upload size={14} /> Khôi phục
            <input type="file" accept=".json" hidden onChange={(e) => handleBackupImport(e.target.files?.[0]) || (e.target.value = "")} />
          </label>
        </div>
      </div>
      {sheet}
    </section>
  );
}
