import { randomUUID } from "node:crypto";
import type {
  Action,
  LearningState,
  Message,
  Session,
  Strategy,
  TutorResult,
} from "../shared/types.ts";

export const strategyInstructions: Record<Strategy, string> = {
  "goal-first":
    "Start from the research capability and motivating failure case. Descend into prerequisites only when needed, check understanding, and return to the original question.",
  direct:
    "Prefer clear direct explanation and a worked example, followed by independent transfer. Keep prerequisite detours brief but substantive.",
  socratic:
    "Prefer one targeted diagnostic question at a time when it will resolve a real uncertainty. Explain directly when the learner is stuck. Avoid endless questioning.",
  "challenge-first":
    "Start with an unfamiliar, achievable challenge. Use the attempt to diagnose what instruction is needed. Do not reveal the full solution prematurely.",
  "paper-centered":
    "Anchor the lesson in the paper’s motivating problem, selected source passages, assumptions, and contribution. Clearly separate author claims from your examples.",
};
export function chooseAction(
  state: LearningState,
  text: string,
  hasImages: boolean,
  hint: boolean,
): Action {
  if (hasImages) return "evaluate";
  if (hint) return "explain";
  if (
    /\b(return|back to (the )?paper|resume)\b/i.test(text) &&
    state.detours.length
  )
    return "return-to-goal";
  if (/\b(don't understand|what is|prerequisite|remind me)\b/i.test(text))
    return "prerequisite";
  if (/\b(review|recall|retrieval)\b/i.test(text)) return "retrieval";
  if (/\b(compare|difference between)\b/i.test(text)) return "compare";
  if (state.exercises.some((e) => e.status === "assigned")) return "evaluate";
  return state.nextAction;
}
export function applyLearning(
  session: Session,
  result: TutorResult,
  user: Message,
  hint = false,
): Session {
  const state: LearningState = structuredClone(session.state);
  const activeExercise = [...state.exercises]
    .reverse()
    .find((e) => e.status === "assigned");
  if (hint && activeExercise)
    activeExercise.hintsUsed = (activeExercise.hintsUsed ?? 0) + 1;
  if (
    result.detour.operation === "enter" &&
    result.detour.topic &&
    state.detours.at(-1)?.topic !== result.detour.topic
  ) {
    state.detours.push({
      topic: result.detour.topic,
      reason: result.detour.reason,
      returnTopic: state.topic,
      returnGoal: state.immediateGoal,
    });
  }
  let returned = false;
  if (result.detour.operation === "return") {
    const prior = state.detours.pop();
    if (prior) {
      state.topic = prior.returnTopic;
      state.immediateGoal = prior.returnGoal;
      returned = true;
    }
  }
  if (!returned) {
    state.topic = result.topic;
    state.immediateGoal = result.immediateGoal;
  }
  state.stage = result.stage;
  state.conceptsIntroduced = [
    ...new Set([...state.conceptsIntroduced, ...result.conceptsIntroduced]),
  ].slice(-100);
  for (const e of result.evidence) {
    // Text evidence must be an exact span of the learner's latest work. Image observations
    // are tutor interpretations tied to an actual submitted frame, never verified transcripts.
    if (
      e.kind === "user-quote" &&
      (!e.quote.trim() || !user.text.includes(e.quote))
    )
      continue;
    if (e.kind === "image-observation" && !user.images.length) continue;
    const delayedRecall =
      e.task === "recall" &&
      state.evidence.some(
        (prior) =>
          prior.concept === e.concept &&
          Date.parse(prior.createdAt) < Date.parse(user.createdAt) - 86400000,
      );
    const demonstration =
      e.demonstration === "independent" &&
      (hint || (activeExercise?.hintsUsed ?? 0) > 0)
        ? "assisted"
        : e.demonstration;
    state.evidence.push({
      ...e,
      quote: e.kind === "image-observation" ? "" : e.quote,
      demonstration,
      delayedRecall,
      id: randomUUID(),
      messageId: user.id,
      createdAt: user.createdAt,
      reviewAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    });
  }
  state.unresolvedQuestions = result.unresolvedQuestions;
  if (result.exercise.operation === "assign" && result.exercise.prompt)
    state.exercises.push({
      id: randomUUID(),
      prompt: result.exercise.prompt,
      kind: result.exercise.kind,
      status: "assigned",
      assignedAt: user.createdAt,
      messageId: user.id,
      hintsUsed: 0,
    });
  if (result.exercise.operation === "complete") {
    const exercise = [...state.exercises]
      .reverse()
      .find((e) => e.status === "assigned");
    const supported = state.evidence.some(
      (e) =>
        e.messageId === user.id &&
        ["independent", "assisted", "improved"].includes(e.demonstration),
    );
    if (exercise && supported) {
      exercise.status = "completed";
      exercise.completedAt = user.createdAt;
    }
  }
  state.nextAction = result.nextAction;
  state.sourceBasis = result.sourceBasis;
  return { ...session, state, updatedAt: new Date().toISOString() };
}
