// Đọc file từ vựng của người dùng: .docx (bảng hoặc từng dòng), .csv, .tsv, .txt
// Không cần thư viện ngoài: .docx là file zip, giải nén bằng DecompressionStream của trình duyệt.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const IPA_RE = /^[\/\[].+[\/\]]$/;
const POS_RE =
  /^[\(\[]?\s*(n|v|adj|adv|prep|conj|pron|det|interj|phr|noun|verb|adjective|adverb|preposition|conjunction|pronoun|phrase|phr\.?\s?v|n\/v|v\/n|adj\/adv)\.?\s*[\)\]]?$/i;
const HEADER_WORDS = new Set([
  "từ vựng",
  "từ",
  "word",
  "vocab",
  "vocabulary",
  "phiên âm",
  "ipa",
  "từ loại",
  "pos",
  "nghĩa",
  "meaning",
  "ví dụ",
  "example",
  "stt",
  "no",
  "#",
]);

/* ---------- đọc .docx ---------- */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function readZipEntry(buffer, wanted) {
  const dv = new DataView(buffer),
    u8 = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("File .docx không hợp lệ.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true),
      elen = dv.getUint16(p + 30, true),
      clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    if (name === wanted) {
      const start =
        local +
        30 +
        dv.getUint16(local + 26, true) +
        dv.getUint16(local + 28, true);
      const data = u8.subarray(start, start + csize);
      return dec.decode(method === 0 ? data : await inflateRaw(data));
    }
    p += 46 + nlen + elen + clen;
  }
  throw new Error("Không tìm thấy nội dung trong file .docx.");
}
const kids = (el, name) =>
  Array.from(el.childNodes).filter((n) => n.localName === name);
const paraText = (p) => {
  let s = "";
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.localName === "t") s += c.textContent;
      else if (c.localName === "tab") s += "\t";
      else if (c.localName === "br") s += " ";
      else if (c.childNodes?.length) walk(c);
    }
  };
  walk(p);
  return s.replace(/\u00a0/g, " ").trim();
};
async function docxToBlocks(buffer, Parser = DOMParser) {
  const xml = await readZipEntry(buffer, "word/document.xml");
  const doc = new Parser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const blocks = [];
  for (const n of Array.from(body.childNodes)) {
    if (n.localName === "p") blocks.push({ type: "line", text: paraText(n) });
    else if (n.localName === "tbl") {
      const rows = kids(n, "tr").map((tr) =>
        kids(tr, "tc").map((tc) =>
          kids(tc, "p").map(paraText).filter(Boolean).join(" ")
        )
      );
      blocks.push({ type: "table", rows });
    }
  }
  return blocks;
}

/* ---------- nhận dạng từng dòng / hàng ---------- */
const cleanPos = (s) =>
  (s || "")
    .replace(/[\(\)\[\]]/g, "")
    .replace(/\.$/, "")
    .trim()
    .toLowerCase();
const POS_MAP = {
  noun: "n",
  verb: "v",
  adjective: "adj",
  adverb: "adv",
  preposition: "prep",
  conjunction: "conj",
  pronoun: "pron",
  phrase: "phr",
};

// Một hàng bảng / CSV: tự nhận cột phiên âm, từ loại; phần còn lại theo thứ tự: từ, nghĩa, ví dụ.
function rowToWord(cells) {
  cells = cells.map((c) => (c || "").trim()).filter(Boolean);
  if (cells.length < 2) return null;
  if (cells.every((c) => HEADER_WORDS.has(c.toLowerCase()))) return null; // hàng tiêu đề
  let ipa = "",
    pos = "";
  const rest = [];
  for (const c of cells) {
    if (!ipa && IPA_RE.test(c)) ipa = c;
    else if (!pos && POS_RE.test(c)) pos = c;
    else rest.push(c);
  }
  if (rest.length < 2) return null;
  const [word, meaning, example] = rest;
  const p = cleanPos(pos);
  return { word, pos: POS_MAP[p] || p, ipa, meaning, example: example || "" };
}

// Một dòng văn bản dạng:  Bench /bentʃ/ (n) ghế dài   hoặc   - **Bench** /bentʃ/ (n) ghế dài
const LINE_RE =
  /^\s*(?:[-•*·–]\s*)?(?:\d+[.)]\s*)?\*{0,2}(.+?)\*{0,2}\s+([\/\[][^\/\]]+[\/\]])\s*(?:[\(\[]([^\)\]]+)[\)\]])?\s*[-–:]?\s*(.+?)\s*$/;
function lineToWord(line) {
  const m = LINE_RE.exec(line);
  if (m) {
    const p = cleanPos(m[3]);
    return {
      word: m[1].trim(),
      ipa: m[2],
      pos: POS_MAP[p] || p,
      meaning: m[4],
      example: "",
    };
  }
  const parts = line
    .split(/\t|\s\|\s|\s[-–—]\s/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2 && /[a-z]/i.test(parts[0]) && parts[0].length <= 40)
    return rowToWord(parts);
  return null;
}

/* ---------- CSV / TSV ---------- */
function parseDelimited(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || "";
  const d = first.includes("\t")
    ? "\t"
    : first.includes("|")
    ? "|"
    : first.includes(";") && !first.includes(",")
    ? ";"
    : ",";
  const rows = [];
  let row = [],
    cur = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/* ---------- API chính ---------- */
export async function parseVocabFile(file, Parser) {
  const ext = file.name.split(".").pop().toLowerCase();
  const out = [],
    seen = new Set();
  let skipped = 0;
  const add = (w) => {
    if (!w || !w.word || !w.meaning) {
      skipped++;
      return;
    }
    const k = w.word.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(w);
  };
  if (ext === "docx") {
    const blocks = await docxToBlocks(await file.arrayBuffer(), Parser);
    // ưu tiên bảng (chính xác nhất), sau đó mới tới các dòng văn bản
    for (const b of blocks)
      if (b.type === "table")
        b.rows.forEach((r) => {
          const w = rowToWord(r);
          if (w) add(w);
        });
    for (const b of blocks)
      if (b.type === "line" && b.text) {
        const w = lineToWord(b.text);
        if (w) add(w);
      }
  } else if (["csv", "tsv", "txt"].includes(ext)) {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    if (
      ext === "txt" &&
      !/[,\t|;]/.test(text.split(/\r?\n/).find((l) => l.trim()) || "")
    ) {
      text.split(/\r?\n/).forEach((l) => {
        const w = l.trim() && lineToWord(l);
        if (w) add(w);
      });
    } else parseDelimited(text).forEach((r) => add(rowToWord(r)));
  } else throw new Error("Chỉ hỗ trợ file .docx, .csv, .tsv hoặc .txt.");
  return { words: out, skipped };
}
