# Project instructions

## Project context

- Margin (`frontier-attempt-3`) is a public, MIT-licensed, personal local-first research tutor.
- React/Vite/TypeScript, Tailwind/custom CSS, Fastify, native Node SQLite, WebRTC/WebSocket notebook camera, PDF.js, JOSE, KaTeX. Requires Node >=24 and npm.
- The user explicitly requested Sign in with ChatGPT for tutoring. Use the official open-source dynamic-registration flow and ChatGPT-plan-authorized Responses requests; do not introduce API keys or private ChatGPT endpoints.
- Preserve source provenance, abstract/full-text distinctions, evidence-backed learning records, and prerequisite return points. Never represent sample replies or simulated connections as working features.
- Keep credentials and learning artifacts in ignored local data. Do not log tokens, authorization URLs, learner content, or pairing secrets. Never use personal learning data in tests.
- README.md and docs/VERIFICATION.md document setup, architecture, verified behavior, and required physical-device checks.

## Checks

- Run `git diff --check` for changes and `git diff --cached --check` before committing.
- Verified commands: `npm run check`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run sources:verify`, `npm run format:check`.
- Browser tests require OpenSSL and Chromium (default `/usr/bin/chromium`, override with `CHROMIUM_PATH`). They start isolated HTTPS on port 3219 with temporary data and synthetic video. Never reuse the personal data directory.
- Source verification uses live Crossref/OpenAlex; unit/browser tests make no live tutoring calls.
- Default development URL: http://localhost:3210 (`npm run dev`). Production: `npm run build && npm start`. Phone use requires trusted HTTPS; never bypass certificate validation in app code.
- Review documentation for accuracy and avoid describing planned features as available.

## Commit and push rules

- After each completed change, run appropriate checks, commit only the files changed for that task, and push to the configured GitHub upstream without waiting for a separate request.
- Before editing, record staged, unstaged, and untracked files. Files with pre-existing changes are off limits: do not edit, stage, commit, revert, stash, or otherwise alter them unless the user explicitly authorizes those files. Ask if the task depends on such a file.
- Stage explicit paths only; never use `git add .`, `git add -A`, or other blanket staging.
- Inspect the staged diff and commit contents. Preserve unrelated staged changes and use a path-scoped commit when needed to exclude them.
- Never force-push or rewrite existing commits. If a push would include unrelated unpushed commits, ask before publishing those commits.
- Outside `/init`, report a missing repository, GitHub remote, upstream, or authentication as a blocker rather than guessing or creating a destination.
- Report the commit and push result, including any failure, in the final response.
