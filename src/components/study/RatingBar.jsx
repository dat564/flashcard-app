import { Check, X } from "lucide-react";
import { RATINGS } from "../../lib/constants";
import { fmtInterval, nextSchedule } from "../../lib/srs";

const ICONS = { again: X, good: Check };

export default function RatingBar({ card, practice, onRate }) {
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
                  : `${fmtInterval(nextSchedule(card, r.key).interval)} nữa`}
                {r.key === "good" ? " →" : ""}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
