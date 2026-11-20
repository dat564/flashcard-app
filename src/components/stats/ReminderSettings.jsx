import { useState } from "react";
import { Bell } from "lucide-react";
import WeekStrip from "../WeekStrip";
import { buildIcs, normalizeGoal, normalizeReminder, reminderSupport } from "../../lib/reminder";
import { downloadText, showReminder, syncPeriodic } from "../../lib/reminderRuntime";

export default function ReminderSettings({ progress, setProgress, setToast, week, dueCount = 0 }) {
  const [sup, setSup] = useState(() => reminderSupport());
  const r = normalizeReminder(progress.settings?.reminder);
  const goal = normalizeGoal(progress.settings?.weeklyGoal);

  const patch = (key, value) =>
    setProgress((p) => ({ ...p, settings: { ...p.settings, [key]: value } }));
  const updateReminder = (change) =>
    setProgress((p) => ({
      ...p,
      settings: { ...p.settings, reminder: { ...normalizeReminder(p.settings?.reminder), ...change } },
    }));

  const toggle = async (on) => {
    if (!on) {
      updateReminder({ enabled: false });
      syncPeriodic(false);
      return;
    }
    if (!sup.notification) {
      setToast("Trình duyệt này chưa hỗ trợ thông báo. Hãy dùng lời nhắc qua lịch bên dưới.");
      return;
    }
    let perm = Notification.permission;
    if (perm === "default") perm = await Notification.requestPermission();
    setSup(reminderSupport());
    if (perm !== "granted") {
      setToast("Chưa được cấp quyền thông báo. Hãy cho phép thông báo cho trang này trong cài đặt trình duyệt.");
      return;
    }
    updateReminder({ enabled: true });
    const bg = await syncPeriodic(true);
    setToast(bg ? "Đã bật nhắc học (nhắc cả khi đóng app)." : "Đã bật nhắc học (khi app đang mở).");
  };

  const test = async () => {
    try {
      await showReminder(dueCount);
    } catch {
      setToast("Không gửi được thông báo thử.");
    }
  };

  const ics = () => {
    downloadText(
      "toeic-recall-nhac-hoc.ics",
      buildIcs({ time: r.time, url: new URL("./", document.baseURI).href, host: location.hostname || "toeic-recall" }),
      "text/calendar;charset=utf-8"
    );
    setToast("Đã tạo file lịch. Mở file để thêm lời nhắc hằng ngày vào lịch của bạn.");
  };

  let note;
  if (sup.needsInstall)
    note =
      "iPhone chỉ cho phép thông báo khi app đã được thêm vào Màn hình chính (Safari → Chia sẻ → Thêm vào Màn hình chính), rồi mở app từ biểu tượng đó. Trong lúc chưa cài, hãy dùng lời nhắc qua lịch.";
  else if (!sup.notification) note = "Trình duyệt này không hỗ trợ thông báo. Hãy dùng lời nhắc qua lịch.";
  else if (sup.permission === "denied")
    note = "Thông báo đang bị chặn cho trang này. Hãy mở cài đặt trình duyệt để cho phép, hoặc dùng lời nhắc qua lịch.";
  else if (sup.periodicSync)
    note =
      "Thông báo hiện khi app đang mở hoặc ở nền; trình duyệt này còn có thể nhắc cả khi đóng app (thời điểm do trình duyệt quyết định nên có thể lệch). Muốn nhắc đúng giờ tuyệt đối, hãy thêm lời nhắc qua lịch.";
  else
    note =
      "Thông báo chỉ hiện khi app đang mở hoặc ở nền (trình duyệt này không nhắc được khi đã đóng app). Muốn nhắc đúng giờ cả khi đóng app, hãy thêm lời nhắc qua lịch.";

  return (
    <div className="panel wide">
      <h3>
        <Bell size={16} /> Nhắc học &amp; mục tiêu tuần
      </h3>

      <WeekStrip week={week} />
      <div className="goal">
        <span>Mục tiêu: học</span>
        <b>{goal} ngày/tuần</b>
      </div>
      <input
        className="range"
        type="range"
        min="1"
        max="7"
        step="1"
        value={goal}
        aria-label="Mục tiêu số ngày học mỗi tuần"
        onChange={(e) => patch("weeklyGoal", normalizeGoal(e.target.value))}
      />

      <label className="check-row">
        <input
          type="checkbox"
          checked={r.enabled}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>Nhắc tôi học mỗi ngày (chỉ khi hôm nay chưa học)</span>
      </label>

      <div className="reminder-row">
        <label>
          Giờ nhắc{" "}
          <input
            type="time"
            value={r.time}
            onChange={(e) => e.target.value && updateReminder({ time: e.target.value })}
          />
        </label>
        {sup.badge && (
          <label className="check-row inline">
            <input
              type="checkbox"
              checked={r.badge}
              onChange={(e) => updateReminder({ badge: e.target.checked })}
            />
            <span>Hiện số thẻ đến hạn trên biểu tượng app</span>
          </label>
        )}
      </div>

      <p className="muted">{note}</p>

      <div className="data-actions">
        <button className="secondary" onClick={ics}>
          Thêm lời nhắc vào lịch (.ics)
        </button>
        <button
          className="secondary"
          onClick={test}
          disabled={!sup.notification || sup.permission !== "granted"}
        >
          Gửi thông báo thử
        </button>
      </div>
    </div>
  );
}
