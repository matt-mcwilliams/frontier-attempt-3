import { X, CornerDownLeft, ArrowUpRight, Clock, Plus } from "lucide-react";
import type { Session, Metrics } from "../../shared/types";
export function LearningPanel({
  session,
  sessions,
  metrics,
  onClose,
  onSelect,
  onNew,
  onReview,
  onEvidence,
}: {
  session: Session;
  sessions: Session[];
  metrics: Metrics;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onReview: (concept: string) => void;
  onEvidence: (id: string) => void;
}) {
  const s = session.state;
  const concepts = [...new Set(s.evidence.map((e) => e.concept))];
  return (
    <aside
      className="workspace learning-workspace"
      aria-label="Learning record"
    >
      <header className="workspace-head">
        <div>
          <span className="eyebrow">CONTINUITY, NOT A SCORE</span>
          <h2>Your learning record</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close learning record"
        >
          <X size={20} />
        </button>
      </header>
      <div className="workspace-scroll">
        <p className="panel-intro">
          Understanding leaves evidence. These are the tutor’s observations of
          your work, open to revision—not mastery estimates.
        </p>
        <div className="metric-strip">
          <div>
            <strong>{Math.round(metrics.activeSeconds / 60)}</strong>
            <span>active minutes</span>
          </div>
          <div>
            <strong>{metrics.hintRequests}</strong>
            <span>hints requested</span>
          </div>
          <div>
            <strong>{metrics.implementations}</strong>
            <span>implementations</span>
          </div>
        </div>
        <p className="fineprint">
          Across lessons · {metrics.independentDemonstrations} independent
          demonstrations · {metrics.delayedRecalls} recall observations. These
          counts do not establish mastery.
        </p>
        {s.detours.map((d, i) => (
          <section className="detour-card" key={i}>
            <span className="eyebrow">PREREQUISITE DETOUR</span>
            <h3>{d.topic}</h3>
            <p>{d.reason}</p>
            <small>
              <CornerDownLeft size={13} />
              Return to {d.returnTopic}
            </small>
          </section>
        ))}
        <section className="record-section">
          <span className="eyebrow">DEMONSTRATED & STILL DEVELOPING</span>
          {!s.evidence.length ? (
            <p>
              No evidence yet. Your explanations, derivations, and
              implementations will appear here as you work.
            </p>
          ) : (
            concepts.map((concept) => (
              <div className="concept-record" key={concept}>
                <h4>{concept}</h4>
                {s.evidence
                  .filter((e) => e.concept === concept)
                  .slice(-4)
                  .map((e) => (
                    <div className="evidence" key={e.id}>
                      <span className={`evidence-label ${e.demonstration}`}>
                        {e.demonstration} · {e.task}
                      </span>
                      <p>{e.observation}</p>
                      {e.quote && <blockquote>“{e.quote}”</blockquote>}
                      <button
                        className="text-button"
                        onClick={() => onEvidence(e.messageId)}
                      >
                        View original work <ArrowUpRight size={12} />
                      </button>
                      <small>
                        {e.kind === "image-observation"
                          ? "Tutor interpretation of submitted image"
                          : "Linked to learner’s words"}{" "}
                        · {new Date(e.createdAt).toLocaleDateString()}
                      </small>
                    </div>
                  ))}
                <button
                  className="review-button"
                  onClick={() => onReview(concept)}
                >
                  <Clock size={13} />
                  {new Date(
                    s.evidence.filter((e) => e.concept === concept).at(-1)!
                      .reviewAt,
                  ) <= new Date()
                    ? "Review due"
                    : "Practice recall"}
                </button>
              </div>
            ))
          )}
        </section>
        {s.conceptsIntroduced.length > 0 && (
          <section className="record-section">
            <span className="eyebrow">INTRODUCED, NOT YET PROVEN</span>
            <p>{s.conceptsIntroduced.join(" · ")}</p>
          </section>
        )}
        {s.exercises.length > 0 && (
          <section className="record-section">
            <span className="eyebrow">PROBLEMS & IMPLEMENTATIONS</span>
            {s.exercises.map((e) => (
              <div className="exercise-record" key={e.id}>
                <span className="evidence-label">
                  {e.kind} · {e.status}
                </span>
                <p>{e.prompt}</p>
              </div>
            ))}
          </section>
        )}
        {s.unresolvedQuestions.length > 0 && (
          <section className="record-section">
            <span className="eyebrow">OPEN QUESTIONS</span>
            {s.unresolvedQuestions.map((q) => (
              <p key={q}>{q}</p>
            ))}
          </section>
        )}
        <section className="record-section history">
          <div className="row spread">
            <span className="eyebrow">LEARNING HISTORY</span>
            <button className="text-button" onClick={onNew}>
              <Plus size={14} />
              New lesson
            </button>
          </div>
          {sessions.map((x) => (
            <button
              key={x.id}
              className={`history-item ${x.id === session.id ? "selected" : ""}`}
              onClick={() => onSelect(x.id)}
            >
              <strong>{x.title}</strong>
              <span>
                {x.state.stage} · {new Date(x.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </section>
      </div>
    </aside>
  );
}
