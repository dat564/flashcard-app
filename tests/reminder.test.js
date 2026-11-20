import { describe, it, expect } from "vitest";
import {
  parseTime,
  normalizeReminder,
  normalizeGoal,
  countDue,
  reminderDecision,
  reminderText,
  weekKeys,
  weekProgress,
  foldLine,
  buildIcs,
  reminderSupport,
  DEFAULT_REMINDER,
} from "../src/lib/reminder";
import { CASES, at } from "./reminderCases";

describe("parseTime / normalizeReminder / normalizeGoal", () => {
  it("đọc giờ hợp lệ, từ chối giờ sai", () => {
    expect(parseTime("20:05")).toBe(1205);
    expect(parseTime("0:00")).toBe(0);
    expect(parseTime("23:59")).toBe(1439);
    for (const bad of ["24:00", "12:60", "abc", "", null, undefined, "12", "12:5"]) expect(parseTime(bad)).toBeNull();
  });
  it("chuẩn hóa cài đặt nhắc (mặc định an toàn)", () => {
    expect(normalizeReminder(undefined)).toEqual({ enabled: false, time: "20:00", badge: true });
    expect(normalizeReminder({ enabled: true, time: "7:05", badge: false })).toEqual({ enabled: true, time: "07:05", badge: false });
    expect(normalizeReminder({ enabled: 1, time: "zz" })).toMatchObject({ enabled: false, time: DEFAULT_REMINDER.time });
  });
  it("mục tiêu tuần giới hạn 1–7, mặc định 5", () => {
    expect([0, 1, 4.4, 7, 9, "3"].map(normalizeGoal)).toEqual([1, 1, 4, 7, 7, 3]);
    expect([undefined, null, "x", NaN].map(normalizeGoal)).toEqual([5, 5, 5, 5]);
  });
  it("đếm thẻ đến hạn", () => {
    const now = 1000;
    expect(countDue({ a: { dueAt: 999 }, b: { dueAt: 1000 }, c: { dueAt: 1001 }, d: {}, e: null }, now)).toBe(2);
    expect(countDue(undefined, now)).toBe(0);
  });
});

describe("reminderDecision (ca dùng chung với service worker)", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const d = reminderDecision({ now: at(c.now), reminder: c.reminder, stats: c.stats || {}, lastNotified: c.last || "" });
      expect(d.notify).toBe(c.expect);
    });
  }
  it("trả về lý do và ngày để ghi 'đã nhắc'", () => {
    const d = reminderDecision({ now: at([2026, 11, 19, 21, 0]), reminder: { enabled: true, time: "20:00" }, stats: {}, lastNotified: "" });
    expect(d).toEqual({ notify: true, reason: "due", day: "2026-11-19" });
  });
});

describe("reminderText", () => {
  it("có thẻ đến hạn: nêu số thẻ", () => expect(reminderText(12).body).toContain("12 thẻ"));
  it("không có thẻ: gợi ý học từ mới", () => expect(reminderText(0).body).toContain("từ mới"));
});

describe("mục tiêu tuần", () => {
  it("tuần bắt đầu từ thứ Hai (kể cả khi hôm nay là Chủ nhật)", () => {
    // 19/11/2026 là thứ Năm
    expect(weekKeys("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(weekKeys("2026-11-22")[0]).toBe("2026-11-16"); // Chủ nhật vẫn thuộc tuần bắt đầu 16/11
    expect(weekKeys("2026-11-16")[0]).toBe("2026-11-16"); // thứ Hai
  });
  it("tuần chuyển tháng / chuyển năm", () => {
    expect(weekKeys("2026-12-31")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });
  it("đếm ngày đã học, tính còn thiếu và khả năng đạt", () => {
    const stats = { "2026-11-16": { reviewed: 5 }, "2026-11-17": { practiced: 2 }, "2026-11-18": { reviewed: 0 } };
    const w = weekProgress(stats, "2026-11-19", 5);
    expect(w).toMatchObject({ goal: 5, done: 2, reached: false, remaining: 3, canReach: true, weekStart: "2026-11-16" });
    expect(w.days.map((d) => d.active)).toEqual([true, true, false, false, false, false, false]);
    expect(w.days.find((d) => d.today).key).toBe("2026-11-19");
    expect(w.days.filter((d) => d.future)).toHaveLength(3);
  });
  it("hôm nay chưa học vẫn còn cơ hội; hết cơ hội thì canReach = false", () => {
    // Chủ nhật, mới học 3 ngày, mục tiêu 5, hôm nay chưa học: tối đa 4 → không đạt
    const stats = { "2026-11-16": { reviewed: 1 }, "2026-11-17": { reviewed: 1 }, "2026-11-18": { reviewed: 1 } };
    const w = weekProgress(stats, "2026-11-22", 5);
    expect(w.done).toBe(3);
    expect(w.canReach).toBe(false);
    // học hôm nay + mục tiêu 4 → đạt
    const w2 = weekProgress({ ...stats, "2026-11-22": { reviewed: 2 } }, "2026-11-22", 4);
    expect(w2).toMatchObject({ done: 4, reached: true, remaining: 0 });
  });
  it("mục tiêu mặc định 5 khi chưa đặt", () => {
    expect(weekProgress({}, "2026-11-19", undefined).goal).toBe(5);
  });
});

describe("lời nhắc qua lịch (.ics)", () => {
  const enc = new TextEncoder();
  const ics = buildIcs({ time: "20:30", url: "https://x.test/app/", now: new Date(2026, 10, 19, 9, 0), host: "x.test" });

  it("đúng cấu trúc iCalendar, xuống dòng CRLF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // không có LF trần
    for (const k of ["VERSION:2.0", "BEGIN:VEVENT", "END:VEVENT", "RRULE:FREQ=DAILY", "BEGIN:VALARM", "TRIGGER:PT0S", "ACTION:DISPLAY", "UID:daily-study@x.test"])
      expect(ics).toContain(k);
  });
  it("giờ bắt đầu 'nổi' đúng giờ đã chọn, ngày bắt đầu là hôm nay", () => {
    expect(ics).toContain("DTSTART:20261119T203000");
    expect(ics).not.toMatch(/DTSTART:[^\r]*Z/);
  });
  it("không dòng nào quá 75 byte (kể cả khi có tiếng Việt)", () => {
    for (const line of ics.split("\r\n")) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
  });
  it("gập dòng không làm mất nội dung (ghép lại đúng)", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Ôn từ vựng TOEIC");
    expect(unfolded).toContain("DESCRIPTION:Mở TOEIC Recall để ôn các thẻ đến hạn hôm nay.\\nhttps://x.test/app/");
    expect(unfolded).toContain("URL:https://x.test/app/");
  });
  it("giờ sai thì dùng giờ mặc định", () => {
    expect(buildIcs({ time: "zz", now: new Date(2026, 0, 1, 9, 0) })).toContain("DTSTART:20260101T200000");
  });
  it("foldLine không cắt giữa ký tự nhiều byte", () => {
    const long = "SUMMARY:" + "ế".repeat(60);
    const folded = foldLine(long);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    for (const l of folded.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(foldLine("ngắn")).toBe("ngắn");
  });
});

describe("reminderSupport", () => {
  const env = (over = {}) => ({
    navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", platform: "Linux x86_64", maxTouchPoints: 0, serviceWorker: {}, ...over.navigator },
    matchMedia: () => ({ matches: !!over.standalone }),
    Notification: "Notification" in over ? over.Notification : { permission: "default" },
    ServiceWorkerRegistration: over.SWR ?? { prototype: {} },
  });
  it("Chrome Android có Periodic Sync và huy hiệu", () => {
    const s = reminderSupport(env({ navigator: { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", setAppBadge() {} }, SWR: { prototype: { periodicSync: {} } } }));
    expect(s).toMatchObject({ notification: true, periodicSync: true, badge: true, ios: false, needsInstall: false, permission: "default" });
  });
  it("iPhone chưa thêm vào Màn hình chính → cần cài trước", () => {
    const s = reminderSupport(env({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }, Notification: undefined, standalone: false }));
    expect(s).toMatchObject({ ios: true, standalone: false, needsInstall: true, notification: false, periodicSync: false });
  });
  it("iPhone đã cài lên Màn hình chính → không cần cài", () => {
    const s = reminderSupport(env({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", standalone: true } }));
    expect(s.needsInstall).toBe(false);
  });
  it("iPad hiện UA là Mac nhưng có cảm ứng vẫn nhận ra là iOS", () => {
    const s = reminderSupport(env({ navigator: { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 } }));
    expect(s.ios).toBe(true);
  });
  it("không có Notification API", () => {
    const e = env();
    delete e.Notification;
    expect(reminderSupport(e)).toMatchObject({ notification: false, permission: "denied" });
  });
});
