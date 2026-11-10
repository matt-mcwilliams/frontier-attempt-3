import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.git/**",
        "**/data/**",
        `${resolve(process.env.DATA_DIR || "./data")}/**`,
        "**/.certs/**",
        "**/*.{pem,key}",
      ],
    },
  },
  build: { outDir: "dist" },
});
