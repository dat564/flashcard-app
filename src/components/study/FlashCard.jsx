import { metaOf } from "../../lib/utils";
import SoundButton from "../SoundButton";

// Một thẻ lật (mặt trước + mặt sau)
export default function FlashCard({
  word: w,
  flipped,
  enVi,
  badge,
  label,
  speak,
}) {
  const sound = <SoundButton onPlay={() => speak(w.word)} />;
  return (
    <div className={`flip ${flipped ? "flipped" : ""}`}>
      <div className="flip-inner">
        <div className="face front">
          <span className={`badge ${badge}`}>{label}</span>
          {enVi ? (
            <>
              <div className="word">{w.word}</div>
              <div className="meta">{metaOf(w)}</div>
              {sound}
            </>
          ) : (
            <div className="word vi">{w.meaning}</div>
          )}
          <div className="flip-hint">Chạm để lật thẻ</div>
        </div>
        <div className="face back">
          <span className={`badge ${badge}`}>{label}</span>
          {enVi ? (
            <>
              <div className="meaning">{w.meaning}</div>
              {w.example && <div className="example">{w.example}</div>}
              <div className="meta small">
                {w.word}
                {w.pos ? `  ·  ${w.pos}` : ""}
              </div>
            </>
          ) : (
            <>
              <div className="word">{w.word}</div>
              <div className="meta">{metaOf(w)}</div>
              {w.example && <div className="example">{w.example}</div>}
              {sound}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
