// Chọn đề, chấm điểm, thống kê, tra từ — các hàm thuần (dễ kiểm thử).
import { words } from "./words";
import { PART_IDS, isListening } from "./examSchema";

/* ---------- Tra từ trong kho từ của app ---------- */
let dict = null;
let dictSize = -1;
const ensureDict = () => {
  if (dict && dictSize === words.length) return dict;
  dict = new Map();
  for (const w of words) dict.set(w.word.trim().toLowerCase(), w);
  dictSize = words.length;
  return dict;
};

const candidates = (raw) => {
  const w = raw.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "").replace(/['’]s$/, "");
  if (!w) return [];
  const out = [w];
  const cut = (n, add = "") => w.length > n + 2 && out.push(w.slice(0, -n) + add);
  if (w.endsWith("ies")) cut(3, "y");
  if (w.endsWith("es")) cut(2);
  if (w.endsWith("s")) cut(1);
  if (w.endsWith("ied")) cut(3, "y");
  if (w.endsWith("ed")) {
    cut(2);
    cut(1);
    if (w[w.length - 3] === w[w.length - 4]) cut(3);
  }
  if (w.endsWith("ing")) {
    cut(3);
    cut(3, "e");
    if (w[w.length - 4] === w[w.length - 5]) cut(4);
  }
  if (w.endsWith("ily")) cut(3, "y");
  if (w.endsWith("ly")) cut(2);
  return out;
};

export function lookupWord(raw) {
  const d = ensureDict();
  for (const c of candidates(String(raw))) if (d.has(c)) return d.get(c);
  return null;
}

// Câu chứa vị trí `pos` trong `text` (dùng làm câu ví dụ khi lưu từ)
export function sentenceAround(text, pos) {
  const left = text.slice(0, pos);
  const start = Math.max(left.lastIndexOf(". "), left.lastIndexOf("? "), left.lastIndexOf("! "), left.lastIndexOf("\n"));
  const rest = text.slice(pos);
  const m = rest.search(/[.!?](\s|$)|\n/);
  const end = m < 0 ? text.length : pos + m + 1;
  return text.slice(start < 0 ? 0 : start + 1, end).trim();
}

/* ---------- Chọn đơn vị cho một lượt luyện ---------- */
export const shuffle = (arr, rnd = Math.random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Ưu tiên: chưa làm → đã sai trước đây → còn lại. Lấy đến khi đủ ~target câu (ít nhất 1 đơn vị).
export function pickUnits({ units, part, target = 10, seen = new Set(), mistakeUnits = new Set(), rnd = Math.random }) {
  const pool = units.filter((u) => (part == null ? true : Array.isArray(part) ? part.includes(u.part) : u.part === part));
  const fresh = shuffle(pool.filter((u) => !seen.has(u.id)), rnd);
  const wrong = shuffle(pool.filter((u) => seen.has(u.id) && mistakeUnits.has(u.id)), rnd);
  const rest = shuffle(pool.filter((u) => seen.has(u.id) && !mistakeUnits.has(u.id)), rnd);
  const out = [];
  let n = 0;
  for (const u of [...fresh, ...wrong, ...rest]) {
    if (n >= target) break;
    out.push(u);
    n += u.questions.length;
  }
  return out;
}

// Thi thử mini: thứ tự như đề thật (nghe 1→4, rồi đọc 5→7); mỗi Part lấy ~số câu trong spec
export const MINI_SPEC = { 1: 3, 2: 6, 3: 6, 4: 6, 5: 10, 6: 4, 7: 6 };
export function buildMiniTest(units, opts = {}) {
  const spec = opts.spec || MINI_SPEC;
  const out = [];
  for (const part of PART_IDS) {
    const picked = pickUnits({ units, part, target: spec[part] || 0, seen: opts.seen, mistakeUnits: opts.mistakeUnits, rnd: opts.rnd });
    if (spec[part]) out.push(...picked);
  }
  return out;
}

/* ---------- Chấm điểm ---------- */
// answers: { [questionId]: chỉ số đáp án đã chọn }
export function scoreAttempt(units, answers) {
  const perPart = {};
  const tags = {};
  const wrong = [];
  let total = 0;
  let correct = 0;
  let answered = 0;
  for (const u of units) {
    const pp = (perPart[u.part] ||= { n: 0, c: 0 });
    for (const q of u.questions) {
      const a = answers[q.id];
      const ok = a === q.answer;
      total++;
      pp.n++;
      if (a != null) answered++;
      if (ok) {
        correct++;
        pp.c++;
      } else if (a != null) wrong.push(q.id);
      for (const t of q.tags) {
        const e = (tags[t] ||= [0, 0]);
        e[1]++;
        if (ok) e[0]++;
      }
    }
  }
  return { total, correct, answered, perPart, tags, wrong };
}

export function makeAttempt({ units, answers, secs, mode, title, t = Date.now() }) {
  const s = scoreAttempt(units, answers);
  const parts = [...new Set(units.map((u) => u.part))];
  return {
    t,
    mode,
    title,
    part: parts.length === 1 ? parts[0] : 0,
    total: s.total,
    correct: s.correct,
    answered: s.answered,
    secs: Math.round(secs || 0),
    perPart: s.perPart,
    tags: s.tags,
    units: units.map((u) => u.id),
    wrong: s.wrong,
  };
}

// Cập nhật danh sách câu sai: sai → thêm; đúng → bỏ khỏi danh sách; chưa trả lời → giữ nguyên
export function applyMistakes(mistakes, units, answers, t = Date.now()) {
  const next = { ...mistakes };
  for (const u of units)
    for (const q of u.questions) {
      const a = answers[q.id];
      if (a == null) continue;
      if (a === q.answer) delete next[q.id];
      else next[q.id] = { unitId: u.id, t };
    }
  return next;
}

/* ---------- Thống kê ---------- */
export function summarizeAttempts(attempts) {
  const perPart = Object.fromEntries(PART_IDS.map((p) => [p, { n: 0, c: 0, recentN: 0, recentC: 0 }]));
  const tags = {};
  const byPartAttempts = Object.fromEntries(PART_IDS.map((p) => [p, []]));
  for (const a of attempts) for (const p of Object.keys(a.perPart || {})) byPartAttempts[p]?.push(a);
  for (const a of attempts) {
    for (const [p, v] of Object.entries(a.perPart || {})) {
      if (!perPart[p]) continue;
      perPart[p].n += v.n;
      perPart[p].c += v.c;
    }
    for (const [t, [c, n]] of Object.entries(a.tags || {})) {
      const e = (tags[t] ||= { c: 0, n: 0 });
      e.c += c;
      e.n += n;
    }
  }
  // độ chính xác gần đây: 5 lần làm gần nhất có Part đó
  for (const p of PART_IDS)
    for (const a of byPartAttempts[p].slice(-5)) {
      perPart[p].recentN += a.perPart[p].n;
      perPart[p].recentC += a.perPart[p].c;
    }
  const weakTags = Object.entries(tags)
    .filter(([, v]) => v.n >= 4)
    .map(([tag, v]) => ({ tag, ...v, acc: v.c / v.n }))
    .sort((a, b) => a.acc - b.acc || b.n - a.n)
    .slice(0, 6);
  const total = Object.values(perPart).reduce((s, v) => s + v.n, 0);
  const correct = Object.values(perPart).reduce((s, v) => s + v.c, 0);
  return { perPart, weakTags, total, correct };
}

export const pct = (c, n) => (n ? Math.round((c / n) * 100) : null);
export const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
export { isListening };
