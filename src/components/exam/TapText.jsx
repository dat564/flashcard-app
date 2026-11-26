import { useMemo } from "react";
import { sentenceAround } from "../../lib/examEngine";

// Văn bản mà từng từ bấm được (tra nghĩa / lưu từ). "[n]" là chỗ trống của Part 6.
//   fills: { [n]: { text, cls } } điền sẵn vào chỗ trống (sau khi chọn / xem đáp án)
export default function TapText({ text, onWord, fills = {}, className = "" }) {
  const nodes = useMemo(() => {
    const out = [];
    const re = /\[(\d+)\]|[A-Za-z][A-Za-z'’-]*/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      if (m[1]) {
        const f = fills[m[1]];
        out.push(
          <span key={m.index} className={`ex-blank ${f ? f.cls : ""}`}>
            {f ? f.text : `(${m[1]})`}
          </span>
        );
      } else {
        const word = m[0];
        const at = m.index;
        out.push(
          <span
            key={m.index}
            className="tw"
            role="button"
            tabIndex={-1}
            onClick={() => onWord?.(word, sentenceAround(text, at))}
          >
            {word}
          </span>
        );
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text, fills, onWord]);
  return <span className={`ex-tap ${className}`}>{nodes}</span>;
}
