import { useMemo } from "react";
import { words } from "../lib/words";
import { dueAt, isHard, retrievability } from "../lib/srs";
import { buildBlankPool } from "../lib/quiz";
import { orderNewWords, DEFAULT_NEW_ORDER } from "../lib/levels";
import { MAX_REVIEWS_PER_DAY, BACKLOG_NEW_STOP } from "../lib/constants";

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
  // Kho chung: theo cài đặt "Thứ tự từ mới" (mặc định: phổ biến trước, trộn ổn định trong từng nhóm);
  // danh sách riêng giữ thứ tự người dùng nhập
  const newOrder = progress.settings?.newOrder || DEFAULT_NEW_ORDER;
  const newWords = isMain ? orderNewWords(unseen, newOrder) : unseen;
  // Giới hạn tải: thẻ ôn lại đã làm hôm nay (không tính từ mới) trừ vào hạn mức ngày.
  // Thẻ đến hạn dư ra không mất, chỉ để sang ngày sau (vẫn ưu tiên thẻ sắp quên nhất).
  const reviewedOld = Math.max(
    0,
    (todayStats.reviewed || 0) - (todayStats.newLearned || 0)
  );
  const reviewsLeft = Math.max(0, MAX_REVIEWS_PER_DAY - reviewedOld);
  const reviewQueue = dueWords.slice(0, reviewsLeft);
  const deferredCount = dueWords.length - reviewQueue.length;
  // Nợ nhiều thì tạm dừng từ mới (tính cả thẻ đã ôn hôm nay để không bật lại giữa ngày)
  const backlog = dueWords.length + reviewedOld;
  const newPaused = isMain && backlog > BACKLOG_NEW_STOP;
  // từ bấm "Đã biết từ này" không tốn hạn mức từ mới trong ngày
  const newUsed = Math.max(0, (todayStats.newLearned || 0) - (todayStats.known || 0));
  const remainingNew = isMain
    ? newPaused
      ? 0
      : Math.max(0, newLimit - newUsed)
    : Infinity; // danh sách riêng: học hết, không giới hạn

  const dueQueue = useMemo(
    () => [...reviewQueue, ...newWords.slice(0, remainingNew)],
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
    dueCount: dueWords.length, // tổng thẻ đến hạn (thật)
    reviewCount: reviewQueue.length, // số thẻ ôn lại sẽ học hôm nay (sau giới hạn)
    deferredCount, // thẻ đến hạn để sang ngày sau
    newPaused, // từ mới đang tạm dừng vì nợ nhiều
    newWords,
    remainingNew,
    dueQueue,
    deckLearned: deck.filter(isLearned).length,
    practiceCount: deck.reduce((n, w) => n + (cards[w.id] ? 1 : 0), 0),
    hardIds: deck.filter((w) => isHard(cards[w.id])).map((w) => w.id),
    blankPool,
  };
}
