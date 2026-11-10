import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUpRight,
  LogOut,
  Download,
  Sun,
  Moon,
  Monitor,
  FlaskConical,
} from "lucide-react";
import type {
  Bootstrap,
  Settings as SettingsType,
  Session,
} from "../../shared/types";
import { strategies } from "../../shared/types";
import { api, post } from "../api";

export function Settings({
  data,
  session,
  onClose,
  onRefresh,
  onUpdateSession,
}: {
  data: Bootstrap;
  session: Session;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onUpdateSession: (s: Session) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<
    { slug: string; display_name: string }[]
  >([]);
  const [goal, setGoal] = useState(session.objective);
  const [ack, setAck] = useState(
    !localStorage.getItem("margin-plan-ack") && !!data.auth.active?.planEnabled,
  );
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setModels([]);
    if (data.auth.active?.planEnabled) {
      if (!localStorage.getItem("margin-plan-ack")) setAck(true);
      void api<typeof models>("/api/models")
        .then((m) => {
          if (!cancelled) setModels(m);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [data.auth.active?.id, data.auth.active?.planEnabled]);
  async function patch(p: Partial<SettingsType>) {
    try {
      await api("/api/settings", { method: "PATCH", body: JSON.stringify(p) });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function login(accountId?: string) {
    setBusy(true);
    setError("");
    const popup = window.open(
      "about:blank",
      "margin-chatgpt",
      "width=700,height=850",
    );
    try {
      const r = await post<{ url: string }>("/api/auth/start", { accountId });
      if (popup) popup.location.href = r.url;
      else location.assign(r.url);
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="settings-inner">
        <header className="workspace-head">
          <div>
            <span className="eyebrow">YOUR PERSONAL STUDIO</span>
            <h2>A few quiet settings.</h2>
          </div>
          <button
            aria-label="Close settings"
            className="icon-button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {ack && (
          <div className="plan-confirmation">
            <h3>You’re using your ChatGPT plan</h3>
            <p>
              Eligible tutoring requests use your ChatGPT plan and any credits
              you authorize. Manage limits in ChatGPT settings.
            </p>
            <button
              className="primary"
              onClick={() => {
                localStorage.setItem("margin-plan-ack", "1");
                setAck(false);
              }}
            >
              Got it
            </button>
          </div>
        )}
        <section>
          <span className="eyebrow">ACCOUNT & MODEL</span>
          <h3>Use your ChatGPT plan.</h3>
          <p>
            Sign in and approve plan use for this local, open-source tutor. Your
            credentials stay on this computer. No API key is required.
          </p>
          {data.auth.accounts.map((a) => (
            <div className="account-row" key={a.id}>
              <div>
                <strong>{a.label}</strong>
                <small>
                  {a.active
                    ? a.planEnabled
                      ? "Using ChatGPT plan"
                      : a.connected
                        ? "Plan use not granted"
                        : "Reconnect required"
                    : "Saved registration"}
                </small>
              </div>
              <button
                disabled={busy}
                className="text-button"
                onClick={() => void login(a.id)}
              >
                {a.active ? "Reconnect" : "Continue"}
              </button>
            </div>
          ))}
          <button
            className="chatgpt-button"
            data-oai-siwc-button
            onClick={() => void login()}
            disabled={busy}
          >
            {busy ? "Opening sign-in…" : "Continue with ChatGPT"}
            <ArrowUpRight size={16} />
          </button>
          {data.auth.active?.connected && (
            <button
              className="text-button signout"
              onClick={() => {
                setBusy(true);
                void post("/api/auth/signout")
                  .then(onRefresh)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          )}
          {data.auth.notice && (
            <p role="status" className="error">
              {data.auth.notice}
            </p>
          )}
          {models.length > 0 && (
            <label className="field-label">
              Tutor model
              <select
                value={data.settings.model}
                onChange={(e) => void patch({ model: e.target.value })}
              >
                <option value="">Account default</option>
                {models.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <a
            className="external-link"
            href="https://chatgpt.com/settings/usage"
            target="_blank"
            rel="noreferrer"
          >
            Manage ChatGPT usage <ArrowUpRight size={14} />
          </a>
          <p className="fineprint">
            Local safeguard: {data.dailyLimit} attempts per day; one request per
            submitted turn. No autonomous model calls.
          </p>
        </section>
        <section>
          <span className="eyebrow">RESEARCH OBJECTIVE</span>
          <label className="sr-only" htmlFor="goal">
            Long-term research objective
          </label>
          <textarea
            id="goal"
            className="goal-input"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={4}
          />
          <button
            className="text-button"
            disabled={goal === session.objective || goal.length < 10}
            onClick={() => {
              void api<Session>(`/api/sessions/${session.id}`, {
                method: "PATCH",
                body: JSON.stringify({ objective: goal }),
              })
                .then(onUpdateSession)
                .catch((e) => setError(e.message));
            }}
          >
            Save objective
          </button>
        </section>
        <section>
          <span className="eyebrow">APPEARANCE</span>
          <div className="theme-options">
            {(
              [
                ["light", Sun],
                ["dark", Moon],
                ["system", Monitor],
              ] as const
            ).map(([theme, Icon]) => (
              <button
                key={theme}
                className={data.settings.theme === theme ? "selected" : ""}
                onClick={() => void patch({ theme })}
              >
                <Icon size={16} />
                {theme}
              </button>
            ))}
          </div>
        </section>
        <section className="experimental">
          <div className="row">
            <FlaskConical size={17} />
            <span className="eyebrow">EXPERIMENTAL TEACHING</span>
          </div>
          <label className="field-label">
            Instructional strategy
            <select
              value={data.settings.strategy}
              onChange={(e) =>
                void patch({
                  strategy: e.target.value as SettingsType["strategy"],
                })
              }
            >
              {strategies.map((s) => (
                <option key={s} value={s}>
                  {
                    {
                      "goal-first": "Goal-first research tutoring",
                      direct: "More direct instruction",
                      socratic: "More targeted questioning",
                      "challenge-first": "Challenge-first learning",
                      "paper-centered": "Paper-centered instruction",
                    }[s]
                  }
                </option>
              ))}
            </select>
          </label>
          <p className="fineprint">
            Evidence includes active study time, hint requests, independent
            demonstrations, completed implementations, and recall attempts.
            Conversation volume is not a learning score.
          </p>
        </section>
        <section>
          <span className="eyebrow">LOCAL DATA</span>
          <p>
            Lessons, sources, and notebook captures are stored in SQLite on this
            computer. Submitted lesson context and selected images go to OpenAI.
            Continuous video does not.
          </p>
          <a
            className="subtle-button"
            href="/api/export"
            download="margin-learning-record.json"
          >
            <Download size={15} />
            Export learning record
          </a>
          <p className="fineprint">
            The JSON export includes lesson text and source text, with image
            IDs. Back up the data directory to preserve images and PDFs.
          </p>
        </section>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
