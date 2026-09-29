-- ตัวละคร: 1 บัญชี Supabase = 1 ตัวละคร
CREATE TABLE characters (
  user_id    TEXT PRIMARY KEY,              -- id ผู้ใช้จาก Supabase Auth
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  level      INTEGER NOT NULL DEFAULT 1,
  exp        INTEGER NOT NULL DEFAULT 0,
  map        TEXT NOT NULL,
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
