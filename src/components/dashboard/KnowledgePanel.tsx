import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, Globe, Trash2, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addPdf, addText, addUrl, deleteKnowledge, listKnowledge, loadSettings } from "@/lib/api.functions";

const icons = { text: Type, file: FileText, pdf: FileText, url: Globe };

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function KnowledgePanel() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({ queryKey: ["knowledge"], queryFn: () => listKnowledge() });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const companies = settings?.companies ?? [];
  const [companyId, setCompanyId] = useState("");
  const [filter, setFilter] = useState("all");
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "Todas as empresas";
  const shown = items.filter((i) => filter === "all" || i.companyId === filter);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      qc.invalidateQueries({ queryKey: ["knowledge"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: máximo 20 MB`);
        continue;
      }
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const base64 = await toBase64(file);
        await run(() => addPdf({ data: { name: file.name, base64, companyId } }), `${file.name} adicionado`);
      } else {
        const content = await file.text();
        await run(() => addText({ data: { title: file.name, content, type: "file", companyId } }), `${file.name} adicionado`);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Base de conhecimento</h1>
        <p className="text-muted-foreground">Tudo que o agente pode usar para responder seus clientes.</p>
      </header>

      <div className="space-y-4 rounded-2xl border bg-card p-6">
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Este conteúdo é de qual empresa?</span>
          <div className="flex flex-wrap gap-2">
            {[{ id: "", name: "Todas as empresas" }, ...companies].map((c) => (
              <button key={c.id} onClick={() => setCompanyId(c.id)} className={`rounded-full border px-3 py-1 text-sm transition-colors ${companyId === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <Tabs defaultValue="text">
          <TabsList>
            <TabsTrigger value="text">Texto</TabsTrigger>
            <TabsTrigger value="file">PDF / arquivo</TabsTrigger>
            <TabsTrigger value="url">Site (URL)</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-4 space-y-3">
            <Input placeholder="Título (ex: Horários e preços)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea rows={8} placeholder="Cole aqui informações, perguntas frequentes, preços..." value={text} onChange={(e) => setText(e.target.value)} />
            <Button
              disabled={busy || !text.trim()}
              onClick={async () => {
                if (await run(() => addText({ data: { title, content: text, type: "text", companyId } }), "Texto adicionado")) {
                  setTitle("");
                  setText("");
                }
              }}
            >
              Adicionar texto
            </Button>
          </TabsContent>
          <TabsContent value="file" className="mt-4">
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:bg-muted"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onFiles(e.dataTransfer.files);
              }}
            >
              <Upload className="h-8 w-8 text-primary" />
              <span className="font-medium">{busy ? "Processando..." : "Clique ou arraste arquivos"}</span>
              <span className="text-sm text-muted-foreground">PDF, TXT, MD, CSV, JSON — até 20 MB</span>
              <input ref={fileRef} type="file" multiple accept=".pdf,.txt,.md,.csv,.json" className="hidden" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
            </label>
          </TabsContent>
          <TabsContent value="url" className="mt-4 flex gap-2">
            <Input placeholder="https://seusite.com.br/sobre" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button
              disabled={busy || !url}
              onClick={async () => {
                if (await run(() => addUrl({ data: { url, companyId } }), "Site importado")) setUrl("");
              }}
            >
              Importar
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{shown.length} conteúdo(s)</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border bg-card px-3 py-1.5 text-sm">
            <option value="all">Mostrar todos</option>
            <option value="">Todas as empresas (compartilhado)</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {shown.map((i) => {
          const Icon = icons[i.type];
          return (
            <div key={i.id} className="flex items-start gap-4 rounded-xl border bg-card p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i.title}</div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{i.preview}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{companyName(i.companyId)}</span>
                  <span>{i.size.toLocaleString("pt-BR")} caracteres</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => run(() => deleteKnowledge({ data: { id: i.id } }), "Removido")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
