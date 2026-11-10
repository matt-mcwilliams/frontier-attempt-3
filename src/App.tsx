import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  CornerDownLeft,
  Feather,
  History,
  LoaderCircle,
  MoreHorizontal,
  Paperclip,
  Settings2,
  Square,
  Target,
  X,
} from "lucide-react";
import type { Bootstrap, Message, Paper, Session } from "../shared/types";
import { stages } from "../shared/types";
import { api, post, consumeStream, uploadImage } from "./api";
const RichText = lazy(() =>
  import("./components/Markdown").then((m) => ({ default: m.Markdown })),
);
function Markdown({ text }: { text: string }) {
  return (
    <Suspense fallback={<div className="prose">{text}</div>}>
      <RichText text={text} />
    </Suspense>
  );
}
import { SourcePanel } from "./components/SourcePanel";
import { LearningPanel } from "./components/LearningPanel";
import { Settings } from "./components/Settings";
import { CameraPanel } from "./camera/CameraPanel";

type Panel = "camera" | "sources" | "history" | null;
export function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [stream, setStream] = useState("");
  const [pending, setPending] = useState<{
    text: string;
    images: string[];
  } | null>(null);
  const [hint, setHint] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const current = useRef<string | null>(null);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    const b = await api<Bootstrap>("/api/bootstrap");
    setData(b);
  }, []);
  const openSession = useCallback(async (id: string) => {
    if (busyRef.current) return;
    const r = await api<{ session: Session; messages: Message[] }>(
      `/api/sessions/${id}`,
    );
    setSession(r.session);
    setMessages(r.messages);
    current.current = id;
    localStorage.setItem("margin-session", id);
    setDraft(localStorage.getItem(`margin-draft:${id}`) ?? "");
    setImages([]);
    setError("");
    follow.current = true;
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        await post("/api/session");
        const b = await api<Bootstrap>("/api/bootstrap");
        setData(b);
        const saved = localStorage.getItem("margin-session");
        await openSession(
          b.sessions.find((s) => s.id === saved)?.id ?? b.sessions[0].id,
        );
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [openSession]);
  useEffect(() => {
    function focus() {
      void refresh().catch(() => {});
    }
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => {
    const theme = data?.settings.theme ?? "system";
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [data?.settings.theme]);
  useEffect(() => {
    if (!session) return;
    localStorage.setItem(`margin-draft:${session.id}`, draft);
  }, [draft, session?.id]);
  useEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTo({
        top: messages.length || pending ? scroll.current.scrollHeight : 0,
        behavior: stream ? "instant" : "smooth",
      });
  }, [messages, stream, pending, session?.id]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (settings) setSettings(false);
        else setPanel(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [settings]);
  useEffect(() => {
    let seconds = 0;
    let lastAction = Date.now();
    const activity = () => {
      lastAction = Date.now();
    };
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        Date.now() - lastAction < 90000
      )
        seconds++;
      if (seconds >= 30 && current.current) {
        void post("/api/metrics", {
          sessionId: current.current,
          kind: "active-seconds",
          value: seconds,
        }).catch(() => {});
        seconds = 0;
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, []);
  useEffect(() => {
    if (
      data?.auth.active?.planEnabled &&
      !localStorage.getItem("margin-plan-ack")
    )
      setSettings(true);
  }, [data?.auth.active?.planEnabled]);
  async function attach(blob: Blob) {
    if (images.length >= 3)
      throw new Error(
        "Submit or remove an attachment before adding another. A turn supports up to three images.",
      );
    setUploading(true);
    try {
      const { id } = await uploadImage(blob);
      setImages((x) => [...x, id].slice(0, 3));
      input.current?.focus();
    } finally {
      setUploading(false);
    }
  }
  async function send(text = draft, selectedImages = images) {
    if (!session || busyRef.current || (!text.trim() && !selectedImages.length))
      return;
    if (!data?.auth.active?.planEnabled) {
      setSettings(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setPending({ text, images: selectedImages });
    setStream("");
    setError("");
    follow.current = true;
    let succeeded = false;
    try {
      const response = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, images: selectedImages, hint }),
      });
      await consumeStream(response, (type, payload) => {
        if (type === "text") setStream(String(payload));
        if (type === "error") throw new Error(String(payload));
        if (type === "done") {
          const r = payload as { session: Session; messages: Message[] };
          setSession(r.session);
          setMessages((m) => [...m, ...r.messages]);
          setDraft("");
          setImages([]);
          setHint(false);
          succeeded = true;
        }
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      if (!succeeded) {
        setDraft(text);
        setImages(selectedImages);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPending(null);
      setStream("");
      input.current?.focus();
    }
  }
  async function newSession(paper?: Paper) {
    if (busyRef.current) return;
    try {
      const s = await post<Session>("/api/sessions", {
        title: paper?.title ?? "An open research question",
        paperId: paper?.id ?? null,
      });
      await refresh();
      await openSession(s.id);
      setPanel(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function choosePaper(id: string) {
    if (!session) return;
    const s = await api<Session>(`/api/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ paperId: id }),
    });
    setSession(s);
    await refresh();
  }
  if (loading)
    return (
      <div className="opening">
        <span className="brand-mark">M</span>
        <p>Opening your research notebook…</p>
        <LoaderCircle className="spin" size={18} />
      </div>
    );
  if (!data || !session)
    return (
      <main className="fatal">
        <span className="brand">Margin</span>
        <h1>Your notebook is on this computer.</h1>
        <p role="alert">{error || "The local server is unavailable."}</p>
        <p>
          Open the desktop application at localhost. A phone should use the
          private pairing QR code.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  const paper = data.papers.find((p) => p.id === session.paperId);
  const stageIndex = stages.indexOf(session.state.stage);
  const stageCount = String(stageIndex + 1).padStart(2, "0");
  const begin = () => {
    const text = paper
      ? `Begin a goal-first learning journey through ${paper.title}. Start with the motivating problem and a concrete example relevant to my research objective. Explain the core intuition before heavy notation. Be explicit about the source material you can access, and give me one useful question to reason about.`
      : "Help me explore the psychometric modeling choices that matter for low-data diagnostic assessment. Begin with a concrete research problem and determine one useful next step.";
    setDraft(text);
    void send(text, []);
  };
  const messageView = (m: Message) => (
    <article id={`message-${m.id}`} key={m.id} className={`message ${m.role}`}>
      <div className="message-meta">
        <span>
          {m.role === "assistant" ? (
            <>
              <Feather size={13} />
              MARGIN
            </>
          ) : (
            "YOU"
          )}
        </span>
        <time dateTime={m.createdAt}>
          {new Date(m.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {m.images.length > 0 && (
        <div className="message-images">
          {m.images.map((id) => (
            <a
              key={id}
              href={`/api/images/${id}`}
              target="_blank"
              rel="noreferrer"
            >
              <img src={`/api/images/${id}`} alt="Submitted handwritten work" />
            </a>
          ))}
        </div>
      )}
      <Markdown text={m.text} />
      {m.sourceBasis && (
        <span className="source-footnote">
          {
            {
              "full-text": "Uses imported source excerpts",
              "abstract-only": "Source access: publisher abstract",
              "metadata-only": "Source access: bibliographic metadata",
              "general-explanation": "Tutor explanation",
            }[m.sourceBasis]
          }
        </span>
      )}
    </article>
  );
  return (
    <div className={`app ${panel ? "has-workspace" : ""}`}>
      <header className="app-header">
        <a className="wordmark" href="/" aria-label="Margin home">
          <span className="brand-mark">M</span>
          <span className="brand">Margin</span>
          <span className="edition">RESEARCH STUDIO</span>
        </a>
        <nav aria-label="Workspace">
          <button
            className={panel === "sources" ? "nav-button active" : "nav-button"}
            onClick={() =>
              setPanel((p) => (p === "sources" ? null : "sources"))
            }
          >
            <BookOpen size={17} />
            <span>Sources</span>
          </button>
          <button
            className={panel === "history" ? "nav-button active" : "nav-button"}
            onClick={() => {
              void refresh();
              setPanel((p) => (p === "history" ? null : "history"));
            }}
          >
            <History size={17} />
            <span>Learning record</span>
          </button>
          <span className="nav-divider" />
          <button
            className="nav-button"
            aria-label="Open settings"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="profile-button"
            aria-label={
              data.auth.active?.planEnabled
                ? "Account settings"
                : "Continue with ChatGPT"
            }
            onClick={() => setSettings(true)}
          >
            {data.auth.active?.planEnabled ? (
              <span className="connected-avatar">
                {(data.auth.active.email || "M")[0].toUpperCase()}
              </span>
            ) : (
              <span className="login-label">
                Connect ChatGPT <ArrowUpRight size={13} />
              </span>
            )}
          </button>
        </nav>
      </header>
      <div className="app-body">
        <main className={`lesson ${messages.length ? "" : "empty-lesson"}`}>
          <div className="objective-bar">
            <Target size={16} strokeWidth={1.5} />
            <div>
              <span className="eyebrow">THE LONG VIEW</span>
              <button
                onClick={() => setSettings(true)}
                title={session.objective}
              >
                {session.objective}
              </button>
            </div>
            <button
              aria-label="Edit research objective"
              className="icon-button"
              onClick={() => setSettings(true)}
            >
              <MoreHorizontal size={17} />
            </button>
          </div>
          <div
            className="lesson-scroll"
            ref={scroll}
            onScroll={() => {
              const s = scroll.current!;
              follow.current =
                s.scrollHeight - s.scrollTop - s.clientHeight < 120;
            }}
          >
            <div className="reading-column">
              <div className="lesson-breadcrumb">
                <span>PSYCHOMETRICS</span>
                <ChevronRight size={12} />
                <span>
                  {paper?.year === 1992
                    ? "BIFACTOR MODELS"
                    : paper?.year === 2009
                      ? "COGNITIVE DIAGNOSIS"
                      : "RESEARCH IN PROGRESS"}
                </span>
                <span className="saved-label">
                  <Check size={11} />
                  Saved locally
                </span>
              </div>
              <header className="lesson-heading">
                <div className="row spread">
                  <span className="eyebrow">
                    {paper
                      ? "A PAPER, UNDERSTOOD DEEPLY"
                      : "A QUESTION WORTH PURSUING"}
                  </span>
                  <span className="lesson-number">
                    FIELDNOTES / {String(data.sessions.length).padStart(2, "0")}
                  </span>
                </div>
                <h1>
                  {messages.length ? (
                    session.state.topic
                  ) : paper?.id === "bifactor-1992" ? (
                    <>
                      One score.
                      <br />
                      <em>Many abilities.</em>
                    </>
                  ) : paper?.id === "dina-2009" ? (
                    <>
                      Beyond a score.
                      <br />
                      <em>A diagnosis.</em>
                    </>
                  ) : (
                    session.title
                  )}
                </h1>
                {paper && (
                  <button
                    className="paper-reference"
                    onClick={() => setPanel("sources")}
                  >
                    <span className="paper-icon">
                      <FileIcon />
                    </span>
                    <span>
                      <strong>{paper.title}</strong>
                      <small>
                        {paper.authors.replaceAll(";", " &")} · {paper.year}{" "}
                        <span className="access-inline">
                          {paper.access === "full-text"
                            ? "Full text"
                            : paper.access === "abstract-only"
                              ? "Abstract only"
                              : "Metadata only"}
                        </span>
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </header>
              <div className="journey-indicator">
                <div
                  className="journey-track"
                  aria-label={`Paper journey: ${session.state.stage}`}
                >
                  {stages.map((s, i) => (
                    <span
                      key={s}
                      className={
                        i < stageIndex
                          ? "past"
                          : i === stageIndex
                            ? "current"
                            : ""
                      }
                      title={s}
                    />
                  ))}
                </div>
                <span>
                  <b>{stageCount}</b> / 06 <i>·</i> {session.state.stage}
                </span>
              </div>
              {session.state.detours.length > 0 && (
                <div className="inline-detour">
                  <CornerDownLeft size={15} />
                  <span>
                    Exploring {session.state.detours.at(-1)!.topic}
                    <small>
                      Return point: {session.state.detours.at(-1)!.returnTopic}
                    </small>
                  </span>
                </div>
              )}
              {messages.length === 0 && !busy ? (
                <section className="lesson-invitation">
                  <span className="invitation-mark">“</span>
                  <h2>
                    What does a test score
                    <br />
                    leave unexplained?
                  </h2>
                  <p>
                    Your research begins with a problem, not a prerequisite
                    list. Explore the idea, work through the mathematics, and
                    build an explanation you can defend.
                  </p>
                  <button className="begin-button" onClick={begin}>
                    Begin the exploration <ArrowUpRight size={18} />
                  </button>
                  <div className="invitation-note">
                    <span className="tiny-rule" />
                    <p>
                      {data.auth.active?.planEnabled
                        ? "The tutor will begin from your research objective."
                        : "Connect your ChatGPT account to begin. Your lessons stay on this computer."}
                    </p>
                  </div>
                </section>
              ) : null}
              <div
                className="conversation"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.map(messageView)}
                {pending && (
                  <article className="message user pending">
                    <div className="message-meta">
                      <span>YOU</span>
                      <span>Sending</span>
                    </div>
                    {pending.images.length > 0 && (
                      <div className="message-images">
                        {pending.images.map((id) => (
                          <img
                            key={id}
                            src={`/api/images/${id}`}
                            alt="Attached notebook work"
                          />
                        ))}
                      </div>
                    )}
                    <Markdown text={pending.text} />
                  </article>
                )}
                {busy && (
                  <article className="message assistant streaming">
                    <div className="message-meta">
                      <span>
                        <Feather size={13} />
                        MARGIN
                      </span>
                      <span>
                        <LoaderCircle size={11} className="spin" />
                        {stream ? "Writing" : "Thinking through the next step"}
                      </span>
                    </div>
                    {stream ? (
                      <Markdown text={stream} />
                    ) : (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                      </div>
                    )}
                  </article>
                )}
              </div>
              {messages.length > 0 && !busy && (
                <div className="next-step">
                  <span className="eyebrow">THE THREAD WE’RE FOLLOWING</span>
                  <p>{session.state.immediateGoal}</p>
                </div>
              )}
            </div>
          </div>
          <footer className="composer-area">
            <div className="composer-inner">
              {error && (
                <div className="error-banner" role="alert">
                  <span>{error}</span>
                  <button
                    aria-label="Dismiss error"
                    className="icon-button"
                    onClick={() => setError("")}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className={`composer ${busy ? "is-busy" : ""}`}>
                {images.length > 0 && (
                  <div className="draft-images">
                    {images.map((id) => (
                      <div key={id}>
                        <img
                          src={`/api/images/${id}`}
                          alt="Notebook attachment ready to submit"
                        />
                        <button
                          aria-label="Remove attachment"
                          onClick={() =>
                            setImages((xs) => xs.filter((x) => x !== id))
                          }
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <span>Only submitted images go to the tutor.</span>
                  </div>
                )}
                <textarea
                  ref={input}
                  aria-label="Message the tutor"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    images.length
                      ? "What would you like me to examine in your work?"
                      : "A question, a line of reasoning, a place you’re stuck…"
                  }
                  rows={2}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="composer-tools">
                  <div className="row">
                    <button
                      className="icon-button"
                      title="Attach notebook image"
                      aria-label="Attach notebook image"
                      disabled={uploading || images.length >= 3 || busy}
                      onClick={() => upload.current?.click()}
                    >
                      {uploading ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <Paperclip size={18} />
                      )}
                    </button>
                    <button
                      className={`camera-toggle ${panel === "camera" ? "active" : ""}`}
                      onClick={() =>
                        setPanel((p) => (p === "camera" ? null : "camera"))
                      }
                    >
                      <Camera size={17} />
                      <span>Connect camera</span>
                    </button>
                    <span className="composer-divider" />
                    <button
                      className={`hint-toggle ${hint ? "active" : ""}`}
                      onClick={() => setHint((v) => !v)}
                      aria-pressed={hint}
                      disabled={busy}
                    >
                      Ask for a hint
                    </button>
                  </div>
                  {busy ? (
                    <button
                      className="send-button stop"
                      aria-label="Stop tutor response"
                      onClick={() =>
                        void post(`/api/sessions/${session.id}/stop`)
                      }
                    >
                      <Square size={13} />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      aria-label="Send message"
                      disabled={(!draft.trim() && !images.length) || uploading}
                      onClick={() => void send()}
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>
              <div className="composer-caption">
                <span>
                  {data.auth.active?.planEnabled ? (
                    <>
                      <span className="status-dot" />
                      Using ChatGPT plan{" "}
                      <a
                        href="https://chatgpt.com/settings/usage"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Manage usage
                      </a>
                    </>
                  ) : (
                    <>A private workspace for independent understanding.</>
                  )}
                </span>
                <span>
                  Enter to send <i>·</i> Shift + Enter for a new line
                </span>
              </div>
            </div>
          </footer>
          <input
            type="file"
            ref={upload}
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Notebook image file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void attach(f).catch((e) => setError(e.message));
              e.target.value = "";
            }}
          />
        </main>
        {panel === "camera" && (
          <CameraPanel
            onClose={() => setPanel(null)}
            onCapture={attach}
            onUpload={() => upload.current?.click()}
          />
        )}
        {panel === "sources" && (
          <SourcePanel
            papers={data.papers}
            activeId={session.paperId}
            onChoose={choosePaper}
            onRefresh={refresh}
            onClose={() => setPanel(null)}
            onBegin={(p) => void newSession(p)}
          />
        )}
        {panel === "history" && (
          <LearningPanel
            session={session}
            sessions={data.sessions}
            metrics={data.metrics}
            onClose={() => setPanel(null)}
            onSelect={(id) => {
              if (!busy) void openSession(id).catch((e) => setError(e.message));
            }}
            onNew={() => void newSession()}
            onReview={(concept) => {
              setDraft(
                `Give me a delayed retrieval or unfamiliar transfer problem about ${concept}. Do not show the answer until I attempt it. Use my prior evidence to choose a suitable challenge.`,
              );
              input.current?.focus();
            }}
            onEvidence={(id) => {
              const el = document.getElementById(`message-${id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.classList.add("highlighted");
              setTimeout(() => el?.classList.remove("highlighted"), 2000);
            }}
          />
        )}
      </div>
      {settings && (
        <Settings
          data={data}
          session={session}
          onClose={() => setSettings(false)}
          onRefresh={refresh}
          onUpdateSession={(s) => {
            setSession(s);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
function FileIcon() {
  return (
    <svg
      width="17"
      height="20"
      viewBox="0 0 17 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 1h7l4 4v13H3V1Z" stroke="currentColor" />
      <path d="M9 1v5h5M5.5 10h6M5.5 13h6" stroke="currentColor" />
    </svg>
  );
}
