import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const clientDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: clientDir,
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    host: true, // เปิดจากมือถือในวง LAN เดียวกันได้
    fs: { allow: [repoRoot] },
    proxy: {
      "/ws": { target: "ws://localhost:8787", ws: true },
      "/api": "http://localhost:8787",
    },
  },
});
