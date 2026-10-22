import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const auth = () => import("./auth.server");
const store = () => import("./store.server");
const guard = async () => (await auth()).requireAdmin();

const mask = (v: string) => (v ? `••••${v.slice(-4)}` : "");

export const getAuthState = createServerFn({ method: "GET" }).handler(async () =>
  (await auth()).authState(),
);

export const login = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    await (await auth()).login(data.username, data.password);
    return { ok: true };
  });

export const installApp = createServerFn({ method: "POST" })
  .validator(
    z.object({
      driver: z.enum(["mysql", "file"]),
      host: z.string().max(255).optional(),
      port: z.number().int().min(1).max(65535).optional(),
      database: z.string().max(100).optional(),
      user: z.string().max(100).optional(),
      password: z.string().max(255).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const st = await store();
    if (await st.getDbConfig()) throw new Error("O sistema já está instalado");
    if (data.driver === "mysql") {
      if (!data.host || !data.database || !data.user) throw new Error("Preencha servidor, banco e usuário");
      try {
        await st.installMysql(data);
      } catch (e) {
        throw new Error(`Não foi possível conectar ao MySQL: ${e instanceof Error ? e.message : e}`);
      }
    }
    await st.saveDbConfig(data);
    await st.getSettings(); // creates default settings
    await st.updateAuth(() => {}); // creates default admin
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).logout();
  return { ok: true };
});

export const changePassword = createServerFn({ method: "POST" })
  .validator(z.object({ current: z.string().min(1), next: z.string().min(8).max(200) }))
  .handler(async ({ data }) => {
    await guard();
    await (await auth()).changePassword(data.current, data.next);
    return { ok: true };
  });

export const loadSettings = createServerFn({ method: "GET" }).handler(async () => {
  await guard();
  const s = await (await store()).getSettings();
  return {
    ...s,
    openaiKey: mask(s.openaiKey),
    evolutionKey: mask(s.evolutionKey),
  };
});

const settingsSchema = z.object({
  openaiKey: z.string().max(500).optional(),
  openaiModel: z.string().max(100).optional(),
  evolutionUrl: z.string().max(500).optional(),
  evolutionKey: z.string().max(500).optional(),
  evolutionInstance: z.string().max(200).optional(),
  systemPrompt: z.string().max(20000).optional(),
  enabled: z.boolean().optional(),
  replyGroups: z.boolean().optional(),
});

export const saveSettings = createServerFn({ method: "POST" })
  .validator(settingsSchema)
  .handler(async ({ data }) => {
    await guard();
    await (await store()).updateSettings((s) => {
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        // Masked/empty secret fields mean "keep current value"
        if ((k === "openaiKey" || k === "evolutionKey") && (v === "" || String(v).startsWith("••••")))
          continue;
        (s as any)[k] = typeof v === "string" ? v.trim() : v;
      }
    });
    return { ok: true };
  });

export const listKnowledge = createServerFn({ method: "GET" }).handler(async () => {
  await guard();
  const items = await (await store()).getKnowledge();
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    title: i.title,
    size: i.content.length,
    preview: i.content.slice(0, 200),
    createdAt: i.createdAt,
  }));
});

async function addItem(type: "text" | "pdf" | "url" | "file", title: string, content: string) {
  const text = content.trim();
  if (!text) throw new Error("Nenhum texto encontrado nesse conteúdo");
  const { randomUUID } = await import("node:crypto");
  await (await store()).updateKnowledge((items) => [
    { id: randomUUID(), type, title: title.slice(0, 200) || "Sem título", content: text, createdAt: new Date().toISOString() },
    ...items,
  ]);
  return { ok: true };
}

export const addText = createServerFn({ method: "POST" })
  .validator(
    z.object({
      title: z.string().max(200),
      content: z.string().min(1).max(2_000_000),
      type: z.enum(["text", "file"]).default("text"),
    }),
  )
  .handler(async ({ data }) => {
    await guard();
    return addItem(data.type, data.title, data.content);
  });

export const addUrl = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().max(2000) }))
  .handler(async ({ data }) => {
    await guard();
    const { htmlToText } = await import("./agent-core");
    const res = await fetch(data.url, { headers: { "User-Agent": "Mozilla/5.0 WhatsAgent" } });
    if (!res.ok) throw new Error(`Não foi possível abrir o site (${res.status})`);
    const { title, text } = htmlToText(await res.text());
    return addItem("url", title || data.url, `Fonte: ${data.url}\n\n${text}`);
  });

export const addPdf = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().max(300), base64: z.string().max(30_000_000) }))
  .handler(async ({ data }) => {
    await guard();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return addItem("pdf", data.name, Array.isArray(text) ? text.join("\n\n") : text);
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    await guard();
    await (await store()).updateKnowledge((items) => items.filter((i) => i.id !== data.id));
    return { ok: true };
  });

export const listConversations = createServerFn({ method: "GET" }).handler(async () => {
  await guard();
  const c = await (await store()).getConversations();
  return Object.entries(c.chats)
    .map(([jid, chat]) => ({ jid, name: chat.name, messages: chat.messages }))
    .sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
});

export const testAgent = createServerFn({ method: "POST" })
  .validator(
    z.object({
      message: z.string().min(1).max(4000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
    }),
  )
  .handler(async ({ data }) => {
    await guard();
    const { generateReply } = await import("./agent.server");
    const settings = await (await store()).getSettings();
    const reply = await generateReply(
      settings,
      data.history.map((h) => ({ ...h, at: "" })),
      data.message,
    );
    return { reply };
  });
