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
  getKnowledge: async () => [],
  updateKnowledge: async (fn: (i: any[]) => any[]) => { state.knowledge = fn(state.knowledge ?? []); },
  updateConversations: async (fn: (c: Conversations) => void) => fn(state.conversations),
  claimInactivityReminder: async () => null,
}));
import { HUMAN_WAIT_MESSAGE, handleIncoming, handleChatwootEvent, returnToAI, sendInactivityReminders } from "@/lib/agent.server";

const jid = "5511999990000@s.whatsapp.net";
const incoming = (text: string, id: string) => ({ id, jid, number: "5511999990000", name: "Cliente teste", text, isGroup: false });
const fetchMock = vi.fn();
beforeEach(() => {
  state.settings = { enabled: true, humanOption: true, replyGroups: false, greeting: "Oi", companies: [{ id: "a", name: "Associação Pace3", prompt: "" }], handoffProvider: "whatsapp", attendantNumber: "5511888880000", evolutionUrl: "https://evolution.example.test", evolutionKey: "test", evolutionInstance: "test", chatwootUrl: "https://chatwoot.example.test", chatwootAccountId: "1", chatwootInboxId: "2", chatwootToken: "test" } as Settings;
  state.conversations = { chats: { [jid]: { name: "Cliente teste", number: "5511999990000", channel: "evolution", stage: "company", companyId: "a", messages: [] } }, seenIds: [] };
  fetchMock.mockReset().mockImplementation(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("same-number WhatsApp handoff", () => {
  it("notifies staff separately while retaining the customer number and pausing AI", async () => {
    expect(await handleIncoming(incoming("quero um atendente", "1"), "evolution")).toBe("transferred-whatsapp");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((b) => b.number)).toEqual(["5511999990000", "5511888880000"]);
    expect(state.conversations.chats[jid]?.number).toBe("5511999990000");
    expect(state.conversations.chats[jid]?.stage).toBe("human");
    expect(state.conversations.chats[jid]?.chatwootConversationId).toBeUndefined();
    expect(fetchMock.mock.calls.every((call) => String(call[0]).startsWith(state.settings.evolutionUrl))).toBe(true);
  });
  it("keeps follow-ups silent even when the global destination changes to Chatwoot", async () => {
    await handleIncoming(incoming("atendente", "1"), "evolution");
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
    await handleIncoming(incoming("atendente", "1"), "evolution");
    await returnToAI(jid);
    expect(state.conversations.chats[jid]?.handoffProvider).toBeUndefined();
    expect(await handleIncoming(incoming("oi", "2"), "evolution")).toBe("menu");
    expect(state.conversations.chats[jid]?.stage).toBe("menu");
  });
  it("records notification failure without reactivating AI", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("{}")).mockImplementationOnce(async () => new Response("offline", { status: 503 }));
    expect(await handleIncoming(incoming("atendente", "1"), "evolution")).toBe("human-notification-failed");
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
    await handleIncoming(incoming("atendente", "1"), "ycloud");
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).to)).toEqual(["+5511999990000", "+5511888880000"]);
  });
});

it("preserves Chatwoot handoff and resolution", async () => {
  state.settings.handoffProvider = "chatwoot";
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("contacts/search")) return Response.json({ payload: [{ id: 10, contact_inboxes: [] }] });
    if (url.endsWith("/conversations")) return Response.json({ id: 42 });
    return Response.json({});
  });
  expect(await handleIncoming(incoming("atendente", "1"), "evolution")).toBe("transferred");
  expect(state.conversations.chats[jid]?.chatwootConversationId).toBe(42);
  expect(await handleChatwootEvent({ event: "conversation_resolved", id: 42 })).toBe("returned-to-ai");
  expect(state.conversations.chats[jid]?.stage).toBe("menu");
});
describe("transfer to another number", () => {
  it("sends the customer a link to the attendant, a bold summary to the attendant, and ends the chat", async () => {
    state.settings.handoffProvider = "other";
    expect(await handleIncoming(incoming("quero um atendente", "1"), "evolution")).toBe("transferred-other");
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((b) => b.number)).toEqual(["5511999990000", "5511888880000"]);
    expect(bodies[0].text).toContain("https://wa.me/5511888880000");
    expect(bodies[1].text).toContain("*Cliente:* quero um atendente");
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
    await handleIncoming(incoming("atendente", "1"), "evolution");
    expect(await closeByStaff(jid)).toBe("closed-by-staff");
    expect(state.conversations.chats[jid]?.stage).toBe("menu");
    expect(await handleIncoming(incoming("oi", "2"), "evolution")).toBe("menu");
  });
});

it("aprende automaticamente com as respostas do atendente ao encerrar", async () => {
  state.knowledge = [];
  const { recordStaffMessage, closeByStaff } = await import("@/lib/agent.server");
  await handleIncoming(incoming("qual o horário da retirada do kit?", "1"), "evolution");
  await handleIncoming(incoming("atendente", "2"), "evolution");
  expect(await recordStaffMessage(jid, "A retirada é das 14h30 às 20h no Espetop.")).toBe("staff-recorded");
  await closeByStaff(jid);
  expect(state.knowledge).toHaveLength(1);
  expect(state.knowledge[0].companyId).toBe("a");
  expect(state.knowledge[0].content).toContain("Resposta do atendente: A retirada é das 14h30 às 20h no Espetop.");
});
