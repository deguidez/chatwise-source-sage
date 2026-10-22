// Pure helpers (no Node APIs) so they can be unit tested.

export type IncomingMessage = {
  id: string;
  jid: string;
  number: string;
  name: string;
  text: string;
  isGroup: boolean;
};

/** Parse an Evolution API "messages.upsert" webhook. Returns null when there's nothing to answer. */
export function parseEvolutionWebhook(body: any): IncomingMessage | null {
  if (!body || typeof body !== "object") return null;
  const event = String(body.event ?? "").toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return null;
  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!data?.key) return null;
  if (data.key.fromMe) return null;
  const jid: string = data.key.remoteJid ?? "";
  if (!jid || jid === "status@broadcast") return null;
  const m = data.message ?? {};
  const text: string =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    "";
  if (!text.trim()) return null;
  return {
    id: String(data.key.id ?? ""),
    jid,
    number: jid.split("@")[0] ?? "",
    name: data.pushName ?? "",
    text: text.trim(),
    isGroup: jid.endsWith("@g.us"),
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export function chunkText(text: string, size = 1200): string[] {
  const parts: string[] = [];
  const paras = text.split(/\n\s*\n/);
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      parts.push(cur);
      cur = "";
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) parts.push(p.slice(i, i + size));
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** Pick the most relevant knowledge chunks for a question (keyword overlap). */
export function selectContext(
  items: { title: string; content: string }[],
  question: string,
  maxChars = 12000,
): string {
  const all = items.map((i) => `# ${i.title}\n${i.content}`).join("\n\n");
  if (all.length <= maxChars) return all;
  const words = new Set(norm(question).split(/\W+/).filter((w) => w.length > 2));
  const chunks = items.flatMap((i) => chunkText(i.content).map((c) => `# ${i.title}\n${c}`));
  const scored = chunks
    .map((c) => {
      const n = norm(c);
      let score = 0;
      words.forEach((w) => {
        if (n.includes(w)) score++;
      });
      return { c, score };
    })
    .sort((a, b) => b.score - a.score);
  let out = "";
  for (const { c } of scored) {
    if (out.length + c.length > maxChars) break;
    out += c + "\n\n";
  }
  return out;
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { title, text };
}

/** Same-site page links found in the HTML (absolute, no hash, no files). */
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)[^"']*["']/gi)) {
    try {
      const u = new URL(m[1]!, base);
      u.hash = "";
      if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
      if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico|xml)$/i.test(u.pathname)) continue;
      out.add(u.toString());
    } catch { /* ignore */ }
  }
  return [...out];
}

/** Images (absolute URL + description) found in the HTML, skipping icons/logos. */
export function extractImages(html: string, baseUrl: string): { url: string; alt: string }[] {
  const out = new Map<string, string>();
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const add = (src: string, alt: string) => {
    try {
      const u = new URL(src, baseUrl).toString();
      if (!/^https?:/.test(u) || /data:|sprite|favicon|icon|pixel|\.svg/i.test(u)) return;
      if (!out.has(u)) out.set(u, alt);
    } catch { /* ignore */ }
  };
  if (og) add(og, "Imagem principal");
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\b(?:data-src|src)=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    add(src, (tag.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "").trim());
  }
  return [...out].map(([url, alt]) => ({ url, alt }));
}

/** Parse a YCloud "whatsapp.inbound_message.received" webhook. */
export function parseYCloudWebhook(body: any): IncomingMessage | null {
  if (body?.type !== "whatsapp.inbound_message.received") return null;
  const m = body.whatsappInboundMessage;
  if (!m?.from) return null;
  const text: string = m.text?.body ?? m.image?.caption ?? m.button?.text ?? m.interactive?.button_reply?.title ?? "";
  if (!text.trim()) return null;
  const number = String(m.from).replace(/\D/g, "");
  return { id: String(m.id ?? body.id ?? ""), jid: `${number}@ycloud`, number, name: m.customerProfile?.name ?? "", text: text.trim(), isGroup: false };
}

export const TRANSFER_TOKEN = "[TRANSFERIR]";

export const INACTIVITY_MS = 2 * 60 * 1000;
export const INACTIVITY_QUESTION = "Você ainda está por aí? Quer cancelar o atendimento ou tem mais alguma dúvida? Para encerrar, responda cancelar.";

export type InactivityState = {
  stage: "menu" | "company" | "human";
  closed?: boolean | undefined;
  inactivityReminderAt?: string | undefined;
  messages: { role: "user" | "assistant" | "agent"; at: string; content?: string }[];
};

export function isInactivityDue(chat: InactivityState, time: number): boolean {
  if (chat.stage === "human" || chat.closed || chat.inactivityReminderAt) return false;
  const last = chat.messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  const at = Date.parse(last.at);
  return Number.isFinite(at) && time - at >= INACTIVITY_MS;
}

export const AUTO_CLOSE_MS = 1 * 60 * 1000;
export const AUTO_CLOSE_MESSAGE = "Como não tivemos resposta, seu atendimento foi finalizado. Se precisar de algo, é só mandar uma nova mensagem. 😊";

/** After the inactivity question, close the chat if the customer stays silent for AUTO_CLOSE_MS. */
export function isAutoCloseDue(chat: InactivityState, time: number): boolean {
  if (chat.stage === "human" || chat.closed || !chat.inactivityReminderAt) return false;
  const last = chat.messages.at(-1);
  if (!last || last.role !== "assistant" || last.content !== INACTIVITY_QUESTION) return false;
  const at = Date.parse(last.at ?? "");
  return Number.isFinite(at) && time - at >= AUTO_CLOSE_MS;
}

export function wantsToCancel(text: string): boolean {
  return /^(cancelar|cancela|cancelar atendimento|cancelar o atendimento|encerrar|encerrar atendimento|encerrar o atendimento|quero cancelar|quero encerrar|sem mais duvidas|nao tenho mais duvidas)[.!?]*$/.test(norm(text).trim());
}

const HUMAN_RE = /\b(atendente|humano|pessoa|algu[eé]m de verdade|falar com (um|uma)?\s*(pessoa|atendente|algu[eé]m))\b/i;
export const wantsHuman = (text: string) => HUMAN_RE.test(norm(text)) || HUMAN_RE.test(text);

export function buildMenu(greeting: string, companies: { name: string }[], humanOption: boolean) {
  const opts = companies.map((c, i) => `${i + 1} - ${c.name}`);
  if (humanOption) opts.push(`${companies.length + 1} - Falar com um atendente`);
  return `${greeting}\n\n*Escolha uma opção:*\n\n${opts.join("\n")}`;
}

export type Route =
  | { kind: "menu" }
  | { kind: "select"; companyId: string }
  | { kind: "human" }
  | { kind: "ai"; companyId: string }
  | { kind: "silent" };

/** Decide what to do with an incoming message given the conversation state. */
export function routeMessage(
  state: { stage: "menu" | "company" | "human"; companyId?: string | undefined } | undefined,
  text: string,
  companies: { id: string; name: string }[],
  humanOption: boolean,
): Route {
  if (state?.stage === "human") return { kind: "silent" };
  const t = norm(text).trim();
  if (state?.stage === "company" && state.companyId && companies.some((c) => c.id === state.companyId)) {
    if (t === "0" || t === "menu") return { kind: "menu" };
    if (wantsHuman(text)) return { kind: "human" };
    return { kind: "ai", companyId: state.companyId };
  }
  // Menu stage: pick a company by number or name
  const n = Number(t.match(/^\d+/)?.[0]);
  const selected = companies[n - 1];
  if (n >= 1 && n <= companies.length && selected) return { kind: "select", companyId: selected.id };
  if (humanOption && n === companies.length + 1) return { kind: "human" };
  const byName = companies.find((c) => t.includes(norm(c.name)));
  if (byName) return { kind: "select", companyId: byName.id };
  if (wantsHuman(text)) return { kind: "human" };
  return { kind: "menu" };
}

/** Message the business itself sent from its own WhatsApp (attendant typing on the phone). */
export function parseEvolutionOwnMessage(body: any): { jid: string; text: string } | null {
  if (!body || typeof body !== "object") return null;
  const event = String(body.event ?? "").toLowerCase().replace(/_/g, ".");
  if (event !== "messages.upsert") return null;
  const data = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!data?.key?.fromMe) return null;
  const jid: string = data.key.remoteJid ?? "";
  if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return null;
  const m = data.message ?? {};
  const text: string = m.conversation ?? m.extendedTextMessage?.text ?? "";
  return text.trim() ? { jid, text: text.trim() } : null;
}

/** Attendant phrase that ends a human conversation, e.g. "Irei encerrar o seu atendimento". */
export function isStaffCloseCommand(text: string): boolean {
  return /\bencerr(ar|ando|o|ei)\b.{0,15}\batendimento\b/.test(norm(text));
}
