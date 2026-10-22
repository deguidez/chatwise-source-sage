import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, Section, useSettingsForm } from "./SettingsPanel";

export function CompaniesPanel() {
  const { f, setF, save } = useSettingsForm();
  if (!f) return <p className="text-muted-foreground">Carregando...</p>;
  const companies = f.companies;
  const setCompanies = (c: typeof companies) => setF({ ...f, companies: c });

  const preview = [
    f.greeting,
    "",
    "*Escolha uma opção:*",
    "",
    ...companies.map((c, i) => `${i + 1} - ${c.name}`),
    ...(f.humanOption ? [`${companies.length + 1} - Falar com um atendente`] : []),
  ].join("\n");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Empresas e menu</h1>
        <p className="text-muted-foreground">O cliente escolhe a empresa e a IA responde só com o conteúdo dela.</p>
      </header>

      <Section title="Mensagem de boas-vindas">
        <Textarea rows={3} value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Label>Mostrar opção "Falar com um atendente"</Label>
          <Switch checked={f.humanOption} onCheckedChange={(v) => setF({ ...f, humanOption: v })} />
        </div>
        <div className="whitespace-pre-wrap rounded-lg bg-bubble-in p-4 text-sm shadow-sm ring-1 ring-border [overflow-wrap:anywhere]">{preview}</div>
      </Section>

      {companies.map((c, i) => (
        <Section key={c.id} title={`${i + 1} - ${c.name || "Nova empresa"}`}>
          <Field label="Nome">
            <Input value={c.name} onChange={(e) => setCompanies(companies.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
          </Field>
          <Field label="Instruções específicas desta empresa" hint="Tom de voz, regras, o que pode ou não falar.">
            <Textarea rows={4} value={c.prompt} onChange={(e) => setCompanies(companies.map((x) => (x.id === c.id ? { ...x, prompt: e.target.value } : x)))} />
          </Field>
          {companies.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => setCompanies(companies.filter((x) => x.id !== c.id))}>
              <Trash2 className="mr-1 h-4 w-4" /> Remover empresa
            </Button>
          )}
        </Section>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="outline" onClick={() => setCompanies([...companies, { id: crypto.randomUUID().slice(0, 8), name: "", prompt: "" }])}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar empresa
        </Button>
        <Button onClick={save}>Salvar</Button>
      </div>
    </div>
  );
}
