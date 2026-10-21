import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, KeyRound, LogOut, MessageCircle, MessagesSquare, FlaskConical } from "lucide-react";
import { getAuthState, logout } from "@/lib/api.functions";
import { KnowledgePanel } from "@/components/dashboard/KnowledgePanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { ConversationsPanel } from "@/components/dashboard/ConversationsPanel";
import { TestPanel } from "@/components/dashboard/TestPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Agente WhatsApp" },
      { name: "description", content: "Gerencie o conhecimento, as chaves e as conversas do seu agente de IA no WhatsApp." },
      { property: "og:title", content: "Painel — Agente WhatsApp" },
      { property: "og:description", content: "Gerencie o conhecimento, as chaves e as conversas do seu agente de IA no WhatsApp." },
    ],
  }),
  beforeLoad: async () => {
    const s = await getAuthState();
    if (!s.loggedIn) throw redirect({ to: "/login" });
  },
  component: Dashboard,
});

const tabs = [
  { id: "knowledge", label: "Conhecimento", icon: BookOpen },
  { id: "settings", label: "Chaves e agente", icon: KeyRound },
  { id: "test", label: "Testar", icon: FlaskConical },
  { id: "chats", label: "Conversas", icon: MessagesSquare },
] as const;

function Dashboard() {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("knowledge");
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-1 bg-sidebar p-4 text-sidebar-foreground md:w-64">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold">Agente WhatsApp</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                tab === t.id ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
        <button
          onClick={async () => {
            await logout();
            await router.navigate({ to: "/login" });
          }}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
      <main className="flex-1 p-6 md:p-10">
        <div className="mx-auto max-w-4xl">
          {tab === "knowledge" && <KnowledgePanel />}
          {tab === "settings" && <SettingsPanel />}
          {tab === "test" && <TestPanel />}
          {tab === "chats" && <ConversationsPanel />}
        </div>
      </main>
    </div>
  );
}
