import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { loadWords } from "./lib/words";
import { initStorage } from "./lib/storage";
import { requestPersistence } from "./lib/persist";

const root = document.getElementById("root");

// Nạp dữ liệu từ vựng, tiến độ (IndexedDB) và mã giao diện song song, rồi mới hiển thị app
function start() {
  return Promise.all([loadWords(), initStorage(), import("./App.jsx")]).then(([, , { default: App }]) => {
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}

function showError() {
  root.innerHTML =
    '<div style="padding:32px;text-align:center;font-family:system-ui,sans-serif">' +
    "<p>Không tải được dữ liệu từ vựng. Kiểm tra kết nối mạng rồi thử lại.</p>" +
    '<button id="retry" style="padding:10px 20px;font-size:16px">Thử lại</button></div>';
  document.getElementById("retry").onclick = () => {
    root.textContent = "Đang tải…";
    start().catch(showError);

// Xin lưu trữ bền vững ở lần chạm đầu tiên (cần thao tác của người dùng ở một số trình duyệt)
window.addEventListener("pointerdown", () => requestPersistence(), { once: true });
  };
}

start().catch(showError);
