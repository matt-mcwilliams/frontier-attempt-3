import { buildApp } from "./app.ts";
import { config } from "./config.ts";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const { app } = await buildApp();
if (process.env.NODE_ENV === "production") {
  const { default: staticFiles } = await import("@fastify/static");
  await app.register(staticFiles, { root: resolve("dist"), wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.sendFile("index.html"),
  );
} else {
  const { default: middie } = await import("@fastify/middie");
  await app.register(middie);
  const { createServer } = await import("vite");
  // A separate loopback-only HMR transport avoids two upgrade listeners
  // accepting the notebook signaling socket. Use production mode on phones.
  const vite = await createServer({
    server: {
      middlewareMode: true,
      ws: { port: config.PORT + 2, host: "127.0.0.1" },
      ...(config.TLS_CERT
        ? {
            https: {
              key: readFileSync(config.TLS_KEY!),
              cert: readFileSync(config.TLS_CERT),
            },
          }
        : {}),
      watch: { ignored: ["**/data/**", "**/test-results/**", "**/.certs/**"] },
    },
    appType: "spa",
  });
  app.use((req, res, next) => {
    if (req.url?.startsWith("/api/") || req.url?.startsWith("/signal")) next();
    else vite.middlewares(req, res, next);
  });
  app.addHook("onClose", async () => vite.close());
}
await app.listen({ port: config.PORT, host: config.HOST });
console.log(
  `Margin is ready at ${config.TLS_CERT ? "https" : "http"}://localhost:${config.PORT}`,
);
if (!config.PUBLIC_ORIGIN)
  console.log(
    "Phone pairing needs PUBLIC_ORIGIN and trusted HTTPS. See README.md.",
  );
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
