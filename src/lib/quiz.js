import { shuffle } from "./utils";
import { QUIZ_LEN } from "./constants";

/* ---------- Chia dạng từ (số nhiều / -ed / -ing) ---------- */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pluralOf = (w) =>
  /(s|x|z|ch|sh)$/.test(w)
    ? w + "es"
    : /[^aeiou]y$/.test(w)
    ? w.slice(0, -1) + "ies"
    : w + "s";
const pastOf = (w) =>
  /e$/.test(w)
    ? w + "d"
    : /[^aeiou]y$/.test(w)
    ? w.slice(0, -1) + "ied"
    : w + "ed";
const ingOf = (w) =>
  /ie$/.test(w)
    ? w.slice(0, -2) + "ying"
    : /[^e]e$/.test(w)
    ? w.slice(0, -1) + "ing"
    : w + "ing";
const FORMS = { base: (w) => w, s: pluralOf, ed: pastOf, ing: ingOf };

// từ tận cùng phụ-nguyên-phụ (plan, submit...) khi chia -ed/-ing phải nhân đôi phụ âm;
// không đoán được nên bỏ khỏi đáp án nhiễu
const safeFor = (kind, w) =>
  kind === "base" ||
  kind === "s" ||
  (!w.includes(" ") && !/[^aeiou][aeiou][^aeiouwxy]$/.test(w));

// Tìm trong câu ví dụ đúng từ đó (hoặc dạng số nhiều / -ed / -ing) để khoét thành chỗ trống
export function makeBlank(w) {
  const ex = w.example;
  const base = (w.word || "").trim().toLowerCase();
  if (!ex || !base || /[()/]/.test(base)) return null;
  for (const kind of ["base", "s", "ed", "ing"]) {
    if (kind !== "base" && base.includes(" ")) break;
    const re = new RegExp(
      "(^|[^A-Za-z])(" + escapeRe(FORMS[kind](base)) + ")(?![A-Za-z])",
      "i"
    );
    const m = re.exec(ex);
    if (m) {
      const start = m.index + m[1].length;
      return {
        kind,
        before: ex.slice(0, start),
        after: ex.slice(start + m[2].length),
        shown: m[2],
      };
    }
  }
  return null;
}

// 3 đáp án nhiễu: cùng từ loại, cùng số chữ, chia cùng dạng với đáp án
function pickDistractors(answer, kind, pos, pool, sentenceLower) {
  const wc = answer.trim().split(/\s+/).length;
  const lower = answer.toLowerCase();
  const cand = shuffle(
    pool.filter((d) => {
      const dw = (d.word || "").trim().toLowerCase();
      return (
        dw &&
        dw !== lower &&
        !/[()/]/.test(dw) &&
        dw.split(/\s+/).length === wc &&
        safeFor(kind, dw)
      );
    })
  );
  const same = cand.filter((d) => d.pos && d.pos === pos);
  const rest = cand.filter((d) => !(d.pos && d.pos === pos));
  const out = [];
  const seen = new Set([lower]);
  for (const d of [...same, ...rest]) {
    const form = FORMS[kind](d.word.trim().toLowerCase());
    if (seen.has(form) || sentenceLower.includes(form)) continue;
    seen.add(form);
    out.push(form);
    if (out.length === 3) break;
  }
  return out;
}

// blankPool: [{ w, b }] — các từ có thể khoét chỗ trống
export function buildBlankPool(deck) {
  return deck.map((w) => ({ w, b: makeBlank(w) })).filter((x) => x.b);
}

// Tạo tối đa QUIZ_LEN câu; ưu tiên từ đã học, thiếu thì lấy từ chưa học
export function buildQuizItems({ blankPool, deck, cards, allWords }) {
  const learned = shuffle(blankPool.filter((x) => cards[x.w.id]));
  const fresh = shuffle(blankPool.filter((x) => !cards[x.w.id]));
  const pool = deck.length >= 30 ? deck : [...deck, ...allWords];
  const items = [];
  for (const { w, b } of [...learned, ...fresh]) {
    const cap = /^[A-Z]/.test(b.shown);
    const fix = (s) => (cap ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const ds = pickDistractors(
      b.shown,
      b.kind,
      w.pos,
      pool,
      (b.before + b.after).toLowerCase()
    );
    if (ds.length < 2) continue;
    items.push({
      id: w.id,
      w,
      before: b.before,
      after: b.after,
      answer: b.shown,
      options: shuffle([b.shown, ...ds.map(fix)]),
    });
    if (items.length >= QUIZ_LEN) break;
  }
  return items;
}
