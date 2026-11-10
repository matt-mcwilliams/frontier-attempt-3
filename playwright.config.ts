import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const dataDir = mkdtempSync(join(tmpdir(), "margin-browser-"));
const cert = join(dataDir, "test.pem"),
  key = join(dataDir, "test-key.pem");
// Ephemeral test-only certificate. No CA is installed or system trust changed.
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "ignore" },
);
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: {
    baseURL: "https://localhost:3219",
    ignoreHTTPSErrors: true,
    viewport: { width: 1360, height: 900 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--ignore-certificate-errors",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm start",
    url: "https://localhost:3219",
    ignoreHTTPSErrors: true,
    env: {
      PORT: "3219",
      HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      TLS_CERT: cert,
      TLS_KEY: key,
      PUBLIC_ORIGIN: "https://localhost:3219",
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
