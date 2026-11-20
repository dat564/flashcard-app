import { useEffect, useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { getReviews } from "../../lib/storage";
import { getRetention } from "../../lib/srs";
import { MIN_REVIEWS, retentionStats, retentionVerdict } from "../../lib/retention";

const pct = (x) => `${Math.round(x * 100)}%`;
const shortDate = (key) => key.slice(8, 10) + "/" + key.slice(5, 7);

function Tile({ label, t }) {
  return (
    <div className="stat">
      <strong>{t.n ? pct(t.rate) : "—"}</strong>
      <span>
        {label}
        {t.n ? ` (${t.n} lượt)` : ""}
      </span>
    </div>
  );
}

// Tỉ lệ nhớ thực tế (từ nhật ký ôn) so với mức nhớ mục tiêu → kiểm chứng lịch ôn có khớp với bạn không
export default function RetentionPanel({ progress, setProgress }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    let alive = true;
    getReviews().then((l) => alive && setLog(l));
    return () => {
      alive = false;
    };
  }, [progress.stats]);

  const stats = useMemo(() => (log ? retentionStats(log) : null), [log]);
  const target = progress.settings?.retention ?? getRetention();
  const tp = Math.round(target * 100);

  // Đánh giá theo 30 ngày gần nhất; chưa đủ lượt thì dùng toàn bộ nhật ký
  const basis = stats && (stats.d30.n >= MIN_REVIEWS ? { t: stats.d30, label: "30 ngày gần nhất" } : { t: stats.all, label: "toàn bộ nhật ký" });
  const v = basis ? retentionVerdict({ ok: basis.t.ok, n: basis.t.n, target }) : null;

  const applyTarget = (value) =>
    setProgress((p) => ({ ...p, settings: { ...p.settings, retention: value / 100 } }));

  let msg = null;
  if (v) {
    const range = v.lo != null ? `${Math.round(v.lo * 100)}%–${Math.round(v.hi * 100)}%` : "";
    if (v.level === "insufficient")
      msg = `Chưa đủ dữ liệu: cần thêm ${v.need} lượt ôn lại nữa để đánh giá (tối thiểu ${MIN_REVIEWS} lượt).`;
    else if (v.level === "ok")
      msg = `Khớp với mục tiêu ${tp}% (${basis.label}; khoảng tin cậy 95%: ${range}). Lịch ôn đang phù hợp với bạn.`;
    else if (v.level === "below")
      msg = `Thấp hơn mục tiêu ${tp}% (${basis.label}; khoảng tin cậy 95%: ${range}): bạn đang quên nhiều hơn lịch dự kiến. Nên tăng mức nhớ mục tiêu lên ${v.suggest}% (ôn nhiều hơn một chút) và chấm "Chưa nhớ" khi phân vân.`;
    else
      msg = `Cao hơn mục tiêu ${tp}% (${basis.label}; khoảng tin cậy 95%: ${range}): bạn nhớ tốt hơn dự kiến. Có thể giảm mức nhớ mục tiêu để ôn ít hơn, hoặc giữ nguyên nếu muốn chắc chắn.`;
  }

  return (
    <div className="panel wide">
      <h3>
        <Gauge size={16} /> Tỉ lệ nhớ thực tế
      </h3>
      <p className="muted">
        Trong các lượt ôn lại thẻ đã học, bạn nhớ được bao nhiêu phần trăm. So với mức nhớ mục tiêu để
        kiểm tra lịch ôn có đang khớp với trí nhớ của bạn.
      </p>

      {!stats ? (
        <p className="muted">Đang đọc nhật ký ôn…</p>
      ) : (
        <>
          <div className="stat-grid">
            <Tile label="7 ngày" t={stats.d7} />
            <Tile label="30 ngày" t={stats.d30} />
            <Tile label="Tất cả" t={stats.all} />
          </div>

          <div className="retention-bars" role="img" aria-label="Tỉ lệ nhớ thực tế theo tuần">
            <i className="target-line" style={{ "--tp": target }} title={`Mục tiêu ${tp}%`} />
            {stats.weeks.map((w) => (
              <div
                key={w.start}
                className={`rbar${w.n < 10 ? " faint" : ""}`}
                title={w.n ? `Tuần ${shortDate(w.start)}: ${pct(w.rate)} (${w.n} lượt)` : `Tuần ${shortDate(w.start)}: chưa có lượt ôn lại`}
              >
                <span className="rbar-fill" style={{ height: w.n ? `${Math.round(w.rate * 100)}%` : "0%" }} />
                <small>{shortDate(w.start)}</small>
              </div>
            ))}
          </div>

          {msg && <p className={`note${v.level === "below" ? " warn-note" : ""}`}>{msg}</p>}
          {v?.level === "below" && (
            <div className="data-actions">
              <button className="secondary" onClick={() => applyTarget(v.suggest)}>
                Đặt mức nhớ mục tiêu {v.suggest}%
              </button>
            </div>
          )}

          <p className="muted">
            Tính từ {stats.logged} lượt đã ghi
            {stats.firstAt ? ` (từ ${new Date(stats.firstAt).toLocaleDateString("vi-VN")})` : ""}. Không tính lần học
            đầu của từ mới, luyện tập và lượt hỏi lại trong phiên. Cột mờ là tuần có dưới 10 lượt, chưa đáng tin;
            đường nét đứt là mức mục tiêu.
          </p>
        </>
      )}
    </div>
  );
}
