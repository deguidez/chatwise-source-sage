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

export type AuthData = { passwordHash: string; salt: string; sessions: string[] };

const dataDir = () => process.env["DATA_DIR"] || path.join(process.cwd(), "data");

const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(name, next.catch(() => undefined));
  return next;
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), name), "utf8");
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

async function writeJson(name: string, data: unknown) {
  await fs.mkdir(dataDir(), { recursive: true });
  const file = path.join(dataDir(), name);
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Read-modify-write a JSON file under a per-file lock. */
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

export const getAuth = () =>
  readJson<AuthData>("auth.json", { passwordHash: "", salt: "", sessions: [] });
export const updateAuth = (fn: (a: AuthData) => void) =>
  update<AuthData>("auth.json", { passwordHash: "", salt: "", sessions: [] }, fn);
