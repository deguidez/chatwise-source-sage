import { buildMenu, routeMessage, selectContext, TRANSFER_TOKEN, type IncomingMessage } from "./agent-core";
import {
  getConversations,
  getKnowledge,
  getSettings,
  updateConversations,
  type ChatMessage,
  type ChatState,
  type Settings,
} from "./store.server";

// ---------------- AI providers ----------------
type Turn = { role: "user" | "assistant"; content: string };

async function callAI(s: Settings, system: string, turns: Turn[]): Promise<string> {
  if (s.aiProvider === "gemini") {
    if (!s.geminiKey) throw new Error("Chave do Gemini não configurada");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.geminiModel || "gemini-3.8-flash")}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": s.geminiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        }),
      },
    );
    const body = await res.text();
    if (!res.ok) throw new Error(`Gemini [${res.status}]: ${body.slice(0, 300)}`);
    const json = JSON.parse(body);
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  }
  if (s.aiProvider === "ollama") {
    const res = await fetch(`${(s.ollamaUrl || "http://localhost:11434").replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: s.ollamaModel || "llama3.1", stream: false, messages: [{ role: "system", content: system }, ...turns] }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Ollama [${res.status}]: ${body.slice(0, 300)}`);
    return String(JSON.parse(body).message?.content ?? "").trim();
  }
  if (!s.openaiKey) throw new Error("Chave da OpenAI não configurada");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${s.openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: s.openaiModel || "gpt-4o-mini", messages: [{ role: "system", content: system }, ...turns] }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI [${res.status}]: ${body.slice(0, 300)}`);
  return String(JSON.parse(body).choices?.[0]?.message?.content ?? "").trim();
}

export async function generateReply(
  settings: Settings,
  history: ChatMessage[],
  question: string,
  companyId?: string,
): Promise<string> {
  const company = settings.companies.find((c) => c.id === companyId);
  const knowledge = (await getKnowledge()).filter((k) => !k.companyId || k.companyId === companyId);
  const context = selectContext(knowledge, question);
  const system = [
    settings.systemPrompt,
    company ? `Você está atendendo em nome de: ${company.name}. Fale somente sobre essa empresa.` : "",
    company?.prompt ?? "",
    `Se não souber a resposta ou o cliente estiver insatisfeito, responda somente ${TRANSFER_TOKEN}.`,
    `=== BASE DE CONHECIMENTO ===\n${context || "(vazia)"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const turns: Turn[] = history
    .filter((m) => m.role !== "agent")
    .slice(-10)
    .map((m) => ({ role: m.role as Turn["role"], content: m.content }));
  return callAI(settings, system, [...turns, { role: "user", content: question }]);
}

// ---------------- WhatsApp providers ----------------
export async function sendWhatsApp(s: Settings, channel: ChatState["channel"], number: string, text: string) {
  if (channel === "ycloud") {
    if (!s.ycloudKey || !s.ycloudFrom) throw new Error("YCloud não configurado");
    const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
      method: "POST",
      headers: { "X-API-Key": s.ycloudKey, "Content-Type": "application/json" },
      body: JSON.stringify({ from: s.ycloudFrom, to: `+${number}`, type: "text", text: { body: text } }),
    });
    if (!res.ok) throw new Error(`YCloud [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    return;
  }
  const { evolutionUrl, evolutionKey, evolutionInstance } = s;
  if (!evolutionUrl || !evolutionKey || !evolutionInstance) throw new Error("Evolution API não configurada");
  const res = await fetch(`${evolutionUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evolutionInstance)}`, {
    method: "POST",
    headers: { apikey: evolutionKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) throw new Error(`Evolution [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

// ---------------- Chatwoot ----------------
const chatwootReady = (s: Settings) => !!(s.chatwootUrl && s.chatwootAccountId && s.chatwootToken && s.chatwootInboxId);

async function cw(s: Settings, method: string, path: string, body?: unknown) {
  const res = await fetch(`${s.chatwootUrl.replace(/\/$/, "")}/api/v1/accounts/${s.chatwootAccountId}${path}`, {
    method,
    headers: { api_access_token: s.chatwootToken, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Chatwoot [${res.status}] ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function openChatwootConversation(s: Settings, chat: ChatState, companyName: string) {
  const phone = `+${chat.number}`;
  const found = await cw(s, "GET", `/contacts/search?q=${encodeURIComponent(phone)}`);
  let contact = found.payload?.[0];
  if (!contact) {
    const created = await cw(s, "POST", "/contacts", { inbox_id: Number(s.chatwootInboxId), name: chat.name || phone, phone_number: phone });
    contact = created.payload?.contact ?? created.payload;
  }
  const sourceId = contact.contact_inboxes?.find((ci: any) => String(ci.inbox?.id) === String(s.chatwootInboxId))?.source_id;
  const conv = await cw(s, "POST", "/conversations", {
    inbox_id: Number(s.chatwootInboxId),
    contact_id: contact.id,
    ...(sourceId ? { source_id: sourceId } : {}),
    status: "open",
    additional_attributes: { empresa: companyName },
  });
  const transcript = chat.messages
    .slice(-20)
    .map((m) => `${m.role === "user" ? "Cliente" : "IA"}: ${m.content}`)
    .join("\n");
  await cw(s, "POST", `/conversations/${conv.id}/messages`, {
    content: `Transferido pela IA — ${companyName}\n\n${transcript}`,
    message_type: "outgoing",
    private: true,
  });
  return conv.id as number;
}

/** Forward a customer message to the open Chatwoot conversation. */
async function forwardToChatwoot(s: Settings, conversationId: number, text: string) {
  await cw(s, "POST", `/conversations/${conversationId}/messages`, { content: text, message_type: "incoming" });
}

// ---------------- Main flow ----------------
const now = () => new Date().toISOString();

async function saveChat(jid: string, fn: (c: ChatState) => void, base: ChatState) {
  await updateConversations((c) => {
    const chat = c.chats[jid] ?? base;
    fn(chat);
    chat.messages = chat.messages.slice(-60);
    c.chats[jid] = chat;
  });
}

export async function handleIncoming(msg: IncomingMessage, channel: ChatState["channel"]) {
  const s = await getSettings();
  if (!s.enabled) return "disabled";
  if (msg.isGroup && !s.replyGroups) return "group-ignored";

  const convs = await getConversations();
  if (msg.id && convs.seenIds.includes(msg.id)) return "duplicate";
  await updateConversations((c) => {
    if (msg.id) c.seenIds = [...c.seenIds.slice(-499), msg.id];
  });

  const base: ChatState = { name: msg.name, number: msg.number, channel, stage: "menu", messages: [] };
  const chat: ChatState = { ...base, ...convs.chats[msg.jid], name: msg.name || convs.chats[msg.jid]?.name || "" };
  const userMsg: ChatMessage = { role: "user", content: msg.text, at: now() };
  const reply = async (text: string) => {
    await sendWhatsApp(s, channel, msg.number, text);
    return { role: "assistant" as const, content: text, at: now() };
  };

  const route = routeMessage(chat, msg.text, s.companies, s.humanOption);

  if (route.kind === "silent") {
    if (chat.chatwootConversationId && chatwootReady(s)) await forwardToChatwoot(s, chat.chatwootConversationId, msg.text);
    await saveChat(msg.jid, (c) => c.messages.push(userMsg), base);
    return "forwarded";
  }

  const transfer = async (): Promise<string> => {
    const companyName = s.companies.find((c) => c.id === chat.companyId)?.name ?? "Sem empresa";
    if (!chatwootReady(s)) {
      const out = await reply("Vou te encaminhar para um atendente. Em breve alguém vai falar com você.");
      await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; }, base);
      return "human-no-chatwoot";
    }
    const out = await reply("Certo! Vou transferir você para um dos nossos atendentes. Aguarde só um instante. 🙂");
    const tmp = { ...chat, messages: [...chat.messages, userMsg, out] };
    const conversationId = await openChatwootConversation(s, tmp, companyName);
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; c.chatwootConversationId = conversationId; }, base);
    return "transferred";
  };

  if (route.kind === "human") return transfer();

  if (route.kind === "menu") {
    const out = await reply(buildMenu(s.greeting, s.companies, s.humanOption));
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "menu"; c.companyId = undefined; }, base);
    return "menu";
  }

  if (route.kind === "select") {
    const company = s.companies.find((c) => c.id === route.companyId)!;
    const out = await reply(`Perfeito! Você está falando com *${company.name}*. Como posso te ajudar?\n\n_(Digite 0 para voltar ao menu)_`);
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "company"; c.companyId = company.id; }, base);
    return "selected";
  }

  const answer = await generateReply(s, chat.messages, msg.text, route.companyId);
  if (!answer || answer.includes(TRANSFER_TOKEN)) return transfer();
  const out = await reply(answer);
  await saveChat(msg.jid, (c) => c.messages.push(userMsg, out), base);
  return "replied";
}

/** Chatwoot events: attendant replies go to WhatsApp; resolving gives the chat back to the AI. */
export async function handleChatwootEvent(body: any) {
  const s = await getSettings();
  const conversationId = Number(body?.conversation?.id ?? body?.id);
  if (!conversationId) return "ignored";
  const convs = await getConversations();
  const entry = Object.entries(convs.chats).find(([, c]) => c.chatwootConversationId === conversationId);
  if (!entry) return "unknown-conversation";
  const [jid, chat] = entry;

  if (body.event === "message_created") {
    if (body.message_type !== "outgoing" || body.private || !body.content) return "ignored";
    if (String(body.content).startsWith("Transferido pela IA")) return "ignored";
    await sendWhatsApp(s, chat.channel, chat.number, String(body.content));
    await updateConversations((c) => {
      c.chats[jid]?.messages.push({ role: "agent", content: String(body.content), at: now() });
    });
    return "sent";
  }

  if (body.event === "conversation_status_changed" || body.event === "conversation_resolved") {
    if (body.status !== "resolved" && body.event !== "conversation_resolved") return "ignored";
    await updateConversations((c) => {
      const ch = c.chats[jid];
      if (!ch) return;
      ch.stage = "menu";
      ch.companyId = undefined;
      ch.chatwootConversationId = undefined;
    });
    return "returned-to-ai";
  }
  return "ignored";
}

/** Manually give a chat back to the AI from the dashboard. */
export async function returnToAI(jid: string) {
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (!ch) return;
    ch.stage = "menu";
    ch.companyId = undefined;
    ch.chatwootConversationId = undefined;
  });
}
