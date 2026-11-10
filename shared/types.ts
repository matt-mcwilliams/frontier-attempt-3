import type { z } from "zod";
import type { evidenceSchema, tutorResultSchema } from "./tutoring-schema";

export const objective =
  "Understand the mathematical and computational foundations of modern psychometric models well enough to implement, evaluate, and eventually develop low-data, LLM-assisted diagnostic assessment systems.";
export const stages = [
  "Motivation",
  "Intuition",
  "Mathematics",
  "Original research",
  "Application",
  "Independent explanation",
] as const;
export const strategies = [
  "goal-first",
  "direct",
  "socratic",
  "challenge-first",
  "paper-centered",
] as const;
export type Strategy = (typeof strategies)[number];
export const actions = [
  "explain",
  "motivate",
  "conceptual-question",
  "handwritten-derivation",
  "problem",
  "evaluate",
  "prerequisite",
  "compare",
  "teach-back",
  "implementation",
  "return-to-goal",
  "retrieval",
] as const;
export type Action = (typeof actions)[number];
export type TutorResult = z.infer<typeof tutorResultSchema>;
export type Evidence = z.infer<typeof evidenceSchema> & {
  id: string;
  messageId: string;
  createdAt: string;
  reviewAt: string;
  delayedRecall: boolean;
};
export interface Detour {
  topic: string;
  reason: string;
  returnTopic: string;
  returnGoal: string;
}
export interface Exercise {
  id: string;
  prompt: string;
  kind: string;
  status: "assigned" | "completed";
  assignedAt: string;
  completedAt?: string;
  messageId: string;
  hintsUsed: number;
}
export interface LearningState {
  topic: string;
  immediateGoal: string;
  stage: (typeof stages)[number];
  conceptsIntroduced: string[];
  evidence: Evidence[];
  unresolvedQuestions: string[];
  detours: Detour[];
  exercises: Exercise[];
  nextAction: Action;
  sourceBasis: TutorResult["sourceBasis"];
}
export interface Session {
  id: string;
  title: string;
  objective: string;
  paperId: string | null;
  state: LearningState;
  createdAt: string;
  updatedAt: string;
}
export interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  text: string;
  images: string[];
  createdAt: string;
  action?: Action;
  sourceBasis?: TutorResult["sourceBasis"];
}
export interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  doi: string | null;
  url: string | null;
  abstract: string;
  text: string;
  access: "metadata-only" | "abstract-only" | "full-text";
  provenance: string;
  verifiedAt: string;
  oaUrl: string | null;
  license: string | null;
  pages: number | null;
}
export interface Settings {
  strategy: Strategy;
  model: string;
  theme: "light" | "dark" | "system";
}
export interface AccountStatus {
  id: string;
  label: string;
  email: string;
  connected: boolean;
  planEnabled: boolean;
  active: boolean;
}
export interface AuthStatus {
  accounts: AccountStatus[];
  active: AccountStatus | null;
  notice: string | null;
}
export interface Metrics {
  activeSeconds: number;
  hintRequests: number;
  turns: number;
  independentDemonstrations: number;
  implementations: number;
  delayedRecalls: number;
}
export interface Bootstrap {
  sessions: Session[];
  papers: Paper[];
  settings: Settings;
  auth: AuthStatus;
  metrics: Metrics;
  dailyLimit: number;
}
