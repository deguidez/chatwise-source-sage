import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Headset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listConversations, loadSettings, returnChatToAI } from "@/lib/api.functions";
import { cn } from "@/lib/utils";

export function ConversationsPanel() {
  const qc = useQueryClient();
  const { data: chats = [] } = useQuery({ queryKey: ["chats"], queryFn: () => listConversations(), refetchInterval: 10000 });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const [sel, setSel] = useState<string | null>(null);
  const current = chats.find((c) => c.jid === sel) ?? chats[0];
  const companyName = (id: string) => settings?.companies.find((c) => c.id === id)?.name ?? "No menu";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Conversas</h1>
        <p className="text-muted-foreground">Atendimentos da IA, WhatsApp e Chatwoot.</p>
      </header>
      {chats.length === 0 ? (
        <p className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">Nenhuma conversa ainda.</p>
      ) : (
        <div className="grid h-[65vh] overflow-hidden rounded-2xl border bg-card md:grid-cols-[260px_1fr]">
          <div className="overflow-y-auto border-r">
            {chats.map((c) => (
              <button key={c.jid} onClick={() => setSel(c.jid)} className={cn("block w-full border-b px-4 py-3 text-left hover:bg-muted", current?.jid === c.jid && "bg-secondary")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.name || c.jid.split("@")[0]}</span>
                  {c.stage === "human" ? <Headset className="h-4 w-4 shrink-0 text-destructive" /> : <Bot className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{companyName(c.companyId)}</div>
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-col">
            {current && (
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
                <span>
                  {companyName(current.companyId)} · {current.closed ? "Encerrado" : current.stage === "human" ? `Com atendente · ${current.handoffProvider === "whatsapp" ? "WhatsApp" : "Chatwoot"}` : current.inactivityReminderAt ? "Aguardando resposta" : "Com a IA"}
                </span>
                {current.stage === "human" && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      await returnChatToAI({ data: { jid: current.jid } });
                      toast.success("Conversa devolvida para a IA");
                      qc.invalidateQueries({ queryKey: ["chats"] });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível devolver a conversa");
                    }
                  }}>
                    Devolver para a IA
                  </Button>
                )}
              </div>
            )}
            {current?.handoffNotificationError && <p role="alert" className="border-b bg-destructive/10 p-3 text-sm text-destructive">Falha no aviso ao atendente: {current.handoffNotificationError}</p>}
            <div className="flex-1 space-y-2 overflow-y-auto bg-muted p-4">
              {current?.messages.map((m, i) => (
                <div key={i} className={cn("max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm", m.role === "user" ? "bg-bubble-in" : "ml-auto bg-bubble-out", m.role === "agent" && "ring-2 ring-accent")}>
                  {m.role === "agent" && <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Atendente</div>}
                  {m.content}
                  <div className="mt-1 text-right text-[10px] text-muted-foreground">{new Date(m.at).toLocaleString("pt-BR")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
