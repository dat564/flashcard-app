import { Volume2 } from "lucide-react";
import { isHard, statusOf, STATUS_LABEL } from "../lib/srs";
import { metaOf } from "../lib/utils";

// Một dòng từ trong Kho từ / danh sách riêng
export default function WordRow({ word, card, speak, showHard = false }) {
  const status = statusOf(card);
  return (
    <div className="row">
      <div className="row-word">
        <b>
          {word.word}
          {showHard && isHard(card) && <em className="hard-tag">khó</em>}
        </b>
        <small>{metaOf(word)}</small>
      </div>
      <span className="row-mean">{word.meaning}</span>
      <i className={`status ${status}`}>{STATUS_LABEL[status]}</i>
      <button
        className="icon-btn sm"
        title="Nghe từ"
        onClick={() => speak(word.word)}
      >
        <Volume2 size={16} />
      </button>
    </div>
  );
}
