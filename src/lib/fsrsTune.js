/* Tối ưu tham số FSRS theo lịch sử ôn của từng người (JS thuần, chạy được trong Web Worker).
 *
 * Mô hình: FSRS-6 (21 tham số w) như trong ts-fsrs. Với mỗi thẻ ta có chuỗi lượt ôn
 * [(rating, số ngày kể từ lượt trước)]. Mô hình dự đoán xác suất nhớ R trước mỗi lượt ôn (trừ lượt đầu);
 * ta chọn w để cực tiểu hóa log-loss (cross-entropy) giữa R và kết quả thật (nhớ / quên),
 * cộng một phạt nhẹ kéo w về giá trị mặc định để không "học vẹt" khi dữ liệu còn ít.
 *
 * Công thức ở `forward` được port từ ts-fsrs (có test đối chiếu từng bước với FSRSAlgorithm.next_state),
 * nên tham số tối ưu cắm thẳng vào bộ lên lịch của app.
 * Gradient tính bằng sai phân hữu hạn (chỉ với tham số thật sự ảnh hưởng), tối ưu bằng Adam.
 */
import { clipParameters, default_w } from "ts-fsrs";

const DAY = 86400000;
const S_MIN = 1e-3;
const S_MAX = 36500;
const EPS = 1e-6;

export const MIN_REVIEWS = 1000; // tổng số lượt ôn tối thiểu
export const MIN_FAILS = 30; // số lần "Chưa nhớ" (ở lượt ôn không phải lần đầu) tối thiểu
export const MIN_IMPROVEMENT = 0.003; // log-loss phải giảm ít nhất chừng này (trên tập kiểm tra) mới đề nghị áp dụng

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/* ---------- Dựng chuỗi ôn từ nhật ký ---------- */
// log: [{c, t, g}] → [{id, g: [1|3...], dt: [0, ngày...]}] (dt tính theo NGÀY dương lịch, như lịch của app)
export function buildSequences(log) {
  const byCard = new Map();
  for (const r of [...log].sort((a, b) => a.t - b.t)) {
    if (!byCard.has(r.c)) byCard.set(r.c, []);
    byCard.get(r.c).push(r);
  }
  const seqs = [];
  for (const [id, rows] of byCard) {
    const g = [];
    const dt = [];
    rows.forEach((r, i) => {
      g.push(r.g);
      dt.push(i === 0 ? 0 : Math.max(0, Math.round((startOfDay(r.t) - startOfDay(rows[i - 1].t)) / DAY)));
    });
    seqs.push({ id, g, dt });
  }
  return seqs;
}

export function dataSummary(log) {
  const seqs = buildSequences(log);
  let scored = 0;
  let fails = 0;
  for (const s of seqs)
    for (let i = 1; i < s.g.length; i++) {
      if (s.dt[i] === 0) continue;
      scored++;
      if (s.g[i] === 1) fails++;
    }
  return {
    reviews: log.length,
    cards: seqs.length,
    scored,
    fails,
    enough: log.length >= MIN_REVIEWS && fails >= MIN_FAILS,
  };
}

/* ---------- Mô hình thuận (port từ ts-fsrs) ---------- */
// Hằng số suy ra từ w, tính một lần cho mỗi bộ tham số
const consts = (w) => {
  const decay = -w[20];
  return {
    decay,
    factor: Math.exp(Math.log(0.9) / decay) - 1,
    expW8: Math.exp(w[8]),
    easyD: w[4] - Math.exp(3 * w[5]) + 1, // init_difficulty(Easy)
  };
};

// Trạng thái sau lượt ôn ĐẦU TIÊN của thẻ
const initState = (w, r, out) => {
  out.s = Math.max(w[r - 1], 0.1);
  out.d = clamp(w[4] - Math.exp((r - 1) * w[5]) + 1, 1, 10);
  out.R = 1;
  return out;
};

// Một lượt ôn sau t ngày kể từ lượt trước: ghi R (xác suất nhớ TRƯỚC lượt này) và (s, d) mới vào `out`
// (out.s, out.d là trạng thái hiện tại khi gọi). Học 1 lần/ngày nên dùng công thức dài hạn.
const stepState = (w, c, r, t, out) => {
  const s = out.s;
  const d = out.d;
  const R = Math.pow(1 + (c.factor * t) / s, c.decay);
  let ns;
  if (r === 1) {
    const sf = clamp(
      w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - R) * w[14]),
      S_MIN,
      S_MAX
    );
    ns = Math.min(Math.max(s, S_MIN), sf); // quên thì độ bền không tăng
  } else {
    const hard = r === 2 ? w[15] : 1;
    const easy = r === 4 ? w[16] : 1;
    ns = clamp(
      s * (1 + c.expW8 * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - R) * w[10]) - 1) * hard * easy),
      S_MIN,
      S_MAX
    );
  }
  const nd = d + (-w[6] * (r - 3) * (10 - d)) / 9;
  out.d = clamp(w[7] * c.easyD + (1 - w[7]) * nd, 1, 10);
  out.s = ns;
  out.R = R;
  return out;
};

// Quỹ đạo trạng thái của một chuỗi (dùng để đối chiếu với ts-fsrs trong test)
export function trace(w, g, dt) {
  const c = consts(w);
  const out = { s: 0, d: 0, R: 1 };
  const rows = [];
  for (let i = 0; i < g.length; i++) {
    if (i === 0) initState(w, g[i], out);
    else stepState(w, c, g[i], dt[i], out);
    rows.push({ s: out.s, d: out.d, R: out.R });
  }
  return rows;
}

// Trả về tổng log-loss và số lượt được chấm điểm trên các chuỗi.
export function lossOn(w, seqs) {
  const c = consts(w);
  const st = { s: 0, d: 0, R: 1 };
  let sum = 0;
  let n = 0;
  for (let k = 0; k < seqs.length; k++) {
    const { g, dt } = seqs[k];
    initState(w, g[0], st);
    for (let i = 1; i < g.length; i++) {
      const t = dt[i];
      stepState(w, c, g[i], t, st);
      if (t > 0) {
        const p = clamp(st.R, EPS, 1 - EPS);
        sum += g[i] > 1 ? -Math.log(p) : -Math.log(1 - p);
        n++;
      }
    }
  }
  return { sum, n };
}

// Log-loss trung bình trên mỗi lượt (không phạt)
export const meanLoss = (w, seqs) => {
  const { sum, n } = lossOn(w, seqs);
  return n ? sum / n : 0;
};

/* ---------- Tối ưu ---------- */
const BASE_ACTIVE = [0, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20];
const PRIOR_STRENGTH = 5; // ≈ độ lệch tương đối 32% còn "rẻ"; tăng để kéo về mặc định mạnh hơn

function activeIndices(seqs) {
  const act = new Set(BASE_ACTIVE);
  const seen = new Set();
  for (const s of seqs) for (const g of s.g) seen.add(g);
  if (seen.has(2)) [1, 15].forEach((i) => act.add(i));
  if (seen.has(4)) [3, 16].forEach((i) => act.add(i));
  return [...act].sort((a, b) => a - b);
}

// opts: {steps, lr, onProgress(frac), shouldStop()}
export function fitWeights(seqs, opts = {}) {
  const { steps = 150, lr = 0.08, onProgress } = opts;
  const def = Array.from(default_w);
  const act = activeIndices(seqs);
  const clip = (w) => clipParameters(w, 0, false);
  let w = clip(def.slice());
  const total = lossOn(w, seqs).n || 1;

  const objective = (x) => {
    const { sum } = lossOn(x, seqs);
    let pen = 0;
    for (const i of act) {
      const rel = (x[i] - def[i]) / (Math.abs(def[i]) + 0.1);
      pen += rel * rel;
    }
    return (sum + PRIOR_STRENGTH * pen) / total;
  };

  const m = new Array(21).fill(0);
  const v = new Array(21).fill(0);
  const b1 = 0.9;
  const b2 = 0.999;
  let best = { w: w.slice(), f: objective(w) };
  for (let step = 1; step <= steps; step++) {
    const rate = lr * (0.05 + 0.95 * 0.5 * (1 + Math.cos((Math.PI * (step - 1)) / steps)));
    const next = w.slice();
    for (const i of act) {
      const h = 1e-3 * (Math.abs(w[i]) + 0.1);
      const up = w.slice();
      const dn = w.slice();
      up[i] = w[i] + h;
      dn[i] = w[i] - h;
      const grad = (objective(up) - objective(dn)) / (2 * h);
      m[i] = b1 * m[i] + (1 - b1) * grad;
      v[i] = b2 * v[i] + (1 - b2) * grad * grad;
      const mh = m[i] / (1 - Math.pow(b1, step));
      const vh = v[i] / (1 - Math.pow(b2, step));
      const scale = Math.max(Math.abs(def[i]), 0.1); // mỗi tham số có thang riêng
      next[i] = w[i] - (rate * scale * mh) / (Math.sqrt(vh) + 1e-8);
    }
    w = clip(next);
    const f = objective(w);
    if (f < best.f) best = { w: w.slice(), f };
    if (onProgress && step % 5 === 0) onProgress(step / steps);
  }
  return best.w.map((x) => Math.round(x * 1e6) / 1e6);
}

/* ---------- Toàn bộ quy trình ---------- */
// Chia thẻ 80/20 (cố định theo id): tối ưu trên 80%, đo trên 20% chưa thấy;
// chỉ khi tốt hơn mặc định rõ rệt mới đề nghị áp dụng, khi đó tối ưu lại trên toàn bộ dữ liệu.
export function tune(log, opts = {}) {
  const { onProgress } = opts;
  const info = dataSummary(log);
  if (!info.enough) return { ok: false, reason: "not-enough-data", ...info };

  const seqs = buildSequences(log);
  const hash = (id) => {
    let h = 2166136261;
    for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0) % 5;
  };
  const train = seqs.filter((s) => hash(s.id) !== 0);
  const test = seqs.filter((s) => hash(s.id) === 0);
  const testN = lossOn(Array.from(default_w), test).n;
  if (testN < 100) return { ok: false, reason: "not-enough-data", ...info };

  const stage = (a, b) => (f) => onProgress && onProgress(a + (b - a) * f);
  const w1 = fitWeights(train, { ...opts, onProgress: stage(0, 0.5) });
  const lossDefault = meanLoss(Array.from(default_w), test);
  const lossTuned = meanLoss(w1, test);
  const improved = lossDefault - lossTuned >= MIN_IMPROVEMENT;
  if (!improved)
    return { ok: true, improved: false, lossDefault, lossTuned, testReviews: testN, ...info };

  const weights = fitWeights(seqs, { ...opts, onProgress: stage(0.5, 1) });
  onProgress && onProgress(1);
  return { ok: true, improved: true, weights, lossDefault, lossTuned, testReviews: testN, ...info };
}
