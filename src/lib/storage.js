import { STORE } from "./constants";

export const freshProgress = () => ({
  cards: {},
  stats: {},
  lists: [],
  settings: { newPerDay: 20 },
  createdAt: Date.now(),
});

export function loadProgress() {
  try {
    return {
      ...freshProgress(),
      ...JSON.parse(localStorage.getItem(STORE) || "{}"),
    };
  } catch {
    return freshProgress();
  }
}

export function saveProgress(p) {
  localStorage.setItem(STORE, JSON.stringify(p));
}

// Gộp 2 bản tiến độ (khi nhập file): mỗi từ giữ bản ôn gần nhất;
// thống kê từng ngày lấy số lớn hơn; danh sách riêng gộp theo id.
export function mergeProgress(a, b) {
  const reset = Math.max(a.resetAt || 0, b.resetAt || 0);
  const resetDay = reset ? new Date(reset).toLocaleDateString("en-CA") : "";
  const cards = {};
  for (const src of [a.cards || {}, b.cards || {}]) {
    for (const [id, c] of Object.entries(src)) {
      if ((c.lastReviewed || 0) < reset) continue;
      if (!cards[id] || (c.lastReviewed || 0) > (cards[id].lastReviewed || 0))
        cards[id] = c;
    }
  }
  const stats = {};
  for (const src of [a.stats || {}, b.stats || {}]) {
    for (const [d, s] of Object.entries(src)) {
      if (resetDay && d < resetDay) continue;
      const m = stats[d] || {
        reviewed: 0,
        correct: 0,
        newLearned: 0,
        practiced: 0,
      };
      stats[d] = {
        reviewed: Math.max(m.reviewed, s.reviewed || 0),
        correct: Math.max(m.correct, s.correct || 0),
        newLearned: Math.max(m.newLearned, s.newLearned || 0),
        practiced: Math.max(m.practiced || 0, s.practiced || 0),
      };
    }
  }
  const lists = [...(a.lists || [])];
  for (const l of b.lists || [])
    if (!lists.some((x) => x.id === l.id)) lists.push(l);
  return {
    ...a,
    cards,
    stats,
    lists,
    settings: { ...(b.settings || {}), ...(a.settings || {}) },
    resetAt: reset || undefined,
  };
}

// Tải file sao lưu JSON về máy; trả về mốc thời gian xuất
export function downloadBackup(progress, dayKey) {
  const lastExportAt = Date.now();
  const data = { ...progress, lastExportAt, app: "toeic-recall", version: 2 };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `toeic-recall-${dayKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return lastExportAt;
}
