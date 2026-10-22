import { describe, expect, it } from "vitest";
import { parseEvolutionWebhook } from "@/lib/agent-core";

const base = (over: any = {}) => ({
  event: "messages.upsert",
  data: {
    key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: false, id: "ABC" },
    pushName: "Ana",
    message: { conversation: "Oi, qual o horário?" },
    ...over,
  },
});

describe("parseEvolutionWebhook", () => {
  it("extracts number and text from an incoming message", () => {
    const m = parseEvolutionWebhook(base());
    expect(m?.number).toBe("5511999998888");
    expect(m?.text).toBe("Oi, qual o horário?");
  });
  it("ignores messages sent by the business itself", () => {
    expect(parseEvolutionWebhook(base({ key: { remoteJid: "1@s.whatsapp.net", fromMe: true, id: "1" } }))).toBeNull();
  });
  it("flags group messages", () => {
    expect(parseEvolutionWebhook(base({ key: { remoteJid: "123@g.us", fromMe: false, id: "2" } }))?.isGroup).toBe(true);
  });
  it("accepts the v1 uppercase event name", () => {
    expect(parseEvolutionWebhook({ ...base(), event: "MESSAGES_UPSERT" })).not.toBeNull();
  });
});

import { queueTab, fillQuickReply, parseEvolutionWebhook as parse2 } from "@/lib/agent-core";
describe("atendimento", () => {
  it("handoff waiting goes to Fila, taken goes to Atendendo, closed to Finalizados", () => {
    expect(queueTab({ stage: "human", ticketStatus: "queue" })).toBe("queue");
    expect(queueTab({ stage: "human", ticketStatus: "open" })).toBe("open");
    expect(queueTab({ stage: "menu", closed: true })).toBe("resolved");
    expect(queueTab({ stage: "company" })).toBe("ai");
  });
  it("quick reply fills the customer's first name", () => {
    expect(fillQuickReply("Olá {{nome}}!", "Ana Souza")).toBe("Olá Ana!");
  });
  it("accepts photos without caption", () => {
    const m = parse2({ event: "messages.upsert", data: { key: { remoteJid: "55119@s.whatsapp.net", fromMe: false, id: "X" }, message: { imageMessage: { mimetype: "image/jpeg" } } } });
    expect(m?.media?.kind).toBe("image");
    expect(m?.text).toBe("");
  });
});
