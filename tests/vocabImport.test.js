import { describe, it, expect } from "vitest";
import { parseVocabFile } from "../src/vocabImport";

const file = (name, text) => new File([text], name, { type: "text/plain" });

describe("parseVocabFile", () => {
  it("đọc CSV có dòng tiêu đề, nhận ra phiên âm và từ loại", async () => {
    const csv = [
      "Từ vựng,Phiên âm,Từ loại,Nghĩa,Ví dụ",
      'bench,/bentʃ/,n,ghế dài,"Sit on the bench, please."',
      "abandon,/əˈbændən/,v,từ bỏ,They abandoned it.",
    ].join("\n");
    const { words, skipped } = await parseVocabFile(file("a.csv", csv));
    expect(skipped).toBe(1); // dòng tiêu đề được đếm là dòng bị bỏ qua
    expect(words).toHaveLength(2);
    expect(words[0]).toMatchObject({
      word: "bench", ipa: "/bentʃ/", pos: "n", meaning: "ghế dài",
      example: "Sit on the bench, please.",
    });
  });

  it("đọc TSV và bỏ từ trùng", async () => {
    const tsv = "bench\tghế dài\nBench\tghế dài\nagenda\tchương trình";
    const { words } = await parseVocabFile(file("a.tsv", tsv));
    expect(words.map((w) => w.word)).toEqual(["bench", "agenda"]);
  });

  it("đọc .txt dạng một dòng: từ /ipa/ (loại) nghĩa", async () => {
    const { words } = await parseVocabFile(file("a.txt", "- **Bench** /bentʃ/ (n) ghế dài"));
    expect(words[0]).toMatchObject({ word: "Bench", ipa: "/bentʃ/", pos: "n", meaning: "ghế dài" });
  });

  it("từ loại viết đầy đủ được chuẩn hóa", async () => {
    const { words } = await parseVocabFile(file("a.csv", "run,verb,chạy"));
    expect(words[0].pos).toBe("v");
  });

  it("dòng chỉ có một cột (thiếu nghĩa) bị bỏ qua và được đếm", async () => {
    const { words, skipped } = await parseVocabFile(file("a.csv", "bench,ghế dài\nonlyword"));
    expect(words).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("từ chối định dạng không hỗ trợ", async () => {
    await expect(parseVocabFile(file("a.pdf", "x"))).rejects.toThrow(/docx|csv/);
  });
});
