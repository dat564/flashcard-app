import {
  Brain,
  Check,
  ChevronDown,
  Library,
  Pencil,
  Plus,
  RotateCcw,
  Shuffle,
  Target,
  Undo2,
} from "lucide-react";
import { PRACTICE_MAX } from "../../lib/constants";
import { words } from "../../lib/words";
import { levelOf, LEVELS, LEVEL_LABEL } from "../../lib/levels";
import WeekStrip from "../WeekStrip";

export default function StartScreen({
  study,
  data,
  quizApi,
  deckId,
  chooseDeck,
  setTab,
  newLimit,
  streak,
  week,
  backupStale,
}) {
  const {
    lists,
    isMain,
    deck,
    todayStats,
    dueCount,
    reviewCount,
    deferredCount,
    newPaused,
    dueQueue,
    newWords,
    remainingNew,
    deckLearned,
    practiceCount,
    hardIds,
    blankPool,
  } = data;
  const { lastIds, undo } = study;
  const nothingDue = dueQueue.length === 0;

  // Hôm nay có bao nhiêu từ mới ở từng mức độ (kho chung), vd. "12 cơ bản · 3 trung cấp"
  const todayNew = newWords.slice(
    0,
    Math.max(0, Math.min(remainingNew, newWords.length))
  );
  const lvCount = { 1: 0, 2: 0, 3: 0 };
  todayNew.forEach((w) => (lvCount[levelOf(w)] += 1));
  const todayNewBreakdown =
    todayNew.length > 0
      ? LEVELS.filter((l) => lvCount[l] > 0)
          .map((l) => `${lvCount[l]} ${LEVEL_LABEL[l].toLowerCase()}`)
          .join(" · ")
      : "";

  return (
    <div className="start">
      <div className="start-brand">
        <span className="logo">
          <Brain size={20} />
        </span>
        <b>TOEIC Recall</b>
      </div>

      <div className="deck-select">
        <select
          aria-label="Chọn bộ từ"
          value={deckId}
          onChange={(e) =>
            e.target.value === "__add__"
              ? setTab("mine")
              : chooseDeck(e.target.value)
          }
        >
          <option value="main">Kho chung · {words.length} từ</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.words.length} từ
            </option>
          ))}
          <option value="__add__">＋ Thêm danh sách mới…</option>
        </select>
        <ChevronDown size={18} />
      </div>

      <div className="hero">
        <div className="start-icon">
          <Check size={30} />
        </div>
        <h2>{nothingDue ? "Hôm nay bạn đã xong!" : "Sẵn sàng học chưa?"}</h2>
        {nothingDue ? (
          <p>
            Không còn thẻ nào cần ôn hôm nay. Quay lại ngày mai để ôn tiếp, hoặc
            học thêm ngay bên dưới nếu bạn còn hứng.
          </p>
        ) : (
          <div className="hero-nums">
            <div>
              <strong>{reviewCount}</strong>
              <span>thẻ đến hạn</span>
            </div>
            <div>
              <strong>{Math.min(remainingNew, newWords.length)}</strong>
              <span>từ mới</span>
            </div>
          </div>
        )}
        {deferredCount > 0 && (
          <p className="muted hero-sub">
            Còn {deferredCount} thẻ đến hạn được để sang ngày mai (giới hạn ôn
            mỗi ngày).
          </p>
        )}
        {newPaused && (
          <p className="muted hero-sub">
            Đang tạm dừng từ mới vì thẻ ôn đang dồn nhiều. Ôn bớt rồi từ mới sẽ
            tự bật lại.
          </p>
        )}
        {isMain && todayNewBreakdown && (
          <p className="muted hero-sub">Từ mới hôm nay: {todayNewBreakdown}</p>
        )}
        <button
          className="primary"
          onClick={() => study.startStudy()}
          disabled={nothingDue}
        >
          {nothingDue ? "Đã hoàn thành" : "Bắt đầu học"}
        </button>
      </div>

      {week && <WeekStrip week={week} />}

      {backupStale && (
        <button className="backup-nag" onClick={() => setTab("stats")}>
          ⚠ Bạn chưa sao lưu tiến độ trong 7 ngày qua. Bấm để sao lưu.
        </button>
      )}

      {blankPool.length > 0 && (
        <button className="mode-btn" onClick={quizApi.startQuiz}>
          <Pencil size={16} /> Điền từ vào câu (kiểu Part 5)
        </button>
      )}

      {((nothingDue && newWords.length > 0) ||
        lastIds.length > 0 ||
        practiceCount > 0 ||
        !isMain) && (
        <div className="more-box">
          <div className="more-title">
            {nothingDue ? "Muốn học thêm?" : "Hoặc luyện tập thêm"}
          </div>
          <div className="more-actions">
            {nothingDue && newWords.length > 0 && (
              <button
                className="more-btn strong"
                onClick={() => study.startStudy("more")}
              >
                <Plus size={16} /> Học thêm{" "}
                {Math.min(newLimit, newWords.length)} từ mới
              </button>
            )}
            {hardIds.length > 0 && (
              <button
                className="more-btn hard"
                onClick={() => study.startStudy("hard")}
              >
                <Target size={15} /> Ôn {hardIds.length} từ khó
              </button>
            )}
            {lastIds.length > 0 && (
              <button
                className="more-btn"
                onClick={() => study.startStudy("last")}
              >
                <RotateCcw size={15} /> Học lại phiên vừa rồi · {lastIds.length}{" "}
                thẻ
              </button>
            )}
            {practiceCount > 0 && (
              <button
                className="more-btn"
                onClick={() => study.startStudy("learned")}
              >
                <Shuffle size={15} /> Ôn ngẫu nhiên{" "}
                {Math.min(PRACTICE_MAX, practiceCount)} từ đã học
              </button>
            )}
            {!isMain && (
              <button
                className="more-btn"
                onClick={() => study.startStudy("all")}
              >
                <Library size={15} /> Ôn lại cả danh sách · {deck.length} từ
              </button>
            )}
          </div>
          <div className="more-note">
            “Học thêm từ mới” được tính vào lịch ôn. Các chế độ còn lại chỉ để
            luyện tập, không làm thay đổi lịch ôn.
          </div>
        </div>
      )}

      {undo && (
        <button className="link-btn" onClick={study.undoLast}>
          <Undo2 size={14} /> Hoàn tác thẻ vừa rồi
        </button>
      )}

      <div className="mini-stats">
        <div>
          <strong>{streak.cur}</strong>
          <span>Ngày liên tiếp</span>
        </div>
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
  );
}
