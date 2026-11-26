// Định dạng đề luyện thi TOEIC + bộ đọc / kiểm tra file nhập (JSON hoặc CSV).
//
// File JSON:
// {
//   "title": "Tên bộ đề",
//   "units": [
//     { "part": 5, "questions": [ { "text": "...", "options": ["A","B","C","D"], "answer": "B",
//                                   "explanation": "...", "tags": ["Ngữ pháp · Giới từ"] } ] },
//     { "part": 7, "passages": ["đoạn 1", "đoạn 2"], "questions": [ ... ] },
//     { "part": 3, "transcript": ["Woman: ...", "Man: ..."], "questions": [ ... ] },
//     { "part": 2, "transcript": ["Where is ...?"], "questions": [ { "options": ["...","...","..."], "answer": "A" } ] },
//     { "part": 1, "image": "https://... hoặc data:image/...", "questions": [ { "options": ["...","...","...","..."], "answer": "A" } ] }
//   ]
// }
// "unit" = một đoạn văn / một đoạn nghe / một tranh kèm 1 hay nhiều câu hỏi (Part 5 và Part 2: mỗi unit 1 câu).
// "answer": chữ cái "A"–"F" hoặc số 1–6 (tính từ 1).

export const PARTS = {
  1: { label: "Mô tả tranh", skill: "listening" },
  2: { label: "Hỏi – đáp", skill: "listening" },
  3: { label: "Hội thoại", skill: "listening" },
  4: { label: "Bài nói ngắn", skill: "listening" },
  5: { label: "Điền vào câu", skill: "reading" },
  6: { label: "Điền vào đoạn", skill: "reading" },
  7: { label: "Đọc hiểu", skill: "reading" },
};
export const PART_IDS = [1, 2, 3, 4, 5, 6, 7];
export const LISTENING_PARTS = [1, 2, 3, 4];
export const READING_PARTS = [5, 6, 7];
export const isListening = (part) => part >= 1 && part <= 4;
export const LETTERS = "ABCDEF";

const str = (v) => (v == null ? "" : String(v).trim());
export const slug = (s) =>
  str(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// "B" / "b" / 2 / "2" → chỉ số 0-based; sai → -1
export function answerIndex(a, n) {
  let i = -1;
  if (typeof a === "number") i = a - 1;
  else {
    const t = str(a).toUpperCase();
    if (/^[A-F]$/.test(t)) i = LETTERS.indexOf(t);
    else if (/^\d+$/.test(t)) i = Number(t) - 1;
  }
  return i >= 0 && i < n ? i : -1;
}

const toTags = (v) =>
  (Array.isArray(v) ? v : str(v).split(/[;,|]/)).map(str).filter(Boolean);

// ["Woman: Hi", "Man: Hello"] | "Woman: Hi\nMan: Hello" | [{speaker, text}] → [{speaker, text}]
export function parseTranscript(v) {
  const items = Array.isArray(v) ? v : str(v).split(/\r?\n|\|/);
  const out = [];
  for (const it of items) {
    if (it && typeof it === "object") {
      const text = str(it.text);
      if (text) out.push({ speaker: str(it.speaker), text });
      continue;
    }
    const s = str(it);
    if (!s) continue;
    const m = s.match(/^([A-Za-z][\w .'’-]{0,20}):\s*(.+)$/);
    out.push(m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: "", text: s });
  }
  return out;
}

const IMG_OK = /^(https?:\/\/|data:image\/|\.{0,2}\/)/i;

function normalizeQuestion(q, qid, part, errs, where) {
  if (!q || typeof q !== "object") {
    errs.push(`${where}: câu hỏi không hợp lệ.`);
    return null;
  }
  const options = (Array.isArray(q.options) ? q.options : [])
    .map((o) => str(o && typeof o === "object" ? o.text : o))
    .filter((o) => o !== "");
  const min = part === 2 ? 3 : 2;
  if (options.length < min || options.length > 6) {
    errs.push(`${where}: cần ${min}–6 đáp án (đang có ${options.length}).`);
    return null;
  }
  const answer = answerIndex(q.answer, options.length);
  if (answer < 0) {
    errs.push(`${where}: "answer" không khớp với các đáp án (dùng A–${LETTERS[options.length - 1]} hoặc số 1–${options.length}).`);
    return null;
  }
  const out = {
    id: qid,
    text: str(q.text ?? q.question),
    options,
    answer,
    explanation: str(q.explanation),
    tags: toTags(q.tags),
  };
  const blank = Number(q.blank);
  if (Number.isInteger(blank) && blank > 0) out.blank = blank;
  return out;
}

function normalizeUnit(u, i, setId, errs, warns) {
  const where = `Đơn vị ${i + 1}`;
  if (!u || typeof u !== "object") {
    errs.push(`${where}: không hợp lệ.`);
    return null;
  }
  const part = Number(u.part);
  if (!PART_IDS.includes(part)) {
    errs.push(`${where}: "part" phải từ 1 đến 7.`);
    return null;
  }
  const uid = `${setId}/${slug(u.id) || `u${i + 1}`}`;
  const passages = (Array.isArray(u.passages) ? u.passages : u.passage != null ? [u.passage] : [])
    .map((p) => (p && typeof p === "object" ? { title: str(p.title), text: str(p.text) } : { title: "", text: str(p) }))
    .filter((p) => p.text);
  const transcript = parseTranscript(u.transcript ?? []);
  let image = str(u.image);
  if (image && !IMG_OK.test(image)) {
    warns.push(`${where}: bỏ qua "image" vì không phải đường dẫn http(s) hoặc data:image.`);
    image = "";
  }
  const audio = str(u.audio);
  if (isListening(part) && !transcript.length && !audio) {
    errs.push(`${where} (Part ${part}): cần "transcript" (để đọc bằng giọng máy) hoặc "audio".`);
    return null;
  }
  if ((part === 6 || part === 7) && !passages.length) {
    errs.push(`${where} (Part ${part}): thiếu đoạn văn ("passage" / "passages").`);
    return null;
  }
  if (part === 1 && !image) warns.push(`${where} (Part 1): chưa có ảnh nên chỉ nghe được, không xem được tranh.`);
  const qs = (Array.isArray(u.questions) ? u.questions : [])
    .map((q, j) => normalizeQuestion(q, `${uid}/${slug(q && q.id) || `q${j + 1}`}`, part, errs, `${where}, câu ${j + 1}`))
    .filter(Boolean);
  if (!qs.length) {
    errs.push(`${where}: không có câu hỏi hợp lệ.`);
    return null;
  }
  return { id: uid, part, passages, transcript, image, audio, questions: qs };
}

// raw (JSON đã parse) → { set, errors, warnings }. Đơn vị lỗi bị bỏ qua, không làm hỏng cả file.
export function normalizeSet(raw, { fallbackTitle = "Đề nhập", source = "import", fixedId = "" } = {}) {
  const errors = [];
  const warnings = [];
  const obj = Array.isArray(raw) ? { units: raw } : raw && typeof raw === "object" ? raw : null;
  if (!obj || !Array.isArray(obj.units))
    return { set: null, errors: ['Không thấy danh sách "units" trong file.'], warnings };
  const title = str(obj.title) || fallbackTitle;
  const id = fixedId || slug(obj.id) || `${slug(title) || "de"}-${Date.now().toString(36)}`;
  const units = obj.units.map((u, i) => normalizeUnit(u, i, id, errors, warnings)).filter(Boolean);
  if (!units.length) return { set: null, errors: errors.length ? errors : ["Không có đơn vị hợp lệ nào."], warnings };
  return {
    set: { id, title, description: str(obj.description), source, createdAt: Date.now(), units },
    errors,
    warnings,
  };
}

/* ---------- CSV ---------- */
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const count = (ch) => first.split(ch).length - 1;
  const delim = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"' && cell === "") inQ = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIAS = {
  part: ["part"],
  unit: ["unit", "group", "nhom", "nhóm"],
  passage: ["passage", "doan", "đoạn", "text"],
  transcript: ["transcript", "script"],
  image: ["image", "anh", "ảnh"],
  audio: ["audio"],
  question: ["question", "q", "cau hoi", "câu hỏi"],
  answer: ["answer", "dap an", "đáp án", "correct"],
  explanation: ["explanation", "giai thich", "giải thích"],
  tags: ["tags", "tag"],
  blank: ["blank", "cho trong", "chỗ trống"],
};
const OPT_KEYS = ["a", "b", "c", "d", "e", "f"];

// CSV → đối tượng giống JSON. Các dòng cùng cột "unit" gộp thành một đơn vị (dùng cho Part 3, 4, 6, 7).
export function csvToRaw(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { units: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.findIndex((h) => ALIAS[name].includes(h));
  const idx = Object.fromEntries(Object.keys(ALIAS).map((k) => [k, col(k)]));
  const optIdx = OPT_KEYS.map((k) => head.indexOf(k));
  const get = (r, k) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
  const groups = new Map();
  rows.slice(1).forEach((r, n) => {
    const key = get(r, "unit") ? `${get(r, "part")}|${get(r, "unit")}` : `row${n}`;
    if (!groups.has(key)) groups.set(key, { part: get(r, "part"), passages: [], transcript: "", image: "", audio: "", questions: [] });
    const g = groups.get(key);
    const passage = get(r, "passage");
    if (passage && !g.passages.length) g.passages = passage.split(/\n?-{3,}\n?/).map((s) => s.trim()).filter(Boolean);
    if (!g.transcript) g.transcript = get(r, "transcript");
    if (!g.image) g.image = get(r, "image");
    if (!g.audio) g.audio = get(r, "audio");
    g.questions.push({
      text: get(r, "question"),
      options: optIdx.map((i) => (i >= 0 ? (r[i] ?? "").trim() : "")).filter((o) => o !== ""),
      answer: get(r, "answer"),
      explanation: get(r, "explanation"),
      tags: get(r, "tags"),
      blank: get(r, "blank"),
    });
  });
  return { units: [...groups.values()] };
}

export function parseExamText(text, filename = "") {
  const name = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const fallbackTitle = name || "Đề nhập";
  const t = String(text).replace(/^\uFEFF/, "").trim();
  let raw;
  if (/\.csv$|\.tsv$/i.test(filename) || !/^[{[]/.test(t)) raw = csvToRaw(t);
  else {
    try {
      raw = JSON.parse(t);
    } catch (e) {
      return { set: null, errors: [`File JSON bị lỗi cú pháp: ${e.message}`], warnings: [] };
    }
  }
  return normalizeSet(raw, { fallbackTitle });
}

/* ---------- File mẫu ---------- */
export function examTemplate() {
  return {
    title: "Đề mẫu của tôi",
    description: "Sửa file này rồi nhập lại vào app. Xóa các unit không cần.",
    units: [
      {
        part: 5,
        questions: [
          {
            text: "Employees must submit their reports ------ the end of the month.",
            options: ["by", "until", "during", "since"],
            answer: "A",
            explanation: "by + mốc thời gian: chậm nhất vào lúc đó.",
            tags: ["Ngữ pháp · Giới từ"],
          },
        ],
      },
      {
        part: 6,
        passages: ["Please note that the office will be closed [1] renovation work."],
        questions: [
          { blank: 1, options: ["due to", "even if", "so that", "in case"], answer: "A", explanation: "due to + danh từ.", tags: ["Liên từ / giới từ"] },
        ],
      },
      {
        part: 7,
        passages: ["From: HR\nSubject: Training\nThe training session will be held on Wednesday at 10 A.M."],
        questions: [
          { text: "When will the training take place?", options: ["Monday", "Tuesday", "Wednesday", "Friday"], answer: "C", explanation: "Bài viết nêu rõ thứ Tư.", tags: ["Đọc hiểu · Chi tiết"] },
        ],
      },
      {
        part: 2,
        transcript: ["Where is the meeting room?"],
        questions: [{ options: ["On the third floor.", "At nine o'clock.", "Yes, I did."], answer: "A", explanation: "Where → nơi chốn.", tags: ["Hỏi – đáp · Where"] }],
      },
      {
        part: 3,
        transcript: ["Woman: Did you finish the report?", "Man: Almost. I'll send it this afternoon."],
        questions: [
          { text: "What will the man do this afternoon?", options: ["Send a report", "Visit a client", "Order lunch", "Cancel a meeting"], answer: "A", explanation: "Anh ấy nói sẽ gửi báo cáo.", tags: ["Nghe · Chi tiết"] },
        ],
      },
    ],
  };
}

export function examCsvTemplate() {
  return [
    "part,unit,passage,transcript,image,audio,question,A,B,C,D,answer,explanation,tags,blank",
    '5,,,,,,"The manager will ------ the plan on Friday.",present,presents,presenting,presented,A,"Sau will dùng động từ nguyên mẫu.","Ngữ pháp · Dạng động từ",',
    '2,,,"Where is the meeting room?",,,,"On the third floor.","At nine o\'clock.","Yes, I did.",,A,"Where hỏi nơi chốn.","Hỏi – đáp · Where",',
    '3,conv1,,"Woman: Did you finish the report? | Man: Almost. I\'ll send it this afternoon.",,,"What will the man do?","Send a report","Visit a client","Order lunch","Cancel a meeting",A,"Anh ấy sẽ gửi báo cáo.","Nghe · Chi tiết",',
    '3,conv1,,,,,"When will he do it?","This morning","This afternoon","Tomorrow","Next week",B,"Ông nói this afternoon.","Nghe · Chi tiết",',
  ].join("\n");
}
