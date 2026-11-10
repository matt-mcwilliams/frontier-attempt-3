import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChatGPTAuth, validateIdentity } from "../server/auth";
import { config } from "../server/config";
import { createServer } from "node:net";

test("OIDC verifies signature, audience, nonce, issuer, expiry and returning account identity", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, alg: "RS256" }] });
  const sign = (
    nonce = "nonce",
    aud = "issued-client",
    iss = "https://auth.openai.com",
    exp = "2m",
  ) =>
    new SignJWT({ nonce })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("subject")
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  const good = await sign();
  assert.equal(
    (await validateIdentity(good, "issued-client", "nonce", keys)).sub,
    "subject",
  );
  await assert.rejects(() =>
    validateIdentity(good, "other-client", "nonce", keys),
  );
  await assert.rejects(() =>
    validateIdentity(good, "issued-client", "wrong", keys),
  );
  await assert.rejects(() =>
    validateIdentity(good, "issued-client", "nonce", keys, "other-subject"),
  );
  await assert.rejects(async () =>
    validateIdentity(
      await sign("nonce", "issued-client", "https://untrusted.invalid"),
      "issued-client",
      "nonce",
      keys,
    ),
  );
  await assert.rejects(async () =>
    validateIdentity(
      await sign("nonce", "issued-client", "https://auth.openai.com", "-1m"),
      "issued-client",
      "nonce",
      keys,
    ),
  );
});
test("dynamic OAuth uses persisted host, fresh PKCE and loopback redirect; invalid and replayed states cannot exchange tokens", async (t) => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  config.OAUTH_PORT = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const dir = mkdtempSync(join(tmpdir(), "margin-auth-"));
  const auth = new ChatGPTAuth(dir);
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({
      issuer: "https://auth.openai.com",
      authorization_endpoint: "https://auth.openai.com/api/accounts/authorize",
      token_endpoint: "https://auth.openai.com/api/accounts/oauth/token",
      jwks_uri: "https://auth.openai.com/.well-known/jwks.json",
      revocation_endpoint: "https://auth.openai.com/oauth/revoke",
    });
  };
  t.after(async () => {
    globalThis.fetch = original;
    await auth.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = new URL(await auth.start());
  const next = new URL(await auth.start());
  assert.equal(url.searchParams.get("client_id"), "dynamic_agent_client");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    `http://127.0.0.1:${config.OAUTH_PORT}/auth/callback`,
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.notEqual(
    url.searchParams.get("code_challenge"),
    next.searchParams.get("code_challenge"),
  );
  assert.equal(
    url.searchParams.get("ext_agent_host_id"),
    next.searchParams.get("ext_agent_host_id"),
  );
  assert.match(url.searchParams.get("scope")!, /chatgpt.tokens.use.direct/);
  const invalid = await original(
    `http://127.0.0.1:${config.OAUTH_PORT}/auth/callback?state=wrong&code=not-real`,
  );
  assert.equal(invalid.status, 400);
  const denied = `http://127.0.0.1:${config.OAUTH_PORT}/auth/callback?state=${url.searchParams.get("state")}&error=access_denied`;
  assert.equal((await original(denied)).status, 400);
  assert.match(await (await original(denied)).text(), /expired|state/);
  assert.equal(calls.length, 1);
  const credentials = JSON.parse(
    readFileSync(join(dir, "chatgpt-credentials.json"), "utf8"),
  );
  assert.match(credentials.hostId, /^urn:uuid:/);
  assert.equal(
    statSync(join(dir, "chatgpt-credentials.json")).mode & 0o777,
    0o600,
  );
});
