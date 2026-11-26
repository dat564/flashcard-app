// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  deleteSet,
  exportExamBackup,
  loadExamData,
  mergeExamBackup,
  saveAttempts,
  saveMistakes,
  saveSet,
} from "../src/lib/examStore";

const set = (id) => ({ id, title: id, source: "import", units: [] });

describe("examStore (IndexedDB)", () => {
  it("lưu và đọc lại đề, lịch sử, câu sai", async () => {
    await saveSet(set("s1"));
    await saveSet(set("s2"));
    await saveAttempts([{ t: 1 }, { t: 2 }]);
    await saveMistakes({ q1: { unitId: "u", t: 1 } });
    const d = await loadExamData();
    expect(d.sets.map((s) => s.id).sort()).toEqual(["s1", "s2"]);
    expect(d.attempts).toHaveLength(2);
    expect(d.mistakes.q1.unitId).toBe("u");
  });
  it("xóa đề", async () => {
    await deleteSet("s1");
    expect((await loadExamData()).sets.map((s) => s.id)).toEqual(["s2"]);
  });
  it("lịch sử chỉ giữ 400 lần gần nhất", async () => {
    await saveAttempts(Array.from({ length: 450 }, (_, i) => ({ t: i })));
    const a = (await loadExamData()).attempts;
    expect(a).toHaveLength(400);
    expect(a[0].t).toBe(50);
  });
  it("sao lưu không chứa đề dựng sẵn", async () => {
    await saveSet({ id: "b", title: "b", source: "builtin", units: [] });
    const bk = await exportExamBackup();
    expect(bk.format).toBe("toeic-recall-exam-backup");
    expect(bk.sets.some((s) => s.id === "b")).toBe(false);
  });
});

describe("mergeExamBackup", () => {
  it("gộp không ghi đè, bỏ lần làm bài trùng", () => {
    const cur = { sets: [set("a")], attempts: [{ t: 1 }, { t: 3 }], mistakes: { q1: { unitId: "x", t: 5 } } };
    const m = mergeExamBackup(cur, {
      sets: [set("a"), set("b")],
      attempts: [{ t: 1 }, { t: 2 }],
      mistakes: { q1: { unitId: "y", t: 1 }, q2: { unitId: "z", t: 1 } },
    });
    expect(m.sets.map((s) => s.id)).toEqual(["a", "b"]);
    expect(m.attempts.map((a) => a.t)).toEqual([1, 2, 3]);
    expect(m.mistakes.q1.unitId).toBe("x");
    expect(m.mistakes.q2).toBeDefined();
  });
});
