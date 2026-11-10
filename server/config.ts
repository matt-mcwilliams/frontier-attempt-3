import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";

const env = z
  .object({
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65533).default(3210),
    OAUTH_PORT: z.coerce.number().int().min(1).max(65535).default(3211),
    DATA_DIR: z.string().default("./data"),
    PUBLIC_ORIGIN: z.url().optional(),
    TLS_CERT: z.string().optional(),
    TLS_KEY: z.string().optional(),
    TUTOR_MODEL: z.string().default(""),
    MAX_TURNS_PER_DAY: z.coerce.number().int().min(1).default(80),
    MAX_INPUT_CHARS: z.coerce
      .number()
      .int()
      .min(10000)
      .max(300000)
      .default(90000),
    OPENALEX_API_KEY: z.string().optional(),
    ICE_SERVERS: z.string().default("[]"),
  })
  .parse(process.env);
export const config = {
  ...env,
  DATA_DIR: resolve(env.DATA_DIR),
  iceServers: JSON.parse(env.ICE_SERVERS) as RTCIceServer[],
};
if (Boolean(config.TLS_CERT) !== Boolean(config.TLS_KEY))
  throw new Error("Set both TLS_CERT and TLS_KEY.");
if (config.PUBLIC_ORIGIN && !config.PUBLIC_ORIGIN.startsWith("https://"))
  throw new Error(
    "PUBLIC_ORIGIN must use trusted HTTPS for phone camera access.",
  );
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
