import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { loadWords } from "./lib/words";

const root = document.getElementById("root");

// Nạp dữ liệu từ vựng và mã giao diện song song, rồi mới hiển thị app
function start() {
  return Promise.all([loadWords(), import("./App.jsx")]).then(([, { default: App }]) => {
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
  };
}

start().catch(showError);
