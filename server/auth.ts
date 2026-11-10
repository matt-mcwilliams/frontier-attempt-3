import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { AppError, config } from "./config.ts";
import type { AuthStatus } from "../shared/types.ts";

interface Registration {
  id: string;
  email: string;
  subject: string;
  clientId: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  scopes: string[];
}
interface Credentials {
  hostId: string;
  activeId: string | null;
  registrations: Registration[];
}
interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  redirectUri: string;
  accountId?: string;
  expires: number;
}
interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}
interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint: string;
}
const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const scopes =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const random = () => randomBytes(32).toString("base64url");

export async function validateIdentity(
  token: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey,
  subject?: string,
) {
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat"],
    clockTolerance: 5,
  });
  if (
    payload.nonce !== nonce ||
    !payload.sub ||
    (subject && payload.sub !== subject)
  )
    throw new AppError(400, "The identity did not match the sign-in attempt.");
  return payload;
}

export class ChatGPTAuth {
  private credentials: Credentials;
  private file: string;
  private pending = new Map<string, Pending>();
  private callbackServer?: Server;
  private discovery?: Discovery;
  private refreshing?: Promise<string>;
  private notice: string | null = null;
  constructor(dataDir: string) {
    this.file = join(dataDir, "chatgpt-credentials.json");
    this.credentials = existsSync(this.file)
      ? JSON.parse(readFileSync(this.file, "utf8"))
      : {
          hostId: `urn:uuid:${randomUUID()}`,
          activeId: null,
          registrations: [],
        };
    this.save();
  }
  private save() {
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.credentials), { mode: 0o600 });
    renameSync(temp, this.file);
  }
  status(): AuthStatus {
    const accounts = this.credentials.registrations.map((a, i) => ({
      id: a.id,
      email: a.email,
      label: `${a.email || "ChatGPT account"} · ${i + 1}`,
      connected: !!a.accessToken,
      planEnabled:
        !!a.accessToken && a.scopes.includes("chatgpt.tokens.use.direct"),
      active: a.id === this.credentials.activeId,
    }));
    return {
      accounts,
      active: accounts.find((a) => a.active) ?? null,
      notice: this.notice,
    };
  }
  private async discover() {
    if (this.discovery) return this.discovery;
    const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new AppError(
        502,
        "OpenAI sign-in discovery is unavailable. Please try again.",
      );
    const doc = (await response.json()) as Discovery;
    if (
      doc.issuer !== issuer ||
      [
        doc.authorization_endpoint,
        doc.token_endpoint,
        doc.jwks_uri,
        doc.revocation_endpoint,
      ].some((x) => !x || new URL(x).origin !== issuer)
    )
      throw new AppError(
        502,
        "OpenAI returned an unexpected identity configuration.",
      );
    this.discovery = doc;
    return doc;
  }
  private async listener() {
    if (this.callbackServer) return;
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404).end();
        return;
      }
      void this.complete(url.searchParams)
        .then(() => {
          res.writeHead(200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'",
          });
          res.end(
            '<html><title>Margin · Connected</title><body style="font:20px system-ui;max-width:36em;margin:15vh auto;padding:2em"><h1>Account connected.</h1><p>Return to Margin. You can close this tab.</p></body></html>',
          );
        })
        .catch((error: unknown) => {
          this.notice =
            error instanceof AppError
              ? error.message
              : "Sign-in could not be verified. Please start a new attempt.";
          res
            .writeHead(400, {
              "Content-Type": "text/plain",
              "Cache-Control": "no-store",
            })
            .end(this.notice);
        });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.OAUTH_PORT, "127.0.0.1", () => resolve());
    });
    this.callbackServer = server;
  }
  async start(accountId?: string) {
    await this.listener();
    const doc = await this.discover();
    const account = accountId
      ? this.credentials.registrations.find((a) => a.id === accountId)
      : undefined;
    if (accountId && !account)
      throw new AppError(404, "That account is no longer saved.");
    for (const [state, p] of this.pending)
      if (p.expires < Date.now()) this.pending.delete(state);
    const p: Pending = {
      state: random(),
      nonce: random(),
      verifier: random(),
      redirectUri: `http://127.0.0.1:${config.OAUTH_PORT}/auth/callback`,
      accountId,
      expires: Date.now() + 10 * 60000,
    };
    this.pending.set(p.state, p);
    const url = new URL(doc.authorization_endpoint);
    const params: Record<string, string> = {
      client_id: account?.clientId ?? "dynamic_agent_client",
      ext_agent_host_id: this.credentials.hostId,
      response_type: "code",
      redirect_uri: p.redirectUri,
      scope: scopes,
      resource,
      state: p.state,
      nonce: p.nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256")
        .update(p.verifier)
        .digest("base64url"),
    };
    if (!account) params.agent_name_hint = "Margin Research Tutor";
    if (account?.idToken) params.id_token_hint = account.idToken;
    if (account?.email) params.login_hint = account.email;
    url.search = new URLSearchParams(params).toString();
    this.notice = null;
    return url.toString();
  }
  private async token(body: Record<string, string>): Promise<TokenSet> {
    const doc = await this.discover();
    const r = await fetch(doc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new AppError(
        401,
        "ChatGPT authorization expired or could not be renewed. Continue with ChatGPT again.",
      );
    const t = (await r.json()) as TokenSet;
    if (
      !t.access_token ||
      !Number.isFinite(t.expires_in) ||
      t.token_type?.toLowerCase() !== "bearer"
    )
      throw new AppError(502, "OpenAI returned an incomplete token response.");
    return t;
  }
  private async complete(params: URLSearchParams) {
    const state = params.get("state") ?? "";
    const p = this.pending.get(state);
    if (!p || p.expires < Date.now())
      throw new AppError(
        400,
        "This sign-in attempt expired or its state did not match. Start again in Margin.",
      );
    this.pending.delete(state);
    if (params.has("error"))
      throw new AppError(
        400,
        "Sign-in was declined. You can try again and approve ChatGPT plan use.",
      );
    const old = this.credentials.registrations.find(
      (a) => a.id === p.accountId,
    );
    const clientId = params.get("client_id") ?? old?.clientId;
    if (
      !clientId ||
      clientId === "dynamic_agent_client" ||
      (old && old.clientId !== clientId) ||
      !params.get("code")
    )
      throw new AppError(
        400,
        "The client registration did not match the sign-in attempt.",
      );
    const tokens = await this.token({
      grant_type: "authorization_code",
      client_id: clientId,
      code: params.get("code")!,
      code_verifier: p.verifier,
      redirect_uri: p.redirectUri,
      resource,
    });
    if (!tokens.id_token)
      throw new AppError(400, "No identity token was returned.");
    const doc = await this.discover();
    const payload = await validateIdentity(
      tokens.id_token,
      clientId,
      p.nonce,
      createRemoteJWKSet(new URL(doc.jwks_uri)),
      old?.subject,
    );
    const existing =
      old ??
      this.credentials.registrations.find(
        (a) => a.clientId === clientId && a.subject === payload.sub,
      );
    const account: Registration = {
      id: existing?.id ?? randomUUID(),
      email: typeof payload.email === "string" ? payload.email : "",
      subject: payload.sub!,
      clientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scopes: (tokens.scope ?? "").split(/\s+/),
    };
    this.credentials.registrations = this.credentials.registrations
      .filter((a) => a.id !== account.id)
      .concat(account);
    this.credentials.activeId = account.id;
    this.save();
    this.notice = account.scopes.includes("chatgpt.tokens.use.direct")
      ? null
      : "Identity connected, but ChatGPT plan use was not granted. Reconnect and approve plan use before tutoring.";
  }
  async accessToken(): Promise<string> {
    const a = this.credentials.registrations.find(
      (a) => a.id === this.credentials.activeId,
    );
    if (!a?.accessToken)
      throw new AppError(401, "Continue with ChatGPT to begin tutoring.");
    if (!a.scopes.includes("chatgpt.tokens.use.direct"))
      throw new AppError(
        403,
        "Reconnect with ChatGPT and approve ChatGPT plan use.",
      );
    if (a.expiresAt > Date.now() + 60000) return a.accessToken;
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      if (!a.refreshToken)
        throw new AppError(
          401,
          "Continue with ChatGPT again to renew your session.",
        );
      const t = await this.token({
        grant_type: "refresh_token",
        client_id: a.clientId,
        refresh_token: a.refreshToken,
        resource,
      });
      a.accessToken = t.access_token;
      a.refreshToken = t.refresh_token ?? a.refreshToken;
      a.idToken = t.id_token ?? a.idToken;
      a.expiresAt = Date.now() + t.expires_in * 1000;
      if (t.scope !== undefined) a.scopes = t.scope.split(/\s+/);
      this.save();
      if (!a.scopes.includes("chatgpt.tokens.use.direct"))
        throw new AppError(403, "ChatGPT plan use is no longer authorized.");
      return a.accessToken;
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  async signOut() {
    this.pending.clear();
    if (this.refreshing) await this.refreshing.catch(() => {});
    const a = this.credentials.registrations.find(
      (a) => a.id === this.credentials.activeId,
    );
    let revoked = !a?.refreshToken;
    if (a?.refreshToken) {
      for (let i = 0; i < 2 && !revoked; i++) {
        try {
          const doc = await this.discover();
          const r = await fetch(doc.revocation_endpoint, {
            method: "POST",
            body: new URLSearchParams({
              token: a.refreshToken,
              token_type_hint: "refresh_token",
              client_id: a.clientId,
            }),
            signal: AbortSignal.timeout(8000),
          });
          revoked = r.status === 200;
        } catch {
          /* Clear locally and report below. */
        }
      }
    }
    if (a) {
      delete a.accessToken;
      delete a.refreshToken;
      delete a.idToken;
      a.scopes = [];
    }
    this.credentials.activeId = null;
    this.save();
    this.notice = revoked
      ? null
      : "Signed out locally. Remote revocation was not confirmed; disconnect Margin in ChatGPT Settings.";
    return { revoked };
  }
  async close() {
    if (this.callbackServer)
      await new Promise<void>((r) => this.callbackServer!.close(() => r()));
  }
}
