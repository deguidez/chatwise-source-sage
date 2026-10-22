import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type Settings = {
  openaiKey: string;
  openaiModel: string;
  evolutionUrl: string;
  evolutionKey: string;
  evolutionInstance: string;
  webhookToken: string;
  systemPrompt: string;
  enabled: boolean;
  replyGroups: boolean;
};

export type KnowledgeItem = {
  id: string;
  type: "text" | "pdf" | "url" | "file";
  title: string;
  content: string;
  createdAt: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string; at: string };
export type Conversations = {
  chats: Record<string, { name: string; messages: ChatMessage[] }>;
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
  driver: "mysql" | "file";
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
};

const dataDir = () => process.env["DATA_DIR"] || path.join(process.cwd(), "data");
const configFile = () => path.join(dataDir(), "config.json");

export async function getDbConfig(): Promise<DbConfig | null> {
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
    host: cfg.host,
    port: cfg.port || 3306,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
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
    if (cfg.driver === "mysql") {
      const [rows] = await (await mysqlPool(cfg)).query("SELECT data FROM app_data WHERE name = ?", [name]);
      raw = rows[0]?.data;
    } else {
      raw = await fs.readFile(path.join(dataDir(), name), "utf8");
    }
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch (e: any) {
    if (cfg.driver === "mysql") throw e;
    return fallback;
  }
}

async function writeJson(name: string, data: unknown) {
  const cfg = await requireConfig();
  const json = JSON.stringify(data);
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
  "Você é um atendente virtual simpático e objetivo no WhatsApp. Responda em português, com mensagens curtas. Use apenas as informações da base de conhecimento; se não souber, diga que vai encaminhar para um atendente humano.";

const settingsFallback = (): Settings => ({
  openaiKey: "",
  openaiModel: "gpt-4o-mini",
  evolutionUrl: "",
  evolutionKey: "",
  evolutionInstance: "",
  webhookToken: "",
  systemPrompt: DEFAULT_PROMPT,
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
