// npm run dev: คำสั่งเดียวสำหรับทำงานบนเครื่อง
// 1) ใช้ migration ใหม่กับ D1 บนเครื่อง (ถ้าไม่มีอะไรใหม่ก็ผ่านไปเฉย ๆ)
// 2) เปิด wrangler dev (server :8787) คู่กับ vite (หน้าเกม :5173 แก้ client แล้วหน้าเว็บโหลดใหม่เอง ไม่ต้อง build)
//    แก้โค้ด server → wrangler โหลดใหม่เอง
// กด Ctrl+C ครั้งเดียวปิดทั้งคู่
import { spawn, spawnSync } from "node:child_process";

const env = { ...process.env, CI: "true" }; // wrangler d1 migrations apply ไม่ถามยืนยัน
const run = (cmd) => spawn(cmd, { shell: true, stdio: "inherit", env });

const mig = spawnSync("npx wrangler d1 migrations apply siam-legends-db --local", { shell: true, stdio: "inherit", env });
if (mig.status !== 0) process.exit(mig.status ?? 1);

const procs = [run("npx wrangler dev"), run("npx vite --config client/vite.config.ts")];
console.log("\n  เปิดเกมที่ http://localhost:5173  (Ctrl+C เพื่อปิด)\n");

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
