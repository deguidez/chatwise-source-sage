import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownToLine, Bot, CheckCircle2, Headset, MessageSquare, RefreshCw, Send, Coins } from "lucide-react";
import { loadMetrics } from "@/lib/api.functions";
import { metricDay, metricsCsv, summarizeMetrics, type MetricEvent } from "@/lib/metrics-core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const number = (value: number) => value.toLocaleString("pt-BR");
const dateBefore = (days: number) => metricDay(new Date(Date.now() - days * 86400000).toISOString());
const EVENT_NAMES: Record<MetricEvent["type"], string> = { received: "Recebida", sent: "Enviada", send_failed: "Falha no envio", started: "Atendimento iniciado", resolved: "Finalizado", handoff: "Transferido", assumed: "Assumido", returned: "Devolvido à IA", ai: "Requisição de IA" };

export function MetricsPanel() {
  const [from, setFrom] = useState(() => dateBefore(29));
  const [to, setTo] = useState(() => dateBefore(0));
  const [company, setCompany] = useState("all");
  const [source, setSource] = useState("all");
  const [provider, setProvider] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [page, setPage] = useState(0);
  const valid = !!from && !!to && from <= to;
  const { data, isPending, isFetching, error, refetch } = useQuery({ queryKey: ["metrics", from, to], queryFn: () => loadMetrics({ data: { from, to } }), enabled: valid, refetchInterval: 30000 });
  const events = useMemo(() => (data?.events ?? []).filter((e) => (company === "all" || (e.companyId || "") === company) && (source === "all" || e.source === source) && (provider === "all" || e.provider === provider)), [data, company, source, provider]);
  const totals = summarizeMetrics(events);
  const active = (data?.active ?? []).filter((c) => company === "all" || c.companyId === company);
  const currentCount = (status: string) => active.filter((c) => c.status === status).length;
  const days = [...new Set(events.map((e) => metricDay(e.at)))].sort();
  const daily = days.map((day) => ({ day, ...summarizeMetrics(events.filter((e) => metricDay(e.at) === day)) }));
  const peak = Math.max(1, ...daily.map((d) => d.received + d.sent));
  const modelKeys = [...new Set(events.filter((e) => e.type === "ai").map((e) => `${e.provider}|${e.model}`))];
  const models = modelKeys.map((key) => {
    const [name, model] = key.split("|");
    return { name, model, ...summarizeMetrics(events.filter((e) => `${e.provider}|${e.model}` === key)) };
  });
  const rows = [...events].filter((e) => eventType === "all" || e.type === eventType).sort((a, b) => b.at.localeCompare(a.at));
  const safePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 20) - 1));
  const companyName = (id?: string) => data?.companies.find((c) => c.id === id)?.name || "Sem empresa";
  const userName = (id?: string) => data?.users.find((u) => u.username === id)?.name || id || "—";
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([metricsCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-${from}-${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const cards = [
    { label: "Atendimentos iniciados", value: totals.started, icon: Headset },
    { label: "Atendimentos finalizados", value: totals.resolved, icon: CheckCircle2 },
    { label: "Mensagens recebidas", value: totals.received, icon: MessageSquare },
    { label: "Mensagens enviadas", value: totals.sent, icon: Send },
    { label: "Requisições de IA", value: totals.aiRequests, icon: Bot },
    { label: "Tokens informados", value: totals.totalTokens, icon: Coins },
  ];

  return (
    <div className="min-w-0 space-y-7">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0"><p className="mb-1 text-xs font-semibold uppercase text-primary">Super admin</p><h1 className="text-3xl font-bold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Atendimento e consumo de IA</p></div>
        <Button variant="outline" size="icon" aria-label="Atualizar números" title="Atualizar números" disabled={isFetching} onClick={() => refetch()}><RefreshCw className={isFetching ? "animate-spin" : ""} /></Button>
      </header>
      <div className="grid min-w-0 gap-3 border-b pb-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 space-y-1.5"><Label htmlFor="metrics-from">De</Label><Input id="metrics-from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(0); }} /></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="metrics-to">Até</Label><Input id="metrics-to" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(0); }} /></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="metrics-company">Empresa</Label><select id="metrics-company" className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={company} onChange={(e) => { setCompany(e.target.value); setPage(0); }}><option value="all">Todas as empresas</option><option value="">Sem empresa</option>{data?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="metrics-source">Origem</Label><select id="metrics-source" className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={source} onChange={(e) => { setSource(e.target.value); setPage(0); }}><option value="all">Todas</option><option value="customer">Cliente</option><option value="ai">Mensagens da IA</option><option value="attendant">Atendente</option><option value="system">Sistema</option><option value="notification">Avisos ao atendente</option><option value="whatsapp">IA no WhatsApp</option><option value="test">Testes de IA</option></select></div>
        <div className="min-w-0 space-y-1.5"><Label htmlFor="metrics-provider">Provedor de IA</Label><select id="metrics-provider" className="h-11 w-full rounded-md border bg-card px-3 text-sm" value={provider} onChange={(e) => { setProvider(e.target.value); setPage(0); }}><option value="all">Todos</option><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="ollama">Ollama</option></select></div>
        <div className="flex items-end"><Button variant="outline" className="w-full" aria-label="Exportar CSV" disabled={!data || !valid} onClick={exportCsv}><ArrowDownToLine /> Exportar CSV</Button></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error instanceof Error ? error.message : "Não foi possível carregar os números"}</p>}
      {!valid && <p role="alert" className="text-sm text-destructive">Escolha um período válido.</p>}
      {isPending && valid ? <p className="text-sm text-muted-foreground">Carregando números…</p> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {cards.map((c) => <div key={c.label} className="min-w-0 rounded-lg border bg-card p-4"><c.icon className="mb-3 h-5 w-5 text-primary" /><p className="text-2xl font-bold tabular-nums [overflow-wrap:anywhere]">{number(c.value)}</p><p className="mt-1 text-xs text-muted-foreground">{c.label}</p></div>)}
        </div>
        <section className="space-y-3 border-b pb-5"><h2 className="text-lg font-semibold">Fila agora</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: "Aguardando", value: currentCount("queue") }, { label: "Atendendo", value: currentCount("open") }, { label: "Com a IA", value: currentCount("ai") }, { label: "Finalizados", value: currentCount("resolved") }].map((c) => <div key={c.label} className="min-w-0 border-l-2 border-primary pl-3"><p className="text-xl font-semibold tabular-nums">{number(c.value)}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>)}</div></section>
        <section className="space-y-4 border-b pb-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5" /> Mensagens por dia</h2>
          <div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-2 w-2 bg-primary" /> Recebidas</span><span className="flex items-center gap-1"><span className="h-2 w-2 bg-accent" /> Enviadas</span></div>
          {daily.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum registro neste período.</p> : <div className="max-h-72 space-y-3 overflow-y-auto pr-1">{daily.map((d) => <div key={d.day} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 text-xs"><span>{d.day.slice(8)}/{d.day.slice(5, 7)}</span><div className="flex h-5 min-w-0 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-primary" style={{ width: `${d.received / peak * 100}%` }} /><div className="h-full bg-accent" style={{ width: `${d.sent / peak * 100}%` }} /></div><span className="tabular-nums">{number(d.received + d.sent)}</span></div>)}</div>}
        </section>
        <section className="space-y-4 border-b pb-5"><h2 className="text-lg font-semibold">Consumo por modelo</h2>
          <div className="grid gap-3 sm:grid-cols-3">{[{ label: "Tokens de entrada", value: totals.inputTokens }, { label: "Tokens de saída", value: totals.outputTokens }, { label: "Tokens em cache", value: totals.cachedTokens }].map((c) => <div key={c.label}><p className="text-xl font-semibold tabular-nums">{number(c.value)}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>)}</div>
          <p className="text-xs text-muted-foreground">Contagem iniciada com este painel. O histórico anterior não inclui consumo de tokens. Valores informados pelos provedores, sem estimativa de cobrança. {number(totals.unknownUsage)} tentativa(s) sem consumo informado.</p>
          {models.map((m) => <div key={`${m.name}-${m.model}`} className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="break-words font-medium">{m.model}</p><p className="text-xs uppercase text-muted-foreground">{m.name}</p></div><div className="text-sm"><p className="font-semibold">{number(m.totalTokens)} tokens</p><p className="text-xs text-muted-foreground">{number(m.aiAttempts)} tentativas · {number(m.aiErrors)} falhas · {(m.averageMs / 1000).toFixed(1)}s</p></div></div>)}
        </section>
        <section className="space-y-4 border-b pb-5"><h2 className="text-lg font-semibold">Operação</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[{ label: "Transferências", value: totals.handoffs }, { label: "Falhas de envio", value: totals.failed }, { label: "Anexos enviados", value: totals.attachments }, { label: "Falhas de IA", value: totals.aiErrors }].map((c) => <div key={c.label}><p className="text-xl font-semibold">{number(c.value)}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>)}</div></section>
        <section className="space-y-3 border-b pb-5"><h2 className="text-lg font-semibold">Por atendente</h2>{data?.users.map((u) => { const summary = summarizeMetrics(events.filter((e) => e.actor === u.username)); return <div key={u.username} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b py-3 text-sm"><span className="min-w-0 break-words font-medium">{u.name}</span><span className="text-right text-xs text-muted-foreground">{number(summary.assumed)} assumidos<br />{number(summary.sent)} mensagens · {number(summary.resolved)} finalizados</span></div>; })}</section>
        <section className="space-y-3"><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><h2 className="text-lg font-semibold">Registros ({number(rows.length)})</h2><select aria-label="Tipo de registro" className="h-11 min-w-0 rounded-md border bg-card px-3 text-sm" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(0); }}><option value="all">Todos os registros</option>{Object.entries(EVENT_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></div>
          {rows.slice(safePage * 20, safePage * 20 + 20).map((e) => <div key={e.id} className="grid min-w-0 gap-1 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="text-sm font-medium">{EVENT_NAMES[e.type]} {e.status === "error" && <span className="text-destructive">· Falha</span>}</p><p className="break-words text-xs text-muted-foreground">{companyName(e.companyId)} · {userName(e.actor)}{e.model ? ` · ${e.model}` : ""}{e.mediaKind ? ` · ${e.mediaKind}` : ""}</p></div><div className="text-xs text-muted-foreground sm:text-right"><p>{new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>{e.type === "ai" && <p>{e.totalTokens == null ? "Consumo não informado" : `${number(e.totalTokens)} tokens`}</p>}</div></div>)}
          <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</Button><span className="text-xs">{safePage + 1} / {Math.max(1, Math.ceil(rows.length / 20))}</span><Button variant="outline" disabled={(safePage + 1) * 20 >= rows.length} onClick={() => setPage(safePage + 1)}>Próxima</Button></div>
        </section>
      </>}
    </div>
  );
}