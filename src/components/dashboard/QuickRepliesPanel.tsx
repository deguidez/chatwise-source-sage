import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteQuickReply, listQuickReplies, saveQuickReply } from "@/lib/api.functions";

export function QuickRepliesPanel() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["quick-replies"], queryFn: () => listQuickReplies() });
  const [editing, setEditing] = useState<string | undefined>();
  const [shortcut, setShortcut] = useState("");
  const [text, setText] = useState("");

  const reset = () => { setEditing(undefined); setShortcut(""); setText(""); };
  const save = async () => {
    try {
      await saveQuickReply({ data: { id: editing, shortcut, text } });
      toast.success("Resposta rápida salva");
      reset();
      qc.invalidateQueries({ queryKey: ["quick-replies"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Respostas rápidas</h1>
        <p className="text-muted-foreground">No atendimento, digite / e o atalho para usar. Use {"{{nome}}"} para colocar o nome do cliente.</p>
      </header>
      <div className="min-w-0 space-y-3 border-b pb-6">
        <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="Atalho, ex: bomdia" maxLength={40} />
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Olá {{nome}}! Tudo bem? Como posso ajudar?" rows={4} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={!shortcut.trim() || !text.trim()}>{editing ? "Salvar alteração" : "Adicionar"}</Button>
          {editing && <Button variant="ghost" onClick={reset}>Cancelar</Button>}
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-center text-sm text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>}
        {items.map((q) => (
          <div key={q.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border bg-card p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="break-all font-semibold">/{q.shortcut}</div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">{q.text}</p>
            </div>
            <div className="flex flex-col sm:flex-row">
            <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEditing(q.id); setShortcut(q.shortcut); setText(q.text); }}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Excluir" onClick={async () => {
              await deleteQuickReply({ data: { id: q.id } });
              qc.invalidateQueries({ queryKey: ["quick-replies"] });
            }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
