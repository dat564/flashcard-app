import { useLayoutEffect, useRef } from "react";
import { EASE_BACK, EASE_OUT } from "../lib/constants";
import { swipeAt } from "../lib/utils";

// Vuốt thẻ: ghi thẳng vào DOM (không re-render khi kéo).
//   onTap()        chạm nhẹ = lật thẻ
//   onDecide(r)    kéo/búng đủ xa: r = "good" | "again"
// index/session: khi đổi thì dọn trạng thái vuốt (chạy trước khi trình duyệt vẽ nên không nháy)
export function useSwipe({ index, session, onTap, onDecide }) {
  const dragRef = useRef(null);
  const stageRef = useRef(null);
  const swipeRef = useRef(null);
  const dxRef = useRef(0);
  const rafRef = useRef(0);
  const leavingRef = useRef(null);

  // thẻ, bóng ở rìa, và thẻ phía sau nhô lên
  const paint = (d, transition = "none") => {
    const el = swipeRef.current,
      st = stageRef.current;
    if (!el || !st) return;
    el.style.transition = transition;
    el.style.transform = `translate(${d}px, ${Math.abs(d) * 0.02}px) rotate(${
      d * 0.035
    }deg)`;
    const p = Math.min(1, Math.abs(d) / swipeAt());
    st.style.setProperty("--yes", d > 0 ? p : 0);
    st.style.setProperty("--no", d < 0 ? p : 0);
    st.style.setProperty("--lift", p);
  };

  const resetSwipe = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    dxRef.current = 0;
    dragRef.current = null;
    leavingRef.current = null;
    paint(0);
  };

  // Bay thẻ ra khỏi màn hình
  const flyOut = (rating) => {
    leavingRef.current = rating;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    paint(
      (rating === "good" ? 1 : -1) * Math.max(700, window.innerWidth),
      EASE_OUT
    );
  };

  useLayoutEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    dxRef.current = 0;
    dragRef.current = null;
    leavingRef.current = null;
    const st = stageRef.current;
    if (st)
      ["--yes", "--no", "--lift"].forEach((k) => st.style.setProperty(k, 0));
  }, [index, session]);

  const onPointerDown = (e) => {
    if (leavingRef.current || e.target.closest("button")) return;
    dragRef.current = {
      x: e.clientX,
      moved: false,
      lx: e.clientX,
      lt: performance.now(),
      v: 0,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const s = dragRef.current;
    if (!s) return;
    const d = e.clientX - s.x;
    if (!s.moved && Math.abs(d) < 8) return;
    s.moved = true;
    dxRef.current = d;
    // vận tốc (px/ms) để nhận ra cú "búng" nhanh dù kéo chưa tới ngưỡng
    const now = performance.now();
    const dt = now - s.lt;
    if (dt > 0) {
      s.v = s.v * 0.6 + ((e.clientX - s.lx) / dt) * 0.4;
      s.lx = e.clientX;
      s.lt = now;
    }
    if (!rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        paint(dxRef.current);
      });
  };

  const onPointerUp = (e) => {
    const s = dragRef.current;
    dragRef.current = null;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (!s) return;
    if (e.type === "pointercancel") return paint(0, EASE_BACK);
    if (!s.moved) return onTap();
    const d = dxRef.current;
    const fling =
      Math.abs(s.v) > 0.5 &&
      Math.abs(d) > 30 &&
      Math.sign(s.v) === Math.sign(d);
    if (Math.abs(d) >= swipeAt() || fling) onDecide(d > 0 ? "good" : "again");
    else paint(0, EASE_BACK);
  };

  return {
    stageRef,
    swipeRef,
    leavingRef,
    resetSwipe,
    flyOut,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
