import { useEffect, useRef, useState } from "react";
import { loadProgress, saveProgress } from "../lib/storage";

// State tiến độ + lưu localStorage lúc rảnh (stringify 3600 thẻ ngay khi chấm sẽ làm khựng animation)
export function useProgress() {
  const [progress, setProgress] = useState(loadProgress);
  const ref = useRef(progress);

  useEffect(() => {
    ref.current = progress;
    const save = () => saveProgress(ref.current);
    const t = setTimeout(() => {
      if (window.requestIdleCallback)
        window.requestIdleCallback(save, { timeout: 2000 });
      else save();
    }, 700);
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

  // Xin trình duyệt không tự xóa dữ liệu khi thiếu dung lượng
  useEffect(() => {
    navigator.storage?.persist?.();
  }, []);

  return [progress, setProgress];
}
