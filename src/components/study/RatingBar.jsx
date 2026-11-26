import { Check, Sparkles, X } from "lucide-react";
import { RATINGS } from "../../lib/constants";
import { fmtInterval, nextSchedule } from "../../lib/srs";

const ICONS = { again: X, good: Check };

export default function RatingBar({ card, practice, relearning, onRate }) {
  return (
    <div className="actions">
      <div className="rating">
        {RATINGS.map((r) => {
          const Icon = ICONS[r.key];
          return (
            <button
              key={r.key}
              className={`rate ${r.key}`}
              onClick={() => onRate(r.key)}
            >
              <b>
                <Icon size={18} /> {r.label}
              </b>
              <small>
                {r.key === "again" ? "← " : ""}
                {practice
                  ? "Không đổi lịch ôn"
                  : relearning
                  ? "Xong, ôn ngày mai"
                  : r.key === "again"
                  ? "Hỏi lại 1 lần nữa"
                  : `${fmtInterval(nextSchedule(card, r.key).interval)} nữa`}
                {r.key === "good" ? " →" : ""}
              </small>
            </button>
          );
        })}
      </div>
      {/* Từ mới: "Đã biết từ này"; thẻ đang ôn: "Quá dễ" (đẩy xa hơn bình thường) */}
      {!practice && !relearning && (
        <button
          className="known-btn"
          title="Phím tắt: 3"
          onClick={() => onRate("known")}
        >
          <Sparkles size={14} /> {card ? "Quá dễ" : "Đã biết từ này"} · ôn lại sau{" "}
          {fmtInterval(nextSchedule(card, "known").interval)}
        </button>
      )}
    </div>
  );
}
