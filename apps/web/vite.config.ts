import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: process.env.API_TARGET ?? "http://127.0.0.1:8081",
        changeOrigin: false,
        rewrite: path => path.replace(/^\/api/, ""),
      },
    },
  },
});
