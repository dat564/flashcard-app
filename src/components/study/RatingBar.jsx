import { Check, Sparkles, X } from "lucide-react";
import { KNOWN_DAYS, RATINGS } from "../../lib/constants";
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
      {/* Chỉ với từ mới: bỏ qua nhanh từ đã biết sẵn */}
      {!card && !practice && (
        <button
          className="known-btn"
          title="Phím tắt: 3"
          onClick={() => onRate("known")}
        >
          <Sparkles size={14} /> Đã biết từ này · ôn lại sau {fmtInterval(KNOWN_DAYS)}
        </button>
      )}
    </div>
  );
}
