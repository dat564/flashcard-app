// Gộp mọi file trong src/data/words/*.json, bỏ từ/ID trùng.
// Dữ liệu nạp LAZY (mỗi file là một chunk riêng, được cache riêng) thay vì nằm trong bundle JS chính.
// Phải gọi `await loadWords()` một lần trước khi render App (xem main.jsx); sau đó `words` đã có đủ.
const loaders = import.meta.glob("../data/words/*.json");

export let words = [];
let loading = null;

export function loadWords() {
  if (!loading) {
    loading = Promise.all(
      Object.keys(loaders)
        .sort()
        .map(async (k) => {
          const m = await loaders[k]();
          return m.default || m;
        })
    )
      .then((lists) => {
        const seenWord = new Set(),
          seenId = new Set(),
          out = [];
        for (const list of lists) {
          for (const w of list) {
            const k = w.word.trim().toLowerCase();
            if (seenWord.has(k) || seenId.has(w.id)) continue;
            seenWord.add(k);
            seenId.add(w.id);
            out.push(w);
          }
        }
        words = out;
        return words;
      })
      .catch((e) => {
        loading = null; // cho phép thử lại
        throw e;
      });
  }
  return loading;
}
