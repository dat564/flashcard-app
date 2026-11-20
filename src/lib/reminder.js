// Nhắc học và mục tiêu tuần — phần logic thuần (không đụng DOM) để test được.
// LƯU Ý: `reminderDecision` được lặp lại (cố ý) trong public/sw.js vì service worker là script thường,
// không import được module của app. tests/reminder.test.js chạy CÙNG các ca kiểm thử qua cả hai nơi.
import { activityOf } from "./stats";

export const DEFAULT_REMINDER = { enabled: false, time: "20:00", badge: true };
export const DEFAULT_WEEKLY_GOAL = 5;
export const REMIND_WINDOW_MIN = 4 * 60; // chỉ nhắc trong 4 giờ kể từ giờ đã chọn (và không qua nửa đêm)

export const dayKeyOf = (d) => new Date(d).toLocaleDateString("en-CA");

// "20:05" → 1205 (phút từ 0h); sai định dạng → null
export function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

export function normalizeReminder(r) {
  const t = parseTime(r?.time);
  return {
    enabled: r?.enabled === true,
    time: t == null ? DEFAULT_REMINDER.time : `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    badge: r?.badge !== false,
  };
}

export const normalizeGoal = (g) => {
  if (g == null || g === "") return DEFAULT_WEEKLY_GOAL; // Number(null) = 0 sẽ bị hiểu nhầm là 1 ngày
  const n = Math.round(Number(g));
  return Number.isFinite(n) ? Math.min(7, Math.max(1, n)) : DEFAULT_WEEKLY_GOAL;
};

// Số thẻ đã đến hạn (kể cả thẻ của danh sách riêng)
export const countDue = (cards = {}, now = Date.now()) => {
  let n = 0;
  for (const c of Object.values(cards)) if (c && c.dueAt && c.dueAt <= now) n++;
  return n;
};

export const studiedOn = (stats, day) => activityOf(stats?.[day]) > 0;

// Có nên gửi thông báo nhắc lúc `now` không?
//   reminder: cài đặt; stats: thống kê theo ngày; lastNotified: ngày ("YYYY-MM-DD") đã nhắc gần nhất
export function reminderDecision({ now, reminder, stats, lastNotified }) {
  const r = normalizeReminder(reminder);
  if (!r.enabled) return { notify: false, reason: "disabled" };
  const d = new Date(now);
  const day = dayKeyOf(d);
  if (lastNotified === day) return { notify: false, reason: "already-notified", day };
  if (studiedOn(stats, day)) return { notify: false, reason: "studied", day };
  const mins = d.getHours() * 60 + d.getMinutes();
  const start = parseTime(r.time);
  if (mins < start) return { notify: false, reason: "too-early", day };
  if (mins >= Math.min(start + REMIND_WINDOW_MIN, 24 * 60)) return { notify: false, reason: "too-late", day };
  return { notify: true, reason: "due", day };
}

export function reminderText(dueCount) {
  return {
    title: "Đến giờ ôn từ vựng TOEIC",
    body:
      dueCount > 0
        ? `Hôm nay có ${dueCount} thẻ đến hạn ôn. Học một phiên ngắn nhé!`
        : "Hôm nay bạn chưa học. Học vài từ mới để giữ nhịp nhé!",
  };
}

/* ---------- Mục tiêu tuần (tuần bắt đầu từ thứ Hai) ---------- */
const parseDay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function weekKeys(today) {
  const t = parseDay(today);
  const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) =>
    dayKeyOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i))
  );
}

export function weekProgress(stats, today, goalDays) {
  const goal = normalizeGoal(goalDays);
  const days = weekKeys(today).map((key) => ({
    key,
    active: studiedOn(stats, key),
    today: key === today,
    future: key > today,
  }));
  const done = days.filter((d) => d.active).length;
  const left = days.filter((d) => d.future || (d.today && !d.active)).length;
  return {
    goal,
    done,
    reached: done >= goal,
    remaining: Math.max(0, goal - done),
    canReach: done + left >= goal,
    days,
    weekStart: days[0].key,
  };
}

/* ---------- Lời nhắc qua lịch (.ics) ---------- */
const icsEscape = (s) =>
  String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Gập dòng theo chuẩn iCalendar: tối đa 75 byte/dòng, không cắt giữa ký tự UTF-8
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // các dòng nối tiếp có thêm 1 dấu cách đầu dòng
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const icsStamp = (d) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T` +
  `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;

// Sự kiện lặp mỗi ngày, giờ "nổi" (theo múi giờ của lịch người dùng), có chuông báo đúng giờ.
export function buildIcs({ time = DEFAULT_REMINDER.time, url = "", now = new Date(), host = "toeic-recall" } = {}) {
  const t = parseTime(time) ?? parseTime(DEFAULT_REMINDER.time);
  const hh = String(Math.floor(t / 60)).padStart(2, "0");
  const mm = String(t % 60).padStart(2, "0");
  const d = new Date(now);
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const desc = "Mở TOEIC Recall để ôn các thẻ đến hạn hôm nay." + (url ? `\n${url}` : "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TOEIC Recall//Nhac hoc//VI",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:daily-study@${host}`,
    `DTSTAMP:${icsStamp(d)}`,
    `DTSTART:${date}T${hh}${mm}00`,
    "DURATION:PT15M",
    "RRULE:FREQ=DAILY",
    `SUMMARY:${icsEscape("Ôn từ vựng TOEIC")}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    ...(url ? [`URL:${url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape("Ôn từ vựng TOEIC")}`,
    "TRIGGER:PT0S",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/* ---------- Khả năng của trình duyệt ---------- */
export function reminderSupport(env = globalThis) {
  const nav = env.navigator || {};
  const ua = nav.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  let standalone = false;
  try {
    standalone = !!(env.matchMedia && env.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true;
  } catch {
    /* bỏ qua */
  }
  const notification = !!env.Notification;
  const sw = "serviceWorker" in nav;
  const SWR = env.ServiceWorkerRegistration;
  return {
    notification,
    permission: notification ? env.Notification.permission : "denied",
    serviceWorker: sw,
    periodicSync: sw && !!SWR && "periodicSync" in SWR.prototype,
    badge: "setAppBadge" in nav,
    ios,
    standalone,
    needsInstall: ios && !standalone, // iPhone chỉ cho thông báo khi app đã thêm vào Màn hình chính
  };
}
