// Kiểm tra dữ liệu từ vựng trước khi build. Chạy: npm run check
import fs from "fs";
let errors = 0, warns = 0;
const seenId = new Set(), seenWord = new Map();
for (const f of fs.readdirSync("src/data/words").filter((f) => f.endsWith(".json"))) {
  for (const w of JSON.parse(fs.readFileSync(`src/data/words/${f}`, "utf8"))) {
    const at = `${f}#${w.id}`;
    const err = (m) => (errors++, console.log(`LỖI  ${at}: ${m}`));
    const warn = (m) => (warns++, console.log(`CẢNH BÁO ${at} (${w.word}): ${m}`));
    if (typeof w.id !== "number") err("id không phải số");
    if (seenId.has(w.id)) err("trùng id");
    seenId.add(w.id);
    if (!w.word || !w.word.trim()) err("thiếu 'word'");
    if (!w.meaning) err("thiếu 'meaning'");
    if (!w.example) err("thiếu 'example'");
    const k = (w.word || "").trim().toLowerCase();
    if (k && seenWord.has(k)) warn(`trùng từ với id ${seenWord.get(k)} (bị bỏ khi nạp)`);
    seenWord.set(k, w.id);
    if (!w.ipa) warn("thiếu phiên âm");
    if (!w.pos) warn("thiếu từ loại");
  }
}
console.log(`\n${errors} lỗi, ${warns} cảnh báo`);
process.exit(errors ? 1 : 0);
