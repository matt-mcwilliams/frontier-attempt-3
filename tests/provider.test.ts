import { test } from "node:test";
import assert from "node:assert/strict";
import { readSSE, partialReply, OpenAIPlanProvider } from "../server/provider";
import { Store } from "../server/store";
import { learner, result } from "./fixtures";

function eventStream(events: unknown[], crlf = false) {
  const raw = events
    .map((e) => `data: ${JSON.stringify(e)}${crlf ? "\r\n\r\n" : "\n\n"}`)
    .join("");
  const bytes = new TextEncoder().encode(raw);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < bytes.length; i += 3)
        c.enqueue(bytes.slice(i, i + 3));
      c.close();
    },
  });
}
test("SSE parser survives Unicode, CRLF and split event boundaries", async () => {
  const events = [
    { type: "response.output_text.delta", delta: "θ → λ" },
    { type: "response.completed" },
  ];
  const output = [];
  for await (const e of readSSE(eventStream(events, true))) output.push(e);
  assert.deepEqual(output, events);
});
test("partial JSON prose correctly decodes escapes without showing state fields", () => {
  assert.equal(partialReply('{"reply":"A \\"'), 'A "');
  assert.equal(
    partialReply('{"reply":"\\u03b8\\nnext","topic":"hidden"}'),
    "θ\nnext",
  );
  assert.equal(partialReply('{"reply":"a\\u03'), "a");
});
test("real provider request shape uses OAuth, explicit history, image input and structured streaming; late failures never succeed", async (t) => {
  const store = new Store(":memory:");
  const s = store.sessions()[0];
  const user = {
    ...learner(),
    sessionId: s.id,
    images: [store.saveImage("image/png", Buffer.from("test-image"))],
  };
  const realFetch = globalThis.fetch;
  let failed = false;
  let captured: Record<string, unknown> | undefined;
  t.after(() => {
    globalThis.fetch = realFetch;
    store.close();
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer test-oauth-token",
    );
    if (url.endsWith("/models"))
      return Response.json({
        models: [
          {
            slug: "test-model",
            display_name: "Test model",
            visibility: "list",
          },
        ],
      });
    captured = JSON.parse(String(init?.body));
    const reply = JSON.stringify(result());
    return new Response(
      eventStream([
        { type: "response.output_text.delta", delta: reply },
        failed
          ? {
              type: "response.failed",
              response: {
                error: { code: "subscription_sharing_usage_limit_exceeded" },
              },
            }
          : { type: "response.completed" },
      ]),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  };
  const provider = new OpenAIPlanProvider(
    async () => "test-oauth-token",
    store,
  );
  let streamed = "";
  const args = {
    session: s,
    history: [],
    user,
    paper: store.papers()[0],
    settings: store.settings(),
    hint: false,
    signal: new AbortController().signal,
    onText: (text: string) => {
      streamed = text;
    },
  };
  const good = await provider.respond(args);
  assert.equal(good.reply, result().reply);
  assert.equal(streamed, good.reply);
  assert.equal(captured?.store, false);
  assert.equal(captured?.stream, true);
  assert.ok(!("max_output_tokens" in captured!));
  assert.ok(!("previous_response_id" in captured!));
  assert.match(JSON.stringify(captured?.input), /input_image/);
  assert.match(JSON.stringify(captured?.text), /json_schema/);
  failed = true;
  await assert.rejects(() => provider.respond(args), /usage is unavailable/);
});
