import { describe, expect, it } from "vitest";
import { isInactivityDue, wantsToCancel, type InactivityState } from "@/lib/agent-core";

const time = Date.parse("2026-10-22T16:00:00Z");
const waiting: InactivityState = {
  stage: "company",
  messages: [{ role: "assistant", at: new Date(time).toISOString() }],
};

describe("inactivity rules", () => {
  it("waits two full minutes before reminding", () => {
    expect(isInactivityDue(waiting, time + 119999)).toBe(false);
    expect(isInactivityDue(waiting, time + 120000)).toBe(true);
  });
  it("does not repeat a reminder while the customer is silent", () => {
    expect(isInactivityDue({ ...waiting, inactivityReminderAt: new Date(time + 120000).toISOString() }, time + 600000)).toBe(false);
  });
  it("never reminds during human attendance", () => {
    expect(isInactivityDue({ ...waiting, stage: "human" }, time + 600000)).toBe(false);
  });
  it("never reminds a closed conversation", () => {
    expect(isInactivityDue({ ...waiting, closed: true }, time + 600000)).toBe(false);
  });
  it("waits for the agent reply before counting silence", () => {
    expect(isInactivityDue({ ...waiting, messages: [{ role: "user", at: new Date(time).toISOString() }] }, time + 600000)).toBe(false);
  });
  it("recognizes cancellation without mistaking a business question for cancellation", () => {
    expect(wantsToCancel("cancelar")).toBe(true);
    expect(wantsToCancel("não tenho mais dúvidas")).toBe(true);
    expect(wantsToCancel("como cancelar minha inscrição?")).toBe(false);
    expect(wantsToCancel("não quero cancelar")).toBe(false);
  });
});