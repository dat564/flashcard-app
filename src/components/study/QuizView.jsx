import { Check, X } from "lucide-react";
import { metaOf } from "../../lib/utils";
import SoundButton from "../SoundButton";

export default function QuizView({ api, speech }) {
  const { quiz, startQuiz, pickOption, nextQuiz, endQuiz } = api;

  if (quiz.done) {
    return (
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
    );
  }

  const qi = quiz.items[quiz.i];
  const answered = quiz.picked != null;
  const right = answered && qi.options[quiz.picked] === qi.answer;

  return (
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
          <span className={`blank ${answered ? "filled" : ""}`}>
            {answered ? qi.answer : "\u00a0"}
          </span>
          {qi.after}
        </p>
        <div className="q-opts">
          {qi.options.map((o, k) => {
            const state = !answered
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
                disabled={answered}
              >
                <kbd>{k + 1}</kbd>
                {o}
              </button>
            );
          })}
        </div>
        {answered && (
          <div className={`q-fb ${right ? "ok" : "no"}`}>
            <b>{right ? "Chính xác!" : "Chưa đúng."}</b>
            <div>
              <strong>{qi.w.word}</strong>
              {metaOf(qi.w) ? `  ·  ${metaOf(qi.w)}` : ""} — {qi.w.meaning}
            </div>
            <div className="q-fb-actions">
              <SoundButton
                size={16}
                label="Nghe câu"
                onPlay={() => speech.speakBrowser(qi.before + qi.answer + qi.after)}
              />
              <SoundButton
                size={16}
                label="Nghe từ"
                onPlay={() => speech.speak(qi.w.word)}
              />
            </div>
          </div>
        )}
      </div>
      <div className="actions">
        {answered ? (
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
  );
}
