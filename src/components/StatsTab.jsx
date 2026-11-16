import { useMemo } from "react";
import {
  BookOpen,
  CalendarDays,
  Brain,
  Check,
  Clock3,
  Target,
} from "lucide-react";
import { words } from "../lib/words";
import { isHard, retrievability, getRetention } from "../lib/srs";
import { buildForecast, buildHeatmap } from "../lib/stats";
import Heatmap from "./stats/Heatmap";
import Forecast from "./stats/Forecast";
import VoiceSettings from "./stats/VoiceSettings";
import ThemePanel from "./stats/ThemePanel";
import DataBackup from "./stats/DataBackup";

export default function StatsTab({
  progress,
  setProgress,
  data,
  speech,
  theme,
  setTheme,
  pwa,
  streak,
  newLimit,
  setNewLimit,
  today,
  setToast,
  endSession,
}) {
  const { cards, isMain, dueCount, learnedCount, todayStats } = data;
  const heat = useMemo(() => buildHeatmap(progress.stats), [progress.stats]);
  const forecast = useMemo(() => buildForecast(cards), [cards]);
  const hardTotal = useMemo(
    () => Object.values(cards).filter(isHard).length,
    [cards]
  );
  // Độ nhớ ước tính: trung bình xác suất nhớ (FSRS) của các từ đã học, tính tại thời điểm này
  const memoryPct = useMemo(() => {
    const learned = Object.values(cards).filter((c) => c && c.dueAt);
    if (!learned.length) return null;
    const now = Date.now();
    const sum = learned.reduce((n, c) => n + retrievability(c, now), 0);
    return Math.round((sum / learned.length) * 100);
  }, [cards]);
  const retentionPct = Math.round(
    (progress.settings?.retention ?? getRetention()) * 100
  );
  const progressPct = Math.round((learnedCount / words.length) * 100);
  const accuracy = todayStats.reviewed
    ? Math.round((todayStats.correct / todayStats.reviewed) * 100)
    : 0;

  return (
    <section className="page">
      <h1>Thống kê & cài đặt</h1>
      <div className="stat-grid">
        <div className="stat">
          <BookOpen size={18} />
          <strong>{words.length}</strong>
          <span>Tổng số từ (kho chung)</span>
        </div>
        <div className="stat">
          <Check size={18} />
          <strong>{learnedCount}</strong>
          <span>Đã học ({progressPct}%)</span>
        </div>
        <div className="stat">
          <Clock3 size={18} />
          <strong>{dueCount}</strong>
          <span>Đến hạn ôn ({isMain ? "kho chung" : "danh sách này"})</span>
        </div>
        <div className="stat">
          <CalendarDays size={18} />
          <strong>{todayStats.reviewed || 0}</strong>
          <span>Lượt ôn hôm nay</span>
        </div>
        <div className="stat">
          <Brain size={18} />
          <strong>{memoryPct == null ? "—" : `${memoryPct}%`}</strong>
          <span>Độ nhớ ước tính (từ đã học)</span>
        </div>
        <div className="stat">
          <Target size={18} />
          <strong>{hardTotal}</strong>
          <span>Từ khó</span>
        </div>
      </div>

      <div className="panels">
        <div className="panel">
          <h3>Tiến độ tổng</h3>
          <div className="track big">
            <i style={{ width: `${progressPct}%` }} />
          </div>
          <p className="muted">
            {learnedCount}/{words.length} từ đã học · độ nhớ tốt hôm nay{" "}
            {accuracy}%
          </p>
          <h3>Từ mới mỗi ngày (kho chung)</h3>
          <div className="goal">
            <span>Tối đa</span>
            <b>{newLimit} từ</b>
          </div>
          <input
            className="range"
            type="range"
            min="5"
            max="100"
            step="5"
            value={newLimit}
            onChange={(e) => {
              setNewLimit(+e.target.value);
              setProgress((p) => ({
                ...p,
                settings: { ...p.settings, newPerDay: +e.target.value },
              }));
            }}
          />
          <h3>Mức nhớ mục tiêu (FSRS)</h3>
          <div className="goal">
            <span>Nhớ được khi đến hạn</span>
            <b>{retentionPct}%</b>
          </div>
          <input
            className="range"
            type="range"
            min="80"
            max="97"
            step="1"
            value={retentionPct}
            onChange={(e) =>
              setProgress((p) => ({
                ...p,
                settings: { ...p.settings, retention: +e.target.value / 100 },
              }))
            }
          />
          <p className="muted">
            Cao hơn: nhớ chắc hơn nhưng phải ôn nhiều hơn. Mức 90% là cân bằng
            (khuyến nghị); sắp thi thì có thể tăng lên 93–95%.
          </p>
        </div>

        <VoiceSettings speech={speech} />
        <ThemePanel theme={theme} setTheme={setTheme} pwa={pwa} />

        <div className="panel wide">
          <Heatmap streak={streak} heat={heat} />
          <Forecast forecast={forecast} />
        </div>

        <DataBackup
          progress={progress}
          setProgress={setProgress}
          today={today}
          setToast={setToast}
          endSession={endSession}
        />
      </div>
    </section>
  );
}
