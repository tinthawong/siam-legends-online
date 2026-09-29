# Siam Legends Online — MMORPG (Phaser + Cloudflare + Supabase Auth)

## ตั้งค่าครั้งแรก
1. สร้างโปรเจกต์ที่ supabase.com แล้วเปิด Project Settings → API
2. ใส่ Project URL และ anon/publishable key ใน `wrangler.toml` ส่วน `[vars]`
3. Authentication → URL Configuration: ตั้ง Site URL เป็น `http://localhost:8787`
   และเพิ่ม Redirect URL `http://localhost:8787` กับ `http://localhost:5173`
4. (ถ้าจะใช้ Google) Authentication → Providers → Google ใส่ Client ID/Secret จาก Google Cloud Console

```bash
npm install
npm run db:migrate     # สร้างตาราง characters ใน D1 บนเครื่อง (ทำครั้งเดียว)
npm run build
npx wrangler dev       # เปิด http://localhost:8787
```

แก้โค้ด client แบบเห็นผลทันที (2 terminal): `npx wrangler dev` กับ `npm run dev:client` (เปิด :5173)

## Deploy ขึ้น Cloudflare
```bash
npx wrangler login
npx wrangler d1 create siam-legends-db     # เอา database_id ที่ได้ไปแทน "local-dev" ใน wrangler.toml
npm run db:migrate:remote
npm run deploy
```
แล้วเพิ่ม URL `https://siam-legends.<ชื่อบัญชี>.workers.dev` ใน Redirect URLs ของ Supabase

## โครงสร้าง
- `shared/` แมพ, A*, ค่าตัวเลขเกม, รูปแบบข้อความ (ใช้ทั้งสองฝั่ง)
- `server/src/index.ts` Worker: ตรวจ token กับ Supabase, API ตัวละคร, ส่งผู้เล่นเข้าแมพ
- `server/src/MapRoom.ts` Durable Object 1 ตัว = 1 แมพ: game loop, AI มอน, ตี, auto, บันทึก D1
- `client/src/main.ts` ล็อกอิน / สร้างตัวละคร / เริ่มเกม
- `client/src/GameScene.ts` Phaser
- `migrations/` โครงสร้างตาราง D1

## กติกาที่ server บังคับ
- ต้องมี token จาก Supabase ที่ยังไม่หมดอายุ ถึงเชื่อมต่อเกมได้
- 1 บัญชี = 1 ตัวละคร, ชื่อห้ามซ้ำ (ไม่สนตัวพิมพ์เล็ก-ใหญ่)
- บัญชีเดียวกันเข้าซ้ำ → การเชื่อมต่อเก่าถูกปิด
- บันทึกเลเวล/EXP/ตำแหน่ง ทุก 30 วินาที และตอนออกจากเกม
- เดินเอง = ยกเลิกเป้าหมายและ auto; auto ทำงานเฉพาะตอนเชื่อมต่อ
