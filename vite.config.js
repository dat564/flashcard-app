import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" → build chạy được ở bất kỳ đường dẫn nào
// (GitHub Pages dạng user.github.io/ten-repo/, thư mục con, hay tên miền riêng).
// https://vite.dev
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 900,
  },
});
