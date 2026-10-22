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
import { cn } from "@/lib/utils";

export type SettingsForm = Awaited<ReturnType<typeof loadSettings>>;

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; desc: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={cn("rounded-xl border-2 p-3 text-left transition-colors", value === o.id ? "border-primary bg-secondary" : "hover:bg-muted")}>
          <div className="text-sm font-semibold">{o.label}</div>
          <div className="text-xs text-muted-foreground">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} />
      <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function useSettingsForm() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
  const [f, setF] = useState<SettingsForm | null>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = async () => {
    if (!f) return;
    try {
      const { webhookToken: _w, ...rest } = f;
      await saveSettings({ data: rest });
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };
  return { f, setF, save };
}

export function SettingsPanel() {
  const { f, setF, save } = useSettingsForm();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  if (!f) return <p className="text-muted-foreground">Carregando...</p>;
  const set = <K extends keyof SettingsForm>(k: K, v: SettingsForm[K]) => setF({ ...f, [k]: v });
  const hook = (p: string) => `${origin}/api/public/${p}/webhook?token=${f.webhookToken}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Chaves e conexões</h1>
        <p className="text-muted-foreground">As chaves ficam guardadas apenas no seu servidor.</p>
      </header>

      <Section title="Agente">
        <div className="flex items-center justify-between">
          <Label>Responder automaticamente</Label>
          <Switch checked={f.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Responder em grupos (só Evolution)</Label>
          <Switch checked={f.replyGroups} onCheckedChange={(v) => set("replyGroups", v)} />
        </div>
        <Field label="Instruções gerais (valem para todas as empresas)">
          <Textarea rows={5} value={f.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        </Field>
      </Section>

      <Section title="Inteligência artificial">
        <Choice
          value={f.aiProvider}
          onChange={(v) => set("aiProvider", v)}
          options={[
            { id: "gemini", label: "Google Gemini", desc: "Plano gratuito" },
            { id: "ollama", label: "Ollama (na VPS)", desc: "100% gratuito, roda no seu servidor" },
            { id: "openai", label: "OpenAI", desc: "Pago por uso" },
          ]}
        />
        {f.aiProvider === "gemini" && (
          <>
            <Field label="Chave do Gemini" hint="Gere grátis em aistudio.google.com/apikey">
              <Input type="password" value={f.geminiKey} onChange={(e) => set("geminiKey", e.target.value)} />
            </Field>
            <Field label="Modelo" hint="Ex: gemini-3.8-flash (deixe em branco para usar o padrão)">
              <Input value={f.geminiModel} onChange={(e) => set("geminiModel", e.target.value)} />
            </Field>
          </>
        )}
        {f.aiProvider === "ollama" && (
          <>
            <Field label="Endereço do Ollama" hint="Instale na VPS: curl -fsSL https://ollama.com/install.sh | sh">
              <Input value={f.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)} />
            </Field>
            <Field label="Modelo" hint="Ex: llama3.1, qwen2.5:7b (baixe com: ollama pull qwen2.5:7b)">
              <Input value={f.ollamaModel} onChange={(e) => set("ollamaModel", e.target.value)} />
            </Field>
          </>
        )}
        {f.aiProvider === "openai" && (
          <>
            <Field label="Chave da OpenAI" hint="platform.openai.com/api-keys">
              <Input type="password" placeholder="sk-..." value={f.openaiKey} onChange={(e) => set("openaiKey", e.target.value)} />
            </Field>
            <Field label="Modelo">
              <Input value={f.openaiModel} onChange={(e) => set("openaiModel", e.target.value)} />
            </Field>
          </>
        )}
      </Section>

      <Section title="WhatsApp">
        <Choice
          value={f.waProvider}
          onChange={(v) => set("waProvider", v)}
          options={[
            { id: "evolution", label: "Evolution API", desc: "Conecta por QR code" },
            { id: "ycloud", label: "YCloud", desc: "API oficial via YCloud" },
          ]}
        />
        {f.waProvider === "evolution" ? (
          <>
            <Field label="URL da Evolution API"><Input value={f.evolutionUrl} onChange={(e) => set("evolutionUrl", e.target.value)} /></Field>
            <Field label="API Key"><Input type="password" value={f.evolutionKey} onChange={(e) => set("evolutionKey", e.target.value)} /></Field>
            <Field label="Nome da instância"><Input value={f.evolutionInstance} onChange={(e) => set("evolutionInstance", e.target.value)} /></Field>
            <Field label="URL do webhook" hint="Cole na Evolution → Webhook, com o evento MESSAGES_UPSERT."><CopyField value={hook("evolution")} /></Field>
          </>
        ) : (
          <>
            <Field label="API Key da YCloud"><Input type="password" value={f.ycloudKey} onChange={(e) => set("ycloudKey", e.target.value)} /></Field>
            <Field label="Número do WhatsApp (remetente)" hint="Com DDI, ex: +5511999999999"><Input value={f.ycloudFrom} onChange={(e) => set("ycloudFrom", e.target.value)} /></Field>
            <Field label="URL do webhook" hint="Cole na YCloud → Webhooks, com o evento whatsapp.inbound_message.received."><CopyField value={hook("ycloud")} /></Field>
          </>
        )}
      </Section>

      <Section title="Atendimento humano">
        <Field label="Destino do atendimento">
          <div className="flex flex-wrap gap-2">
            <Button variant={f.handoffProvider === "whatsapp" ? "default" : "outline"} aria-pressed={f.handoffProvider === "whatsapp"} onClick={() => set("handoffProvider", "whatsapp")}>Mesmo WhatsApp</Button>
            <Button variant={f.handoffProvider === "other" ? "default" : "outline"} aria-pressed={f.handoffProvider === "other"} onClick={() => set("handoffProvider", "other")}>Outro número</Button>
            <Button variant={f.handoffProvider === "chatwoot" ? "default" : "outline"} aria-pressed={f.handoffProvider === "chatwoot"} onClick={() => set("handoffProvider", "chatwoot")}>Chatwoot</Button>
          </div>
        </Field>
        {f.handoffProvider === "whatsapp" && (
          <Field label="WhatsApp do atendente para avisos" hint="Use outro número com DDI. O atendente responde pelo WhatsApp da empresa; ao terminar, clique em Devolver para a IA em Conversas. Na YCloud, avisos fora da janela de 24 horas podem ser recusados.">
            <Input aria-label="WhatsApp do atendente para avisos" type="tel" value={f.attendantNumber} onChange={(e) => set("attendantNumber", e.target.value)} placeholder="+55…" />
          </Field>
        )}
        {f.handoffProvider === "other" && (
          <Field label="WhatsApp do atendente" hint="Com DDI. O cliente recebe um link para chamar este número, e o atendente recebe o resumo da conversa. A IA encerra o atendimento no número da empresa.">
            <Input aria-label="WhatsApp do atendente" type="tel" value={f.attendantNumber} onChange={(e) => set("attendantNumber", e.target.value)} placeholder="+55…" />
          </Field>
        )}
      </Section>

      <Section title="Chatwoot">
        <Field label="URL do Chatwoot" hint="Ex: https://chat.seudominio.com"><Input value={f.chatwootUrl} onChange={(e) => set("chatwootUrl", e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ID da conta"><Input value={f.chatwootAccountId} onChange={(e) => set("chatwootAccountId", e.target.value)} /></Field>
          <Field label="ID da caixa de entrada (API)"><Input value={f.chatwootInboxId} onChange={(e) => set("chatwootInboxId", e.target.value)} /></Field>
        </div>
        <Field label="Token de acesso" hint="Chatwoot → Perfil → Token de acesso"><Input type="password" value={f.chatwootToken} onChange={(e) => set("chatwootToken", e.target.value)} /></Field>
        <Field label="URL do webhook do Chatwoot" hint="Chatwoot → Configurações → Integrações → Webhooks, com os eventos 'Mensagem criada' e 'Status da conversa alterado'.">
          <CopyField value={hook("chatwoot")} />
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
