import { useEffect, useRef, useState } from "react";
import { loadProgress, saveProgress } from "../lib/storage";

// State tiến độ + lưu vào IndexedDB (xem lib/storage.js).
// Mỗi lần chấm thẻ chỉ ghi thẻ thay đổi nên có thể lưu gần như ngay (trễ 300 ms để gộp các thay đổi liên tiếp).
export function useProgress() {
  const [progress, setProgress] = useState(loadProgress);
  const ref = useRef(progress);

  useEffect(() => {
    ref.current = progress;
    const t = setTimeout(() => saveProgress(ref.current), 300);
    return () => clearTimeout(t);
  }, [progress]);

  // Lưu ngay khi ẩn tab / đóng trang
  useEffect(() => {
    const flush = () => saveProgress(ref.current);
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return [progress, setProgress];
}
