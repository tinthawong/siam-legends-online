import type { Net } from "./net";
import type { ServerMsg } from "../../shared/protocol";
import { ITEMS } from "../../shared/items";
import { MOBS } from "../../shared/game";
import { NPCS, QUESTS, progressOf, type QuestDef, type QuestLog } from "../../shared/quests";

// หน้าต่างคุยกับ NPC (#dialog) และรายการเควส (#quest-panel) — server ตัดสินทุกอย่าง หน้านี้แค่แสดงและส่งปุ่มที่กด

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** เป้าหมายของเควสเป็นข้อความ เช่น "ล่าปูนา 3 / 10" */
function goal(q: QuestDef, log: QuestLog, inv: (item: string) => number): string {
  if (q.type === "talk") return `ไปคุยกับ${NPCS[q.target]?.name ?? q.target}`;
  const n = progressOf(q, log, inv);
  const what = q.type === "kill" ? `ล่า${MOBS[q.target]?.name ?? q.target}` : `หา${ITEMS[q.target]?.name ?? q.target}`;
  return `${what} ${n} / ${q.count}`;
}

function rewardText(q: QuestDef): string {
  const parts: string[] = [];
  if (q.reward.exp) parts.push(`${q.reward.exp} EXP`);
  if (q.reward.money) parts.push(`${q.reward.money} เบี้ย`);
  for (const i of q.reward.items) parts.push(`${ITEMS[i.item]?.name ?? i.item} ×${i.count}`);
  return parts.join(" · ");
}

export function bindQuests(net: Net, invCount: (item: string) => number) {
  let log: QuestLog = { active: {}, done: [] };
  let justDone = false; // เพิ่งส่งเควส: ถ้า NPC ไม่มีงานต่อ ไม่ต้องเปิดหน้า "ไม่มีงาน" ซ้ำ
  const dlg = $("dialog"), panel = $("quest-panel");

  const closeDialog = () => { dlg.hidden = true; };
  $("dlg-close").onclick = closeDialog;

  const renderList = () => {
    const list = $("quest-list");
    list.replaceChildren();
    const active = Object.keys(log.active).map((k) => QUESTS[k]).filter(Boolean);
    for (const q of active) {
      const li = document.createElement("li");
      const name = document.createElement("b");
      name.textContent = q.name;
      const g = document.createElement("span");
      g.textContent = goal(q, log, invCount);
      const from = document.createElement("small");
      from.textContent = `ส่งที่: ${NPCS[q.turnIn]?.name ?? q.turnIn}`;
      li.append(name, g, from);
      list.appendChild(li);
    }
    $("quest-empty").hidden = active.length > 0;
    $("quest-done-count").textContent = String(log.done.length);
  };
  // ปุ่มปิด: ใช้ .panel-close ของเมนู (main.ts)

  return {
    setLog(next: QuestLog) { log = next; renderList(); },
    /** กระเป๋าเปลี่ยน → เควสเก็บของนับใหม่ */
    refresh: renderList,
    openList() { renderList(); },
    dialog(m: Extract<ServerMsg, { t: "dialog" }>) {
      const after = justDone;
      justDone = false;
      if (after && m.stage === "idle") return;
      const npc = NPCS[m.npc];
      const q = m.quest ? QUESTS[m.quest] : null;
      $("dlg-npc").textContent = npc?.name ?? "";
      $("dlg-quest").textContent = q?.name ?? "";
      $("dlg-quest").hidden = !q;
      const text = !q ? "ตอนนี้ยังไม่มีงานให้ช่วย" : m.stage === "offer" ? q.text.offer
        : m.stage === "done" ? q.text.done : q.text.progress || "ยังทำไม่เสร็จเลยหรือ";
      $("dlg-text").textContent = text;
      // เป้าหมาย / รางวัล
      const info = $("dlg-info");
      info.hidden = !q || m.stage === "idle";
      if (q) info.textContent = m.stage === "done" ? `รางวัล: ${rewardText(q)}` : `${goal(q, log, invCount)} · รางวัล: ${rewardText(q)}`;
      const ok = $<HTMLButtonElement>("dlg-ok");
      ok.hidden = !q || m.stage === "progress";
      ok.textContent = m.stage === "done" ? "รับรางวัล" : "รับเควส";
      ok.onclick = () => {
        if (!q) return;
        ok.disabled = true;
        justDone = m.stage === "done";
        net.send(m.stage === "done" ? { t: "quest_done", id: q.id } : { t: "quest_accept", id: q.id });
        closeDialog(); // server ตอบกลับด้วยหน้าคุยถัดไป (ถ้ามี)
      };
      ok.disabled = false;
      $("dlg-close").textContent = m.stage === "offer" ? "ไว้ทีหลัง" : "ปิด";
      dlg.hidden = false;
    },
  };
}
