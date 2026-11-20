import { ArrowLeftRight, Check, Undo2, X } from "lucide-react";
import { isHard } from "../../lib/srs";
import FlashCard from "./FlashCard";
import RatingBar from "./RatingBar";

function badgeOf(card, practice) {
  if (isHard(card)) return ["hard", "Từ khó"];
  if (practice) return ["practice", "Luyện tập"];
  return card ? ["review", "Ôn tập"] : ["new", "Từ mới"];
}

export default function SessionView({ study, data, speech }) {
  const {
    session,
    index,
    current,
    showAnswer,
    enVi,
    practice,
    relearning,
    undo,
    sessionPct,
    swipe,
  } = study;
  const { cards, wordById } = data;

  return (
    <>
      <div className="session-bar">
        <div className="track">
          <i style={{ width: `${sessionPct}%` }} />
        </div>
        <span className="count">
          {index + 1} / {session.length}
        </span>
        <button className="chip btn" onClick={study.toggleDirection}>
          <ArrowLeftRight size={14} />
          {enVi ? "Anh → Việt" : "Việt → Anh"}
        </button>
        <button
          className="icon-btn sm"
          title="Hoàn tác thẻ vừa rồi (Z)"
          onClick={study.undoLast}
          disabled={!undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          className="icon-btn sm"
          title="Kết thúc phiên"
          aria-label="Kết thúc phiên"
          onClick={study.finishEarly}
        >
          <X size={16} />
        </button>
      </div>

      <div className="stage" ref={swipe.stageRef}>
        {/* thẻ phía sau đứng trước trong DOM để khi lên làm thẻ chính, React giữ nguyên node (không nháy) */}
        {[index + 1, index]
          .filter((i) => session[i] != null)
          .map((i) => {
            const w = wordById.get(session[i]);
            if (!w) return null;
            const top = i === index;
            const [badge, label] = badgeOf(cards[w.id], practice);
            return (
              <div
                key={`${session[i]}-${i}`}
                className={`swipe ${top ? "top" : "behind"}`}
                ref={top ? swipe.swipeRef : null}
                {...(top ? swipe.handlers : {})}
              >
                <FlashCard
                  word={w}
                  flipped={top && showAnswer}
                  enVi={enVi}
                  badge={badge}
                  label={label}
                  speak={speech.speak}
                />
              </div>
            );
          })}

        {/* bóng nằm sau thẻ, chữ nằm trên thẻ nên không bị che */}
        <div className="glow no" aria-hidden />
        <div className="glow yes" aria-hidden />
        <div className="mark no" aria-hidden>
          <X size={34} strokeWidth={3} />
          <span>CHƯA NHỚ</span>
        </div>
        <div className="mark yes" aria-hidden>
          <Check size={34} strokeWidth={3} />
          <span>ĐÃ NHỚ</span>
        </div>
      </div>

      <RatingBar
        card={cards[current.id]}
        practice={practice}
        relearning={relearning}
        onRate={study.commit}
      />
      <p className="gesture-hint">
        Vuốt thẻ sang <b className="g">phải = đã nhớ</b> · sang{" "}
        <b className="r">trái = chưa nhớ</b>
        <span className="kb-hint"> · Space để lật</span>
      </p>
    </>
  );
}
