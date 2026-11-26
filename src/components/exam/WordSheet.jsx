import { useState } from "react";
import { BookmarkPlus, Check, Volume2, X } from "lucide-react";
import { lookupWord } from "../../lib/examEngine";

export const EXAM_LIST_ID = "LEXAM";

// Khung tra từ ở cuối màn hình: nghĩa (nếu có trong kho từ), nghe, lưu vào "Từ trong đề thi"
export default function WordSheet({ entry, lists, onClose, onSave, speak }) {
  const found = lookupWord(entry.word);
  const key = (found?.word || entry.word).toLowerCase();
  const saved = !!(lists || []).find((l) => l.id === EXAM_LIST_ID)?.words.some((w) => w.word.toLowerCase() === key);
  const [meaning, setMeaning] = useState("");
  const canSave = !saved && (found || meaning.trim());

  const save = () =>
    onSave({
      word: found?.word || entry.word.toLowerCase(),
      pos: found?.pos || "",
      ipa: found?.ipa || "",
      meaning: found?.meaning || meaning.trim(),
      example: entry.sentence || found?.example || "",
    });

  return (
    <div className="ex-sheet-wrap" onClick={onClose}>
      <div className="ex-sheet" role="dialog" aria-label="Tra từ" onClick={(e) => e.stopPropagation()}>
        <div className="ex-sheet-head">
          <div>
            <b className="ex-sheet-word">{found?.word || entry.word}</b>
            {found && (
              <span className="muted">
                {" "}
                {found.pos} {found.ipa}
              </span>
            )}
          </div>
          <button className="icon-btn" onClick={() => speak?.(found?.word || entry.word)} aria-label="Nghe">
            <Volume2 size={18} />
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        {found ? (
          <p className="ex-sheet-meaning">{found.meaning}</p>
        ) : (
          <input
            className="ex-sheet-input"
            placeholder="Từ này chưa có trong kho. Nhập nghĩa để lưu"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
          />
        )}
        {entry.sentence && <p className="ex-sheet-ctx muted">“{entry.sentence}”</p>}
        <button className="primary ex-sheet-save" disabled={!canSave} onClick={save}>
          {saved ? (
            <>
              <Check size={16} /> Đã có trong “Từ trong đề thi”
            </>
          ) : (
            <>
              <BookmarkPlus size={16} /> Lưu vào “Từ trong đề thi”
            </>
          )}
        </button>
      </div>
    </div>
  );
}
