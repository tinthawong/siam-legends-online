-- กระเป๋า: ไอเท็มของตัวละคร (key ใน shared/items.ts) และจำนวน
CREATE TABLE inventory (
  user_id TEXT NOT NULL,
  item    TEXT NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
);
