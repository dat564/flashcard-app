// Phần chạm vào trình duyệt của tính năng nhắc học (thông báo, huy hiệu, đồng bộ nền).
import { reminderText } from "./reminder";

export const PERIODIC_TAG = "study-reminder";
const CACHE = "toeic-reminder";
const LS_KEY = "toeic-recall-last-notified";
// Khóa Cache API dùng chung với service worker (cùng một URL giả)
const cacheKey = () => `${location.origin}/__reminder__/last-notified`;

// Ngày đã nhắc gần nhất. Lưu ở Cache API để cả service worker lẫn trang cùng đọc/ghi được,
// tránh nhắc đúp; dự phòng localStorage khi không có Cache API.
export async function getLastNotified() {
  try {
    if (typeof caches !== "undefined") {
      const r = await (await caches.open(CACHE)).match(cacheKey());
      if (r) return (await r.text()).trim();
    }
  } catch {
    /* thử localStorage */
  }
  try {
    return localStorage.getItem(LS_KEY) || "";
  } catch {
    return "";
  }
}

export async function setLastNotified(day) {
  try {
    localStorage.setItem(LS_KEY, day);
  } catch {
    /* bỏ qua */
  }
  try {
    if (typeof caches !== "undefined") {
      await (await caches.open(CACHE)).put(cacheKey(), new Response(day));
    }
  } catch {
    /* bỏ qua */
  }
}

const assetUrl = (p) => new URL(p, document.baseURI).href;

// Hiện thông báo qua service worker (bắt buộc trên Android; dùng được cả khi trang ở nền)
export async function showReminder(dueCount) {
  const { title, body } = reminderText(dueCount);
  const opts = {
    body,
    icon: assetUrl("icon-192.png"),
    badge: assetUrl("icon-192.png"),
    tag: "study-reminder", // cùng tag: thông báo mới thay thế cũ, không bao giờ hiện đúp
    lang: "vi",
    data: { url: assetUrl("./") },
  };
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (reg?.showNotification) return reg.showNotification(title, opts);
  new Notification(title, opts);
}

export async function setBadge(n) {
  try {
    if (!("setAppBadge" in navigator)) return;
    if (n > 0) await navigator.setAppBadge(n);
    else await navigator.clearAppBadge?.();
  } catch {
    /* bỏ qua */
  }
}

// Đăng ký (hoặc hủy) đồng bộ nền định kỳ để service worker nhắc cả khi app đã đóng.
// Chỉ một số trình duyệt hỗ trợ (Chrome/Edge, app đã cài); trả về true nếu đã đăng ký.
export async function syncPeriodic(enabled) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (!reg?.periodicSync) return false;
    if (enabled) {
      await reg.periodicSync.register(PERIODIC_TAG, { minInterval: 3 * 3600 * 1000 });
      return true;
    }
    await reg.periodicSync.unregister(PERIODIC_TAG);
  } catch {
    /* không được cấp quyền / không hỗ trợ */
  }
  return false;
}

export function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
