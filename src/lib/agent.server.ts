import { buildMenu, routeMessage, selectContext, TRANSFER_TOKEN, INACTIVITY_QUESTION, isInactivityDue, isAutoCloseDue, AUTO_CLOSE_MESSAGE, wantsToCancel, type IncomingMessage } from "./agent-core";
import {
  getConversations,
  getKnowledge,
  getSettings,
  updateKnowledge,
  claimInactivityReminder,
  updateConversations,
  type ChatMessage,
  type ChatState,
  type ChatMedia,
  type Settings,
  saveMedia,
  getMedia,
} from "./store.server";

// ---------------- AI providers ----------------
type Turn = { role: "user" | "assistant"; content: string };

async function callAI(s: Settings, system: string, turns: Turn[]): Promise<string> {
  if (s.aiProvider === "gemini") {
    if (!s.geminiKey) throw new Error("Chave do Gemini não configurada");
    const primary = (s.geminiModel || "").trim().replace(/^models\//, "").replace(/^gemini-2\.5-flash(-lite)?$/, "") || "gemini-3.8-flash";
    // When Google is overloaded (503/429), wait and retry, then try a lighter model.
    const attempts = [primary, "gemini-3.8-flash-lite", "gemini-flash-latest", primary];
    let res!: Response;
    let body = "";
    for (let i = 0; i < attempts.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 800));
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
      // Quota exhausted: retrying wastes time, go straight to the backup.
      if (res.status === 429 && body.includes("quota") && s.openaiKey) break;
    }
    if (!res.ok) {
      console.error(`Gemini falhou [${res.status}]: ${body.slice(0, 500)}`);
      // Backup: answer with OpenAI when its key is saved, so the customer is not left without a reply.
      if (s.openaiKey) return callAI({ ...s, aiProvider: "openai" }, system, turns);
      if (res.status === 429) throw new Error("O limite gratuito do Gemini foi atingido. Aguarde alguns minutos ou ative o faturamento no Google AI Studio.");
      if (res.status === 503) throw new Error("O Gemini está sobrecarregado no momento. Tente de novo em alguns minutos.");
      throw new Error(`Gemini [${res.status}]: ${body.slice(0, 300)}`);
    }
    const json = JSON.parse(body);
    return (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  }
  if (s.aiProvider === "ollama") {
    // Fix common typos in the saved address ("ttps://", missing scheme, trailing slash).
    let base = (s.ollamaUrl || "http://localhost:11434").trim().replace(/\/+$/, "").replace(/\/api\/(chat|tags)$/, "");
    base = base.replace(/^h?t?t?p?s?:?\/*(?=[a-z0-9])/i, (m) => (/^h?t?tps/i.test(m) ? "https://" : m.toLowerCase().startsWith("http:") ? "http://" : "https://"));
    const res = await fetch(`${base}/api/chat`, {
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

export type OutgoingMedia = { kind: ChatMedia["kind"]; mimetype: string; fileName?: string | undefined; data: string; caption?: string | undefined };

/** Send a photo, video, audio or file through Evolution (base64 body). */
export async function sendWhatsAppMedia(s: Settings, channel: ChatState["channel"], number: string, media: OutgoingMedia) {
  if (channel === "ycloud") throw new Error("Envio de anexos pelo app está disponível apenas com a Evolution");
  const { evolutionUrl, evolutionKey, evolutionInstance } = s;
  if (!evolutionUrl || !evolutionKey || !evolutionInstance) throw new Error("Evolution API não configurada");
  const base = `${evolutionUrl.replace(/\/$/, "")}/message`;
  const inst = encodeURIComponent(evolutionInstance);
  const [url, body] = media.kind === "audio"
    ? [`${base}/sendWhatsAppAudio/${inst}`, { number, audio: media.data }]
    : [`${base}/sendMedia/${inst}`, {
        number,
        mediatype: media.kind === "sticker" ? "image" : media.kind,
        mimetype: media.mimetype,
        media: media.data,
        fileName: media.fileName || `arquivo.${media.mimetype.split("/")[1]?.split(";")[0] || "bin"}`,
        ...(media.caption ? { caption: media.caption } : {}),
      }];
  const res = await fetch(url, { method: "POST", headers: { apikey: evolutionKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Evolution [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

/** Download an incoming attachment from Evolution and store it. */
async function storeIncomingMedia(s: Settings, msg: IncomingMessage): Promise<ChatMedia | undefined> {
  if (!msg.media) return undefined;
  try {
    const res = await fetch(`${s.evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(s.evolutionInstance)}`, {
      method: "POST",
      headers: { apikey: s.evolutionKey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg.raw, convertToMp4: msg.media.kind === "video" }),
    });
    if (!res.ok) throw new Error(`Evolution [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const data = String(json.base64 ?? "");
    if (!data) throw new Error("arquivo vazio");
    if (data.length > 22_000_000) throw new Error("arquivo grande demais");
    const mimetype = String(json.mimetype || msg.media.mimetype).split(";")[0] ?? msg.media.mimetype;
    const id = await saveMedia({ mimetype, fileName: msg.media.fileName, data });
    return { id, kind: msg.media.kind, mimetype, fileName: msg.media.fileName };
  } catch (error) {
    console.error("Download de anexo falhou:", error);
    return undefined;
  }
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
const STAFF_CLOSED_NOTE = "Atendimento encerrado pelo atendente.";

/** Store what the attendant typed on the company phone during a same-WhatsApp handoff. */
export async function recordStaffMessage(jid: string, text: string) {
  let saved = false;
  await updateConversations((c) => {
    const chat = c.chats[jid];
    if (!chat || chat.stage !== "human" || chat.handoffProvider !== "whatsapp") return;
    // Our own automatic messages also echo back as "sent by the company"; skip them.
    if (chat.messages.slice(-6).some((m) => m.role !== "user" && m.content === text)) return;
    chat.messages.push({ role: "agent", content: text, at: now() });
    chat.messages = chat.messages.slice(-200);
    saved = true;
  });
  return saved ? "staff-recorded" : "ignored";
}
export const HUMAN_WAIT_MESSAGE = "Seu atendimento já foi encaminhado. Um atendente irá te atender em instantes. 🙂";

async function saveChat(jid: string, fn: (c: ChatState) => void, base: ChatState) {
  await updateConversations((c) => {
    const chat = c.chats[jid] ?? base;
    fn(chat);
    if (chat.messages.at(-1)?.role === "user") chat.inactivityReminderAt = undefined;
    chat.messages = chat.messages.slice(-200);
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
    chat.ticketStatus = undefined;
  }
  const media = msg.media && channel === "evolution" ? await storeIncomingMedia(s, msg) : undefined;
  const userMsg: ChatMessage = { role: "user", content: msg.text || (msg.media ? "" : ""), at: now(), ...(media ? { media } : {}) };
  // Attachments without text cannot be read by the AI: keep them for the attendant.
  if (!msg.text && chat.stage !== "human") {
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg); c.closed = false; c.ticketStatus = undefined; if (!c.name && msg.name) c.name = msg.name; }, { ...base, ...chat });
    return "media-stored";
  }
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
    if (c.closed) c.ticketStatus = undefined;
    c.closed = false;
    c.inactivityReminderAt = undefined;
    if (msg.name) c.name = msg.name;
  }, base);

  if (route.kind === "silent") {
    if (msg.text && chat.handoffProvider !== "whatsapp" && chat.chatwootConversationId && chatwootReady(s)) await forwardToChatwoot(s, chat.chatwootConversationId, msg.text);
    await saveChat(msg.jid, (c) => c.messages.push(userMsg), base);
    // Reassure the customer while waiting, at most once every 5 minutes.
    const lastNotice = [...chat.messages].reverse().find((m) => m.role === "assistant" && m.content === HUMAN_WAIT_MESSAGE);
    if (!lastNotice || Date.now() - Date.parse(lastNotice.at) >= 5 * 60 * 1000) {
      try {
        await sendWhatsApp(s, channel, msg.number, HUMAN_WAIT_MESSAGE);
        await saveChat(msg.jid, (c) => c.messages.push({ role: "assistant", content: HUMAN_WAIT_MESSAGE, at: now() }), base);
      } catch (error) {
        console.error("Aviso de espera falhou:", error);
      }
    }
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
        c.ticketStatus = "queue";
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
      await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; c.ticketStatus = "queue"; c.handoffProvider = "chatwoot"; }, base);
      return "human-no-chatwoot";
    }
    const out = await reply("Certo! Vou transferir você para um dos nossos atendentes. Aguarde só um instante. 🙂");
    const tmp = { ...chat, messages: [...chat.messages, userMsg, out] };
    const conversationId = await openChatwootConversation(s, tmp, companyName);
    await saveChat(msg.jid, (c) => { c.messages.push(userMsg, out); c.stage = "human"; c.ticketStatus = "queue"; c.handoffProvider = "chatwoot"; c.chatwootConversationId = conversationId; }, base);
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
  if (!settings.enabled) return { sent: 0, failed: 0, closed: 0 };
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
        latest.messages = latest.messages.slice(-200);
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
  // Second step: customers silent after the question get an automatic closing message.
  let closedCount = 0;
  for (const jid of Object.keys((await getConversations()).chats)) {
    let target: { number: string; channel: typeof conversations.chats[string]["channel"] } | null = null;
    await updateConversations((c) => {
      const latest = c.chats[jid];
      if (!latest || !isAutoCloseDue(latest, time)) return;
      latest.closed = true;
      latest.stage = "menu";
      latest.companyId = undefined;
      latest.messages.push({ role: "assistant", content: AUTO_CLOSE_MESSAGE, at: now() });
      latest.messages = latest.messages.slice(-200);
      target = { number: latest.number, channel: latest.channel };
    });
    const t = target as { number: string; channel: typeof conversations.chats[string]["channel"] } | null;
    if (!t) continue;
    try { await sendWhatsApp(settings, t.channel, t.number, AUTO_CLOSE_MESSAGE); closedCount++; } catch { failed++; }
  }
  return { sent, failed, closed: closedCount };
}

/** Automatic learning: the attendant's answers become knowledge for the AI next time. */
export async function learnFromChat(chat: ChatState | undefined) {
  if (!chat) return false;
  const recent = chat.messages.slice(-30);
  const first = recent.findIndex((m) => m.role === "agent" && m.content !== STAFF_CLOSED_NOTE);
  if (first < 0) return false;
  const lines = recent.slice(Math.max(0, first - 3))
    .filter((m) => m.role !== "assistant" && m.content !== STAFF_CLOSED_NOTE)
    .map((m) => `${m.role === "user" ? "Pergunta do cliente" : "Resposta do atendente"}: ${m.content}`);
  if (!lines.some((l) => l.startsWith("Resposta"))) return false;
  const date = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await updateKnowledge((items) => [
    ...items,
    { id: crypto.randomUUID(), type: "text", title: `Aprendido com atendimento — ${chat.name || chat.number} (${date})`, content: lines.join("\n").slice(0, 6000), companyId: chat.companyId, createdAt: now() },
  ]);
  return true;
}

/** Attendant ends a same-WhatsApp handoff by sending the closing phrase from the company phone. */
export async function closeByStaff(jid: string) {
  let closed = false;
  let snapshot: ChatState | undefined;
  await updateConversations((c) => {
    const chat = c.chats[jid];
    if (!chat || chat.stage !== "human" || chat.handoffProvider !== "whatsapp") return;
    snapshot = structuredClone(chat);
    chat.stage = "menu";
    chat.closed = true;
    chat.ticketStatus = "resolved";
    chat.closedAt = now();
    chat.companyId = undefined;
    chat.handoffProvider = undefined;
    chat.handoffNotificationError = undefined;
    chat.inactivityReminderAt = undefined;
    chat.messages.push({ role: "agent", content: STAFF_CLOSED_NOTE, at: now() });
    closed = true;
  });
  if (closed) await learnFromChat(snapshot).catch((e) => console.error("Aprendizado falhou:", e));
  return closed ? "closed-by-staff" : "ignored";
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
    let snapshot: ChatState | undefined;
    await updateConversations((c) => {
      const ch = c.chats[jid];
      if (!ch) return;
      snapshot = structuredClone(ch);
      ch.stage = "menu";
      ch.companyId = undefined;
      ch.chatwootConversationId = undefined;
      ch.handoffProvider = undefined;
      ch.handoffNotificationError = undefined;
    });
    await learnFromChat(snapshot).catch((e) => console.error("Aprendizado falhou:", e));
    return "returned-to-ai";
  }
  return "ignored";
}

/** Manually give a chat back to the AI from the dashboard. */
export async function returnToAI(jid: string) {
  let snapshot: ChatState | undefined;
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (!ch) return;
    if (ch.stage === "human") snapshot = structuredClone(ch);
    ch.stage = "menu";
    ch.companyId = undefined;
    ch.chatwootConversationId = undefined;
    ch.handoffProvider = undefined;
    ch.handoffNotificationError = undefined;
  });
  await learnFromChat(snapshot).catch((e) => console.error("Aprendizado falhou:", e));
}

// ---------------- Attendance from the app ----------------
const RESOLVED_MESSAGE = "Seu atendimento foi finalizado. Obrigado pelo contato! Se precisar, é só mandar uma nova mensagem. 😊";

/** Attendant takes the chat: the AI stops answering it. */
export async function assumeChat(jid: string) {
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (!ch) throw new Error("Conversa não encontrada");
    if (ch.stage !== "human") { ch.handoffProvider = "whatsapp"; ch.chatwootConversationId = undefined; }
    ch.stage = "human";
    ch.closed = false;
    ch.ticketStatus = "open";
    ch.inactivityReminderAt = undefined;
  });
}

/** Attendant sends a text and/or attachment from the app. */
export async function agentSend(jid: string, text: string, media?: OutgoingMedia) {
  const s = await getSettings();
  const chat = (await getConversations()).chats[jid];
  if (!chat) throw new Error("Conversa não encontrada");
  await assumeChat(jid);
  let stored: ChatMedia | undefined;
  if (media) {
    await sendWhatsAppMedia(s, chat.channel, chat.number, { ...media, caption: text || undefined });
    const id = await saveMedia({ mimetype: media.mimetype, fileName: media.fileName, data: media.data });
    stored = { id, kind: media.kind, mimetype: media.mimetype, fileName: media.fileName };
  } else {
    if (!text.trim()) throw new Error("Mensagem vazia");
    await sendWhatsApp(s, chat.channel, chat.number, text);
  }
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (!ch) return;
    ch.messages.push({ role: "agent", content: text, at: now(), ...(stored ? { media: stored } : {}) });
    ch.messages = ch.messages.slice(-200);
  });
}

/** Resolve: tell the customer, move to "Finalizados" and learn from the answers. */
export async function resolveChat(jid: string, notify = true) {
  const s = await getSettings();
  let snapshot: ChatState | undefined;
  const chat = (await getConversations()).chats[jid];
  if (!chat) throw new Error("Conversa não encontrada");
  if (notify) await sendWhatsApp(s, chat.channel, chat.number, RESOLVED_MESSAGE).catch((e) => console.error("Aviso de finalização falhou:", e));
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (!ch) return;
    if (ch.stage === "human") snapshot = structuredClone(ch);
    ch.stage = "menu";
    ch.closed = true;
    ch.ticketStatus = "resolved";
    ch.closedAt = now();
    ch.companyId = ch.companyId;
    ch.handoffProvider = undefined;
    ch.chatwootConversationId = undefined;
    ch.handoffNotificationError = undefined;
    ch.inactivityReminderAt = undefined;
    if (notify) ch.messages.push({ role: "assistant", content: RESOLVED_MESSAGE, at: now() });
  });
  await learnFromChat(snapshot).catch((e) => console.error("Aprendizado falhou:", e));
}

/** Reopen a finished conversation with the attendant. */
export async function reopenChat(jid: string) {
  await assumeChat(jid);
}

export async function renameChat(jid: string, name: string) {
  await updateConversations((c) => {
    const ch = c.chats[jid];
    if (ch) ch.name = name;
  });
}

export { getMedia };
