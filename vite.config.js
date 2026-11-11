import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev
export default defineConfig({
  plugins: [react()],
  base: "/toeic-flashcard-react/", // 👈 Thêm chính xác dòng này (nhớ có dấu gạch chéo ở đầu và cuối)
});
