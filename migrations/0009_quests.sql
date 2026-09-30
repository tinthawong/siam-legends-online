-- เควส: สถานะเก็บเป็น JSON {"active": {"q003": 4}, "done": ["q001"]} (shared/quests.ts)
ALTER TABLE characters ADD COLUMN quests TEXT NOT NULL DEFAULT '{}';
