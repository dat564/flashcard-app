// Ca kiểm thử dùng chung cho reminderDecision (app) và logic tương ứng trong public/sw.js.
// now = [năm, tháng, ngày, giờ, phút] theo giờ máy.
const R = (time = "20:00", extra = {}) => ({ enabled: true, time, ...extra });
const TODAY = "2026-11-19";
const YESTERDAY = "2026-11-18";

export const CASES = [
  { name: "trước giờ nhắc 1 phút", now: [2026, 11, 19, 19, 59], reminder: R(), expect: false },
  { name: "đúng giờ nhắc", now: [2026, 11, 19, 20, 0], reminder: R(), expect: true },
  { name: "sau giờ nhắc 2,5 giờ", now: [2026, 11, 19, 22, 30], reminder: R(), expect: true },
  { name: "giờ 21:30: trước 1 phút", now: [2026, 11, 19, 21, 29], reminder: R("21:30"), expect: false },
  { name: "giờ 21:30: đúng giờ", now: [2026, 11, 19, 21, 30], reminder: R("21:30"), expect: true },
  { name: "giờ 21:30: 23:59 vẫn trong khung (không qua nửa đêm)", now: [2026, 11, 19, 23, 59], reminder: R("21:30"), expect: true },
  { name: "giờ 08:00: 11:59 còn trong khung 4 giờ", now: [2026, 11, 19, 11, 59], reminder: R("08:00"), expect: true },
  { name: "giờ 08:00: 12:00 quá khung 4 giờ", now: [2026, 11, 19, 12, 0], reminder: R("08:00"), expect: false },
  { name: "sáng hôm sau chưa tới giờ", now: [2026, 11, 20, 0, 30], reminder: R(), expect: false },
  { name: "tắt nhắc", now: [2026, 11, 19, 21, 0], reminder: R("20:00", { enabled: false }), expect: false },
  { name: "không có cài đặt", now: [2026, 11, 19, 21, 0], reminder: undefined, expect: false },
  { name: "enabled phải đúng là true (không nhận chuỗi)", now: [2026, 11, 19, 21, 0], reminder: { enabled: "true", time: "20:00" }, expect: false },
  { name: "đã nhắc hôm nay", now: [2026, 11, 19, 21, 0], reminder: R(), last: TODAY, expect: false },
  { name: "chỉ mới nhắc hôm qua", now: [2026, 11, 19, 21, 0], reminder: R(), last: YESTERDAY, expect: true },
  { name: "hôm nay đã ôn thẻ", now: [2026, 11, 19, 21, 0], reminder: R(), stats: { [TODAY]: { reviewed: 3 } }, expect: false },
  { name: "hôm nay đã luyện tập", now: [2026, 11, 19, 21, 0], reminder: R(), stats: { [TODAY]: { practiced: 1 } }, expect: false },
  { name: "thống kê hôm nay rỗng (0 lượt)", now: [2026, 11, 19, 21, 0], reminder: R(), stats: { [TODAY]: { reviewed: 0, practiced: 0 } }, expect: true },
  { name: "chỉ học hôm qua", now: [2026, 11, 19, 21, 0], reminder: R(), stats: { [YESTERDAY]: { reviewed: 40 } }, expect: true },
  { name: "giờ sai định dạng → mặc định 20:00 (19:00 chưa tới)", now: [2026, 11, 19, 19, 0], reminder: R("abc"), expect: false },
  { name: "giờ sai định dạng → mặc định 20:00 (20:05 nhắc)", now: [2026, 11, 19, 20, 5], reminder: R("abc"), expect: true },
  { name: "giờ 25:99 không hợp lệ → mặc định", now: [2026, 11, 19, 20, 5], reminder: R("25:99"), expect: true },
];

export const at = ([y, m, d, h, mi]) => new Date(y, m - 1, d, h, mi, 0);
