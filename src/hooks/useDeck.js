import { useMemo } from "react";
import { words } from "../lib/words";
import { dueAt, isHard, retrievability } from "../lib/srs";
import { buildBlankPool } from "../lib/quiz";
import { mixKey } from "../lib/utils";

// Dữ liệu dẫn xuất của bộ từ đang học (kho chung hoặc danh sách riêng)
export function useDeck({ progress, deckId, newLimit, today }) {
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
  // Thẻ đến hạn: từ sắp quên nhất (xác suất nhớ thấp nhất) học trước
  const dueWords = deck
    .filter((w) => cards[w.id] && dueAt(cards[w.id]) <= nowMs)
    .map((w) => ({ w, r: retrievability(cards[w.id], nowMs) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.w);
  const unseen = deck.filter((w) => !cards[w.id]);
  // Kho chung: trộn ổn định để không học liền các từ cùng gốc; danh sách riêng giữ thứ tự người dùng
  const newWords = isMain
    ? [...unseen].sort((a, b) => mixKey(a.id) - mixKey(b.id))
    : unseen;
  const remainingNew = isMain
    ? Math.max(0, newLimit - (todayStats.newLearned || 0))
    : Infinity; // danh sách riêng: học hết, không giới hạn

  const dueQueue = useMemo(
    () => [...dueWords, ...newWords.slice(0, remainingNew)],
    [progress, today, newLimit, deckId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const blankPool = useMemo(() => buildBlankPool(deck), [deck]);

  return {
    cards,
    lists,
    isMain,
    deck,
    wordById,
    todayStats,
    isLearned,
    learnedCount,
    dueCount: dueWords.length,
    newWords,
    remainingNew,
    dueQueue,
    deckLearned: deck.filter(isLearned).length,
    practiceCount: deck.reduce((n, w) => n + (cards[w.id] ? 1 : 0), 0),
    hardIds: deck.filter((w) => isHard(cards[w.id])).map((w) => w.id),
    blankPool,
  };
}
