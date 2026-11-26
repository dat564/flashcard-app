import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, Headphones, Pause, Play, RotateCcw, X } from "lucide-react";
import { PARTS, LETTERS, isListening } from "../../lib/examSchema";
import { fmtTime } from "../../lib/examEngine";
import TapText from "./TapText";
import { useUnitAudio } from "./useUnitAudio";

const RATES = [0.85, 1, 1.15];
const STATUS = { idle: "Bấm ▶ để nghe", playing: "Đang phát…", paused: "Tạm dừng", done: "Đã phát xong" };
const scrollTop = () => {
  window.scrollTo(0, 0);
  document.querySelector(".main")?.scrollTo?.(0, 0);
};

function AudioPanel({ unit, audio, rate, setRate }) {
  const noTts = !unit.audio && typeof window !== "undefined" && !window.speechSynthesis;
  const toggle = () => {
    if (audio.state === "playing") audio.pause();
    else if (audio.state === "paused") audio.resume();
    else audio.start(unit, rate);
  };
  return (
    <div className="ex-audio">
      <button className="ex-play" onClick={toggle} aria-label={audio.state === "playing" ? "Tạm dừng" : "Phát"}>
        {audio.state === "playing" ? <Pause size={22} /> : <Play size={22} />}
      </button>
      <div className="ex-audio-info">
        <b>
          <Headphones size={14} /> Phần nghe
        </b>
        <span className="muted">{noTts ? "Trình duyệt này không đọc được giọng máy" : STATUS[audio.state]}</span>
      </div>
      <button className="icon-btn" onClick={() => audio.start(unit, rate)} aria-label="Nghe lại" title="Nghe lại">
        <RotateCcw size={17} />
      </button>
      <div className="ex-rate" role="group" aria-label="Tốc độ">
        {RATES.map((r) => (
          <button key={r} className={r === rate ? "on" : ""} onClick={() => setRate(r)}>
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionBlock({ q, number, unit, answer, reveal, mode, onPick, onWord }) {
  const hideText = (unit.part === 1 || unit.part === 2) && !reveal;
  const label = q.text || (q.blank ? `Chỗ trống (${q.blank})` : "");
  return (
    <div className="ex-q">
      <p className="ex-qtext">
        <b className="ex-qnum">{number}.</b>{" "}
        {q.text ? <TapText text={q.text} onWord={onWord} /> : label}
      </p>
      <div className="ex-opts">
        {q.options.map((o, k) => {
          let cls = "";
          if (reveal) cls = k === q.answer ? "right" : k === answer ? "wrong" : "dim";
          else if (answer === k) cls = "sel";
          return (
            <button key={k} className={`ex-opt ${cls}`} onClick={() => onPick(q, k)} disabled={reveal}>
              <i>{LETTERS[k]}</i>
              <span>{hideText ? "• • •" : o}</span>
            </button>
          );
        })}
      </div>
      {reveal && (
        <div className={`ex-exp ${answer === q.answer ? "ok" : "bad"}`}>
          <b>{answer === q.answer ? "Chính xác!" : `Đáp án đúng: ${LETTERS[q.answer]}. ${q.options[q.answer]}`}</b>
          {q.explanation && <p>{q.explanation}</p>}
        </div>
      )}
    </div>
  );
}

// Màn làm bài. mode: "practice" (xem đáp án ngay sau mỗi câu) | "test" (chấm ở cuối)
export default function ExamRunner({ units, mode, speech, onFinish, onExit, onWord }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secs, setSecs] = useState(0);
  const [rate, setRate] = useState(1);
  const [passageOpen, setPassageOpen] = useState(true); // điện thoại: ẩn bớt đoạn văn để có chỗ cho câu hỏi
  const audio = useUnitAudio(speech);
  const practice = mode !== "test";
  const unit = units[i];
  const last = i === units.length - 1;
  const offsets = useMemo(() => {
    let n = 0;
    return units.map((u) => {
      const o = n;
      n += u.questions.length;
      return o;
    });
  }, [units]);
  const totalQ = units.reduce((s, u) => s + u.questions.length, 0);
  const allDone = unit.questions.every((q) => answers[q.id] != null);
  const answeredN = Object.keys(answers).length;

  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const pick = (q, k) => {
    if (practice && answers[q.id] != null) return;
    setAnswers((a) => ({ ...a, [q.id]: k }));
  };
  const finish = () => {
    audio.stop();
    onFinish({ answers, secs });
  };
  const next = () => {
    if (last) return finish();
    const n = i + 1;
    setI(n);
    scrollTop();
    // đang trong thao tác bấm nên được phép tự phát âm thanh của đơn vị kế tiếp
    if (isListening(units[n].part)) audio.start(units[n], rate);
    else audio.stop();
  };
  const finishEarly = () => {
    if (confirm(`Kết thúc và chấm ${answeredN}/${totalQ} câu đã làm?`)) finish();
  };
  const exit = () => {
    if (!answeredN || confirm("Thoát? Kết quả lượt này sẽ không được lưu.")) {
      audio.stop();
      onExit();
    }
  };

  const fills = {};
  for (const q of unit.questions) {
    if (!q.blank || answers[q.id] == null) continue;
    const reveal = practice;
    fills[q.blank] = reveal
      ? { text: q.options[q.answer], cls: "ok" }
      : { text: q.options[answers[q.id]], cls: "pick" };
  }
  const showTranscript = isListening(unit.part) && unit.part !== 1 && practice && allDone;
  const script = unit.transcript;

  return (
    <div className="ex-run">
      <div className="ex-bar">
        <button className="icon-btn" onClick={exit} aria-label="Thoát">
          <X size={18} />
        </button>
        <div className="ex-prog">
          <div className="track">
            <i style={{ width: `${(i / units.length) * 100}%` }} />
          </div>
          <span className="count">
            {i + 1}/{units.length}
          </span>
        </div>
        <span className="ex-timer">
          <Clock size={14} /> {fmtTime(secs)}
        </span>
        <button className="chip btn" onClick={finishEarly}>
          Kết thúc
        </button>
      </div>

      <div className="ex-meta">
        <span className="ex-badge">
          Part {unit.part} · {PARTS[unit.part].label}
        </span>
        {!practice && <span className="ex-badge alt">Thi thử</span>}
        {unit.questions.length > 1 && (
          <span className="muted">
            Câu {offsets[i] + 1}–{offsets[i] + unit.questions.length}
          </span>
        )}
      </div>

      {isListening(unit.part) && <AudioPanel unit={unit} audio={audio} rate={rate} setRate={setRate} />}
      {unit.image && <img className="ex-img" src={unit.image} alt="Tranh của câu hỏi" />}

      <div className={unit.passages.length ? "ex-split" : "ex-qs"}>
        {unit.passages.length > 0 && (
          <div className={`ex-pane-passage ${passageOpen ? "" : "closed"}`}>
            <button className="link-btn ex-toggle" onClick={() => setPassageOpen((o) => !o)}>
              {passageOpen ? "Ẩn đoạn văn" : "Hiện đoạn văn"}
            </button>
            {unit.passages.map((p, pi) => (
              <div className="ex-passage" key={pi}>
                {(p.title || unit.passages.length > 1) && <h4>{p.title || `Văn bản ${pi + 1}`}</h4>}
                <TapText text={p.text} onWord={onWord} fills={fills} />
              </div>
            ))}
          </div>
        )}
        <div className="ex-qs">
          {unit.questions.map((q, qi) => (
            <QuestionBlock
              key={q.id}
              q={q}
              number={offsets[i] + qi + 1}
              unit={unit}
              answer={answers[q.id]}
              reveal={practice && answers[q.id] != null}
              mode={mode}
              onPick={pick}
              onWord={onWord}
            />
          ))}
        </div>
      </div>

      {showTranscript && (
        <details className="ex-transcript" open>
          <summary>Xem transcript</summary>
          {script.map((l, k) => (
            <p key={k} className={audio.line === k ? "now" : ""}>
              {l.speaker && <b>{l.speaker}: </b>}
              <TapText text={l.text} onWord={onWord} />
            </p>
          ))}
        </details>
      )}

      <div className="ex-foot">
        {practice && !allDone && (
          <button className="link-btn" onClick={next}>
            Bỏ qua
          </button>
        )}
        <button className="primary" onClick={next} disabled={practice && !allDone}>
          {last ? "Xem kết quả" : "Tiếp"} <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
