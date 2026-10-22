import { recordMetric, getConversations } from "./store.server";
import { providerUsage, type MetricEvent } from "./metrics-core";

export async function captureMetric(event: Omit<MetricEvent, "id" | "at">) {
  // Metrics must never cause a successfully delivered WhatsApp message to be retried.
  await recordMetric(event).catch(() => console.error("Falha ao gravar métrica de atendimento"));
}

export type AIContext = { companyId?: string | undefined; source: "test" | "whatsapp"; requestId: string };

export async function aiFetch(url: string, init: RequestInit, provider: string, model: string, context: AIContext) {
  const start = Date.now();
  try {
    const res = await fetch(url, init);
    const json = await res.clone().json().catch(() => null);
    await captureMetric({ type: "ai", ...context, provider, model, status: res.ok ? "ok" : "error", durationMs: Date.now() - start, ...providerUsage(provider, json) });
    return res;
  } catch (e) {
    await captureMetric({ type: "ai", ...context, provider, model, status: "error", durationMs: Date.now() - start, ...providerUsage(provider, null) });
    throw e;
  }
}

export async function whatsAppFetch(url: string, init: RequestInit, channel: string, number: string, source: string, mediaKind = "text") {
  const chat = Object.values((await getConversations()).chats).find((c) => c.number === number);
  const context = { channel, source, mediaKind, companyId: chat?.companyId, actor: source === "attendant" ? chat?.handledBy : undefined };
  try {
    const res = await fetch(url, init);
    await captureMetric({ ...context, type: res.ok ? "sent" : "send_failed" });
    return res;
  } catch (e) {
    await captureMetric({ ...context, type: "send_failed" });
    throw e;
  }
}