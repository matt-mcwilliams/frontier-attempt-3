import { z } from "zod";
import { actions, stages } from "./types";

export const evidenceSchema = z.object({
  concept: z.string().max(180),
  observation: z.string().max(1200),
  kind: z.enum(["user-quote", "image-observation"]),
  quote: z.string().max(2000),
  demonstration: z.enum([
    "independent",
    "assisted",
    "unclear",
    "misconception",
    "improved",
  ]),
  task: z.enum([
    "explanation",
    "derivation",
    "calculation",
    "transfer",
    "implementation",
    "recall",
  ]),
});
export const tutorResultSchema = z.object({
  reply: z.string().min(1),
  topic: z.string().max(180),
  immediateGoal: z.string().max(400),
  stage: z.enum(stages),
  conceptsIntroduced: z.array(z.string().max(180)).max(8),
  evidence: z.array(evidenceSchema).max(6),
  unresolvedQuestions: z.array(z.string().max(500)).max(8),
  detour: z.object({
    operation: z.enum(["none", "enter", "return"]),
    topic: z.string(),
    reason: z.string(),
  }),
  exercise: z.object({
    operation: z.enum(["none", "assign", "complete"]),
    prompt: z.string(),
    kind: z.enum([
      "derivation",
      "transfer",
      "implementation",
      "teach-back",
      "recall",
    ]),
  }),
  nextAction: z.enum(actions),
  sourceBasis: z.enum([
    "full-text",
    "abstract-only",
    "metadata-only",
    "general-explanation",
  ]),
});
