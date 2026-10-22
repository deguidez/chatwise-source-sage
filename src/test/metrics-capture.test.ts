import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock("@/lib/store.server", () => ({ recordMetric: async (e: any) => state.events.push(e), getConversations: async () => ({ chats: { first: { number: "123", channel: "ycloud", companyId: "wrong" }, second: { number: "123", channel: "evolution", companyId: "correct", handledBy: "staff" } } }) }));
import { aiFetch, whatsAppFetch } from "@/lib/metrics.server";
beforeEach(() => { state.events = []; vi.restoreAllMocks(); });
it("registra tokens reais na tentativa e conserva a resposta", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 } }));
  const result = await aiFetch("https://example.test", {}, "openai", "model", { requestId: "request", source: "test" });
  expect(result.ok).toBe(true);
  expect(state.events[0]).toMatchObject({ type: "ai", source: "test", requestId: "request", totalTokens: 110, status: "ok" });
});
it("só conta envio confirmado, respeitando canal e atendente", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 400 })).mockResolvedValueOnce(new Response("{}"));
  await whatsAppFetch("https://example.test", {}, "evolution", "123", "attendant");
  await whatsAppFetch("https://example.test", {}, "evolution", "123", "attendant");
  expect(state.events.map((e) => e.type)).toEqual(["send_failed", "sent"]);
  expect(state.events[1]).toMatchObject({ companyId: "correct", actor: "staff" });
});