import { useEffect, useRef, useState } from "react";
import { words } from "../lib/words";
import { buildQuizItems } from "../lib/quiz";
import { unlockAudio } from "../lib/audio";

// Lượt "điền từ vào câu" (kiểu Part 5)
//   beforeStart(): dọn phiên học đang mở và chuyển sang tab Học
export function useQuiz({
  data,
  setProgress,
  today,
  speech,
  tab,
  setToast,
  beforeStart,
}) {
  const { blankPool, deck, cards } = data;
  const [quiz, setQuiz] = useState(null);

  const startQuiz = () => {
    unlockAudio();
    if (!blankPool.length) {
      setToast("Bộ từ này chưa có câu ví dụ chứa từ để điền chỗ trống.");
      return;
    }
    const items = buildQuizItems({ blankPool, deck, cards, allWords: words });
    if (!items.length) {
      setToast("Chưa tạo được câu hỏi cho bộ từ này.");
      return;
    }
    beforeStart();
    setQuiz({ items, i: 0, picked: null, score: 0, wrong: [] });
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
    if (speech.autoSpeak) speech.speak(it.w.word);
  };

  const nextQuiz = () =>
    setQuiz((q) =>
      q.i + 1 >= q.items.length
        ? { ...q, done: true }
        : { ...q, i: q.i + 1, picked: null }
    );
  const endQuiz = () => setQuiz(null);

  // phím 1–4 chọn đáp án, Enter/Space/→ sang câu tiếp
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (!quiz || quiz.done || tab !== "study") return;
    if (e.target.matches?.("input, select, textarea")) return;
    const it = quiz.items[quiz.i];
    if (quiz.picked == null) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= it.options.length) pickOption(n - 1);
    } else if (e.key === "Enter" || e.code === "Space" || e.key === "ArrowRight") {
      e.preventDefault();
      nextQuiz();
    }
  };
  useEffect(() => {
    const h = (e) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return { quiz, startQuiz, pickOption, nextQuiz, endQuiz };
}
