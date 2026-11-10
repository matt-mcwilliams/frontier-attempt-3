import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { config, AppError } from "./config.ts";
import { Store } from "./store.ts";
import { ChatGPTAuth } from "./auth.ts";
import { OpenAIPlanProvider, type TutorProvider } from "./provider.ts";
import { CameraRooms, equalSecret } from "./camera.ts";
import { applyLearning, chooseAction } from "./learning.ts";
import {
  extractDoi,
  extractPdf,
  fetchPublic,
  importDoi,
  plainText,
} from "./sources.ts";
import { strategies, type Message, type Paper } from "../shared/types.ts";
import { join } from "node:path";

export async function buildApp(
  options: { store?: Store; provider?: TutorProvider; test?: boolean } = {},
) {
  const store =
    options.store ?? new Store(join(config.DATA_DIR, "margin.sqlite"));
  const auth = options.test ? undefined : new ChatGPTAuth(config.DATA_DIR);
  const provider =
    options.provider ??
    new OpenAIPlanProvider(() => auth!.accessToken(), store);
  const camera = new CameraRooms();
  const secret =
    store.get<string>("browser-secret") ??
    randomBytes(32).toString("base64url");
  store.set("browser-secret", secret);
  const app = Fastify({
    logger: false,
    bodyLimit: 24 * 1024 * 1024,
    ...(config.TLS_CERT && !options.test
      ? {
          https: {
            key: readFileSync(config.TLS_KEY!),
            cert: readFileSync(config.TLS_CERT),
          },
        }
      : {}),
  });
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8 },
  });
  await app.register(websocket, { options: { maxPayload: 64000 } });
  const busy = new Map<string, AbortController>();
  const requireSession = (id: string) => {
    const s = store.session(id);
    if (!s) throw new AppError(404, "This lesson could not be found.");
    return s;
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Referrer-Policy", "no-referrer")
      .header("X-Content-Type-Options", "nosniff")
      .header("Permissions-Policy", "camera=(self), microphone=()");
    if (process.env.NODE_ENV === "production")
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
      );
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    const localHost =
      /^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$|^\[::1\](?::\d+)?$/.test(
        req.headers.host ?? "",
      );
    const localSocket = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.ip,
    );
    const expectedOrigin = `${config.TLS_CERT ? "https" : "http"}://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== expectedOrigin)
      throw new AppError(403, "Use this app from its own local origin.");
    if (req.url === "/api/session" && req.method === "POST") {
      if (!localHost || !localSocket)
        throw new AppError(
          403,
          "Open the tutor on this computer at localhost. The phone uses its private pairing page.",
        );
      reply.setCookie("margin_session", secret, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: !!config.TLS_CERT,
        maxAge: 30 * 86400,
      });
      return;
    }
    if (!equalSecret(req.cookies.margin_session ?? "", secret))
      throw new AppError(
        401,
        "Open Margin on localhost on the desktop to unlock your local learning data.",
      );
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) {
      reply.status(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    const e = error as Error & { statusCode?: number };
    reply
      .status(error instanceof AppError ? error.status : (e.statusCode ?? 500))
      .send({
        error:
          error instanceof AppError || (e.statusCode && e.statusCode < 500)
            ? e.message
            : "The local operation failed. Check source access or configuration, then retry.",
      });
  });
  app.post("/api/session", async () => ({ ok: true }));
  app.get("/api/bootstrap", async () => ({
    sessions: store.sessions(),
    papers: store.papers().map(({ text, ...p }) => ({ ...p, text: "" })),
    settings: store.settings(),
    auth: auth?.status() ?? { accounts: [], active: null, notice: null },
    metrics: store.metrics(),
    dailyLimit: config.MAX_TURNS_PER_DAY,
  }));
  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req) => ({
    session: requireSession(req.params.id),
    messages: store.messages(req.params.id),
  }));
  app.post("/api/sessions", async (req) => {
    const b = z
      .object({
        title: z.string().trim().min(1).max(180),
        paperId: z.string().nullable().default(null),
      })
      .parse(req.body);
    if (b.paperId && !store.paper(b.paperId))
      throw new AppError(404, "Select a paper from the library.");
    return store.createSession(b.title, b.paperId);
  });
  app.patch<{ Params: { id: string } }>("/api/sessions/:id", async (req) => {
    const b = z
      .object({
        objective: z.string().trim().min(10).max(2000).optional(),
        paperId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const s = requireSession(req.params.id);
    if (busy.has(s.id))
      throw new AppError(409, "Wait for the tutor turn to finish first.");
    if (b.paperId && !store.paper(b.paperId))
      throw new AppError(404, "That paper was not found.");
    const next = { ...s, ...b, updatedAt: new Date().toISOString() };
    store.saveSession(next);
    return next;
  });
  app.patch("/api/settings", async (req) => {
    const b = z
      .object({
        strategy: z.enum(strategies).optional(),
        model: z.string().max(180).optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
      })
      .parse(req.body);
    const s = { ...store.settings(), ...b };
    store.set("settings", s);
    return s;
  });
  app.post("/api/auth/start", async (req) => {
    if (!auth)
      throw new AppError(503, "Authentication is disabled in the test server.");
    const b = z
      .object({ accountId: z.string().optional() })
      .parse(req.body ?? {});
    return { url: await auth.start(b.accountId) };
  });
  app.post("/api/auth/signout", async () => {
    for (const abort of busy.values()) abort.abort();
    return auth?.signOut() ?? { revoked: true };
  });
  app.get("/api/models", async () => provider.models());
  app.post("/api/metrics", async (req) => {
    const b = z
      .object({
        sessionId: z.string(),
        kind: z.enum(["active-seconds"]),
        value: z.number().min(0).max(60),
      })
      .parse(req.body);
    requireSession(b.sessionId);
    store.event(b.kind, b.sessionId, b.value);
    return { ok: true };
  });
  app.post("/api/images", async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, "Choose a notebook image.");
    const data = await file.toBuffer();
    const mime = data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? "image/jpeg"
      : data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "image/png"
        : data.subarray(0, 4).toString() === "RIFF" &&
            data.subarray(8, 12).toString() === "WEBP"
          ? "image/webp"
          : null;
    if (!mime) throw new AppError(400, "Use a JPEG, PNG, or WebP image.");
    if (data.length > 10 * 1024 * 1024)
      throw new AppError(
        413,
        "Notebook images must be under 10 MB. Crop or resize the image first.",
      );
    return { id: store.saveImage(mime, data) };
  });
  app.get<{ Params: { id: string } }>("/api/images/:id", async (req, reply) => {
    const image = store.image(req.params.id);
    if (!image) throw new AppError(404, "Image not found.");
    return reply.type(image.mime).send(Buffer.from(image.data));
  });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (req, reply) => {
      const b = z
        .object({
          text: z.string().max(12000),
          images: z.array(z.string()).max(3).default([]),
          hint: z.boolean().default(false),
        })
        .parse(req.body);
      if (!b.text.trim() && !b.images.length)
        throw new AppError(400, "Write a message or attach your work.");
      const session = requireSession(req.params.id);
      if (busy.has(session.id))
        throw new AppError(
          409,
          "This lesson already has a tutor turn in progress.",
        );
      if (b.images.some((id) => !store.image(id)))
        throw new AppError(
          400,
          "An attached image is missing. Upload it again.",
        );
      if (store.dailyAttempts() >= config.MAX_TURNS_PER_DAY)
        throw new AppError(
          429,
          "The local daily request safeguard was reached. Adjust MAX_TURNS_PER_DAY deliberately to continue.",
        );
      const abort = new AbortController();
      busy.set(session.id, abort);
      const timeout = setTimeout(() => abort.abort(), 180000);
      const user: Message = {
        id: randomUUID(),
        sessionId: session.id,
        role: "user",
        text: b.text,
        images: b.images,
        createdAt: new Date().toISOString(),
      };
      const hint = b.hint || /\b(hint|small clue)\b/i.test(b.text);
      store.event("attempt", session.id);
      if (hint) store.event("hint", session.id);
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (type: string, data: unknown) => {
        if (!reply.raw.destroyed)
          reply.raw.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };
      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(": keepalive\n\n");
      }, 15000);
      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) abort.abort();
      });
      try {
        const result = await provider.respond({
          session,
          history: store.messages(session.id),
          user,
          paper: session.paperId ? store.paper(session.paperId) : undefined,
          settings: store.settings(),
          hint,
          signal: abort.signal,
          onText: (text) => send("text", text),
        });
        if (abort.signal.aborted)
          throw new AppError(
            499,
            "This turn was stopped. Your draft was kept; no learning evidence was saved.",
          );
        const assistant: Message = {
          id: randomUUID(),
          sessionId: session.id,
          role: "assistant",
          text: result.reply,
          images: [],
          createdAt: new Date().toISOString(),
          action: chooseAction(session.state, b.text, !!b.images.length, hint),
          sourceBasis: result.sourceBasis,
        };
        const next = applyLearning(session, result, user, hint);
        store.commitTurn(user, assistant, next);
        send("done", { session: next, messages: [user, assistant] });
      } catch (error) {
        send(
          "error",
          error instanceof AppError
            ? error.message
            : abort.signal.aborted
              ? "The turn was stopped or timed out. Your draft is preserved. Retry when ready."
              : "The tutor could not complete this turn. Your draft is preserved; no learning evidence was saved.",
        );
      } finally {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        busy.delete(session.id);
        reply.raw.end();
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/stop",
    async (req) => {
      busy.get(req.params.id)?.abort();
      return { ok: true };
    },
  );
  app.get<{ Params: { id: string } }>("/api/papers/:id", async (req) => {
    const p = store.paper(req.params.id);
    if (!p) throw new AppError(404, "Paper not found.");
    return p;
  });
  app.post("/api/papers/import", async (req) => {
    const b = z
      .object({
        value: z.string().trim().min(1).max(2000),
        permitted: z.boolean().default(false),
      })
      .parse(req.body);
    const doi = extractDoi(b.value);
    const directPdf =
      /^https:\/\//i.test(b.value) &&
      /\.pdf(?:[?#]|$)|\/pdf(?:\/|[?#]|$)/i.test(b.value);
    if (doi && !directPdf) {
      const p = await importDoi(doi);
      const old = store.papers().find((x) => x.doi?.toLowerCase() === doi);
      if (old) {
        return old;
      }
      store.savePaper(p);
      return p;
    }
    if (!b.permitted)
      throw new AppError(
        400,
        "Confirm permission to store the source text before importing a URL.",
      );
    const remote = await fetchPublic(b.value);
    if (
      remote.type.includes("pdf") ||
      remote.data.subarray(0, 5).toString() === "%PDF-"
    ) {
      const extracted = await extractPdf(remote.data);
      const p: Paper = {
        id: randomUUID(),
        title: decodeURIComponent(
          new URL(remote.url).pathname.split("/").pop() || "Imported paper",
        ),
        authors: "Not verified",
        year: null,
        doi: null,
        url: remote.url,
        abstract: "",
        ...extracted,
        access: "full-text",
        provenance:
          "User-authorized public PDF URL; bibliographic identity not independently verified",
        verifiedAt: new Date().toISOString(),
        oaUrl: null,
        license: null,
      };
      store.savePaper(p);
      store.set(`pdf:${p.id}`, store.saveImage("application/pdf", remote.data));
      return { ...p, text: "" };
    }
    throw new AppError(
      422,
      "This URL is not a PDF or DOI link. Use the paper DOI for verified metadata, or upload a permitted PDF.",
    );
  });
  app.post("/api/papers/upload", async (req) => {
    let data: Buffer | undefined;
    let title = "Imported PDF";
    let permitted = false;
    let paperId = "";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        data = await part.toBuffer();
        title = part.filename.replace(/\.pdf$/i, "");
      } else if (part.fieldname === "permitted")
        permitted = part.value === "true";
      else if (part.fieldname === "paperId") paperId = String(part.value);
    }
    if (!permitted)
      throw new AppError(
        400,
        "Confirm that you may store and use this PDF locally.",
      );
    if (!data) throw new AppError(400, "Choose a PDF.");
    const extracted = await extractPdf(data);
    const old = paperId ? store.paper(paperId) : undefined;
    if (paperId && !old) throw new AppError(404, "Original paper not found.");
    const p: Paper = {
      id: old?.id ?? randomUUID(),
      title: old?.title ?? plainText(title),
      authors: old?.authors ?? "Not verified",
      year: old?.year ?? null,
      doi: old?.doi ?? null,
      url: old?.url ?? null,
      abstract: old?.abstract ?? "",
      ...extracted,
      access: "full-text",
      provenance: `${old?.provenance ?? "Bibliographic identity not independently verified"}; user-supplied PDF (user-associated, identity not automatically matched)`,
      verifiedAt: new Date().toISOString(),
      oaUrl: old?.oaUrl ?? null,
      license: old?.license ?? null,
    };
    store.savePaper(p);
    store.set(`pdf:${p.id}`, store.saveImage("application/pdf", data));
    return { ...p, text: "" };
  });
  app.get<{ Params: { id: string } }>(
    "/api/papers/:id/pdf",
    async (req, reply) => {
      const id = store.get<string>(`pdf:${req.params.id}`);
      const image = id ? store.image(id) : undefined;
      if (!image) throw new AppError(404, "No PDF stored for this paper.");
      return reply.type("application/pdf").send(Buffer.from(image.data));
    },
  );
  app.post("/api/camera/pair", async () => {
    const room = camera.create();
    const origin = config.PUBLIC_ORIGIN;
    return {
      id: room.id,
      expiresAt: room.expires,
      url: origin ? `${origin}/phone#${room.id}.${room.token}` : null,
      iceServers: config.iceServers,
      secure: !!config.TLS_CERT,
    };
  });
  app.post("/api/camera/disconnect", async () => {
    for (const id of camera.rooms.keys()) camera.remove(id);
    return { ok: true };
  });
  app.get("/api/export", async () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: store
      .sessions()
      .map((s) => ({ ...s, messages: store.messages(s.id) })),
    papers: store.papers(),
    settings: store.settings(),
    metrics: store.metrics(),
  }));
  camera.attach(app, secret);
  app.addHook("onClose", async () => {
    for (const c of busy.values()) c.abort();
    camera.close();
    await auth?.close();
    store.close();
  });
  return { app, store };
}
