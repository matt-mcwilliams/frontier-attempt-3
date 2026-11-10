import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowUpRight,
  LogOut,
  Download,
  Sun,
  Moon,
  Monitor,
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
      aria-labelledby="settings-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="settings-inner">
        <header className="workspace-head">
          <h2 id="settings-title">Settings</h2>
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
          <h3>ChatGPT</h3>
          <p>
            Sign in to tutor with your ChatGPT plan. Credentials stay on this
            computer.
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
        </section>
        <section>
          <h3>Research objective</h3>
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
          <h3>Appearance</h3>
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
                aria-pressed={data.settings.theme === theme}
                className={data.settings.theme === theme ? "selected" : ""}
                onClick={() => void patch({ theme })}
              >
                <Icon size={16} />
                {theme}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>Your data</h3>
          <p>
            Lessons and files stay on this computer. Submitted messages, source
            excerpts, and selected images go to OpenAI; live video stays
            private.
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
            Export includes text and image IDs. Back up the data directory for
            images and PDFs.
          </p>
        </section>
        <details className="advanced-settings">
          <summary>Advanced settings</summary>
          <p className="fineprint">
            Daily limit: {data.dailyLimit} attempts. Each submitted turn makes
            one tutor request.
          </p>

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
            Teaching strategies are experimental. Activity counts do not measure
            mastery.
          </p>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
