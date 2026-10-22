import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthState, login, setupPassword } from "@/lib/api.functions";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Agente WhatsApp" },
      { name: "description", content: "Acesso ao painel do agente de IA para WhatsApp." },
      { property: "og:title", content: "Entrar — Agente WhatsApp" },
      { property: "og:description", content: "Acesso ao painel do agente de IA para WhatsApp." },
    ],
  }),
  beforeLoad: async () => {
    const s = await getAuthState();
    if (s.loggedIn) throw redirect({ to: "/" });
    return { hasPassword: s.hasPassword };
  },
  component: LoginPage,
});

function LoginPage() {
  const { hasPassword } = Route.useRouteContext();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPassword && password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }
    setBusy(true);
    try {
      if (hasPassword) await login({ data: { password } });
      else await setupPassword({ data: { password } });
      await router.navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-8 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <MessageCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Agente WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              {hasPassword ? "Digite sua senha" : "Primeiro acesso: crie sua senha"}
            </p>
          </div>
        </div>
        <Input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} minLength={hasPassword ? 1 : 8} required />
        {!hasPassword && (
          <Input type="password" placeholder="Confirmar senha (mín. 8 caracteres)" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {hasPassword ? "Entrar" : "Criar senha e entrar"}
        </Button>
      </form>
    </div>
  );
}
