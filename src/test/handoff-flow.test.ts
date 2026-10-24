import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversations, Settings } from "@/lib/store.server";

const state = vi.hoisted(() => ({
  conversations: { chats: {}, seenIds: [] } as Conversations,
  settings: {} as Settings,
  knowledge: [] as any[],
}));
vi.mock("@/lib/store.server", () => ({
  getSettings: async () => state.settings,
  getConversations: async () => structuredClone(state.conversations),
  getKnowledge: async () => state.knowledge,
  updateKnowledge: async (fn: (i: any[]) => any[]) => { state.knowledge = fn(state.knowledge ?? []); },
  updateConversations: async (fn: (c: Conversations) => void) => fn(state.conversations),
  claimInactivityReminder: async () => null,
  recordMetric: async () => {},
}));
import { HUMAN_WAIT_MESSAGE, handleIncoming, handleChatwootEvent, returnToAI, sendInactivityReminders } from "@/lib/agent.server";

const jid = "5511999990000@s.whatsapp.net";
const incoming = (text: string, id: string) => ({ id, jid, number: "5511999990000", name: "Cliente teste", text, isGroup: false });
const requestHandoff = async (text: string, id: string, channel: "evolution" | "ycloud" = "evolution") => {
  expect(await handleIncoming(incoming(text, id), channel)).toBe("awaiting-handoff-description");
  return handleIncoming(incoming("Preciso alterar minha inscrição", `${id}-description`), channel);
};
const fetchMock = vi.fn();
beforeEach(() => {
  state.knowledge = [];
  state.settings = { enabled: true, humanOption: true, replyGroups: false, greeting: "Oi", companies: [{ id: "a", name: "Associação Pace3", prompt: "" }], handoffProvider: "whatsapp", attendantNumber: "5511888880000", evolutionUrl: "https://evolution.example.test", evolutionKey: "test", evolutionInstance: "test", chatwootUrl: "https://chatwoot.example.test", chatwootAccountId: "1", chatwootInboxId: "2", chatwootToken: "test" } as Settings;
  state.conversations = { chats: { [jid]: { name: "Cliente teste", number: "5511999990000", channel: "evolution", stage: "company", companyId: "a", messages: [] } }, seenIds: [] };
  fetchMock.mockReset().mockImplementation(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("same-number WhatsApp handoff", () => {
  it("notifies staff separately while retaining the customer number and pausing AI", async () => {
    expect(await requestHandoff("quero um atendente", "1")).toBe("transferred-whatsapp");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((b) => b.number)).toEqual(["5511999990000", "5511999990000", "5511888880000"]);
    expect(state.conversations.chats[jid]?.number).toBe("5511999990000");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
    expect(state.conversations.chats[jid]?.chatwootConversationId).toBeUndefined();
    expect(fetchMock.mock.calls.every((call) => String(call[0]).startsWith(state.settings.evolutionUrl))).toBe(true);
  });
  it("keeps follow-ups silent even when the global destination changes to Chatwoot", async () => {
    await requestHandoff("atendente", "1");
    fetchMock.mockClear();
    state.settings.handoffProvider = "chatwoot";
    await handleIncoming(incoming("mais uma dúvida", "2"), "evolution");
    expect(await sendInactivityReminders(Date.now() + 120000)).toMatchObject({ sent: 0, failed: 0 });
    // Only the waiting notice goes to the customer; the AI does not answer.
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).text)).toEqual([HUMAN_WAIT_MESSAGE]);
    fetchMock.mockClear();
    await handleIncoming(incoming("alô?", "3"), "evolution");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("resumes the menu only after manual return", async () => {
    await requestHandoff("atendente", "1");
    await returnToAI(jid);
    expect(state.conversations.chats[jid]?.handoffProvider).toBeUndefined();
    expect(await handleIncoming(incoming("oi", "2"), "evolution")).toBe("menu");
    expect(state.conversations.chats[jid]?.stage).toBe("menu");
  });
  it("records notification failure without reactivating AI", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}")).mockImplementationOnce(async () => new Response("{}")).mockImplementationOnce(async () => new Response("offline", { status: 503 }));
    expect(await requestHandoff("atendente", "1")).toBe("human-notification-failed");
    expect(state.conversations.chats[jid]?.handoffNotificationError).toContain("503");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
  });
  it("does not start an AI conversation with the staff notification recipient", async () => {
    expect(await handleIncoming({ ...incoming("oi", "1"), number: state.settings.attendantNumber, jid: "staff@s.whatsapp.net" }, "evolution")).toBe("staff-ignored");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses YCloud for both customer acknowledgment and staff notification", async () => {
    state.settings.ycloudKey = "test";
    state.settings.ycloudFrom = "+5511777770000";
    await requestHandoff("atendente", "1", "ycloud");
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).to)).toEqual(["+5511999990000", "+5511999990000", "+5511888880000"]);
  });
});

it("preserves Chatwoot handoff and resolution", async () => {
  state.settings.handoffProvider = "chatwoot";
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("contacts/search")) return Response.json({ payload: [{ id: 10, contact_inboxes: [] }] });
    if (url.endsWith("/conversations")) return Response.json({ id: 42 });
    return Response.json({});
  });
  expect(await requestHandoff("atendente", "1")).toBe("transferred");
  expect(state.conversations.chats[jid]?.chatwootConversationId).toBe(42);
  expect(await handleChatwootEvent({ event: "conversation_resolved", id: 42 })).toBe("returned-to-ai");
  expect(state.conversations.chats[jid]?.stage).toBe("menu");
});
describe("transfer to another number", () => {
  it("sends the customer a link to the attendant, a bold summary to the attendant, and ends the chat", async () => {
    state.settings.handoffProvider = "other";
    expect(await requestHandoff("quero um atendente", "1")).toBe("transferred-other");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((b) => b.number)).toEqual(["5511999990000", "5511999990000", "5511888880000"]);
    expect(bodies[1].text).toContain("https://wa.me/5511888880000");
    expect(bodies[2].text).toContain("*Cliente:* quero um atendente");
    expect(bodies[2].text).toContain("*Cliente:* Preciso alterar minha inscrição");
    expect(state.conversations.chats[jid]?.closed).toBe(true);
    expect(await handleIncoming(incoming("oi", "2"), "evolution")).toBe("menu");
  });
});

describe("attendant closes from the company phone", () => {
  it("'irei encerrar o seu atendimento' ends the handoff and the next message gets the menu", async () => {
    const { isStaffCloseCommand } = await import("@/lib/agent-core");
    const { closeByStaff } = await import("@/lib/agent.server");
    expect(isStaffCloseCommand("Obrigado! Irei encerrar o seu atendimento.")).toBe(true);
    expect(isStaffCloseCommand("Já te passo o valor")).toBe(false);
    await requestHandoff("atendente", "1");
    expect(await closeByStaff(jid)).toBe("closed-by-staff");
    expect(state.conversations.chats[jid]?.stage).toBe("menu");
    expect(await handleIncoming(incoming("oi", "2"), "evolution")).toBe("menu");
  });
});

it("aprende automaticamente com as respostas do atendente ao encerrar", async () => {
  state.knowledge = [];
  const { recordStaffMessage, closeByStaff } = await import("@/lib/agent.server");
  state.conversations.chats[jid]?.messages.push({ role: "user", content: "qual o horário da retirada do kit?", at: new Date().toISOString() });
  await requestHandoff("atendente", "2");
  expect(await recordStaffMessage(jid, "A retirada é das 14h30 às 20h no Espetop.")).toBe("staff-recorded");
  await closeByStaff(jid);
  expect(state.knowledge).toHaveLength(1);
  expect(state.knowledge[0].companyId).toBe("a");
  expect(state.knowledge[0].content).toContain("Resposta do atendente: A retirada é das 14h30 às 20h no Espetop.");
});


describe("description before customer-requested handoff", () => {
  it.each(["a", "e", undefined])("answers from eligible knowledge before transferring company %s", async (companyId) => {
    state.settings.companies.push({ id: "e", name: "Pace3 Eventos Esportivos", prompt: "" });
    state.settings.aiProvider = "openai";
    state.settings.openaiKey = "test";
    state.knowledge = [
      { title: "Retirada", content: "Retirada de kit das 14h30 às 20h.", companyId: companyId ?? "" },
      { title: "Outra empresa", content: "Informação exclusiva da outra empresa.", companyId: "outra" },
    ];
    const chat = state.conversations.chats[jid];
    if (!chat) throw new Error("Missing test conversation");
    chat.companyId = companyId;
    chat.stage = companyId ? "company" : "menu";
    fetchMock.mockImplementation(async (url: string) => url.includes("api.openai.com")
      ? Response.json({ choices: [{ message: { content: "A retirada de kit é das 14h30 às 20h." } }] })
      : Response.json({}));
    await handleIncoming(incoming(companyId ? "atendente" : "3", "request"), "evolution");
    expect(await handleIncoming(incoming("Qual o horário da retirada de kit?", "description"), "evolution")).toBe("replied");
    expect(state.conversations.chats[jid]?.stage).toBe(companyId ? "company" : "menu");
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBeUndefined();
    expect(state.conversations.chats[jid]?.messages.at(-1)?.content).toBe("A retirada de kit é das 14h30 às 20h.");
    const aiCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("api.openai.com"));
    expect(aiCall).toBeDefined();
    const prompt = JSON.parse(aiCall?.[1].body).messages[0].content;
    expect(prompt).toContain("Retirada de kit das 14h30 às 20h.");
    expect(prompt).not.toContain("Informação exclusiva da outra empresa.");
    expect(fetchMock.mock.calls.filter((call) => JSON.parse(call[1].body).number === state.settings.attendantNumber)).toHaveLength(0);
  });
  it.each(["[TRANSFERIR]", "", "error"])("transfers with the existing description when knowledge cannot resolve it (%s)", async (answer) => {
    state.settings.aiProvider = "openai";
    state.settings.openaiKey = "test";
    state.knowledge = [{ title: "Horário", content: "Retirada às 14h30.", companyId: "a" }];
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.openai.com")) return answer === "error"
        ? new Response("unavailable", { status: 503 })
        : Response.json({ choices: [{ message: { content: answer } }] });
      return Response.json({});
    });
    expect(await requestHandoff("atendente", "request")).toBe("transferred-whatsapp");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body).text).toContain("*Cliente:* Preciso alterar minha inscrição");
  });
  it.each(["[TRANSFERIR]", ""])("asks before an automatic AI handoff (%s), then transfers after the description", async (answer) => {
    state.settings.aiProvider = "openai";
    state.settings.openaiKey = "test";
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("api.openai.com")) return Response.json({ choices: [{ message: { content: answer } }] });
      return Response.json({});
    });
    expect(await handleIncoming(incoming("Não consegui resolver minha inscrição", "ai-request"), "evolution")).toBe("awaiting-handoff-description");
    expect(state.conversations.chats[jid]?.stage).toBe("company");
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBe(true);
    const notifications = fetchMock.mock.calls.filter((call) => JSON.parse(call[1].body).number === state.settings.attendantNumber);
    expect(notifications).toHaveLength(0);
    expect(await handleIncoming(incoming("Preciso corrigir meu nome na inscrição", "ai-description"), "evolution")).toBe("transferred-whatsapp");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
    expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1].body).text).toContain("*Cliente:* Preciso corrigir meu nome na inscrição");
  });
  it.each(["a", "e", undefined])("waits for a description and preserves company %s", async (companyId) => {
    state.settings.companies.push({ id: "e", name: "Pace3 Eventos Esportivos", prompt: "" });
    const chat = state.conversations.chats[jid];
    if (!chat) throw new Error("Missing test conversation");
    chat.companyId = companyId;
    chat.stage = companyId ? "company" : "menu";
    expect(await handleIncoming(incoming(companyId ? "atendente" : "3", "request"), "evolution")).toBe("awaiting-handoff-description");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(state.conversations.chats[jid]?.stage).toBe(companyId ? "company" : "menu");
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBe(true);
    fetchMock.mockClear();
    expect(await handleIncoming(incoming("Preciso alterar minha inscrição", "description"), "evolution")).toBe("transferred-whatsapp");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
    expect(state.conversations.chats[jid]?.companyId).toBe(companyId);
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBeUndefined();
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).text).toContain("*Cliente:* Preciso alterar minha inscrição");
  });
  it("lets the customer return to the menu without transferring", async () => {
    await handleIncoming(incoming("atendente", "request"), "evolution");
    expect(await handleIncoming(incoming("0", "back"), "evolution")).toBe("menu");
    expect(state.conversations.chats[jid]?.awaitingHandoffDescription).toBeUndefined();
    expect(state.conversations.chats[jid]?.stage).toBe("menu");
  });
});
