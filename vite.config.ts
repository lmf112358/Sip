import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Tauri 期望固定端口，失败直接报错而不是悄悄换端口
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: ["chrome110", "safari15"],
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        reminder: resolve(__dirname, "reminder.html"),
        toast: resolve(__dirname, "toast.html"),
      },
    },
  },
});
