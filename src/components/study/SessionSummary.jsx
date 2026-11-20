import { CalendarClock, Clock3, Flame, Plus, Sparkles } from "lucide-react";
import { dueOutlook, fmtDuration } from "../../lib/sessionSummary";
import WeekStrip from "../WeekStrip";

const MAX_FORGOT = 8;
const pct = (x) => `${Math.round(x * 100)}%`;

// Màn hình tổng kết hiện ngay sau khi hết phiên (hoặc kết thúc sớm), cho tới khi bấm "Xong"
export default function SessionSummary({ summary: s, data, speech, streak, week, onDone, onMore }) {
  const { cards, wordById, newWords } = data;
  const outlook = dueOutlook(cards);
  const forgot = s.forgot.map((id) => wordById.get(id)).filter(Boolean);
  const title = s.early ? "Phiên kết thúc sớm" : s.practice ? "Hoàn thành luyện tập" : "Hoàn thành phiên học 🎉";
  const canMore = !s.practice && newWords.length > 0 && onMore;

  return (
    <div className="summary" role="region" aria-label="Tổng kết phiên học">
      <h2>{title}</h2>
      {s.practice && <p className="muted">Luyện tập không đổi lịch ôn của các từ.</p>}

      <div className="summary-main">
        <div className="ring" style={{ "--pct": `${Math.round((s.rate ?? 0) * 100)}%` }} aria-hidden="true">
          <b>{s.rate == null ? "—" : pct(s.rate)}</b>
        </div>
        <div>
          <p className="big">
            Nhớ {s.good}/{s.total} thẻ
          </p>
          {s.reviewCount > 0 && (
            <p className="muted">
              Nhớ lại thẻ đã học: {s.reviewGood}/{s.reviewCount} ({pct(s.reviewRate)})
            </p>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <Sparkles size={18} />
          <strong>{s.newCount}</strong>
          <span>{s.newCount ? `Từ mới học (nhớ ngay ${s.newGood})` : "Từ mới học"}</span>
        </div>
        <div className="stat">
          <CalendarClock size={18} />
          <strong>{s.reviewCount}</strong>
          <span>Thẻ ôn lại</span>
        </div>
        <div className="stat">
          <Clock3 size={18} />
          <strong>{fmtDuration(s.seconds)}</strong>
          <span>Thời gian học thực</span>
        </div>
      </div>

      {forgot.length > 0 && (
        <div className="forgot">
          <h3>{s.practice ? "Từ bạn chưa nhớ" : "Từ cần chú ý (sẽ ôn lại ngày mai)"}</h3>
          <ul>
            {forgot.slice(0, MAX_FORGOT).map((w) => (
              <li key={w.id}>
                <button className="forgot-word" onClick={() => speech?.speak?.(w.word)} title="Nghe phát âm">
                  {w.word}
                </button>
                <span className="muted">{w.meaning}</span>
              </li>
            ))}
          </ul>
          {forgot.length > MAX_FORGOT && <p className="muted">và {forgot.length - MAX_FORGOT} từ khác</p>}
          {s.relearnTotal > 0 && (
            <p className="muted">
              Khi được hỏi lại ngay trong phiên, bạn nhớ được {s.relearnGood}/{s.relearnTotal} từ.
            </p>
          )}
        </div>
      )}

      <div className="outlook">
        {outlook.dueNow > 0 && <p>Còn {outlook.dueNow} thẻ đến hạn hôm nay.</p>}
        <p>
          {outlook.dueTomorrow > 0
            ? `Ngày mai có thêm ${outlook.dueTomorrow} thẻ đến hạn.`
            : "Ngày mai chưa có thẻ nào đến hạn."}
        </p>
        {streak?.cur > 0 && (
          <p>
            <Flame size={16} aria-hidden="true" /> Chuỗi {streak.cur} ngày liên tiếp
          </p>
        )}
      </div>

      {week && <WeekStrip week={week} />}

      <div className="summary-actions">
        <button className="primary" onClick={onDone}>
          Xong
        </button>
        {canMore && (
          <button className="secondary" onClick={onMore}>
            <Plus size={16} aria-hidden="true" /> Học thêm từ mới
          </button>
        )}
      </div>
    </div>
  );
}
