import { useEffect, useState } from "react";
import { THEME_KEY } from "../lib/constants";
import { setMeta } from "../lib/utils";

// Áp giao diện đã lưu ngay khi tải để không bị nháy sáng → tối
try {
  const t = localStorage.getItem(THEME_KEY);
  if (t === "light" || t === "dark")
    document.documentElement.setAttribute("data-theme", t);
} catch {
  /* bỏ qua */
}

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "auto"
  );
  const [sysDark, setSysDark] = useState(
    () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    const dark = theme === "dark" || (theme === "auto" && sysDark);
    setMeta("theme-color", dark ? "#0f1120" : "#ffffff");
  }, [theme, sysDark]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const h = (e) => setSysDark(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);

  return { theme, setTheme };
}
