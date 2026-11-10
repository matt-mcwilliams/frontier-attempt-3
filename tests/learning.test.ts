import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store";
import { applyLearning, chooseAction } from "../server/learning";
import { containedRect, sourceCrop } from "../shared/capture";
import {
  extractDoi,
  extractPdf,
  isPublicAddress,
  sourceContext,
} from "../server/sources";
import { learner, result, simplePdf } from "./fixtures";

test("letterboxed selection maps to actual source pixels and clamps outside the frame", () => {
  const rect = containedRect(400, 400, 1920, 1080);
  assert.deepEqual(rect, { x: 0, y: 87.5, width: 400, height: 225 });
  assert.deepEqual(
    sourceCrop(
      { x: 100, y: 87.5, width: 200, height: 112.5 },
      rect,
      1920,
      1080,
    ),
    { x: 480, y: 0, width: 960, height: 540 },
  );
  assert.deepEqual(
    sourceCrop({ x: -20, y: 0, width: 440, height: 400 }, rect, 1920, 1080),
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  const portrait = containedRect(400, 300, 1080, 1920);
  assert.equal(portrait.height, 300);
  assert.equal(portrait.width, 168.75);
});
test("detour remembers the exact research return point", () => {
  const store = new Store(":memory:");
  const s = store.sessions()[0];
  const original = structuredClone(s.state);
  const entered = applyLearning(
    s,
    result({
      topic: "Conditional probability",
      detour: {
        operation: "enter",
        topic: "Conditional probability",
        reason: "Missing prerequisite",
      },
    }),
    learner(),
  );
  assert.equal(entered.state.detours[0].returnTopic, original.topic);
  const returned = applyLearning(
    entered,
    result({
      topic: "Ignore this",
      detour: { operation: "return", topic: "", reason: "" },
    }),
    learner(),
  );
  assert.equal(returned.state.topic, original.topic);
  assert.equal(returned.state.immediateGoal, original.immediateGoal);
  assert.equal(returned.state.detours.length, 0);
  store.close();
});
test("invented learner quotations and image observations without images cannot enter evidence", () => {
  const store = new Store(":memory:");
  const s = store.sessions()[0];
  const user = learner();
  const evidence = {
    concept: "Independence",
    observation: "A single explanation is not mastery.",
    kind: "user-quote" as const,
    quote: user.text,
    demonstration: "independent" as const,
    task: "explanation" as const,
  };
  const next = applyLearning(
    s,
    result({
      evidence: [
        evidence,
        { ...evidence, quote: "The learner never said this" },
        { ...evidence, kind: "image-observation", quote: "" },
      ],
    }),
    user,
  );
  assert.equal(next.state.evidence.length, 1);
  assert.equal(next.state.evidence[0].messageId, user.id);
  assert.ok(next.state.evidence[0].reviewAt);
  assert.equal("mastery" in next.state, false);
  store.close();
});
test("exercise completion requires evidence, and hints change the instructional action", () => {
  const store = new Store(":memory:");
  let s = store.sessions()[0];
  const user = learner();
  s = applyLearning(
    s,
    result({
      exercise: {
        operation: "assign",
        kind: "derivation",
        prompt: "Derive the conditional likelihood.",
      },
    }),
    user,
  );
  s = applyLearning(
    s,
    result({
      exercise: { operation: "complete", kind: "derivation", prompt: "" },
    }),
    user,
  );
  assert.equal(s.state.exercises[0].status, "assigned");
  assert.equal(
    chooseAction(s.state, "Here is my answer", false, false),
    "evaluate",
  );
  assert.equal(chooseAction(s.state, "Help", false, true), "explain");
  assert.equal(chooseAction(s.state, "", true, false), "evaluate");
  store.close();
});
test("SQLite resumes goal, source, conversation, and evidence after a restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "margin-store-"));
  const file = join(dir, "db.sqlite");
  try {
    const first = new Store(file);
    const s = first.sessions()[0];
    const user = { ...learner(), sessionId: s.id };
    const assistant = {
      ...user,
      id: "assistant-1",
      role: "assistant" as const,
      text: "A response",
    };
    first.commitTurn(user, assistant, s);
    first.close();
    const second = new Store(file);
    assert.equal(second.messages(s.id).length, 2);
    assert.equal(second.session(s.id)?.objective, s.objective);
    assert.equal(second.papers().length, 2);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("hint assistance and delayed recall remain distinct from independent immediate success", () => {
  const store = new Store(":memory:");
  const user = learner();
  let s = store.sessions()[0];
  s = applyLearning(
    s,
    result({
      exercise: {
        operation: "assign",
        kind: "derivation",
        prompt: "Explain the conditioning set.",
      },
    }),
    user,
  );
  s = applyLearning(s, result(), { ...user, id: "hint-turn" }, true);
  const evidence = {
    concept: "Conditioning",
    observation: "A correct explanation after assistance.",
    kind: "user-quote" as const,
    quote: user.text,
    demonstration: "independent" as const,
    task: "recall" as const,
  };
  s = applyLearning(s, result({ evidence: [evidence] }), {
    ...user,
    id: "answer-turn",
  });
  assert.equal(s.state.evidence[0].demonstration, "assisted");
  assert.equal(s.state.evidence[0].delayedRecall, false);
  s.state.evidence[0].createdAt = new Date(
    Date.now() - 2 * 86400000,
  ).toISOString();
  s = applyLearning(s, result({ evidence: [evidence] }), {
    ...user,
    id: "later-turn",
  });
  assert.equal(s.state.evidence.at(-1)!.delayedRecall, true);
  store.close();
});
test("source handling distinguishes abstracts and extracts real PDF page text", async () => {
  const store = new Store(":memory:");
  const p = store.papers()[0];
  assert.match(sourceContext(p, "bifactor"), /not full-text evidence/);
  assert.equal(p.access, "abstract-only");
  const pdf = await extractPdf(simplePdf());
  assert.equal(pdf.pages, 1);
  assert.match(pdf.text, /\[PDF page 1\]/);
  assert.match(pdf.text, /original test document/);
  store.close();
});
test("DOI extraction and public address checks reject private import targets", () => {
  assert.equal(
    extractDoi("https://doi.org/10.1007/BF02295430"),
    "10.1007/bf02295430",
  );
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.2.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1234",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
