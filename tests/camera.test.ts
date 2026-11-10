import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import { CameraRooms } from "../server/camera";

test("signaling rejects malformed credentials and origins; pending pairing expires independently of the connected desktop", async (t) => {
  const app = Fastify();
  await app.register(cookie);
  await app.register(websocket);
  const rooms = new CameraRooms();
  rooms.attach(app, "desktop-secret");
  await app.ready();
  t.after(async () => {
    rooms.close();
    await app.close();
  });
  const room = rooms.create();
  const pendingExpiry = room.expires;
  const headers = { host: "localhost", origin: "http://localhost" };
  for (const payload of [
    null,
    { type: "join", id: room.id, role: "phone", token: 42 },
    { type: "join", id: room.id, role: "phone", token: "incorrect" },
  ]) {
    const ws = await app.injectWS("/signal", { headers });
    const closed = once(ws, "close");
    ws.send(JSON.stringify(payload));
    const [code] = await closed;
    assert.ok([1003, 1008].includes(code));
  }
  const untrusted = await app.injectWS("/signal", {
    headers: { ...headers, origin: "https://untrusted.invalid" },
  });
  const rejected = once(untrusted, "close");
  untrusted.send(
    JSON.stringify({
      type: "join",
      id: room.id,
      role: "phone",
      token: room.token,
    }),
  );
  assert.equal((await rejected)[0], 1008);
  const desktop = await app.injectWS("/signal", {
    headers: { ...headers, cookie: "margin_session=desktop-secret" },
  });
  const joined = once(desktop, "message");
  desktop.send(JSON.stringify({ type: "join", id: room.id, role: "desktop" }));
  assert.equal(JSON.parse(String((await joined)[0])).type, "joined");
  assert.equal(room.expires, pendingExpiry);
  const phone = await app.injectWS("/signal", { headers });
  const phoneJoined = once(phone, "message");
  phone.send(
    JSON.stringify({
      type: "join",
      id: room.id,
      role: "phone",
      token: room.token,
    }),
  );
  await phoneJoined;
  assert.equal(room.paired, true);
  assert.ok(room.expires > pendingExpiry);
  const desktopClosed = once(desktop, "close"),
    phoneClosed = once(phone, "close");
  rooms.create();
  await Promise.all([desktopClosed, phoneClosed]);
  assert.equal(rooms.rooms.has(room.id), false);
});
