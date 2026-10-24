import { describe, expect, it } from "vitest";
import { parseYCloudWebhook, routeMessage } from "@/lib/agent-core";

const companies = [
  { id: "a", name: "Associação Pace3" },
  { id: "e", name: "Pace3 Eventos Esportivos" },
];

describe("routeMessage", () => {
  it("new contact gets the menu", () => {
    expect(routeMessage(undefined, "oi", companies, true)).toEqual({ kind: "menu" });
  });
  it("option 2 selects the second company", () => {
    expect(routeMessage({ stage: "menu" }, "2", companies, true)).toEqual({ kind: "select", companyId: "e" });
  });
  it("option 3 transfers to an attendant when enabled", () => {
    expect(routeMessage({ stage: "menu" }, "3", companies, true)).toEqual({ kind: "describe-handoff" });
  });
  it("asking for an attendant inside a company transfers", () => {
    expect(routeMessage({ stage: "company", companyId: "a" }, "quero falar com um atendente", companies, true)).toEqual({ kind: "describe-handoff" });
  });
  it("questions inside a company go to the AI of that company", () => {
    expect(routeMessage({ stage: "company", companyId: "a" }, "qual o valor?", companies, true)).toEqual({ kind: "ai", companyId: "a" });
  });
  it("AI stays silent while a human is attending", () => {
    expect(routeMessage({ stage: "human" }, "oi", companies, true)).toEqual({ kind: "silent" });
  });
  it("0 returns to the menu", () => {
    expect(routeMessage({ stage: "company", companyId: "a" }, "0", companies, true)).toEqual({ kind: "menu" });
  });
});

describe("parseYCloudWebhook", () => {
  it("reads number and text", () => {
    const m = parseYCloudWebhook({ type: "whatsapp.inbound_message.received", whatsappInboundMessage: { id: "x", from: "+5511999990000", type: "text", text: { body: "Oi" } } });
    expect(m?.number).toBe("5511999990000");
    expect(m?.text).toBe("Oi");
  });
});
