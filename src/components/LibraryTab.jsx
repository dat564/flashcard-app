import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { words } from "../lib/words";
import { isHard, statusOf } from "../lib/srs";
import WordRow from "./WordRow";

export default function LibraryTab({ cards, speak }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(100);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    return words.filter((w) => {
      const match =
        !q ||
        [w.word, w.meaning, w.example, w.ipa].some((v) =>
          (v || "").toLowerCase().includes(q)
        );
      if (!match) return false;
      const c = cards[w.id];
      if (filter === "hard") return isHard(c);
      return filter === "all" || statusOf(c, now) === filter;
    });
  }, [query, filter, cards]);

  return (
    <section className="page">
      <h1>Kho từ vựng</h1>
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(100);
            }}
            placeholder="Tìm từ, nghĩa hoặc câu ví dụ..."
          />
        </div>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setShown(100);
          }}
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="new">Chưa học</option>
          <option value="due">Đến hạn ôn</option>
          <option value="learning">Đã lên lịch</option>
          <option value="hard">Từ khó</option>
        </select>
      </div>
      <div className="table">
        <div className="table-sum">
          Hiển thị <b>{filtered.length}</b> / {words.length} từ
        </div>
        {filtered.slice(0, shown).map((w) => (
          <WordRow key={w.id} word={w} card={cards[w.id]} speak={speak} showHard />
        ))}
        {filtered.length > shown && (
          <button className="more" onClick={() => setShown((s) => s + 200)}>
            Xem thêm {Math.min(200, filtered.length - shown)} từ
          </button>
        )}
        {filtered.length === 0 && (
          <div className="no-results">
            Không tìm thấy từ phù hợp. Thử từ khóa khác hoặc đổi bộ lọc.
          </div>
        )}
      </div>
    </section>
  );
}
