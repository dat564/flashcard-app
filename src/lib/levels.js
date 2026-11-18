import { mixKey } from "./utils";

// Mức độ của từ theo độ phổ biến (Zipf, từ thư viện wordfreq — tiếng Anh nói chung, KHÔNG riêng TOEIC).
//   Cơ bản   : z ≥ 5,0   (khoảng 900 từ: their, during, family, policy...)
//   Trung cấp: 4,4 ≤ z < 5,0
//   Nâng cao : z < 4,4   (từ hiếm hơn: agenda, negotiate, spider...)
// Lưu ý: phổ biến ≠ dễ. Từ cụ thể như "piano" hay "spider" ít gặp nhưng không khó hiểu.
export const LEVEL_CUTS = [5.0, 4.4];
export const LEVEL_LABEL = { 1: "Cơ bản", 2: "Trung cấp", 3: "Nâng cao" };
export const LEVELS = [1, 2, 3];
const Z_DEFAULT = 4.4; // từ chưa có dữ liệu: coi như mức Trung cấp

export const zOf = (w) => (typeof w?.z === "number" && Number.isFinite(w.z) ? w.z : Z_DEFAULT);
export const levelOf = (w) => {
  const z = zOf(w);
  return z >= LEVEL_CUTS[0] ? 1 : z >= LEVEL_CUTS[1] ? 2 : 3;
};

// Thứ tự học từ mới của kho chung
export const NEW_ORDERS = {
  common: "Phổ biến trước (khuyên dùng)",
  random: "Ngẫu nhiên",
};
export const DEFAULT_NEW_ORDER = "common";

// "common": đi từ nhóm phổ biến nhất xuống, mỗi nhóm rộng 0,5 Zipf. TRONG nhóm các từ được trộn ổn định
// (cùng id luôn cùng thứ tự) để từ cùng gốc như abandon / abandoned không đứng liền nhau.
// "random": trộn ổn định toàn bộ. Không sửa mảng đầu vào.
export function orderNewWords(words, mode = DEFAULT_NEW_ORDER) {
  const band = (w) => Math.floor(zOf(w) * 2);
  const out = [...words];
  if (mode === "random") return out.sort((a, b) => mixKey(a.id) - mixKey(b.id));
  return out.sort((a, b) => band(b) - band(a) || mixKey(a.id) - mixKey(b.id));
}
