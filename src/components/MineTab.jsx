import { useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { parseVocabFile } from "../vocabImport";
import { dueAt } from "../lib/srs";
import WordRow from "./WordRow";

export default function MineTab({
  lists,
  cards,
  isLearned,
  deckId,
  setProgress,
  setToast,
  chooseDeck,
  setTab,
  speak,
}) {
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openList, setOpenList] = useState(null);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { words: ws, skipped } = await parseVocabFile(file);
      if (!ws.length)
        throw new Error(
          "Không đọc được từ nào. Hãy kiểm tra file có dạng: Từ vựng | Phiên âm | Từ loại | Nghĩa."
        );
      const id = "L" + Date.now().toString(36);
      const name =
        uploadName.trim() ||
        file.name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
      const list = {
        id,
        name,
        createdAt: Date.now(),
        words: ws.map((w, i) => ({ id: `${id}:${i}`, ...w })),
      };
      setProgress((p) => ({ ...p, lists: [...(p.lists || []), list] }));
      setUploadName("");
      setOpenList(id);
      setToast(
        `Đã thêm ${ws.length} từ vào "${name}"${
          skipped ? ` (bỏ qua ${skipped} dòng lỗi)` : ""
        }`
      );
    } catch (e) {
      alert(e.message || "Không đọc được file.");
    } finally {
      setUploading(false);
    }
  };

  const deleteList = (l) => {
    if (!confirm(`Xóa danh sách "${l.name}" và tiến độ học của nó?`)) return;
    setProgress((p) => {
      const c = { ...(p.cards || {}) };
      l.words.forEach((w) => delete c[w.id]);
      return {
        ...p,
        cards: c,
        lists: (p.lists || []).filter((x) => x.id !== l.id),
      };
    });
    if (deckId === l.id) chooseDeck("main");
    setOpenList(null);
  };

  return (
    <section className="page">
      <h1>Từ của tôi</h1>
      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files?.[0]);
        }}
      >
        <Upload size={26} />
        <b>
          {uploading
            ? "Đang đọc file…"
            : "Chọn hoặc kéo thả file từ vựng vào đây"}
        </b>
        <span>
          .docx (bảng: Từ vựng | Phiên âm | Từ loại | Nghĩa, hoặc mỗi dòng “Bench
          /bentʃ/ (n) ghế dài”), .csv, .tsv, .txt
        </span>
        <input
          type="file"
          hidden
          accept=".docx,.csv,.tsv,.txt"
          onChange={(e) => {
            handleUpload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="search">
          <input
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder="Tên danh sách (không bắt buộc, mặc định lấy tên file)"
          />
        </div>
      </div>

      {lists.length === 0 && (
        <div className="no-results">
          Chưa có danh sách nào. Danh sách riêng học tách biệt hoàn toàn với kho
          chung 3600 từ.
        </div>
      )}
      {lists.map((l) => {
        const due = l.words.filter(
          (w) => cards[w.id] && dueAt(cards[w.id]) <= Date.now()
        ).length;
        const learned = l.words.filter(isLearned).length;
        const open = openList === l.id;
        return (
          <div className="list-card" key={l.id}>
            <div className="list-head">
              <div>
                <b>{l.name}</b>
                <small>
                  {l.words.length} từ · {learned} đã làm quen · {due} đến hạn ·
                  tạo {new Date(l.createdAt).toLocaleDateString("vi-VN")}
                </small>
              </div>
              <div className="list-actions">
                <button
                  className="solid"
                  onClick={() => {
                    chooseDeck(l.id);
                    setTab("study");
                  }}
                >
                  Học danh sách này
                </button>
                <button
                  className="secondary"
                  onClick={() => setOpenList(open ? null : l.id)}
                >
                  {open ? "Ẩn" : "Xem từ"}
                </button>
                <button
                  className="icon-btn sm"
                  title="Xóa danh sách"
                  onClick={() => deleteList(l)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            {open && (
              <div className="table inner">
                {l.words.slice(0, 300).map((w) => (
                  <WordRow key={w.id} word={w} card={cards[w.id]} speak={speak} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
