import { useEffect, useRef, useState } from "react";
import { PRACTICE_MAX } from "../lib/constants";
import { nextSchedule, insertRelearn } from "../lib/srs";
import { logReview, removeReview } from "../lib/storage";
import { shuffle } from "../lib/utils";
import { preloadAudio, unlockAudio } from "../lib/audio";
import { useSwipe } from "./useSwipe";

// Toàn bộ phiên học thẻ: hàng đợi, chấm điểm, hoàn tác, vuốt, tự đọc, phím tắt.
export function useStudySession({
  data,
  progress,
  setProgress,
  today,
  speech,
  deckId,
  newLimit,
  tab,
  setTab,
  setToast,
}) {
  const { cards, deck, wordById, newWords, dueQueue, hardIds } = data;
  const { speak, autoSpeak, voiceMode } = speech;

  const [direction, setDirection] = useState("en-vi");
  const [showAnswer, setShowAnswer] = useState(false);
  const [session, setSession] = useState([]);
  const [index, setIndex] = useState(0);
  const [practice, setPractice] = useState(false); // luyện tập: không đổi lịch ôn
  const [lastSession, setLastSession] = useState(null); // {deckId, ids}
  const [undo, setUndo] = useState(null); // trạng thái trước khi chấm thẻ gần nhất
  const [relearn, setRelearn] = useState([]); // id thẻ vừa bấm "Chưa nhớ", đang được hỏi lại trong phiên
  const spokenRef = useRef(""); // thẻ đã tự đọc, để không đọc lặp

  const enVi = direction === "en-vi";
  const current = session[index] ? wordById.get(session[index]) : null;
  const lastIds =
    lastSession && lastSession.deckId === deckId
      ? lastSession.ids.filter((id) => wordById.has(id))
      : [];
  const relearning = !practice && !!current && relearn.includes(current.id);
  const sessionPct = session.length
    ? Math.round((index / session.length) * 100)
    : 0;

  const swipe = useSwipe({
    index,
    session,
    onTap: () => setShowAnswer((v) => !v),
    onDecide: (r) => commit(r),
  });

  /* ---------- chấm điểm ---------- */
  function setRating(rating) {
    if (!current) return;
    const old = cards[current.id];
    const again = rating === "again";
    // Lượt hỏi lại (lần thứ hai trong phiên): KHÔNG đổi lịch ôn / thống kê
    // (lần "Chưa nhớ" đầu tiên đã tính rồi)
    const isRelearnPass = !practice && relearn.includes(current.id);
    const scheduled = nextSchedule(old, rating);
    // Ghi nhật ký lượt ôn thật (dùng để tối ưu tham số FSRS); luyện tập và lượt hỏi lại không tính
    const logT = !practice && !isRelearnPass ? Date.now() : null;
    if (logT) logReview({ c: current.id, t: logT, g: again ? 1 : 3 });
    setUndo({
      logT,
      session,
      index,
      id: current.id,
      old,
      day: progress.stats?.[today],
      today,
      practice,
      relearn,
    });
    if (!isRelearnPass) {
      setProgress((p) => {
        const st = { ...(p.stats || {}) };
        const day = {
          ...(st[today] || { reviewed: 0, correct: 0, newLearned: 0 }),
        };
        if (practice) {
          // luyện tập: chỉ ghi nhận hoạt động (tính chuỗi ngày), không đổi lịch ôn
          day.practiced = (day.practiced || 0) + 1;
          st[today] = day;
          return { ...p, stats: st };
        }
        day.reviewed += 1;
        if (!again) day.correct += 1;
        if (!old && typeof current.id === "number") day.newLearned += 1; // chỉ kho chung tính vào hạn mức từ mới/ngày
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
    }
    // Thẻ "Chưa nhớ" (không phải luyện tập) được hỏi lại ĐÚNG 1 LẦN sau vài thẻ.
    // Lượt hỏi lại chỉ để ôn thêm: dù nhớ hay không, lịch vẫn là ngày mai (đã hẹn từ lần sai đầu).
    let nextSession = session;
    if (!practice && again && !isRelearnPass) {
      nextSession = insertRelearn(session, index, current.id);
      setRelearn((r) => [...r, current.id]);
    } else if (isRelearnPass) {
      setRelearn((r) => r.filter((id) => id !== current.id));
    }
    const next = index + 1;
    if (next >= nextSession.length) {
      setSession([]);
      setIndex(0);
      setShowAnswer(false);
      setRelearn([]);
      setToast("Hoàn thành lượt học! 🎉");
    } else {
      setSession(nextSession);
      setIndex(next);
      setShowAnswer(false);
    }
  }

  // Bay thẻ ra (thẻ kế tiếp nhô lên cùng lúc) rồi mới ghi kết quả
  function commit(rating) {
    if (swipe.leavingRef.current || !current) return;
    swipe.flyOut(rating);
    // Thẻ kế tiếp đã hiện sẵn phía sau: đọc luôn lúc vuốt
    if (autoSpeak && enVi) {
      const nid = session[index + 1];
      const nw = nid != null ? wordById.get(nid) : null;
      if (nw) {
        spokenRef.current = `${nid}-${index + 1}`;
        speak(nw.word);
      }
    }
    setTimeout(() => setRating(rating), 240);
  }

  // Hoàn tác thẻ vừa chấm: trả lại lịch ôn, thống kê và vị trí trong phiên
  function undoLast() {
    if (!undo || swipe.leavingRef.current) return;
    const u = undo;
    if (u.logT) removeReview(u.id, u.logT); // bỏ dòng nhật ký của lượt vừa hoàn tác
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
    setRelearn(u.relearn || []);
    setSession(u.session);
    setIndex(u.index);
    setShowAnswer(false);
    setTab("study");
    setToast("Đã hoàn tác thẻ vừa rồi");
  }

  // mode: "due" | "more" | "learned" | "last" | "all" | "hard"
  // "due" và "more" tính vào lịch ôn; các chế độ còn lại chỉ luyện tập.
  function startStudy(mode = "due") {
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
    setRelearn([]);
    spokenRef.current = "";
    // Đọc luôn từ đầu tiên ngay trong cú chạm (iOS chỉ cho phát tiếng ở đây)
    const first = wordById.get(ids[0]);
    if (autoSpeak && direction === "en-vi" && first) {
      spokenRef.current = `${ids[0]}-0`;
      speak(first.word);
    }
    setPractice(["learned", "last", "all", "hard"].includes(mode));
    setSession(ids);
    setIndex(0);
    setShowAnswer(false);
    swipe.resetSwipe();
    setTab("study");
  }

  function endSession() {
    setUndo(null);
    setRelearn([]);
    setSession([]);
    setIndex(0);
    setShowAnswer(false);
    swipe.resetSwipe();
  }

  const toggleDirection = () => {
    setDirection((v) => (v === "en-vi" ? "vi-en" : "en-vi"));
    setShowAnswer(false);
  };

  /* ---------- phím tắt (đăng ký một lần, luôn gọi bản handler mới nhất) ---------- */
  const keyRef = useRef(null);
  keyRef.current = (e) => {
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
  useEffect(() => {
    const h = (e) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------- âm thanh ---------- */
  // Tải sẵn thẻ hiện tại + 3 thẻ kế tiếp (chưa vào phiên thì tải đầu hàng đợi)
  useEffect(() => {
    if (voiceMode !== "human") return;
    if (current)
      for (let k = 0; k <= 3; k++)
        preloadAudio(wordById.get(session[index + k])?.word);
    else dueQueue.slice(0, 3).forEach((w) => preloadAudio(w.word));
  }, [current?.id, index, voiceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tự đọc: Anh → Việt đọc ngay khi thẻ hiện; Việt → Anh đọc khi lật ra đáp án
  useEffect(() => {
    if (!autoSpeak || tab !== "study" || !current || !enVi) return;
    const key = `${current.id}-${index}`;
    if (spokenRef.current === key) return; // đã đọc lúc vuốt / lúc bấm bắt đầu
    spokenRef.current = key;
    speak(current.word);
  }, [current?.id, index, autoSpeak, enVi, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoSpeak || tab !== "study" || !current || enVi || !showAnswer)
      return;
    speak(current.word);
  }, [showAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    session,
    index,
    current,
    showAnswer,
    enVi,
    practice,
    relearning,
    undo,
    lastIds,
    sessionPct,
    swipe,
    commit,
    undoLast,
    startStudy,
    endSession,
    toggleDirection,
  };
}
