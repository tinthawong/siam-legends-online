// npm run dev: คำสั่งเดียวสำหรับทำงานบนเครื่อง ใช้พอร์ตเดียว http://localhost:8787 (ตรงกับ redirect ของ Supabase)
// 1) ใช้ migration ใหม่กับ D1 บนเครื่อง (ถ้าไม่มีอะไรใหม่ก็ผ่านไปเฉย ๆ)
// 2) vite build --watch: แก้โค้ด client แล้ว build ใหม่ลง client/dist เอง (รอราว 10 วินาที แล้วกดรีเฟรชหน้าเกม)
// 3) wrangler dev: server + เสิร์ฟหน้าเกมจาก client/dist แก้โค้ด server แล้วโหลดใหม่เอง
// กด Ctrl+C ครั้งเดียวปิดทั้งคู่
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const env = { ...process.env, CI: "true" }; // wrangler d1 migrations apply ไม่ถามยืนยัน
const once = (cmd) => {
  const r = spawnSync(cmd, { shell: true, stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

once("npx wrangler d1 migrations apply siam-legends-db --local");
if (!existsSync("client/dist/index.html")) once("npx vite build --config client/vite.config.ts");

const run = (cmd) => spawn(cmd, { shell: true, stdio: "inherit", env });
const procs = [run("npx vite build --watch --config client/vite.config.ts"), run("npx wrangler dev")];
console.log("\n  เปิดเกมที่ http://localhost:8787  (แก้โค้ดแล้วรอ build เสร็จ กดรีเฟรช · Ctrl+C เพื่อปิด)\n");

let closing = false;
const stop = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const p of procs) if (p.exitCode === null) p.kill();
  process.exit(code);
};
for (const p of procs) p.on("exit", (code) => stop(code ?? 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
