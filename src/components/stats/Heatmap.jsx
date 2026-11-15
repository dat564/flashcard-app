import { Flame } from "lucide-react";
import { heatLevel } from "../../lib/stats";

export default function Heatmap({ streak, heat }) {
  return (
    <>
      <div className="streak-head">
        <div className="streak-big">
          <Flame size={22} />
          <strong>{streak.cur}</strong> ngày liên tiếp
        </div>
        <span className="muted">Dài nhất: {streak.best} ngày</span>
      </div>
      <div className="heat-wrap">
        <div className="heat-days" aria-hidden>
          <span>T2</span>
          <span />
          <span>T4</span>
          <span />
          <span>T6</span>
          <span />
          <span>CN</span>
        </div>
        <div className="heat">
          {heat.map((c) => (
            <i
              key={c.key}
              className={`cell l${heatLevel(c.n)}`}
              title={c.n < 0 ? "" : `${c.key}: ${c.n} lượt`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
