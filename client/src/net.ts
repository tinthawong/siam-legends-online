import { CLOSE_KICKED, type ClientMsg, type ServerMsg } from "../../shared/protocol";

export class Net {
  private ws: WebSocket;
  private handler: ((m: ServerMsg) => void) | null = null;
  private queue: ServerMsg[] = [];
  onClose: ((code: number) => void) | null = null;

  constructor(token: string) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.t === "kicked") { this.close(); this.onClose?.(CLOSE_KICKED); return; }
      if (this.handler) this.handler(m);
      else this.queue.push(m); // ข้อความที่มาก่อน scene พร้อม
    };
    this.ws.onclose = (ev) => this.onClose?.(ev.code);
  }

  listen(h: (m: ServerMsg) => void) {
    this.handler = h;
    for (const m of this.queue) h(m);
    this.queue = [];
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.ws.onclose = null;
    this.ws.close();
  }
}
