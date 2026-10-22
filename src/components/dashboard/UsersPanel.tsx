import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus, Users, KeyRound } from "lucide-react";
import { listUsers, createUser, deleteUser, resetUserPassword } from "@/lib/api.functions";
import { toast } from "sonner";

type UserRow = { username: string; role: "super" | "attendant" };

export function UsersPanel({ currentUser }: { currentUser: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super" | "attendant">("attendant");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar usuários");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setBusy(true);
    try {
      await createUser({ data: { username, password, role } });
      toast.success(`Usuário ${username} criado`);
      setUsername("");
      setPassword("");
      setRole("attendant");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar usuário");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (u: string) => {
    if (!confirm(`Excluir o usuário ${u}?`)) return;
    try {
      await deleteUser({ data: { username: u } });
      toast.success("Usuário excluído");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  const doReset = async () => {
    if (!resetFor) return;
    setBusy(true);
    try {
      await resetUserPassword({ data: { username: resetFor, password: resetPassword } });
      toast.success(`Senha de ${resetFor} alterada`);
      setResetFor(null);
      setResetPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar senha");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5" /> Usuários do painel
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Somente o super administrador pode gerenciar usuários e configurar as chaves de API.
        </p>
        <ul className="divide-y">
          {users.map((u) => (
            <li key={u.username} className="flex flex-wrap items-center gap-3 py-3">
              <span className="font-medium">{u.username}</span>
              {u.username === currentUser && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">você</span>
              )}
              <span
                className={
                  u.role === "super"
                    ? "flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                    : "rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                }
              >
                {u.role === "super" && <ShieldCheck className="h-3 w-3" />}
                {u.role === "super" ? "Super admin" : "Atendente"}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => {
                    setResetFor(u.username);
                    setResetPassword("");
                  }}
                  className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <KeyRound className="h-3 w-3" /> Trocar senha
                </button>
                {u.username !== currentUser && u.username !== "admin" && (
                  <button
                    onClick={() => void remove(u.username)}
                    className="flex items-center gap-1 rounded-lg border border-destructive px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Excluir
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <UserPlus className="h-5 w-5" /> Novo usuário
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Usuário
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex.: maria"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Senha (mín. 8 caracteres)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Permissão
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "super" | "attendant")}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            >
              <option value="attendant">Atendente (não acessa as chaves)</option>
              <option value="super">Super admin (acessa tudo)</option>
            </select>
          </label>
        </div>
        <button
          onClick={() => void add()}
          disabled={busy || !username || !password}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Criar usuário
        </button>
      </section>

      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border bg-card p-6">
            <h3 className="mb-3 font-display text-lg font-semibold">Nova senha para {resetFor}</h3>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Mín. 8 caracteres"
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setResetFor(null)} className="rounded-lg border px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={() => void doReset()}
                disabled={busy || resetPassword.length < 8}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
