import { randomBytes, timingSafeEqual } from "node:crypto";
import type { WebSocket } from "ws";
import type { FastifyInstance } from "fastify";
import { config } from "./config.ts";

interface Room {
  id: string;
  token: string;
  expires: number;
  paired?: boolean;
  desktop?: WebSocket;
  phone?: WebSocket;
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class CameraRooms {
  rooms = new Map<string, Room>();
  private cleanup = setInterval(() => {
    for (const [id, r] of this.rooms)
      if (r.expires < Date.now()) this.remove(id);
  }, 30000).unref();
  create() {
    // One personal notebook camera at a time. A new QR revokes all previous pairs.
    for (const id of this.rooms.keys()) this.remove(id);
    const room: Room = {
      id: randomBytes(16).toString("hex"),
      token: randomBytes(32).toString("base64url"),
      expires: Date.now() + 10 * 60000,
    };
    this.rooms.set(room.id, room);
    return room;
  }
  remove(id: string) {
    const r = this.rooms.get(id);
    if (r) {
      r.desktop?.close(1000, "Disconnected");
      r.phone?.close(1000, "Disconnected");
      this.rooms.delete(id);
    }
  }
  attach(app: FastifyInstance, desktopSecret: string) {
    app.get("/signal", { websocket: true }, (socket, req) => {
      let room: Room | undefined;
      let role: "phone" | "desktop" | undefined;
      let count = 0;
      let windowStart = Date.now();
      const timeout = setTimeout(
        () => socket.close(1008, "Pairing required"),
        5000,
      );
      socket.on("message", (bytes) => {
        if (bytes.toString().length > 64000) {
          socket.close(1009);
          return;
        }
        if (Date.now() - windowStart > 1000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > 80) {
          socket.close(1008);
          return;
        }
        let message: {
          type: string;
          id?: string;
          token?: string;
          role?: string;
          payload?: unknown;
        };
        try {
          const parsed = JSON.parse(bytes.toString());
          if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof parsed.type !== "string"
          )
            throw new Error("Invalid signaling message");
          if (
            parsed.type === "join" &&
            (typeof parsed.id !== "string" ||
              !["phone", "desktop"].includes(parsed.role) ||
              (parsed.role === "phone" && typeof parsed.token !== "string"))
          )
            throw new Error("Invalid pairing fields");
          message = parsed;
        } catch {
          socket.close(1003);
          return;
        }
        if (!room) {
          const r = this.rooms.get(message.id ?? "");
          const origin = req.headers.origin;
          const expected = `${config.TLS_CERT ? "https" : "http"}://${req.headers.host}`;
          if (
            !origin ||
            (origin !== expected && origin !== config.PUBLIC_ORIGIN) ||
            message.type !== "join" ||
            !r ||
            r.expires < Date.now()
          ) {
            socket.close(1008, "Pairing expired");
            return;
          }
          if (
            message.role === "desktop" &&
            equalSecret(req.cookies.margin_session ?? "", desktopSecret)
          )
            role = "desktop";
          else if (
            message.role === "phone" &&
            equalSecret(message.token ?? "", r.token)
          )
            role = "phone";
          else {
            socket.close(1008, "Invalid pair");
            return;
          }
          if (r[role] && r[role]!.readyState === 1) {
            socket.close(1008, "Device already connected");
            return;
          }
          room = r;
          r[role] = socket;
          clearTimeout(timeout);
          if (role === "phone" && !r.paired) {
            r.expires = Date.now() + 2 * 60 * 60000;
            r.paired = true;
          }
          socket.send(
            JSON.stringify({ type: "joined", iceServers: config.iceServers }),
          );
          if (r.phone?.readyState === 1 && r.desktop?.readyState === 1) {
            r.phone.send(JSON.stringify({ type: "peer-ready" }));
            r.desktop.send(JSON.stringify({ type: "peer-ready" }));
          }
          return;
        }
        if (
          ["offer", "answer", "ice", "restart", "status"].includes(message.type)
        ) {
          const peer = role === "phone" ? room.desktop : room.phone;
          if (peer?.readyState === 1)
            peer.send(
              JSON.stringify({ type: message.type, payload: message.payload }),
            );
        }
      });
      socket.on("error", () => {});
      socket.on("close", () => {
        clearTimeout(timeout);
        if (room && role && room[role] === socket) {
          delete room[role];
          const peer = role === "phone" ? room.desktop : room.phone;
          if (peer?.readyState === 1)
            peer.send(JSON.stringify({ type: "peer-left" }));
        }
      });
    });
  }
  close() {
    clearInterval(this.cleanup);
    for (const id of this.rooms.keys()) this.remove(id);
  }
}
