import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app";
import { Store } from "../server/store";
import { result } from "./fixtures";
import type { TutorProvider } from "../server/provider";

test("browser → tutor API → SQLite commits a validated turn; failure rolls back both messages and learning state", async (t) => {
  const store = new Store(":memory:");
  let fail = false;
  const provider: TutorProvider = {
    models: async () => [],
    respond: async ({ onText, user }) => {
      onText("Partial response");
      if (fail) throw new Error("Simulated interrupted upstream");
      return result({
        evidence: [
          {
            concept: "Independence",
            observation:
              "The learner correctly distinguishes conditioning sets.",
            kind: "user-quote",
            quote: user.text,
            demonstration: "independent",
            task: "explanation",
          },
        ],
      });
    },
  };
  const { app } = await buildApp({ test: true, store, provider });
  t.after(() => app.close());
  const login = await app.inject({
    method: "POST",
    url: "/api/session",
    headers: { host: "localhost:3210" },
  });
  assert.equal(login.statusCode, 200);
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/i);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  const headers = { host: "localhost:3210", cookie };
  const unauth = await app.inject({ url: "/api/bootstrap" });
  assert.equal(unauth.statusCode, 401);
  const lan = await app.inject({
    method: "POST",
    url: "/api/session",
    headers: { host: "192.168.1.10:3210" },
    remoteAddress: "192.168.1.20",
  });
  assert.equal(lan.statusCode, 403);
  const cross = await app.inject({
    method: "PATCH",
    url: "/api/settings",
    headers: { ...headers, origin: "https://attacker.invalid" },
    payload: { theme: "dark" },
  });
  assert.equal(cross.statusCode, 403);
  const s = store.sessions()[0];
  const body = {
    text: "I must condition on the group factor as well.",
    images: [],
  };
  const response = await app.inject({
    method: "POST",
    url: `/api/sessions/${s.id}/messages`,
    headers,
    payload: body,
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"type":"done"/);
  assert.equal(store.messages(s.id).length, 2);
  assert.equal(store.session(s.id)?.state.evidence.length, 1);
  fail = true;
  const failed = await app.inject({
    method: "POST",
    url: `/api/sessions/${s.id}/messages`,
    headers,
    payload: body,
  });
  assert.match(failed.body, /"type":"error"/);
  assert.doesNotMatch(failed.body, /"type":"done"/);
  assert.equal(store.messages(s.id).length, 2);
  assert.equal(store.session(s.id)?.state.evidence.length, 1);
  for (let n = 0; n < 80; n++) store.event("attempt", s.id);
  const limited = await app.inject({
    method: "POST",
    url: `/api/sessions/${s.id}/messages`,
    headers,
    payload: body,
  });
  assert.equal(limited.statusCode, 429);
});
