import { selectContext, type IncomingMessage } from "./agent-core";
import {
  getConversations,
  getKnowledge,
  getSettings,
  updateConversations,
  type ChatMessage,
  type Settings,
} from "./store.server";

export async function generateReply(
  settings: Settings,
  history: ChatMessage[],
  question: string,
): Promise<string> {
  if (!settings.openaiKey) throw new Error("Chave da OpenAI não configurada");
  const knowledge = await getKnowledge();
  const context = selectContext(knowledge, question);
  const messages = [
    {
      role: "system",
      content: `${settings.systemPrompt}\n\n=== BASE DE CONHECIMENTO ===\n${context || "(vazia)"}`,
    },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: question },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: settings.openaiModel || "gpt-4o-mini", messages }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI [${res.status}]: ${body.slice(0, 300)}`);
  const json = JSON.parse(body);
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

export async function sendWhatsApp(settings: Settings, number: string, text: string) {
  const { evolutionUrl, evolutionKey, evolutionInstance } = settings;
  if (!evolutionUrl || !evolutionKey || !evolutionInstance)
    throw new Error("Evolution API não configurada");
  const url = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(evolutionInstance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: evolutionKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) throw new Error(`Evolution [${res.status}]: ${(await res.text()).slice(0, 300)}`);
}

export async function handleIncoming(msg: IncomingMessage) {
  const settings = await getSettings();
  if (!settings.enabled) return "disabled";
  if (msg.isGroup && !settings.replyGroups) return "group-ignored";

  const convs = await getConversations();
  if (msg.id && convs.seenIds.includes(msg.id)) return "duplicate";
  await updateConversations((c) => {
    if (msg.id) c.seenIds = [...c.seenIds.slice(-499), msg.id];
  });

  const history = convs.chats[msg.jid]?.messages ?? [];
  const reply = await generateReply(settings, history, msg.text);
  if (!reply) return "empty";
  await sendWhatsApp(settings, msg.number, reply);

  const now = new Date().toISOString();
  await updateConversations((c) => {
    const chat = c.chats[msg.jid] ?? { name: msg.name, messages: [] };
    chat.name = msg.name || chat.name;
    chat.messages = [
      ...chat.messages,
      { role: "user" as const, content: msg.text, at: now },
      { role: "assistant" as const, content: reply, at: now },
    ].slice(-40);
    c.chats[msg.jid] = chat;
  });
  return "replied";
}
