import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isInactivityDue } from "./agent-core";

export type Company = { id: string; name: string; prompt: string };

export type Settings = {
  aiProvider: "openai" | "gemini" | "ollama";
  openaiKey: string;
  openaiModel: string;
  geminiKey: string;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  waProvider: "evolution" | "ycloud";
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
  ycloudKey: string;
  ycloudFrom: string;
  handoffProvider: "whatsapp" | "other" | "chatwoot";
  attendantNumber: string;
  chatwootUrl: string;
  chatwootAccountId: string;
  chatwootToken: string;
  chatwootInboxId: string;
  webhookToken: string;
  systemPrompt: string;
  greeting: string;
  humanOption: boolean;
  companies: Company[];
  enabled: boolean;
  replyGroups: boolean;
};

export type KnowledgeItem = {
  id: string;
  type: "text" | "pdf" | "url" | "file";
  title: string;
  content: string;
  /** Company this content belongs to; empty = shared by all. */
  companyId?: string | undefined;
  createdAt: string;
};

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker";
export type ChatMedia = { id: string; kind: MediaKind; mimetype: string; fileName?: string | undefined };
export type ChatMessage = { role: "user" | "assistant" | "agent"; content: string; at: string; media?: ChatMedia | undefined };
export type ChatState = {
  name: string;
  number: string;
  channel: "evolution" | "ycloud";
  stage: "menu" | "company" | "human";
  companyId?: string | undefined;
  chatwootConversationId?: number | undefined;
  handoffProvider?: "whatsapp" | "other" | "chatwoot" | undefined;
  handoffNotificationError?: string | undefined;
  inactivityReminderAt?: string | undefined;
  closed?: boolean | undefined;
  /** Attendance queue state in the app: waiting in queue, being handled, or resolved. */
  ticketStatus?: "queue" | "open" | "resolved" | undefined;
  closedAt?: string | undefined;
  messages: ChatMessage[];
};
export type Conversations = {
  chats: Record<string, ChatState>;
  seenIds: string[];
};

export type AdminUser = { username: string; salt: string; hash: string };
export type Session = { token: string; username: string; expires: number };
export type AuthData = {
  users: AdminUser[];
  sessions: Session[];
  attempts: Record<string, { count: number; until: number }>;
};

// ---------- Install config (MySQL or local files) ----------
export type DbConfig = {
  driver: "mysql" | "file" | "cloud";
  host?: string | undefined;
  port?: number | undefined;
  database?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
};

const dataDir = () => process.env["DATA_DIR"] || path.join(process.cwd(), "data");
const configFile = () => path.join(dataDir(), "config.json");

export async function getDbConfig(): Promise<DbConfig | null> {
  // Hosted on Lovable: use Lovable Cloud automatically (no install step).
  if (!process.env["DB_HOST"] && process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    return { driver: "cloud" };
  }
  if (process.env["DB_HOST"] && process.env["DB_NAME"]) {
    return {
      driver: "mysql",
      host: process.env["DB_HOST"],
      port: Number(process.env["DB_PORT"] || 3306),
      database: process.env["DB_NAME"],
      user: process.env["DB_USER"],
      password: process.env["DB_PASSWORD"],
    };
  }
  try {
    return JSON.parse(await fs.readFile(configFile(), "utf8")) as DbConfig;
  } catch {
    return null;
  }
}

let pool: any = null;
let poolKey = "";
async function mysqlPool(cfg: DbConfig) {
  const key = JSON.stringify(cfg);
  if (pool && poolKey === key) return pool;
  const mysql = await import("mysql2/promise");
  pool = mysql.createPool({
    host: cfg.host ?? "localhost",
    port: cfg.port || 3306,
    database: cfg.database ?? "",
    user: cfg.user ?? "",
    password: cfg.password ?? "",
    connectionLimit: 5,
    charset: "utf8mb4",
  });
  poolKey = key;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS app_data (
      name VARCHAR(64) NOT NULL PRIMARY KEY,
      data LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  return pool;
}

/** Test a MySQL connection and create the tables. Throws a readable error. */
export async function installMysql(cfg: DbConfig) {
  pool = null;
  await mysqlPool(cfg);
}

export async function saveDbConfig(cfg: DbConfig) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify(cfg, null, 2), "utf8");
}

async function requireConfig() {
  const cfg = await getDbConfig();
  if (!cfg) throw new Error("Sistema não instalado. Acesse /install");
  return cfg;
}

// ---------- Generic JSON document storage ----------
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(name, next.catch(() => undefined));
  return next;
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  const cfg = await requireConfig();
  try {
    let raw: string | undefined;
    if (cfg.driver === "cloud") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.from("app_data").select("data").eq("name", name).maybeSingle();
      if (error) throw new Error(`Banco: ${error.message}`);
      return data ? ({ ...fallback, ...(data.data as object) } as T) : fallback;
    }
    if (cfg.driver === "mysql") {
      const [rows] = await (await mysqlPool(cfg)).query("SELECT data FROM app_data WHERE name = ?", [name]);
      raw = rows[0]?.data;
    } else {
      raw = await fs.readFile(path.join(dataDir(), name), "utf8");
    }
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch (e: any) {
    if (cfg.driver !== "file") throw e;
    return fallback;
  }
}

async function writeJson(name: string, data: unknown) {
  const cfg = await requireConfig();
  const json = JSON.stringify(data);
  if (cfg.driver === "cloud") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_data")
      .upsert({ name, data: JSON.parse(json), updated_at: new Date().toISOString() });
    if (error) throw new Error(`Banco: ${error.message}`);
    return;
  }
  if (cfg.driver === "mysql") {
    await (await mysqlPool(cfg)).query(
      "INSERT INTO app_data (name, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
      [name, json],
    );
    return;
  }
  await fs.mkdir(dataDir(), { recursive: true });
  const file = path.join(dataDir(), name);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, file);
}

/** Read-modify-write a JSON document under a per-document lock. */
export function update<T>(name: string, fallback: T, fn: (d: T) => T | void) {
  return withLock(name, async () => {
    const data = await readJson(name, fallback);
    const result = (fn(data) ?? data) as T;
    await writeJson(name, result);
    return result;
  });
}

export const DEFAULT_PROMPT =
  "Você é um atendente virtual simpático e objetivo no WhatsApp. Responda em português, com mensagens curtas. Use apenas as informações da base de conhecimento; se a resposta não estiver na base de conhecimento, responda apenas [TRANSFERIR].";

const settingsFallback = (): Settings => ({
  aiProvider: "gemini",
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  geminiKey: "",
  geminiModel: "gemini-3.8-flash",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "llama3.1",
  waProvider: "evolution",
  evolutionUrl: "",
  evolutionKey: "",
  evolutionInstance: "",
  ycloudKey: "",
  ycloudFrom: "",
  handoffProvider: "chatwoot",
  attendantNumber: "",
  chatwootUrl: "",
  chatwootAccountId: "",
  chatwootToken: "",
  chatwootInboxId: "",
  webhookToken: "",
  systemPrompt: DEFAULT_PROMPT,
  greeting: "Oi! Tudo bem? Para que eu possa direcionar o seu atendimento rapidinho, me conta: sobre qual área você precisa falar?",
  humanOption: true,
  companies: [
    { id: "pace3-associacao", name: "Associação Pace3", prompt: "" },
    { id: "pace3-eventos", name: "Pace3 Eventos Esportivos", prompt: "" },
  ],
  enabled: true,
  replyGroups: false,
});

export async function getSettings(): Promise<Settings> {
  const s = await readJson("settings.json", settingsFallback());
  if (!s.webhookToken) {
    return update("settings.json", settingsFallback(), (d) => {
      if (!d.webhookToken) d.webhookToken = randomUUID().replace(/-/g, "");
    });
  }
  return s;
}
export const updateSettings = (fn: (s: Settings) => void) =>
  update("settings.json", settingsFallback(), fn);

export const getKnowledge = async () =>
  (await readJson<{ items: KnowledgeItem[] }>("knowledge.json", { items: [] })).items;
export const updateKnowledge = (fn: (items: KnowledgeItem[]) => KnowledgeItem[]) =>
  update<{ items: KnowledgeItem[] }>("knowledge.json", { items: [] }, (d) => ({
    items: fn(d.items),
  }));

export const getConversations = () =>
  readJson<Conversations>("conversations.json", { chats: {}, seenIds: [] });
export const updateConversations = (fn: (c: Conversations) => void) =>
  update<Conversations>("conversations.json", { chats: {}, seenIds: [] }, fn);

/** Claim before sending; Cloud compare-and-swap prevents overlapping scheduled sends. */
export async function claimInactivityReminder(jid: string, time: number): Promise<ChatState | null> {
  const cfg = await requireConfig();
  if (cfg.driver === "cloud") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("app_data").select("data, updated_at").eq("name", "conversations.json").maybeSingle();
    if (error) throw new Error(`Banco: ${error.message}`);
    if (!data) return null;
    const conversations = data.data as unknown as Conversations;
    const chat = conversations.chats[jid];
    if (!chat || !isInactivityDue(chat, time)) return null;
    chat.inactivityReminderAt = new Date(time).toISOString();
    const result = await supabaseAdmin.from("app_data").update({
      data: JSON.parse(JSON.stringify(conversations)), updated_at: new Date().toISOString(),
    }).eq("name", "conversations.json").eq("updated_at", data.updated_at).select("name");
    if (result.error) throw new Error(`Banco: ${result.error.message}`);
    return result.data?.length ? chat : null;
  }
  let claimed: ChatState | null = null;
  await updateConversations((c) => {
    const chat = c.chats[jid];
    if (!chat || !isInactivityDue(chat, time)) return;
    chat.inactivityReminderAt = new Date(time).toISOString();
    claimed = structuredClone(chat);
  });
  return claimed;
}

// Default admin: user "admin" (password hash only, never plaintext).
const authFallback = (): AuthData => ({
  users: [
    {
      username: "admin",
      salt: "547e9c2d635053bd0f1cba7d8aed8257",
      hash: "5aa7705282dc796458044d75347ef483d4c5fb7cc0eb3dfc57580da89915be73edf71011a925ad73768f6e289a0aa415eb3779428e6582b73252956bb966a3b7",
    },
  ],
  sessions: [],
  attempts: {},
});
export const getAuth = () => readJson<AuthData>("auth.json", authFallback());
export const updateAuth = (fn: (a: AuthData) => void) => update<AuthData>("auth.json", authFallback(), fn);

// ---------- Media files (one document per file) ----------
export type StoredMedia = { mimetype: string; fileName?: string | undefined; data: string };
export async function saveMedia(media: StoredMedia): Promise<string> {
  const id = `media-${randomUUID()}`;
  await writeJson(id, media);
  return id;
}
export async function getMedia(id: string): Promise<StoredMedia | null> {
  if (!/^media-[0-9a-f-]{36}$/.test(id)) return null;
  const m = await readJson<StoredMedia>(id, { mimetype: "", data: "" });
  return m.data ? m : null;
}

// ---------- Quick replies ----------
export type QuickReply = { id: string; shortcut: string; text: string };
export const getQuickReplies = async () =>
  (await readJson<{ items: QuickReply[] }>("quick-replies.json", { items: [] })).items;
export const updateQuickReplies = (fn: (items: QuickReply[]) => QuickReply[]) =>
  update<{ items: QuickReply[] }>("quick-replies.json", { items: [] }, (d) => ({ items: fn(d.items) }));
