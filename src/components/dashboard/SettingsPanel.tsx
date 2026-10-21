import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { changePassword, loadSettings, saveSettings } from "@/lib/api.functions";

type Form = Awaited<ReturnType<typeof loadSettings>>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const [f, setF] = useState<Form | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [webhook, setWebhook] = useState("");

  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  useEffect(() => {
    if (data) setWebhook(`${window.location.origin}/api/public/evolution/webhook?token=${data.webhookToken}`);
  }, [data]);

  if (!f) return <p className="text-muted-foreground">Carregando...</p>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });

  const save = async () => {
    try {
      const { webhookToken: _w, ...rest } = f;
      await saveSettings({ data: rest });
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Chaves e agente</h1>
        <p className="text-muted-foreground">As chaves ficam guardadas apenas no seu servidor.</p>
      </header>

      <Section title="Agente">
        <div className="flex items-center justify-between">
          <Label>Responder automaticamente</Label>
          <Switch checked={f.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Responder em grupos</Label>
          <Switch checked={f.replyGroups} onCheckedChange={(v) => set("replyGroups", v)} />
        </div>
        <Field label="Instruções do agente (personalidade e regras)">
          <Textarea rows={6} value={f.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        </Field>
      </Section>

      <Section title="OpenAI">
        <Field label="Chave da API" hint="Crie em platform.openai.com/api-keys. Deixe como está para manter a atual.">
          <Input type="password" placeholder="sk-..." value={f.openaiKey} onChange={(e) => set("openaiKey", e.target.value)} />
        </Field>
        <Field label="Modelo" hint="Ex: gpt-4o-mini, gpt-4o, gpt-4.1-mini">
          <Input value={f.openaiModel} onChange={(e) => set("openaiModel", e.target.value)} />
        </Field>
      </Section>

      <Section title="Evolution API (WhatsApp)">
        <Field label="URL da Evolution API" hint="Ex: https://evolution.seudominio.com">
          <Input value={f.evolutionUrl} onChange={(e) => set("evolutionUrl", e.target.value)} />
        </Field>
        <Field label="API Key">
          <Input type="password" value={f.evolutionKey} onChange={(e) => set("evolutionKey", e.target.value)} />
        </Field>
        <Field label="Nome da instância">
          <Input value={f.evolutionInstance} onChange={(e) => set("evolutionInstance", e.target.value)} />
        </Field>
        <Field label="URL do webhook" hint="Cole na Evolution: Instância → Webhook, ative o evento MESSAGES_UPSERT.">
          <div className="flex gap-2">
            <Input readOnly value={webhook} />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhook); toast.success("Copiado"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </Field>
      </Section>

      <Button size="lg" onClick={save}>Salvar configurações</Button>

      <Section title="Alterar senha">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input type="password" placeholder="Senha atual" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <Input type="password" placeholder="Nova senha (mín. 8)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <Button
          variant="outline"
          disabled={!pw.current || pw.next.length < 8}
          onClick={async () => {
            try {
              await changePassword({ data: pw });
              setPw({ current: "", next: "" });
              toast.success("Senha alterada");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro");
            }
          }}
        >
          Alterar senha
        </Button>
      </Section>
    </div>
  );
}
