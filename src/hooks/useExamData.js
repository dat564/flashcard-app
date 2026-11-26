import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as store from "../lib/examStore";
import { normalizeSet, parseExamText } from "../lib/examSchema";
import { applyMistakes } from "../lib/examEngine";

const builtinLoaders = import.meta.glob("../data/exam/*.json");
const MAX_ATTEMPTS = 400;

// Đề dựng sẵn (src/data/exam/*.json) + đề người dùng nhập + lịch sử làm bài + câu sai.
// Chỉ nạp khi mở tab Luyện thi lần đầu.
export function useExamData(enabled = true) {
  const [s, setS] = useState({ ready: false, builtin: [], imported: [], attempts: [], mistakes: {} });
  const ref = useRef(s);
  ref.current = s;

  useEffect(() => {
    if (!enabled || s.ready) return;
    let off = false;
    (async () => {
      const builtin = [];
      for (const [path, load] of Object.entries(builtinLoaders).sort()) {
        try {
          const m = await load();
          const id = path.split("/").pop().replace(/\.json$/, "");
          const r = normalizeSet(m.default || m, { fixedId: id, source: "builtin" });
          if (r.set) builtin.push(r.set);
        } catch {
          /* bỏ qua file đề lỗi */
        }
      }
      let data = { sets: [], attempts: [], mistakes: {} };
      try {
        data = await store.loadExamData();
      } catch {
        /* dùng dữ liệu rỗng */
      }
      if (!off)
        setS({
          ready: true,
          builtin,
          imported: data.sets.filter((x) => x.source !== "builtin"),
          attempts: data.attempts,
          mistakes: data.mistakes,
        });
    })();
    return () => {
      off = true;
    };
  }, [enabled, s.ready]);

  const sets = useMemo(() => [...s.builtin, ...s.imported], [s.builtin, s.imported]);
  const units = useMemo(
    () => sets.flatMap((set) => set.units.map((u) => ({ ...u, setId: set.id, setTitle: set.title }))),
    [sets]
  );

  // Nhập từ nội dung file; trả về { ok, set, errors, warnings }
  const importText = useCallback(async (text, filename) => {
    const r = parseExamText(text, filename);
    if (!r.set) return { ok: false, errors: r.errors, warnings: r.warnings };
    await store.saveSet(r.set);
    setS((p) => ({ ...p, imported: [...p.imported, r.set] }));
    return { ok: true, set: r.set, errors: r.errors, warnings: r.warnings };
  }, []);

  const removeSet = useCallback(async (id) => {
    await store.deleteSet(id);
    setS((p) => ({ ...p, imported: p.imported.filter((x) => x.id !== id) }));
  }, []);

  // Ghi lại một lần làm bài và cập nhật danh sách câu sai
  const record = useCallback(async (attempt, doneUnits, answers) => {
    const cur = ref.current;
    const attempts = [...cur.attempts, attempt].slice(-MAX_ATTEMPTS);
    const mistakes = applyMistakes(cur.mistakes, doneUnits, answers, attempt.t);
    setS((p) => ({ ...p, attempts, mistakes }));
    await Promise.all([store.saveAttempts(attempts), store.saveMistakes(mistakes)]);
  }, []);

  const exportBackup = useCallback(() => store.exportExamBackup(), []);
  const importBackup = useCallback(async (obj) => {
    if (obj?.format !== "toeic-recall-exam-backup") throw new Error("Đây không phải file sao lưu luyện thi.");
    const cur = ref.current;
    const merged = store.mergeExamBackup(
      { sets: cur.imported, attempts: cur.attempts, mistakes: cur.mistakes },
      obj
    );
    for (const set of merged.sets) await store.saveSet(set);
    await Promise.all([store.saveAttempts(merged.attempts), store.saveMistakes(merged.mistakes)]);
    setS((p) => ({ ...p, imported: merged.sets, attempts: merged.attempts, mistakes: merged.mistakes }));
  }, []);

  return { ...s, sets, units, importText, removeSet, record, exportBackup, importBackup };
}
