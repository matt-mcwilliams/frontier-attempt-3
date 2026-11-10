import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Message,
  Session,
  Paper,
  Settings,
  LearningState,
  Metrics,
} from "../shared/types.ts";
import { objective } from "../shared/types.ts";
import seedPapers from "./seed-papers.json";

export const initialState = (): LearningState => ({
  topic: "The structure behind a test score",
  immediateGoal:
    "Distinguish a general ability from domain-specific variation, and ask what a useful diagnostic model must preserve.",
  stage: "Motivation",
  conceptsIntroduced: [],
  evidence: [],
  unresolvedQuestions: [],
  detours: [],
  exercises: [],
  nextAction: "motivate",
  sourceBasis: "general-explanation",
});
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS message_session ON messages(session_id);
      CREATE TABLE IF NOT EXISTS papers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, session_id TEXT, kind TEXT NOT NULL, value REAL NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    `);
    if (!this.get("settings"))
      this.set("settings", {
        strategy: "goal-first",
        model: "",
        theme: "system",
      });
    for (const paper of seedPapers)
      if (!this.paper(paper.id)) this.savePaper(paper as Paper);
    if (!this.sessions().length)
      this.createSession(
        "A general factor, many specific abilities",
        "bifactor-1992",
      );
  }
  get<T>(key: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM kv WHERE key=?").get(key);
    return row ? (JSON.parse(row.value as string) as T) : undefined;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  settings() {
    return this.get<Settings>("settings")!;
  }
  sessions(): Session[] {
    return this.db
      .prepare("SELECT data FROM sessions")
      .all()
      .map((r) => JSON.parse(r.data as string) as Session)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  session(id: string): Session | undefined {
    const r = this.db.prepare("SELECT data FROM sessions WHERE id=?").get(id);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  createSession(title: string, paperId: string | null) {
    const now = new Date().toISOString();
    const s: Session = {
      id: randomUUID(),
      title,
      objective,
      paperId,
      state: initialState(),
      createdAt: now,
      updatedAt: now,
    };
    this.saveSession(s);
    return s;
  }
  saveSession(s: Session) {
    this.db
      .prepare("INSERT OR REPLACE INTO sessions VALUES (?,?)")
      .run(s.id, JSON.stringify(s));
  }
  messages(id: string): Message[] {
    return this.db
      .prepare("SELECT data FROM messages WHERE session_id=? ORDER BY rowid")
      .all(id)
      .map((r) => JSON.parse(r.data as string));
  }
  saveMessage(m: Message) {
    this.db
      .prepare("INSERT INTO messages VALUES (?,?,?)")
      .run(m.id, m.sessionId, JSON.stringify(m));
  }
  commitTurn(user: Message, assistant: Message, session: Session) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.saveMessage(user);
      this.saveMessage(assistant);
      this.saveSession(session);
      this.event("turn", session.id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  papers(): Paper[] {
    return this.db
      .prepare("SELECT data FROM papers ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  paper(id: string): Paper | undefined {
    const r = this.db.prepare("SELECT data FROM papers WHERE id=?").get(id);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  savePaper(p: Paper) {
    this.db
      .prepare("INSERT OR REPLACE INTO papers VALUES (?,?)")
      .run(p.id, JSON.stringify(p));
  }
  image(id: string) {
    return this.db
      .prepare("SELECT mime,data FROM images WHERE id=?")
      .get(id) as { mime: string; data: Uint8Array } | undefined;
  }
  saveImage(mime: string, data: Buffer) {
    const id = randomUUID();
    this.db.prepare("INSERT INTO images VALUES (?,?,?)").run(id, mime, data);
    return id;
  }
  event(kind: string, sessionId: string | null, value = 1) {
    this.db
      .prepare(
        "INSERT INTO events(session_id,kind,value,created_at) VALUES (?,?,?,?)",
      )
      .run(sessionId, kind, value, new Date().toISOString());
  }
  dailyAttempts() {
    return Number(
      this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM events WHERE kind='attempt' AND created_at>=?",
        )
        .get(new Date().toISOString().slice(0, 10))?.n ?? 0,
    );
  }
  metrics(): Metrics {
    const sum = (kind: string) =>
      Number(
        this.db
          .prepare(
            "SELECT COALESCE(SUM(value),0) AS n FROM events WHERE kind=?",
          )
          .get(kind)?.n ?? 0,
      );
    const states = this.sessions().map((s) => s.state);
    return {
      activeSeconds: sum("active-seconds"),
      hintRequests: sum("hint"),
      turns: sum("turn"),
      independentDemonstrations: states
        .flatMap((s) => s.evidence)
        .filter((e) => e.demonstration === "independent").length,
      implementations: states
        .flatMap((s) => s.exercises)
        .filter((e) => e.kind === "implementation" && e.status === "completed")
        .length,
      delayedRecalls: states
        .flatMap((s) => s.evidence)
        .filter((e) => e.task === "recall" && e.delayedRecall).length,
    };
  }
  close() {
    this.db.close();
  }
}
