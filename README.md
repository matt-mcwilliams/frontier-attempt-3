# Margin

A local-first, open-source research tutor. Begin with a research problem, descend into prerequisites when needed, work by hand, and return to the original question with evidence of what you understand.

Margin uses **Sign in with ChatGPT**, not an OpenAI API key. Eligible model requests use the ChatGPT plan permissions you explicitly grant. There are no hardcoded tutor replies or simulated connection states in the application.

## Run locally

Requires Node.js **24 or later** and npm. Tested with Node 26 on Linux and Chromium.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:3210** on this computer. Select **Connect ChatGPT** → **Continue with ChatGPT**, sign in in the opened browser window, and approve ChatGPT plan use. Return to Margin, then begin the exploration or send your own question. Sign-in does not itself make a model request.

For the built application (recommended for phone use):

```bash
npm run build
npm start
```

The first library contains verified bibliographic records and publisher abstracts for:

- Gibbons, R. D., & Hedeker, D. R. (1992). _Full-Information Item Bi-Factor Analysis_. Psychometrika, 57, 423–436. [DOI](https://doi.org/10.1007/BF02295430).
- de la Torre, J. (2009). _DINA Model and Parameter Estimation: A Didactic_. Journal of Educational and Behavioral Statistics, 34, 115–130. [DOI](https://doi.org/10.3102/1076998607309474).

**These are abstract-only records initially.** Import a permitted PDF from Sources to ground equations, sections, and page references in the paper. An uploaded PDF can be associated with a selected DOI record, but that association is user-supplied; the app does not automatically verify that the file is the correct paper.

## Learning workflow

The conversation retains the research objective, immediate question, current paper, and flexible paper journey: motivation, intuition, mathematics, original research, application, and independent explanation. Questions can trigger a prerequisite detour with a saved return point. Exercises, implementations, misconceptions, and evidence linked to the learner’s actual work survive restarts.

The learning record distinguishes introduced concepts from demonstrated understanding. Exact learner quotations are checked against the submitted message. Image evidence is labeled as a tutor interpretation of a specific submitted image. One correct response never becomes a mastery percentage. Request a hint using the composer toggle; ordinary messages containing “hint” are also tracked. A successful attempt after hints on the active exercise is marked assisted. Delayed recall observations require earlier evidence for that concept at least 24 hours old. The default three-day review interval is an experimental schedule, not a validated optimum.

Strategy changes are in Settings: goal-first, direct, Socratic, challenge-first, and paper-centered. Active study time is approximate, counted while the tab is visible, focused, and recently used. Neither time nor conversation volume establishes learning.

**Enter** sends; **Shift+Enter** adds a line; **Ctrl/Cmd+K** focuses the input; **Escape** closes a secondary workspace. Full-frame capture and ordinary image upload are keyboard-accessible alternatives to dragging. Themes support light, dark, and system preferences. KaTeX renders mathematics; Markdown supports code and tables. There is no arbitrary executable diagram or code execution.

## Phone document camera

Phone browsers require **trusted HTTPS** for camera permissions. HTTP to a LAN IP or an HTTPS-looking URL alone is insufficient.

1. Install [mkcert](https://github.com/FiloSottile/mkcert) using its official instructions. Run `mkcert -install` on the desktop.
2. Find this computer’s Wi-Fi/LAN address, for example `192.168.1.50`. Generate a certificate covering that address and loopback names:

   ```bash
   mkdir -p .certs
   mkcert -cert-file .certs/local.pem -key-file .certs/local-key.pem \
     localhost 127.0.0.1 ::1 192.168.1.50
   ```

3. Install **only the public `rootCA.pem`** from `mkcert -CAROOT` on the phone using its OS certificate-installation flow. Never copy or share `rootCA-key.pem`. On iOS, also enable full trust under Settings → General → About → Certificate Trust Settings. Managed devices may restrict local CA installation.
4. Edit the ignored `.env`:

   ```dotenv
   HOST=0.0.0.0
   PORT=3210
   PUBLIC_ORIGIN=https://192.168.1.50:3210
   TLS_CERT=./.certs/local.pem
   TLS_KEY=./.certs/local-key.pem
   ```

5. Restart with `npm run build && npm start`. Open **https://localhost:3210** on the desktop. Both devices should use the same Wi-Fi. Allow the chosen port through the desktop firewall for your local network if needed; do not forward it through the router.
6. Select **Connect camera**, scan the private QR code, and enable the rear camera on the phone. Keep the page visible and position the phone above the notebook.
7. Drag over the desktop preview to freeze and select a region. **Attach selection** crops the actual source-resolution frame, accounting for letterboxing and rotation. Add an instruction and **send the message** to request feedback. **Resume preview** unfreezes the display; WebRTC transmission continues while frozen.

Capturing only stores an attachment locally. Neither continuous video nor unsubmitted frames go to the AI. The QR credential is in a URL fragment and is removed from the phone address bar on load. Pairing expires after ten minutes; a joined room lasts at most two hours. New pairing revokes the previous room. Reconnect attempts ICE negotiation again; expired pairs need a new QR.

LAN connections use no external ICE servers by default. Guest Wi-Fi isolation, VPNs, or different networks may block them. Configure `ICE_SERVERS` with your own STUN/TURN service when needed; there is no bundled relay. Image upload supports JPEG, PNG, and WebP (10 MB maximum, three attachments per turn).

Vite’s reload transport uses a separate loopback-only port (`PORT + 2`) to avoid competing with signaling. Use the built application on a phone. When your LAN IP changes, update the certificate and `PUBLIC_ORIGIN`.

## ChatGPT authorization and usage

Margin implements OpenAI’s [official open-source flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in): stable opaque host ID, dynamic registration, PKCE S256, state and nonce, and a separate **HTTP loopback callback at `127.0.0.1:3211/auth/callback`**. The ID token’s signature, issuer, audience, expiry, nonce, and returning identity are validated. `OAUTH_PORT` changes only the callback port; it must be free. This callback remains loopback HTTP even when the app uses HTTPS.

Account/workspace registrations retain separate credentials and issued client IDs. Settings can reauthorize a saved registration or add another. Tokens never reach frontend storage; they are atomically written with owner-only permissions, refreshed serially, and revoked on sign-out when the network permits. Unconfirmed remote revocation is reported; disconnect the app in ChatGPT settings if needed.

Models come from the signed-in account’s catalog. Following the [official inference documentation](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), requests use OAuth authorization, explicit local history, `store: false`, `stream: true`, and the public Responses endpoint. **Sign in with ChatGPT changes authorization and usage funding; requests still go to OpenAI’s model service.** No private ChatGPT endpoints, another app’s credentials, or API keys are used. Identity-only consent does not authorize tutoring.

The model must support structured output and, for notebook work, images. A rejected, incomplete, interrupted, or invalid turn preserves the draft and does not save partial learning evidence. Stop cancels a request, though work already processed may count toward usage. There are no automatic model retries.

Environment safeguards:

- `TUTOR_MODEL`: optional account-visible default; otherwise the first discovered model is used. Settings can override it.
- `MAX_TURNS_PER_DAY`: defaults to 80 attempted requests, including failures.
- `MAX_INPUT_CHARS`: text-context bound. Historical images are limited to the latest two image-bearing messages.
- A three-minute request timeout and response-size guard cancel excessive output. The plan route does not support `max_output_tokens`, so these are **request/context safeguards, not a precise monetary or generated-token cap**.

Manage permissions and spending in [ChatGPT usage settings](https://chatgpt.com/settings/usage). The official integration has [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations); account/workspace eligibility still applies. Paid or remotely hosted offerings have a separate onboarding path described in the [official overview](https://developers.openai.com/siwc/token-sharing-open-source). This project is for personal local hosting, not public multi-user deployment.

## Source integrity

- DOI imports verify exact metadata and publisher abstracts with Crossref, then check OpenAlex for legal open-access locations. Optional `OPENALEX_API_KEY` stays on the server. Discovery failures are labeled, without inventing access.
- DOI links import metadata; direct public HTTPS PDF URLs and local uploads import text. General HTML import, paywall circumvention, and autonomous research are not implemented. Private IP targets and private redirects are blocked; validated DNS is pinned during downloads.
- PDF import requires permission and is limited to 20 MB / 300 pages. Text retains **PDF page numbers**, and the original PDF remains locally available. Image-only scans require a text-based PDF or deliberate image attachment; OCR success is not assumed.
- The tutor receives access status and lexically selected excerpts. Missing sections and damaged mathematical extraction must be acknowledged. Unsupported generated links are removed from saved answers. Retrieval can miss relevant passages; use a focused question or attach a page image.
- Source grounding and learning observations remain model judgments. Check important claims against the original paper and correct mistaken interpretations in the conversation.

## Local data

`data/margin.sqlite` stores sessions, messages, evidence, settings, source text, PDFs, and images. `data/chatgpt-credentials.json` stores OAuth registrations. The owner-only directory is ignored by Git. Credentials are protected by filesystem permissions, **not encrypted at rest**; use disk encryption when needed. Unsent text drafts also use this browser’s local storage.

Desktop access is unlocked only from loopback sockets and hostnames. An HTTP-only, same-site cookie protects data APIs. Phone pairing grants signaling access, not access to lessons, sources, or credentials. Signaling checks origin, credentials, expiry, role, message size, and rate. Authorization URLs, credentials, and request bodies are not logged.

Settings exports the textual learning record with image IDs. Stop the server and securely back up the entire `data/` directory to preserve all images, PDFs, and authorization records. There is no deletion/restoration UI in this version. Removing the directory yourself resets the app; revoke ChatGPT access first when appropriate.

## Architecture and checks

React / Vite / TypeScript, Tailwind/custom CSS, Fastify, native Node SQLite, WebSocket signaling, WebRTC, JOSE, PDF.js, and KaTeX. No hosted database or build-time credentials.

| Boundary                      | Location                                               |
| ----------------------------- | ------------------------------------------------------ |
| Conversation and workspaces   | `src/App.tsx`, `src/components/`                       |
| Pairing, camera, capture      | `server/camera.ts`, `src/camera/`, `shared/capture.ts` |
| Model transport and grounding | `server/provider.ts`                                   |
| Strategies and evidence       | `server/learning.ts`, `shared/types.ts`                |
| OAuth and account lifecycle   | `server/auth.ts`                                       |
| Source import and excerpts    | `server/sources.ts`                                    |
| Storage and HTTP              | `server/store.ts`, `server/app.ts`                     |

```bash
npm run check           # strict TypeScript
npm test                # unit and backend integration
npm run build           # production bundle
npm run test:e2e        # isolated HTTPS app; Chromium and OpenSSL required
npm run sources:verify  # live Crossref/OpenAlex verification
npm run format:check
```

Browser tests default to `/usr/bin/chromium`; override with `CHROMIUM_PATH`. They generate an ephemeral test certificate, use synthetic camera input and isolated temporary data, do not install a CA, and do not consume personal credentials or make live tutoring calls. Screenshots go to `test-results/`.

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for tested scope and physical-device checks, and [AGENTS.md](AGENTS.md) for development rules.

[MIT](LICENSE). Independent experimental software; not an OpenAI product.
