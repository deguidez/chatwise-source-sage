import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, FileText, Headset, Mic, Paperclip, Pencil, RotateCcw, Search, Send, Smile, Square, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  assumeConversation,
  listConversations,
  listQuickReplies,
  loadMedia,
  loadSettings,
  renameConversation,
  reopenConversation,
  resolveConversation,
  returnChatToAI,
  sendAgentMessage,
} from "@/lib/api.functions";
import { fillQuickReply, queueTab, type QueueTab } from "@/lib/agent-core";
import { cn } from "@/lib/utils";

type Chat = Awaited<ReturnType<typeof listConversations>>[number];
type Media = NonNullable<Chat["messages"][number]["media"]>;

const TABS: { id: QueueTab; label: string }[] = [
  { id: "queue", label: "Fila" },
  { id: "open", label: "Atendendo" },
  { id: "ai", label: "Com a IA" },
  { id: "resolved", label: "Finalizados" },
];

const EMOJIS = "😀 😁 😂 🤣 😊 😍 😘 😉 😎 🤩 🥳 😅 😇 🙂 🤔 😴 😢 😭 😡 🙏 👍 👎 👏 🙌 💪 👋 🤝 ✌️ 👌 ❤️ 💚 💙 💛 🔥 ⭐ ✨ 🎉 🏃 🏃‍♀️ 🚴 🏊 🏅 🏆 ⚽ 📅 📍 ⏰ ✅ ❌ ⚠️ 📞 💬 📷 🎥 📄 💰 🎁 🚀".split(" ");

const fmtTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};
const displayName = (c: Chat) => c.name || `+${c.number || c.jid.split("@")[0]}`;
const preview = (c: Chat) => {
  const m = c.messages.at(-1);
  if (!m) return "";
  const media = m.media ? { image: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", document: "📄 Arquivo", sticker: "Figurinha" }[m.media.kind] : "";
  const text = m.content.replace(/[*_~`]/g, "").replace(/\s+/g, " ").trim();
  return [media, text].filter(Boolean).join(" ");
};

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
const kindOf = (mime: string): Media["kind"] =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";

function MediaView({ media }: { media: Media }) {
  const { data, isError } = useQuery({ queryKey: ["media", media.id], queryFn: () => loadMedia({ data: { id: media.id } }), staleTime: Infinity });
  if (isError) return <p className="text-xs text-destructive">Arquivo indisponível</p>;
  if (!data) return <div className="h-24 w-40 animate-pulse rounded-lg bg-muted" />;
  const src = `data:${data.mimetype};base64,${data.data}`;
  if (media.kind === "image" || media.kind === "sticker") return <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Foto" className="max-h-72 max-w-full rounded-lg" /></a>;
  if (media.kind === "video") return <video src={src} controls className="max-h-72 max-w-full rounded-lg" />;
  if (media.kind === "audio") return <audio src={src} controls className="max-w-full" />;
  return (
    <a href={src} download={media.fileName || "arquivo"} className="flex min-w-0 items-center gap-2 rounded-lg bg-background/60 p-2 text-sm underline">
      <FileText className="h-5 w-5 shrink-0" /> <span className="min-w-0 break-all">{media.fileName || "Baixar arquivo"}</span>
    </a>
  );
}

export function ConversationsPanel() {
  const qc = useQueryClient();
  const { data: chats = [] } = useQuery({ queryKey: ["chats"], queryFn: () => listConversations(), refetchInterval: 4000 });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const { data: quick = [] } = useQuery({ queryKey: ["quick-replies"], queryFn: () => listQuickReplies() });
  const [tab, setTab] = useState<QueueTab>("queue");
  const [company, setCompany] = useState("all");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const companyName = (id: string) => settings?.companies.find((c) => c.id === id)?.name ?? "Sem empresa";
  const counts = useMemo(() => {
    const r: Record<QueueTab, number> = { ai: 0, queue: 0, open: 0, resolved: 0 };
    chats.forEach((c) => { if (company === "all" || c.companyId === company) r[queueTab(c)]++; });
    return r;
  }, [chats, company]);
  const filtered = chats.filter((c) => {
    if (company !== "all" && c.companyId !== company) return false;
    const q = search.trim().toLowerCase();
    if (q) return displayName(c).toLowerCase().includes(q) || c.number.includes(q.replace(/\D/g, "") || "§") || c.messages.some((m) => m.content.toLowerCase().includes(q));
    return queueTab(c) === tab;
  });
  const current = chats.find((c) => c.jid === sel);
  const currentTab = current ? queueTab(current) : null;

  useEffect(() => {
    if (messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [current?.jid, current?.messages.length]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["chats"] });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Algo deu errado"); }
  };

  const send = async (override?: { blob: Blob; mimetype: string; kind: Media["kind"]; fileName?: string }) => {
    if (!current) return;
    const att = override ?? (file ? { blob: file, mimetype: file.type || "application/octet-stream", kind: kindOf(file.type), fileName: file.name } : null);
    if (!att && !text.trim()) return;
    if (att && att.blob.size > 16 * 1024 * 1024) { toast.error("Arquivo maior que 16 MB"); return; }
    setSending(true);
    try {
      const media = att ? { kind: att.kind, mimetype: att.mimetype, fileName: att.fileName, data: await fileToBase64(att.blob) } : undefined;
      await sendAgentMessage({ data: { jid: current.jid, text: override ? "" : text.trim(), media } });
      if (!override) { setText(""); setFile(null); }
      if (currentTab !== "open") setTab("open");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar");
    } finally {
      setSending(false);
    }
  };

  const toggleRecord = async () => {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mimetype = (rec.mimeType || "audio/webm").split(";")[0] ?? "audio/webm";
        const blob = new Blob(parts, { type: mimetype });
        if (blob.size > 0) void send({ blob, mimetype, kind: "audio" });
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast.error("Permita o uso do microfone para gravar áudio");
    }
  };

  const slash = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const suggestions = slash !== null ? quick.filter((q) => q.shortcut.includes(slash) || q.text.toLowerCase().includes(slash)).slice(0, 6) : [];
  const useQuick = (t: string) => setText(fillQuickReply(t, current?.name ?? ""));

  return (
    <div className="attendance-shell flex min-h-0 min-w-0 overflow-hidden bg-card lg:rounded-lg lg:border">
      {/* Lista */}
      <div className={cn("flex min-h-0 w-full shrink-0 flex-col sm:w-72 lg:w-80", current ? "hidden sm:flex sm:border-r" : "sm:border-r")}>
        <div className="shrink-0 space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar nome, número ou mensagem" className="pl-8" />
          </div>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-11 w-full min-w-0 rounded-md border bg-background px-2 text-sm sm:h-9" aria-label="Filtrar por empresa">
            <option value="all">Todas as empresas</option>
            {settings?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!search && (
            <div className="grid grid-cols-4 gap-1">
              {TABS.map((t) => (
                <Button key={t.id} variant="ghost" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className={cn("h-12 min-w-0 flex-col gap-0 px-0.5 py-1.5 text-[11px] font-medium", tab === t.id ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "bg-muted hover:bg-secondary")}>
                  {t.label}
                  <span className="block text-[10px] opacity-80">{counts[t.id]}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa aqui.</p>}
          {filtered.map((c) => (
            <button type="button" key={c.jid} onClick={() => setSel(c.jid)} className={cn("grid w-full grid-cols-[40px_minmax(0,1fr)] items-start gap-3 border-b px-3 py-3 text-left hover:bg-muted", sel === c.jid && "bg-secondary")}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary">{displayName(c).replace("+", "").slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <span className="truncate font-medium">{displayName(c)}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.messages.at(-1)?.at)}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{preview(c)}</div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  {c.stage === "human" ? <Headset className="h-3 w-3 text-destructive" /> : <Bot className="h-3 w-3 text-primary" />}
                  <span className="min-w-0 truncate">{companyName(c.companyId)}</span>
                  {c.handledBy && <span className="max-w-full truncate rounded-full bg-secondary px-1.5 py-0.5 text-secondary-foreground">👤 {c.handledByName || c.handledBy}</span>}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>

      {/* Conversa */}
      {!current ? (
        <div className="hidden min-w-0 flex-1 items-center justify-center p-4 text-center text-muted-foreground sm:flex">Escolha uma conversa</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2 border-b px-3 py-2">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-1">
            <Button size="icon" variant="ghost" className="sm:hidden" onClick={() => setSel(null)} aria-label="Voltar às conversas"><ArrowLeft className="h-5 w-5" /></Button>
            <div className="min-w-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center font-semibold">
                <span className="truncate">{displayName(current)}</span>
                <Button size="icon" variant="ghost" aria-label="Editar nome" className="text-muted-foreground hover:text-foreground" onClick={() => {
                  const name = window.prompt("Nome do cliente", current.name);
                  if (name?.trim()) void run(() => renameConversation({ data: { jid: current.jid, name: name.trim() } }), "Nome atualizado");
                }}><Pencil className="h-3.5 w-3.5" /></Button>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                +{current.number} · {companyName(current.companyId)} · {TABS.find((t) => t.id === currentTab)?.label}
              </div>
              {current.handledBy && <p className="truncate text-xs font-medium text-foreground">Atendido por {current.handledByName || current.handledBy}</p>}
            </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            {(currentTab === "queue" || currentTab === "ai") && <Button size="sm" onClick={() => run(() => assumeConversation({ data: { jid: current.jid } }), "Você assumiu o atendimento").then(() => setTab("open"))}><Headset className="mr-1 h-4 w-4" />Atender</Button>}
            {(currentTab === "queue" || currentTab === "open") && (
              <>
                <Button size="sm" variant="outline" onClick={() => run(() => returnChatToAI({ data: { jid: current.jid } }), "Conversa devolvida para a IA")}><Bot className="mr-1 h-4 w-4" />IA</Button>
                <Button size="sm" variant="secondary" onClick={() => run(() => resolveConversation({ data: { jid: current.jid, notify: true } }), "Conversa finalizada").then(() => setTab("resolved"))}><CheckCircle2 className="mr-1 h-4 w-4" />Resolver</Button>
              </>
            )}
            {currentTab === "resolved" && <Button size="sm" onClick={() => run(() => reopenConversation({ data: { jid: current.jid } }), "Conversa reaberta").then(() => setTab("open"))}><RotateCcw className="mr-1 h-4 w-4" />Reabrir</Button>}
            </div>
          </div>
          {current.handoffNotificationError && <p role="alert" className="max-h-24 shrink-0 overflow-y-auto break-all border-b bg-destructive/10 p-2 text-xs text-destructive">Falha no aviso ao atendente: {current.handoffNotificationError}</p>}

          <div ref={messages} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted p-3 sm:p-4">
            {current.messages.map((m, i) => (
              <div key={i} className={cn("max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm [overflow-wrap:anywhere] sm:max-w-[85%] lg:max-w-[80%]", m.role === "user" ? "bg-bubble-in" : "ml-auto bg-bubble-out", m.role === "agent" && "ring-2 ring-accent")}>
                <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{m.role === "agent" ? "Atendente" : m.role === "assistant" ? "IA" : displayName(current)}</div>
                {m.media && <div className="mb-1"><MediaView media={m.media} /></div>}
                {m.content}
                <div className="mt-1 text-right text-[10px] text-muted-foreground">{new Date(m.at).toLocaleString("pt-BR")}</div>
              </div>
            ))}
            <div ref={bottom} />
          </div>

          {/* Composer */}
          <div className="chat-composer relative shrink-0 border-t p-2">
            {suggestions.length > 0 && (
              <div className="absolute bottom-full left-2 right-2 mb-1 max-h-60 overflow-y-auto rounded-lg border bg-popover shadow-lg">
                {suggestions.map((q) => (
                  <Button variant="ghost" key={q.id} onClick={() => useQuick(q.text)} className="block h-auto min-h-11 w-full whitespace-normal break-words border-b px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="font-semibold">/{q.shortcut}</span> <span className="text-muted-foreground">{q.text.slice(0, 80)}</span>
                  </Button>
                ))}
              </div>
            )}
            {file && (
              <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm">
                <Paperclip className="h-4 w-4 shrink-0" /> <span className="min-w-0 truncate">{file.name}</span>
                <Button size="icon" variant="ghost" aria-label="Remover anexo" onClick={() => setFile(null)}><X className="h-4 w-4" /></Button>
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:gap-1">
              <div className="col-span-2 row-start-2 flex items-center gap-1 sm:contents">
              <Popover>
                <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Emojis"><Smile className="h-5 w-5" /></Button></PopoverTrigger>
                <PopoverContent align="start" className="grid w-[min(320px,calc(100vw-24px))] grid-cols-7 gap-0.5 p-2">
                  {EMOJIS.map((e) => <Button variant="ghost" key={e} aria-label={e} className="h-10 min-w-0 px-0 text-xl" onClick={() => setText((t) => t + e)}>{e}</Button>)}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild><Button size="icon" variant="ghost" aria-label="Respostas rápidas"><Zap className="h-5 w-5" /></Button></PopoverTrigger>
                <PopoverContent align="start" className="max-h-72 w-[min(320px,calc(100vw-24px))] overflow-y-auto p-1">
                  {quick.length === 0 && <p className="p-3 text-sm text-muted-foreground">Cadastre respostas rápidas na aba "Respostas rápidas".</p>}
                  {quick.map((q) => (
                    <Button variant="ghost" key={q.id} onClick={() => useQuick(q.text)} className="block h-auto min-h-11 w-full whitespace-normal rounded px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="font-semibold">/{q.shortcut}</span>
                      <span className="block truncate text-muted-foreground">{q.text}</span>
                    </Button>
                  ))}
                </PopoverContent>
              </Popover>
              <Button size="icon" variant="ghost" aria-label="Anexar arquivo" onClick={() => fileInput.current?.click()}><Paperclip className="h-5 w-5" /></Button>
              <input ref={fileInput} type="file" className="hidden" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </div>
              <textarea
                aria-label="Mensagem"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (suggestions[0] && slash !== null) useQuick(suggestions[0].text);
                    else void send();
                  }
                }}
                rows={1}
                placeholder={recording ? "Gravando áudio…" : "Digite uma mensagem ou / para respostas rápidas"}
                className="row-start-1 max-h-32 min-h-11 w-full min-w-0 resize-none rounded-lg border bg-background px-3 py-2 text-base sm:min-h-10 sm:flex-1 sm:text-sm"
              />
              {text.trim() || file ? (
                <Button size="icon" onClick={() => send()} disabled={sending} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
              ) : (
                <Button size="icon" variant={recording ? "destructive" : "default"} onClick={toggleRecord} disabled={sending} aria-label={recording ? "Parar e enviar áudio" : "Gravar áudio"}>
                  {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
