import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const auth = () => import("./auth.server");
const store = () => import("./store.server");
const guard = async () => (await auth()).requireAdmin();
const guardSuper = async () => (await auth()).requireSuper();

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

export const listUsers = createServerFn({ method: "GET" }).handler(async () => (await auth()).listUsers());

export const createUser = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(3).max(30),
      password: z.string().min(8).max(200),
      role: z.enum(["super", "attendant"]),
      name: z.string().max(60).optional(),
    }),
  )
  .handler(async ({ data }) => {
    await (await auth()).createUser(data.username, data.password, data.role, data.name ?? "");
    return { ok: true };
  });

export const updateUser = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(30), name: z.string().max(60) }))
  .handler(async ({ data }) => {
    await (await auth()).updateUser(data.username, data.name);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(30) }))
  .handler(async ({ data }) => {
    await (await auth()).deleteUser(data.username);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1).max(30), password: z.string().min(8).max(200) }))
  .handler(async ({ data }) => {
    await (await auth()).resetUserPassword(data.username, data.password);
    return { ok: true };
  });

export const loadSettings = createServerFn({ method: "GET" }).handler(async () => {
  await guardSuper();
  const s = await (await store()).getSettings();
  return {
    ...s,
    openaiKey: mask(s.openaiKey),
    evolutionKey: mask(s.evolutionKey),
    geminiKey: mask(s.geminiKey),
    ycloudKey: mask(s.ycloudKey),
    chatwootToken: mask(s.chatwootToken),
  };
});

const SECRET_KEYS = ["openaiKey", "evolutionKey", "geminiKey", "ycloudKey", "chatwootToken"];
const str = (n = 500) => z.string().max(n).optional();
const settingsSchema = z.object({
  aiProvider: z.enum(["openai", "gemini", "ollama"]).optional(),
  geminiKey: str(),
  geminiModel: str(100),
  ollamaUrl: str(),
  ollamaModel: str(100),
  waProvider: z.enum(["evolution", "ycloud"]).optional(),
  ycloudKey: str(),
  ycloudFrom: str(50),
  handoffProvider: z.enum(["whatsapp", "other", "chatwoot"]).optional(),
  attendantNumber: z.string().max(30).transform((v) => v.replace(/\D/g, "")).refine((v) => !v || /^[1-9]\d{7,14}$/.test(v), "Informe o WhatsApp do atendente com DDI").optional(),
  chatwootUrl: str(),
  chatwootAccountId: str(20),
  chatwootToken: str(),
  chatwootInboxId: str(20),
  greeting: str(2000),
  humanOption: z.boolean().optional(),
  companies: z
    .array(z.object({ id: z.string().min(1).max(60), name: z.string().min(1).max(100), prompt: z.string().max(10000) }))
    .max(10)
    .optional(),
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
    await guardSuper();
    await (await store()).updateSettings((s) => {
      if ((data.handoffProvider ?? s.handoffProvider) !== "chatwoot" && !(data.attendantNumber ?? s.attendantNumber)) {
        throw new Error("Informe o WhatsApp do atendente para receber os avisos");
      }
      for (const [k, v] of Object.entries(data)) {
        if (v === undefined) continue;
        // Masked/empty secret fields mean "keep current value"
        if (SECRET_KEYS.includes(k) && (v === "" || String(v).startsWith("••••")))
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
    companyId: i.companyId ?? "",
    size: i.content.length,
    preview: i.content.slice(0, 200),
    createdAt: i.createdAt,
  }));
});

async function addItem(type: "text" | "pdf" | "url" | "file", title: string, content: string, companyId = "") {
  const text = content.trim();
  if (!text) throw new Error("Nenhum texto encontrado nesse conteúdo");
  const { randomUUID } = await import("node:crypto");
  await (await store()).updateKnowledge((items) => [
    { id: randomUUID(), type, title: title.slice(0, 200) || "Sem título", content: text, companyId: companyId || undefined, createdAt: new Date().toISOString() },
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
      companyId: z.string().max(60).default(""),
    }),
  )
  .handler(async ({ data }) => {
    await guard();
    return addItem(data.type, data.title, data.content, data.companyId);
  });

export const addUrl = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().max(2000), companyId: z.string().max(60).default("") }))
  .handler(async ({ data }) => {
    await guard();
    const { htmlToText, extractLinks, extractImages } = await import("./agent-core");
    const MAX_PAGES = 20;
    const get = async (u: string) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 WhatsAgent" }, signal: ctrl.signal });
        clearTimeout(t);
        if (!r.ok || !(r.headers.get("content-type") ?? "").includes("html")) return null;
        return await r.text();
      } catch { return null; }
    };
    const first = await get(data.url);
    if (!first) throw new Error("Não foi possível abrir o site");
    const queue = [data.url, ...extractLinks(first, data.url)];
    const seen = new Set<string>();
    const pages: string[] = [];
    const images = new Map<string, string>();
    let mainTitle = "";
    while (queue.length && seen.size < MAX_PAGES) {
      const batch = queue.splice(0, 5).filter((u) => !seen.has(u));
      batch.forEach((u) => seen.add(u));
      const htmls = await Promise.all(batch.map((u) => (u === data.url ? Promise.resolve(first) : get(u))));
      htmls.forEach((html, i) => {
        if (!html) return;
        const u = batch[i]!;
        const { title, text } = htmlToText(html);
        if (!mainTitle) mainTitle = title;
        const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
        if (text) pages.push(`### ${title || u}\nPágina: ${u}\n${desc ? desc + "\n" : ""}${text.slice(0, 15000)}`);
        for (const img of extractImages(html, u)) if (!images.has(img.url) && images.size < 60) images.set(img.url, img.alt || title);
        for (const l of extractLinks(html, data.url)) if (!seen.has(l) && !queue.includes(l)) queue.push(l);
      });
    }
    const fotos = images.size
      ? `\n\n### Fotos do site (envie o link quando o cliente pedir foto)\n${[...images].map(([u, a]) => `- ${a || "Foto"}: ${u}`).join("\n")}`
      : "";
    return addItem(
      "url",
      `${mainTitle || data.url} (${pages.length} páginas, ${images.size} fotos)`,
      `Fonte: ${data.url}\n\n${pages.join("\n\n")}${fotos}`,
      data.companyId,
    );
  });

export const addPdf = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().max(300), base64: z.string().max(30_000_000), companyId: z.string().max(60).default("") }))
  .handler(async ({ data }) => {
    await guard();
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = Uint8Array.from(Buffer.from(data.base64, "base64"));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return addItem("pdf", data.name, Array.isArray(text) ? text.join("\n\n") : text, data.companyId);
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
  const st = await store();
  const c = await st.getConversations();
  const users = (await st.getAuth()).users;
  const nameOf = (u: string) => users.find((x) => x.username === u)?.name || u;
  return Object.entries(c.chats)
    .map(([jid, chat]) => ({ jid, name: chat.name, stage: chat.stage ?? "menu", companyId: chat.companyId ?? "", closed: chat.closed ?? false, inactivityReminderAt: chat.inactivityReminderAt ?? "", handoffProvider: chat.handoffProvider ?? "chatwoot", handoffNotificationError: chat.handoffNotificationError ?? "", ticketStatus: chat.ticketStatus ?? "", closedAt: chat.closedAt ?? "", handledBy: chat.handledBy ?? "", handledByName: chat.handledBy ? nameOf(chat.handledBy) : "", number: chat.number, channel: chat.channel, messages: chat.messages }))
    .sort((a, b) => (b.messages.at(-1)?.at ?? "").localeCompare(a.messages.at(-1)?.at ?? ""));
});

export const testAgent = createServerFn({ method: "POST" })
  .validator(
    z.object({
      message: z.string().min(1).max(4000),
      companyId: z.string().max(60).default(""),
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
      data.companyId || undefined,
      "test",
    );
    return { reply };
  });

export const returnChatToAI = createServerFn({ method: "POST" })
  .validator(z.object({ jid: z.string().max(200) }))
  .handler(async ({ data }) => {
    await guard();
    await (await import("./agent.server")).returnToAI(data.jid);
    return { ok: true };
  });

const agent = () => import("./agent.server");
const jidSchema = z.object({ jid: z.string().min(1).max(200) });

export const sendAgentMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      jid: z.string().min(1).max(200),
      text: z.string().max(4000).default(""),
      media: z
        .object({
          kind: z.enum(["image", "video", "audio", "document", "sticker"]),
          mimetype: z.string().min(1).max(120),
          fileName: z.string().max(200).optional(),
          // base64 without the data: prefix, up to ~16 MB file
          data: z.string().min(1).max(22_000_000),
        })
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const me = await guard();
    await (await agent()).agentSend(data.jid, data.text, data.media, me);
    return { ok: true };
  });

export const assumeConversation = createServerFn({ method: "POST" }).validator(jidSchema).handler(async ({ data }) => {
  const me = await guard();
  await (await agent()).assumeChat(data.jid, me);
  return { ok: true };
});

export const resolveConversation = createServerFn({ method: "POST" })
  .validator(z.object({ jid: z.string().min(1).max(200), notify: z.boolean().default(true) }))
  .handler(async ({ data }) => {
    await guard();
    await (await agent()).resolveChat(data.jid, data.notify);
    return { ok: true };
  });

export const reopenConversation = createServerFn({ method: "POST" }).validator(jidSchema).handler(async ({ data }) => {
  const me = await guard();
  await (await agent()).assumeChat(data.jid, me);
  return { ok: true };
});

export const renameConversation = createServerFn({ method: "POST" })
  .validator(z.object({ jid: z.string().min(1).max(200), name: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }) => {
    await guard();
    await (await agent()).renameChat(data.jid, data.name);
    return { ok: true };
  });

export const loadMedia = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().max(60) }))
  .handler(async ({ data }) => {
    await guard();
    const m = await (await store()).getMedia(data.id);
    if (!m) throw new Error("Arquivo não encontrado");
    return m;
  });

export const listQuickReplies = createServerFn({ method: "GET" }).handler(async () => {
  await guard();
  return (await store()).getQuickReplies();
});

export const saveQuickReply = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(60).optional(), shortcut: z.string().trim().min(1).max(40), text: z.string().trim().min(1).max(4000) }))
  .handler(async ({ data }) => {
    await guard();
    const shortcut = data.shortcut.replace(/^\/+/, "").toLowerCase();
    await (await store()).updateQuickReplies((items) => {
      const item = { id: data.id || crypto.randomUUID(), shortcut, text: data.text };
      return data.id ? items.map((i) => (i.id === data.id ? item : i)) : [...items, item];
    });
    return { ok: true };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().max(60) }))
  .handler(async ({ data }) => {
    await guard();
    await (await store()).updateQuickReplies((items) => items.filter((i) => i.id !== data.id));
    return { ok: true };
  });

export const loadMetrics = createServerFn({ method: "GET" })
  .inputValidator(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ data }) => {
    await guardSuper();
    const from = Date.parse(data.from);
    const to = Date.parse(data.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 366 * 86400000) throw new Error("Escolha um período válido de até um ano");
    const st = await store();
    const [events, conversations, settings, users] = await Promise.all([st.getMetrics(data.from, data.to), st.getConversations(), st.getSettings(), st.getAuth()]);
    const { queueTab } = await import("./agent-core");
    const active = Object.values(conversations.chats).map((c) => ({ companyId: c.companyId || "", status: queueTab(c) }));
    return { events, active, companies: settings.companies.map((c) => ({ id: c.id, name: c.name })), users: users.users.map((u) => ({ username: u.username, name: u.name || u.username })) };
  });
