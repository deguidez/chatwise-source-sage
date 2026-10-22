import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Database, HardDrive, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthState, installApp } from "@/lib/api.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Instalação — Agente WhatsApp" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Configure o banco de dados do agente de IA para WhatsApp." },
      { property: "og:title", content: "Instalação — Agente WhatsApp" },
      { property: "og:description", content: "Configure o banco de dados do agente de IA para WhatsApp." },
    ],
  }),
  beforeLoad: async () => {
    const s = await getAuthState();
    if (s.installed) throw redirect({ to: "/login" });
  },
  component: InstallPage,
});

function InstallPage() {
  const router = useRouter();
  const [driver, setDriver] = useState<"mysql" | "file">("mysql");
  const [db, setDb] = useState({ host: "localhost", port: "3306", database: "", user: "", password: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await installApp({
        data: driver === "mysql" ? { driver, ...db, port: Number(db.port) || 3306 } : { driver },
      });
      toast.success("Instalado! Entre com o usuário admin.");
      await router.navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na instalação");
    } finally {
      setBusy(false);
    }
  };

  const opt = (id: "mysql" | "file", Icon: typeof Database, title: string, desc: string) => (
    <button type="button" onClick={() => setDriver(id)} className={cn("flex-1 rounded-xl border-2 p-4 text-left transition-colors", driver === id ? "border-primary bg-secondary" : "hover:bg-muted")}>
      <Icon className="mb-2 h-5 w-5 text-primary" />
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-2xl bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Instalação</h1>
            <p className="text-sm text-muted-foreground">As tabelas são criadas automaticamente.</p>
          </div>
        </div>
        <div className="flex gap-3">
          {opt("mysql", Database, "MySQL", "Recomendado para hospedagem")}
          {opt("file", HardDrive, "Arquivos", "Sem banco, salva em pasta")}
        </div>
        {driver === "mysql" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <div className="space-y-1.5"><Label>Servidor</Label><Input value={db.host} onChange={(e) => setDb({ ...db, host: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Porta</Label><Input value={db.port} onChange={(e) => setDb({ ...db, port: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Nome do banco</Label><Input value={db.database} onChange={(e) => setDb({ ...db, database: e.target.value })} required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Usuário do banco</Label><Input value={db.user} onChange={(e) => setDb({ ...db, user: e.target.value })} required /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Senha do banco</Label><Input type="password" value={db.password} onChange={(e) => setDb({ ...db, password: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground sm:col-span-2">Crie o banco e o usuário no painel da hospedagem (cPanel → Bancos de dados MySQL).</p>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Instalando..." : "Instalar"}</Button>
      </form>
    </div>
  );
}
