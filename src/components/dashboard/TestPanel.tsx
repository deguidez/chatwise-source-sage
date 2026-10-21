import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { testAgent } from "@/lib/api.functions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function TestPanel() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;
    setInput("");
    const history = msgs.slice(-20);
    setMsgs([...msgs, { role: "user", content: message }]);
    setBusy(true);
    try {
      const { reply } = await testAgent({ data: { message, history } });
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
      <div className="flex h-[60vh] flex-col rounded-2xl border bg-muted">
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm shadow-sm", m.role === "user" ? "ml-auto bg-bubble-out" : "bg-bubble-in")}>
              {m.content}
            </div>
          ))}
          {busy && <div className="text-sm text-muted-foreground">digitando...</div>}
        </div>
        <form onSubmit={send} className="flex gap-2 border-t bg-card p-3">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite uma mensagem" />
          <Button type="submit" size="icon" disabled={busy}><Send className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
