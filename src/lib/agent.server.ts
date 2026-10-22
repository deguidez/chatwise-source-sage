import { buildMenu, routeMessage, selectContext, TRANSFER_TOKEN, INACTIVITY_QUESTION, isInactivityDue, wantsToCancel, type IncomingMessage } from "./agent-core";
import {
  getConversations,
  getKnowledge,
  getSettings,
  claimInactivityReminder,
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
    const primary = (s.geminiModel || "").trim().replace(/^models\//, "").replace(/^gemini-2\.5-flash(-lite)?$/, "") || "gemini-3.8-flash";
    // When Google is overloaded (503/429), wait and retry, then try a lighter model.
    const attempts = [primary, primary, "gemini-3.8-flash-lite", primary];
    let res!: Response;
    let body = "";
    for (let i = 0; i < attempts.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(attempts[i] ?? primary)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": s.geminiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        }),
      });
      body = await res.text();
      if (res.ok || ![429, 500, 503, 404].includes(res.status)) break;
    }
    if (!res.ok) {
      if (res.status === 503 || res.status === 429) throw new Error("O Gemini está sobrecarregado no momento. Tente de novo em alguns minutos.");
      throw new Error(`Gemini [${res.status}]: ${body.slice(0, 300)}`);
    }
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
    .map((m) => `${m.role === "user" ? "**Cliente:**" : "**IA:**"} ${m.content}`)
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
    if (chat.messages.at(-1)?.role === "user") chat.inactivityReminderAt = undefined;
    chat.messages = chat.messages.slice(-60);
    c.chats[jid] = chat;
  });
}

export async function handleIncoming(msg: IncomingMessage, channel: ChatState["channel"]) {
  const s = await getSettings();
  if (!s.enabled) return "disabled";
  if (msg.isGroup && !s.replyGroups) return "group-ignored";
  if (s.handoffProvider !== "chatwoot" && msg.number === s.attendantNumber) return "staff-ignored";

  const convs = await getConversations();
  if (msg.id && convs.seenIds.includes(msg.id)) return "duplicate";
  await updateConversations((c) => {
    if (msg.id) c.seenIds = [...c.seenIds.slice(-499), msg.id];
  });

  const base: ChatState = { name: msg.name, number: msg.number, channel, stage: "menu", messages: [] };
  const chat: ChatState = { ...base, ...convs.chats[msg.jid], name: msg.name || convs.chats[msg.jid]?.name || "" };
  if (chat.closed) {
    chat.closed = false;
    chat.stage = "menu";
    chat.companyId = undefined;
  }
  const userMsg: ChatMessage = { role: "user", content: msg.text, at: now() };
  const reply = async (text: string) => {
    await sendWhatsApp(s, channel, msg.number, text);
    return { role: "assistant" as const, content: text, at: now() };
  };

  const route = routeMessage(chat, msg.text, s.companies, s.humanOption);

  // A cancellation answer belongs to the reminder, not to the company AI.
  if (chat.stage !== "human" && chat.inactivityReminderAt && wantsToCancel(msg.text)) {
    const out = await reply("Atendimento encerrado. Quando precisar, é só mandar uma mensagem. Até mais! 🙂");
    await saveChat(msg.jid, (c) => {
      c.messages.push(userMsg, out);
      c.closed = true;
      c.stage = "menu";
      c.companyId = undefined;
      c.inactivityReminderAt = undefined;
    }, base);
    return "cancelled";
  }

  await saveChat(msg.jid, (c) => {
    c.closed = false;
    c.inactivityReminderAt = undefined;
  }, base);

  if (route.kind === "silent") {
    if (chat.handoffProvider !== "whatsapp" && chat.chatwootConversationId && chatwootReady(s)) await forwardToChatwoot(s, chat.chatwootConversationId, msg.text);
    await saveChat(msg.jid, (c) => c.messages.push(userMsg), base);
    return "forwarded";
  }

  const transfer = async (): Promise<string> => {
    const companyName = s.companies.find((c) => c.id === chat.companyId)?.name ?? "Sem empresa";
    const waTranscript = () =>
      [...chat.messages, userMsg].slice(-10).map((m) => `${m.role === "user" ? "*Cliente:*" : "*IA:*"} ${m.content}`).join("\n").slice(-3000);
    if (s.handoffProvider === "other") {
      const out = await reply(`Certo! Para continuar com um atendente, chame neste WhatsApp: https://wa.me/${s.attendantNumber} 🙂`);
      // Customer continues on another number: end this chat so the next message starts at the menu.
      await saveChat(msg.jid, (c) => {
        c.messages.push(userMsg, out);
        c.stage = "menu";
        c.closed = true;
        c.handoffProvider = "other";
        c.chatwootConversationId = undefined;
        c.handoffNotificationError = undefined;
      }, base);
      try {
        if (!s.attendantNumber || s.attendantNumber === msg.number) throw new Error("Configure outro número para o atendente");
        await sendWhatsApp(s, channel, s.attendantNumber, `*Cliente encaminhado para você — ${companyName}*\n*Nome:* ${chat.name || msg.number}\n*WhatsApp:* +${msg.number}\n\n*Resumo:*\n${waTranscript()}`);
        return "transferred-other";
      } catch (error) {
        await saveChat(msg.jid, (c) => {
          c.handoffNotificationError = error instanceof Error ? error.message : "Falha ao avisar atendente";
        }, base);
        return "human-notification-failed";
      }
    }
    if (s.handoffProvider === "whatsapp") {
      const out = await reply("Certo! Um atendente vai continuar seu atendimento aqui neste WhatsApp. Aguarde um instante. 🙂");
      // Pause durably before notifying staff, even if notification delivery fails.
      await saveChat(msg.jid, (c) => {
        c.messages.push(userMsg, out);
        c.stage = "human";
        c.handoffProvider = "whatsapp";
        c.chatwootConversationId = undefined;
        c.handoffNotificationError = undefined;
      }, base);
      try {
        if (!s.attendantNumber || s.attendantNumber === msg.number) throw new Error("Configure outro número para os avisos ao atendente");
        await sendWhatsApp(s, channel, s.attendantNumber, `*Atendimento humano solicitado — ${companyName}*\n*Nome:* ${chat.name || msg.number}\n*WhatsApp:* +${msg.number}\n\n*Resumo:*\n${waTranscript()}`);
        return "transferred-whatsapp";
      } catch (error) {
        await saveChat(msg.jid, (c) => {
          c.handoffNotificationError = error instanceof Error ? error.message : "Falha ao avisar atendente";
        }, base);
        return "human-notification-failed";
      }
    }
    if (!chatwootReady(s)) {
      const out = await reply("Vou te encaminhar para um atendente. Em breve alguém vai falar com você.");
      await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; c.handoffProvider = "chatwoot"; }, base);
      return "human-no-chatwoot";
    }
    const out = await reply("Certo! Vou transferir você para um dos nossos atendentes. Aguarde só um instante. 🙂");
    const tmp = { ...chat, messages: [...chat.messages, userMsg, out] };
    const conversationId = await openChatwootConversation(s, tmp, companyName);
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; c.handoffProvider = "chatwoot"; c.chatwootConversationId = conversationId; }, base);
    return "transferred";
  };

  if (route.kind === "human") return transfer();

  if (route.kind === "menu") {
    const out = await reply(buildMenu(s.greeting, s.companies, s.humanOption));
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "menu"; c.companyId = undefined; }, base);
    return "menu";
  }

  if (route.kind === "select") {
    const company = s.companies.find((c) => c.id === route.companyId);
    if (!company) return "unknown-company";
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

/** Scheduled sweep: one reminder per unanswered turn, never during a handoff. */
export async function sendInactivityReminders(time = Date.now()) {
  const settings = await getSettings();
  if (!settings.enabled) return { sent: 0, failed: 0 };
  const conversations = await getConversations();
  let sent = 0;
  let failed = 0;
  for (const [jid, candidate] of Object.entries(conversations.chats)) {
    if (!isInactivityDue(candidate, time)) continue;
    // Bound each callback; later ticks process remaining conversations.
    if (sent + failed >= 20) break;
    const chat = await claimInactivityReminder(jid, time);
    if (!chat) continue;
    try {
      const current = (await getConversations()).chats[jid];
      if (!current || current.stage === "human" || current.closed || current.inactivityReminderAt !== chat.inactivityReminderAt) continue;
      await sendWhatsApp(settings, chat.channel, chat.number, INACTIVITY_QUESTION);
      await updateConversations((c) => {
        const latest = c.chats[jid];
        if (!latest) return;
        latest.messages.push({ role: "assistant", content: INACTIVITY_QUESTION, at: now() });
        latest.messages = latest.messages.slice(-60);
      });
      sent++;
    } catch {
      failed++;
      await updateConversations((c) => {
        const latest = c.chats[jid];
        if (latest && latest.inactivityReminderAt === chat.inactivityReminderAt) latest.inactivityReminderAt = undefined;
      });
    }
  }
  return { sent, failed };
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
  if (chat.stage !== "human" || chat.handoffProvider === "whatsapp") return "ignored";

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
      ch.handoffProvider = undefined;
      ch.handoffNotificationError = undefined;
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
    ch.handoffProvider = undefined;
    ch.handoffNotificationError = undefined;
  });
}
