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
    await guard();
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
        const u = batch[i];
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
  const c = await (await store()).getConversations();
  return Object.entries(c.chats)
    .map(([jid, chat]) => ({ jid, name: chat.name, stage: chat.stage ?? "menu", companyId: chat.companyId ?? "", closed: chat.closed ?? false, inactivityReminderAt: chat.inactivityReminderAt ?? "", handoffProvider: chat.handoffProvider ?? "chatwoot", handoffNotificationError: chat.handoffNotificationError ?? "", messages: chat.messages }))
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
