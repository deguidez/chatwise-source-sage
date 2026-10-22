import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatState, Conversations, Settings } from "@/lib/store.server";
import { isInactivityDue, INACTIVITY_QUESTION } from "@/lib/agent-core";

const state = vi.hoisted(() => ({
  conversations: { chats: {}, seenIds: [] } as Conversations,
  settings: { enabled: true, replyGroups: false, companies: [{ id: "a", name: "Associação Pace3", prompt: "" }], humanOption: true, greeting: "Oi", evolutionUrl: "https://evolution.example.test", evolutionKey: "test", evolutionInstance: "test" } as Settings,
}));

vi.mock("@/lib/store.server", () => ({
  getSettings: async () => state.settings,
  getConversations: async () => structuredClone(state.conversations),
  getKnowledge: async () => [],
  updateConversations: async (fn: (c: Conversations) => void) => fn(state.conversations),
  claimInactivityReminder: async (jid: string, time: number) => {
    const chat = state.conversations.chats[jid];
    if (!chat || !isInactivityDue(chat, time)) return null;
    chat.inactivityReminderAt = new Date(time).toISOString();
    return structuredClone(chat);
  },
}));

import { handleIncoming, sendInactivityReminders } from "@/lib/agent.server";

const start = Date.parse("2026-10-22T16:00:00Z");
const jid = "5511999990000@s.whatsapp.net";
const incoming = (text: string, id: string) => ({ id, jid, number: "5511999990000", name: "Teste", text, isGroup: false });
const fetchMock = vi.fn();

beforeEach(() => {
  state.conversations = { chats: { [jid]: { name: "Teste", number: "5511999990000", channel: "evolution", stage: "company", companyId: "a", messages: [{ role: "assistant", content: "Como posso ajudar?", at: new Date(start).toISOString() }] } }, seenIds: [] };
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("inactivity conversation flow", () => {
  it("sends once, closes on cancelar, and reopens on a new message", async () => {
    expect(await sendInactivityReminders(start + 119999)).toEqual({ sent: 0, failed: 0 });
    expect(await sendInactivityReminders(start + 120000)).toEqual({ sent: 1, failed: 0 });
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).text).toBe(INACTIVITY_QUESTION);
    expect(await sendInactivityReminders(start + 600000)).toEqual({ sent: 0, failed: 0 });
    expect(await handleIncoming(incoming("cancelar", "cancel"), "evolution")).toBe("cancelled");
    expect(state.conversations.chats[jid]?.closed).toBe(true);
    expect(await sendInactivityReminders(start + 900000)).toEqual({ sent: 0, failed: 0 });
    expect(await handleIncoming(incoming("oi", "reopen"), "evolution")).toBe("menu");
    expect(state.conversations.chats[jid]?.closed).toBe(false);
    expect(state.conversations.chats[jid]?.companyId).toBeUndefined();
  });

  it("lets customers continue and allows a reminder on their next unanswered turn", async () => {
    await sendInactivityReminders(start + 120000);
    expect(await handleIncoming(incoming("menu", "continue"), "evolution")).toBe("menu");
    expect(state.conversations.chats[jid]?.inactivityReminderAt).toBeUndefined();
    expect(await sendInactivityReminders(Date.now() + 120001)).toEqual({ sent: 1, failed: 0 });
  });

  it("skips human conversations and retries failed delivery", async () => {
    const chat: ChatState | undefined = state.conversations.chats[jid];
    if (!chat) throw new Error("Missing test conversation");
    chat.stage = "human";
    expect(await sendInactivityReminders(start + 120000)).toEqual({ sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    chat.stage = "company";
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await sendInactivityReminders(start + 120000)).toEqual({ sent: 0, failed: 1 });
    expect(chat.inactivityReminderAt).toBeUndefined();
    expect(await sendInactivityReminders(start + 180000)).toEqual({ sent: 1, failed: 0 });
  });
});