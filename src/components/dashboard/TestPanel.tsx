import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { loadSettings, testAgent } from "@/lib/api.functions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function TestPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const companies = settings?.companies ?? [];
  const [companyId, setCompanyId] = useState("");

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = input.trim();
    if (!message) return;
    setInput("");
    const history = msgs.slice(-20);
    setMsgs([...msgs, { role: "user", content: message }]);
    setBusy(true);
    try {
      const { reply: raw } = await testAgent({ data: { message, history, companyId: companyId || companies[0]?.id || "" } });
      const reply = raw.includes("[TRANSFERIR]") ? `➡️ Aqui a conversa seria transferida para um atendente ${settings?.handoffProvider === "whatsapp" ? "no mesmo WhatsApp" : settings?.handoffProvider === "other" ? "em outro número de WhatsApp" : "no Chatwoot"}.` : raw;
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Testar agente</h1>
        <p className="text-muted-foreground">Converse como se fosse um cliente. Nada é enviado ao WhatsApp.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {companies.map((c) => (
          <Button variant="outline" key={c.id} aria-pressed={(companyId || companies[0]?.id) === c.id} onClick={() => { setCompanyId(c.id); setMsgs([]); }} className={`h-auto min-h-11 max-w-full whitespace-normal break-words border px-3 py-2 text-sm transition-colors ${(companyId || companies[0]?.id) === c.id ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "hover:bg-muted"}`}>
            {c.name}
          </Button>
        ))}
      </div>
      <div className="flex h-[60dvh] min-h-64 min-w-0 flex-col overflow-hidden rounded-lg border bg-muted">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm [overflow-wrap:anywhere] sm:max-w-[80%]", m.role === "user" ? "ml-auto bg-bubble-out" : "bg-bubble-in")}>
              {m.content}
            </div>
          ))}
          {busy && <div className="text-sm text-muted-foreground">digitando...</div>}
        </div>
        <form onSubmit={send} className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border-t bg-card p-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Digite uma mensagem"
          />
          <Button type="submit" size="icon" aria-label="Enviar mensagem de teste" disabled={busy}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
