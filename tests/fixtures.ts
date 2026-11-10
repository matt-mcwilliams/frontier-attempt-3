import type { Message, TutorResult } from "../shared/types";
export function learner(
  text = "The general factor does not imply independence conditional on that factor alone.",
): Message {
  return {
    id: "learner-1",
    sessionId: "session-1",
    role: "user",
    text,
    images: [],
    createdAt: new Date().toISOString(),
  };
}
export function result(overrides: Partial<TutorResult> = {}): TutorResult {
  return {
    reply:
      "Consider which latent variables you have conditioned on. The remaining group factor can still induce dependence.",
    topic: "Conditional independence",
    immediateGoal:
      "Distinguish conditioning on the general factor from conditioning on all relevant factors.",
    stage: "Intuition",
    conceptsIntroduced: ["Conditional independence"],
    evidence: [],
    unresolvedQuestions: [],
    detour: { operation: "none", topic: "", reason: "" },
    exercise: { operation: "none", prompt: "", kind: "derivation" },
    nextAction: "conceptual-question",
    sourceBasis: "general-explanation",
    ...overrides,
  };
}
export function simplePdf(): Buffer {
  const text =
    "An original test document for Margin. Consider a general latent factor and a domain specific factor. This text exists only to verify local PDF extraction and persistent storage.";
  const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let doc = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(doc));
    doc += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(doc);
  doc += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(doc);
}
