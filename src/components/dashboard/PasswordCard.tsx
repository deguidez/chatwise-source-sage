import { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/lib/api.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordCard({ username }: { username: string }) {
  const [pw, setPw] = useState({ current: "", next: "" });

  return (
    <section className="min-w-0 space-y-3">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
        <Lock className="h-5 w-5" /> Minha conta
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Você está conectado como <strong>{username}</strong>. Altere sua senha abaixo.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input type="password" placeholder="Senha atual" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <Input type="password" placeholder="Nova senha (mín. 8)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
      </div>
      <Button
        className="mt-3 w-full sm:w-auto"
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
    </section>
  );
}
