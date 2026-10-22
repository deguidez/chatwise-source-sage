export type MetricEvent = {
  id: string;
  at: string;
  type: "received" | "sent" | "send_failed" | "started" | "resolved" | "handoff" | "assumed" | "returned" | "ai";
  companyId?: string | undefined;
  actor?: string | undefined;
  channel?: string | undefined;
  source?: string | undefined;
  provider?: string | undefined;
  model?: string | undefined;
  requestId?: string | undefined;
  status?: "ok" | "error" | undefined;
  inputTokens?: number | null | undefined;
  outputTokens?: number | null | undefined;
  totalTokens?: number | null | undefined;
  cachedTokens?: number | null | undefined;
  durationMs?: number | undefined;
  mediaKind?: string | undefined;
};

export function providerUsage(provider: string, body: any) {
  const n = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
  const input = n(provider === "gemini" ? body?.usageMetadata?.promptTokenCount : provider === "ollama" ? body?.prompt_eval_count : body?.usage?.prompt_tokens);
  const output = n(provider === "gemini" ? body?.usageMetadata?.candidatesTokenCount : provider === "ollama" ? body?.eval_count : body?.usage?.completion_tokens);
  const reported = n(provider === "gemini" ? body?.usageMetadata?.totalTokenCount : provider === "openai" ? body?.usage?.total_tokens : null);
  return { inputTokens: input, outputTokens: output, totalTokens: reported ?? (input !== null && output !== null ? input + output : null), cachedTokens: n(provider === "gemini" ? body?.usageMetadata?.cachedContentTokenCount : provider === "openai" ? body?.usage?.prompt_tokens_details?.cached_tokens : null) };
}

export const metricDay = (at: string) => new Date(at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function summarizeMetrics(events: MetricEvent[]) {
  const count = (type: MetricEvent["type"]) => events.filter((e) => e.type === type).length;
  const ai = events.filter((e) => e.type === "ai");
  return {
    started: count("started"), resolved: count("resolved"), received: count("received"), sent: count("sent"), failed: count("send_failed"), handoffs: count("handoff"), assumed: count("assumed"),
    aiRequests: new Set(ai.map((e) => e.requestId || e.id)).size,
    aiAttempts: ai.length, aiErrors: ai.filter((e) => e.status === "error").length,
    unknownUsage: ai.filter((e) => e.totalTokens == null).length,
    inputTokens: ai.reduce((n, e) => n + (e.inputTokens ?? 0), 0),
    outputTokens: ai.reduce((n, e) => n + (e.outputTokens ?? 0), 0),
    totalTokens: ai.reduce((n, e) => n + (e.totalTokens ?? 0), 0),
    cachedTokens: ai.reduce((n, e) => n + (e.cachedTokens ?? 0), 0),
    averageMs: ai.length ? Math.round(ai.reduce((n, e) => n + (e.durationMs ?? 0), 0) / ai.length) : 0,
    attachments: events.filter((e) => e.type === "sent" && e.mediaKind && e.mediaKind !== "text").length,
  };
}

export function metricsCsv(events: MetricEvent[]) {
  const headers: (keyof MetricEvent)[] = ["id", "at", "type", "companyId", "actor", "channel", "source", "provider", "model", "requestId", "status", "inputTokens", "outputTokens", "totalTokens", "cachedTokens", "durationMs", "mediaKind"];
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[\s]*[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [headers.map(cell).join(";"), ...events.map((e) => headers.map((key) => cell(e[key])).join(";"))].join("\r\n");
}