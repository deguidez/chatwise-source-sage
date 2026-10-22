import { useEffect, useState } from "react";
import { ShieldCheck, Trash2, UserPlus, Users, KeyRound, Pencil } from "lucide-react";
import { listUsers, createUser, deleteUser, resetUserPassword, updateUser } from "@/lib/api.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type UserRow = { username: string; role: "super" | "attendant"; name?: string };

export function UsersPanel({ currentUser }: { currentUser: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super" | "attendant">("attendant");
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
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
      await createUser({ data: { username, password, role, name } });
      toast.success(`Usuário ${username} criado`);
      setUsername("");
      setName("");
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

  const saveName = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateUser({ data: { username: editing.username, name: editName } });
      toast.success("Nome atualizado");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nome");
    } finally {
      setBusy(false);
    }
  };

  const displayName = (u: UserRow) => (u.name ? u.name : u.username);

  return (
    <div className="space-y-8">
      <section className="min-w-0 border-b pb-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5" /> Usuários do painel
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Somente o super administrador pode gerenciar usuários e configurar as chaves de API.
        </p>
        <ul className="divide-y">
          {users.map((u) => (
            <li key={u.username} className="flex min-w-0 flex-wrap items-center gap-2 py-4">
              <span className="max-w-full break-words font-medium">{displayName(u)}</span>
              {u.name && <span className="text-xs text-muted-foreground">({u.username})</span>}
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
              <span className="flex w-full flex-wrap gap-2 pt-2 sm:ml-auto sm:w-auto sm:pt-0">
                <Button variant="outline" size="sm"
                  onClick={() => {
                    setEditing(u);
                    setEditName(u.name ?? "");
                  }}
                >
                  <Pencil className="h-3 w-3" /> Editar nome
                </Button>
                <Button variant="outline" size="sm"
                  onClick={() => {
                    setResetFor(u.username);
                    setResetPassword("");
                  }}
                >
                  <KeyRound className="h-3 w-3" /> Trocar senha
                </Button>
                {u.username !== currentUser && u.username !== "admin" && (
                  <Button variant="outline" size="sm"
                    onClick={() => void remove(u.username)}
                    className="border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" /> Excluir
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-w-0">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <UserPlus className="h-5 w-5" /> Novo usuário
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Usuário (login)
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ex.: maria"
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Nome (exibido no atendimento)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Maria Silva"
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
        <Button
          onClick={() => void add()}
          disabled={busy || !username || !password}
          className="mt-4 w-full sm:w-auto"
        >
          Criar usuário
        </Button>
      </section>

      {resetFor && (
        <Dialog open onOpenChange={(open) => { if (!open) setResetFor(null); }}>
          <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg">
            <DialogTitle className="pr-6 break-words">Nova senha para {resetFor}</DialogTitle>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Mín. 8 caracteres"
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetFor(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void doReset()}
                disabled={busy || resetPassword.length < 8}
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => { if (!open) setEditing(null); }}>
          <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg">
            <DialogTitle>Editar nome</DialogTitle>
            <p className="mb-3 text-xs text-muted-foreground">
              Usuário: {editing.username} — o login continua o mesmo.
            </p>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Nome completo"
              className="w-full rounded-lg border bg-background px-3 py-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void saveName()}
                disabled={busy}
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
