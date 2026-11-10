import { useState } from "react";
import {
  X,
  Plus,
  ArrowUpRight,
  FileText,
  Upload,
  Check,
  BookOpen,
} from "lucide-react";
import type { Paper } from "../../shared/types";
import { api, post } from "../api";

export function SourcePanel({
  papers,
  activeId,
  onChoose,
  onRefresh,
  onClose,
  onBegin,
}: {
  papers: Paper[];
  activeId: string | null;
  onChoose: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
  onBegin: (paper: Paper) => void;
}) {
  const [selected, setSelected] = useState(activeId ?? papers[0]?.id);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] = useState(false);
  const [notice, setNotice] = useState("");
  const [linkExisting, setLinkExisting] = useState(true);
  const paper = papers.find((p) => p.id === selected);
  async function importSource(file?: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      let p: Paper;
      if (file) {
        const f = new FormData();
        f.append("permitted", String(permission));
        if (linkExisting && paper) f.append("paperId", paper.id);
        f.append("file", file);
        p = await api<Paper>("/api/papers/upload", { method: "POST", body: f });
      } else
        p = await post<Paper>("/api/papers/import", {
          value,
          permitted: permission,
        });
      await onRefresh();
      setSelected(p.id);
      setValue("");
      setNotice(
        file
          ? "Text extracted and stored locally. Check that the file matches the selected paper."
          : "Bibliographic record imported. Full text is available only if a PDF was imported.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="workspace source-workspace" aria-label="Research library">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">READ WITH PURPOSE</span>
          <h2>The source library</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close sources"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <div className="workspace-scroll">
        <p className="panel-intro">
          Each paper is an intellectual journey. Start with its problem; earn
          your way to an independent explanation.
        </p>
        <div className="paper-list">
          {papers.map((p) => (
            <button
              className={`paper-choice ${selected === p.id ? "selected" : ""}`}
              key={p.id}
              onClick={() => {
                setSelected(p.id);
                setNotice("");
              }}
            >
              <FileText size={18} />
              <span>
                <strong>{p.title}</strong>
                <small>
                  {p.authors} · {p.year ?? "Year unverified"}
                </small>
              </span>
              {selected === p.id && <Check size={16} />}
            </button>
          ))}
        </div>
        {paper && (
          <section className="source-detail">
            <span
              className={`access-badge ${paper.access === "full-text" ? "available" : ""}`}
            >
              {paper.access === "full-text"
                ? "Full text imported"
                : paper.access === "abstract-only"
                  ? "Abstract available · full text needed"
                  : "Metadata only"}
            </span>
            <h3>{paper.title}</h3>
            <p className="fineprint">
              {paper.authors}
              <br />
              {paper.year} {paper.doi && <>· DOI {paper.doi}</>}
            </p>
            {paper.abstract && (
              <details>
                <summary>Read the publisher abstract</summary>
                <p className="abstract">{paper.abstract}</p>
              </details>
            )}
            <p className="source-provenance">
              {paper.provenance}
              <br />
              Verified {new Date(paper.verifiedAt).toLocaleDateString()}
            </p>
            <div className="source-links">
              {paper.url && (
                <a href={paper.url} target="_blank" rel="noreferrer">
                  Original source <ArrowUpRight size={13} />
                </a>
              )}
              {paper.oaUrl && (
                <a href={paper.oaUrl} target="_blank" rel="noreferrer">
                  Open-access location <ArrowUpRight size={13} />
                </a>
              )}
              {paper.access === "full-text" && (
                <a
                  href={`/api/papers/${paper.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF <ArrowUpRight size={13} />
                </a>
              )}
            </div>
            <div className="source-actions">
              <button
                className="primary"
                onClick={() => {
                  void onChoose(paper.id).catch((e) =>
                    setError((e as Error).message),
                  );
                }}
              >
                {activeId === paper.id ? (
                  <Check size={16} />
                ) : (
                  <BookOpen size={16} />
                )}{" "}
                {activeId === paper.id
                  ? "Current source"
                  : "Use in this lesson"}
              </button>
              <button className="text-button" onClick={() => onBegin(paper)}>
                <Plus size={14} />
                New paper journey
              </button>
            </div>
          </section>
        )}
        <section className="import-section">
          <span className="eyebrow">BRING YOUR OWN MATERIAL</span>
          <h3>A paper worth understanding.</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void importSource();
            }}
          >
            <label htmlFor="source-url">DOI or direct PDF URL</label>
            <div className="inline-field">
              <input
                id="source-url"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="10.1007/BF02295430"
              />
              <button
                type="submit"
                className="icon-button"
                aria-label="Import source"
                disabled={busy || !value.trim()}
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="fineprint">
              DOIs use Crossref and OpenAlex. URL imports require a publicly
              accessible PDF.
            </p>
          </form>
          <label className="check-label">
            <input
              type="checkbox"
              checked={permission}
              onChange={(e) => setPermission(e.target.checked)}
            />
            <span>
              I may store and use this source locally, including sharing
              selected excerpts with the tutor.
            </span>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={linkExisting}
              onChange={(e) => setLinkExisting(e.target.checked)}
            />
            <span>Associate the uploaded PDF with the selected paper.</span>
          </label>
          <label
            className={`upload-button ${busy || !permission ? "disabled" : ""}`}
          >
            <Upload size={16} />
            {busy ? "Importing and extracting…" : "Upload a PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy || !permission}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importSource(f);
                e.target.value = "";
              }}
            />
          </label>
          {notice && (
            <p role="status" className="success-note">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
