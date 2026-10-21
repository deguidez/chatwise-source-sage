import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listConversations } from "@/lib/api.functions";
import { cn } from "@/lib/utils";

export function ConversationsPanel() {
  const { data: chats = [] } = useQuery({
    queryKey: ["chats"],
    queryFn: () => listConversations(),
    refetchInterval: 10000,
  });
  const [sel, setSel] = useState<string | null>(null);
  const current = chats.find((c) => c.jid === sel) ?? chats[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Conversas</h1>
        <p className="text-muted-foreground">Mensagens respondidas pelo agente no WhatsApp.</p>
      </header>
      {chats.length === 0 ? (
        <p className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">Nenhuma conversa ainda.</p>
      ) : (
        <div className="grid h-[65vh] overflow-hidden rounded-2xl border bg-card md:grid-cols-[240px_1fr]">
          <div className="overflow-y-auto border-r">
            {chats.map((c) => (
              <button key={c.jid} onClick={() => setSel(c.jid)} className={cn("block w-full border-b px-4 py-3 text-left hover:bg-muted", current?.jid === c.jid && "bg-secondary")}>
                <div className="truncate font-medium">{c.name || c.jid.split("@")[0]}</div>
                <div className="truncate text-xs text-muted-foreground">{c.messages.at(-1)?.content}</div>
              </button>
            ))}
          </div>
          <div className="space-y-2 overflow-y-auto bg-muted p-4">
            {current?.messages.map((m, i) => (
              <div key={i} className={cn("max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm", m.role === "user" ? "bg-bubble-in" : "ml-auto bg-bubble-out")}>
                {m.content}
                <div className="mt-1 text-right text-[10px] text-muted-foreground">{new Date(m.at).toLocaleString("pt-BR")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
