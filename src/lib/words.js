// Gộp mọi file trong src/data/words/*.json, bỏ từ/ID trùng.
const wordModules = import.meta.glob("../data/words/*.json", { eager: true });

export const words = (() => {
  const seenWord = new Set(),
    seenId = new Set(),
    out = [];
  for (const key of Object.keys(wordModules).sort()) {
    const list = wordModules[key].default || wordModules[key];
    for (const w of list) {
      const k = w.word.trim().toLowerCase();
      if (seenWord.has(k) || seenId.has(w.id)) continue;
      seenWord.add(k);
      seenId.add(w.id);
      out.push(w);
    }
  }
  return out;
})();
