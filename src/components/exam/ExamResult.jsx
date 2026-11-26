import { useMemo } from "react";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { PARTS, LETTERS } from "../../lib/examSchema";
import { fmtTime, pct, scoreAttempt } from "../../lib/examEngine";
import TapText from "./TapText";

export default function ExamResult({ units, answers, attempt, onHome, onRetryWrong, onWord }) {
  const s = useMemo(() => scoreAttempt(units, answers), [units, answers]);
  const p = pct(s.correct, s.total);
  const tagList = Object.entries(s.tags)
    .map(([tag, [c, n]]) => ({ tag, c, n, acc: c / n }))
    .sort((a, b) => a.acc - b.acc);
  let num = 0;
  return (
    <div className="ex-result">
      <div className="ex-score panel">
        <div className={`ex-ring ${p >= 80 ? "great" : p >= 50 ? "ok" : "low"}`}>
          <b>{p}%</b>
          <span>
            {s.correct}/{s.total}
          </span>
        </div>
        <div>
          <h2>{p >= 80 ? "Rất tốt!" : p >= 50 ? "Khá ổn, cần luyện thêm" : "Cần ôn lại phần này"}</h2>
          <p className="muted">
            <Clock size={14} /> {fmtTime(attempt.secs)} · {s.answered}/{s.total} câu đã trả lời
          </p>
          {attempt.mode === "test" && s.answered < s.total && (
            <p className="muted">Câu bỏ trống được tính là sai.</p>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Theo Part</h3>
        {Object.entries(s.perPart).map(([part, v]) => (
          <div className="ex-row" key={part}>
            <span>
              Part {part} · {PARTS[part].label}
            </span>
            <div className="ex-bar-mini">
              <i style={{ width: `${pct(v.c, v.n)}%` }} />
            </div>
            <b>
              {v.c}/{v.n}
            </b>
          </div>
        ))}
        {tagList.length > 1 && (
          <>
            <h3>Theo dạng câu</h3>
            {tagList.map((t) => (
              <div className="ex-row" key={t.tag}>
                <span>{t.tag}</span>
                <div className="ex-bar-mini">
                  <i style={{ width: `${Math.round(t.acc * 100)}%` }} />
                </div>
                <b>
                  {t.c}/{t.n}
                </b>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="ex-actions">
        {s.wrong.length > 0 && (
          <button className="primary" onClick={onRetryWrong}>
            <RotateCcw size={16} /> Làm lại {s.wrong.length} câu sai
          </button>
        )}
        <button className={s.wrong.length ? "more" : "primary"} onClick={onHome}>
          Về trang luyện thi
        </button>
      </div>

      <h3 className="ex-review-title">Xem lại từng câu</h3>
      {units.map((u) => (
        <details className="panel ex-review" key={u.id} open={u.questions.some((q) => answers[q.id] !== q.answer)}>
          <summary>
            Part {u.part} · {u.questions.map((q) => (answers[q.id] === q.answer ? "✓" : "✗")).join(" ")}
          </summary>
          {u.image && <img className="ex-img" src={u.image} alt="" />}
          {u.passages.map((ps, k) => (
            <div className="ex-passage" key={k}>
              {ps.title && <h4>{ps.title}</h4>}
              <TapText text={ps.text} onWord={onWord} />
            </div>
          ))}
          {u.part !== 1 && u.transcript.length > 0 && !u.audio && (
            <div className="ex-transcript">
              {u.transcript.map((l, k) => (
                <p key={k}>
                  {l.speaker && <b>{l.speaker}: </b>}
                  <TapText text={l.text} onWord={onWord} />
                </p>
              ))}
            </div>
          )}
          {u.questions.map((q) => {
            num++;
            const a = answers[q.id];
            const ok = a === q.answer;
            return (
              <div className={`ex-rq ${ok ? "ok" : "bad"}`} key={q.id}>
                <p>
                  {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} <b>Câu {num}.</b>{" "}
                  {q.text ? <TapText text={q.text} onWord={onWord} /> : q.blank ? `Chỗ trống (${q.blank})` : ""}
                </p>
                <ul>
                  {q.options.map((o, k) => (
                    <li key={k} className={k === q.answer ? "right" : k === a ? "wrong" : ""}>
                      <i>{LETTERS[k]}</i> {o}
                      {k === a && k !== q.answer ? "  ← bạn chọn" : ""}
                    </li>
                  ))}
                </ul>
                {a == null && <p className="muted">Bạn chưa trả lời câu này.</p>}
                {q.explanation && <p className="ex-explain">{q.explanation}</p>}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}
