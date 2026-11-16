import { fsrs, generatorParameters, createEmptyCard, Rating, default_w } from "ts-fsrs";

export const DAY = 86400000;
export const D0 = new Date(2026, 0, 5, 9, 0).getTime();

// RNG có hạt giống (kết quả lặp lại được)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Mô phỏng một người học có "trí nhớ thật" khác mặc định ---------- */
export function simulateUser(trueW, cards, days, seed) {
  const rand = rng(seed);
  const f = fsrs(generatorParameters({ w: Array.from(default_w), enable_fuzz: false, enable_short_term: false }));
  const truth = fsrs(generatorParameters({ w: trueW, enable_fuzz: false, enable_short_term: false }));
  const state = []; // mỗi thẻ: {card (theo lịch app, dùng tham số mặc định), mem (trí nhớ thật)}
  const log = [];
  for (let day = 0; day < days; day++) {
    const now = D0 + day * DAY;
    // mỗi ngày học thêm vài thẻ mới
    for (let k = 0; k < Math.ceil(cards / days); k++) {
      if (state.length < cards) state.push({ id: String(state.length), card: createEmptyCard(new Date(now)), mem: createEmptyCard(new Date(now)), due: now });
    }
    for (const st of state) {
      if (st.due > now) continue;
      const isNew = st.card.reps === 0;
      let remembered = true;
      if (!isNew) {
        const R = truth.get_retrievability(st.mem, new Date(now), false);
        remembered = rand() < R;
      }
      const grade = remembered ? Rating.Good : Rating.Again;
      st.mem = truth.next(st.mem, new Date(now), grade).card;
      st.card = f.next(st.card, new Date(now), grade).card;
      st.due = remembered ? now + st.card.scheduled_days * DAY : now + DAY;
      log.push({ c: st.id, t: now + 9 * 3600000, g: remembered ? 3 : 1 });
    }
  }
  return log;
}
