import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { loadWords } from "./lib/words";
import { initStorage } from "./lib/storage";
import { requestPersistence } from "./lib/persist";

const root = document.getElementById("root");
const splash = document.getElementById("splash"); // màn hình chờ vẽ sẵn trong index.html

// Ẩn màn hình chờ (mờ dần) sau khi app đã vẽ xong khung hình đầu tiên
function hideSplash() {
  if (!splash) return;
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 450);
}

// Đợi font tải xong (tối đa maxMs) rồi mới mở app, để chữ không nhảy từ font hệ thống sang font của app.
// Mất mạng / bị chặn thì bỏ qua ngay, không bắt người dùng chờ.
function fontsReady(maxMs = 1500) {
  const link = document.getElementById("gfonts");
  const cssLoaded = new Promise((res) => {
    if (!link || link.dataset.done) return res(); // đã xong (hoặc lỗi) từ trước
    link.addEventListener("load", res, { once: true });
    link.addEventListener("error", res, { once: true });
  });
  const nextFrames = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const loaded = cssLoaded.then(nextFrames).then(() => document.fonts?.ready);
  return Promise.race([loaded, new Promise((r) => setTimeout(r, maxMs))]).catch(() => {});
}

// Nạp dữ liệu từ vựng, tiến độ (IndexedDB) và mã giao diện song song, rồi mới hiển thị app
function start() {
  return Promise.all([loadWords(), initStorage(), import("./App.jsx")]).then(([, , { default: App }]) => {
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    fontsReady().then(() => requestAnimationFrame(() => requestAnimationFrame(hideSplash)));
  });
}

function showError(err) {
  console.error("Không khởi động được app:", err);
  if (!splash) {
    root.textContent = "Không tải được dữ liệu từ vựng. Hãy tải lại trang.";
    return;
  }
  splash.classList.add("error");
  document.getElementById("retry").onclick = () => {
    splash.classList.remove("error");
    start().catch(showError);
  };
}

start().catch(showError);

// Xin lưu trữ bền vững ở lần chạm đầu tiên (cần thao tác của người dùng ở một số trình duyệt)
window.addEventListener("pointerdown", () => requestPersistence(), { once: true });
