import { SWIPE_AT } from "./constants";

export const todayKey = () => new Date().toLocaleDateString("en-CA");
export const dayKeyOf = (d) => d.toLocaleDateString("en-CA");
export const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};
export const metaOf = (w) => [w.pos, w.ipa].filter(Boolean).join("  ·  ");
export const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
// Màn hình nhỏ thì ngưỡng thấp hơn (22% chiều rộng) để vuốt nhẹ tay cũng ăn
export const swipeAt = () => Math.min(SWIPE_AT, window.innerWidth * 0.22);

export function setMeta(name, content) {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.name = name;
    document.head.appendChild(m);
  }
  m.content = content;
}

// Khóa trộn ổn định theo id: cùng id luôn ra cùng thứ tự, nhưng các từ liền kề
// trong bảng chữ cái (abandon / abandoned / ability...) không còn đứng sát nhau.
export const mixKey = (id) => {
  let x = ((Number(id) || 0) + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
};
