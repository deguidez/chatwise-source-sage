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
    number: jid.split("@")[0],
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
