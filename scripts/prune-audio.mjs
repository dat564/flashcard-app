// Xóa file mp3 không còn từ nào dùng. Chạy: npm run prune-audio  (thêm --dry để chỉ xem)
import fs from "fs";
import path from "path";
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const dry = process.argv.includes("--dry");
const need = new Set();
for (const f of fs.readdirSync("src/data/words").filter((f) => f.endsWith(".json")))
  for (const w of JSON.parse(fs.readFileSync(`src/data/words/${f}`, "utf8")))
    if (w.word && w.word.trim()) need.add(slug(w.word.trim()));
let n = 0, bytes = 0;
for (const f of fs.readdirSync("public/audio").filter((f) => f.endsWith(".mp3"))) {
  if (need.has(f.slice(0, -4))) continue;
  const p = path.join("public/audio", f);
  bytes += fs.statSync(p).size;
  n++;
  if (!dry) fs.unlinkSync(p);
}
console.log(`${dry ? "[dry] " : ""}${n} file thừa, ${(bytes / 1e6).toFixed(1)} MB`);
