// check-audio.mjs
import fs from "fs";
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
for (const f of fs
  .readdirSync("src/data/words")
  .filter((f) => f.endsWith(".json"))) {
  for (const w of JSON.parse(fs.readFileSync(`src/data/words/${f}`, "utf8"))) {
    if (!fs.existsSync(`public/audio/${slug(w.word.trim())}.mp3`))
      console.log("THIẾU:", w.word);
  }
}
