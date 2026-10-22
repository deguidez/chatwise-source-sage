import { describe, expect, it } from "vitest";
import { metricsCsv, providerUsage, summarizeMetrics, type MetricEvent } from "@/lib/metrics-core";

describe("Consumo de API", () => {
  it("captura os tokens informados por Gemini, incluindo raciocínio no total", () => {
    expect(providerUsage("gemini", { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 140, cachedContentTokenCount: 15 } })).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 140, cachedTokens: 15 });
  });
  it("captura tokens reais OpenAI e Ollama sem estimar uso ausente", () => {
    expect(providerUsage("openai", { usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } }).totalTokens).toBe(12);
    expect(providerUsage("ollama", { prompt_eval_count: 10, eval_count: 2 }).totalTokens).toBe(12);
    expect(providerUsage("gemini", {}).totalTokens).toBeNull();
  });
  it("fallback soma tentativas e tokens sem duplicar a requisição lógica", () => {
    const base = { at: "2026-10-22T22:00:00Z", type: "ai" as const, requestId: "same" };
    const summary = summarizeMetrics([{ ...base, id: "1", status: "error" }, { ...base, id: "2", status: "ok", inputTokens: 8, outputTokens: 4, totalTokens: 12 }]);
    expect(summary).toMatchObject({ aiRequests: 1, aiAttempts: 2, aiErrors: 1, totalTokens: 12, unknownUsage: 1 });
  });
});

it("contabiliza mensagens e atendimentos separadamente", () => {
  const events = ["started", "received", "sent", "sent", "send_failed", "resolved"].map((type, i) => ({ id: String(i), at: "2026-10-22T22:00:00Z", type } as MetricEvent));
  expect(summarizeMetrics(events)).toMatchObject({ started: 1, resolved: 1, received: 1, sent: 2, failed: 1 });
});

it("CSV exporta tokens e protege contra fórmulas", () => {
  const csv = metricsCsv([{ id: "1", at: "2026-10-22T22:00:00Z", type: "ai", model: '=HYPERLINK("bad")', totalTokens: 123 }]);
  expect(csv).toContain('"123"');
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
});