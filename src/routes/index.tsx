import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, BookOpen, KeyRound, Lock, LogOut, MessageCircle, MessagesSquare, FlaskConical, Users, Zap } from "lucide-react";
import { getAuthState, logout } from "@/lib/api.functions";
import { KnowledgePanel } from "@/components/dashboard/KnowledgePanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { ConversationsPanel } from "@/components/dashboard/ConversationsPanel";
import { CompaniesPanel } from "@/components/dashboard/CompaniesPanel";
import { QuickRepliesPanel } from "@/components/dashboard/QuickRepliesPanel";
import { UsersPanel } from "@/components/dashboard/UsersPanel";
import { PasswordCard } from "@/components/dashboard/PasswordCard";
import { TestPanel } from "@/components/dashboard/TestPanel";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Agente WhatsApp" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Gerencie o conhecimento, as chaves e as conversas do seu agente de IA no WhatsApp." },
      { property: "og:title", content: "Painel — Agente WhatsApp" },
      { property: "og:description", content: "Gerencie o conhecimento, as chaves e as conversas do seu agente de IA no WhatsApp." },
    ],
  }),
  beforeLoad: async () => {
    const s = await getAuthState();
    if (!s.loggedIn) throw redirect({ to: "/login" });
    return { auth: s };
  },
  component: Dashboard,
});

const tabs = [
  { id: "chats", label: "Atendimento", icon: MessagesSquare, superOnly: false },
  { id: "quick", label: "Respostas rápidas", icon: Zap, superOnly: false },
  { id: "companies", label: "Empresas e menu", icon: Building2, superOnly: false },
  { id: "knowledge", label: "Conhecimento", icon: BookOpen, superOnly: false },
  { id: "settings", label: "Chaves e conexões", icon: KeyRound, superOnly: true },
  { id: "users", label: "Usuários", icon: Users, superOnly: true },
  { id: "test", label: "Testar", icon: FlaskConical, superOnly: false },
  { id: "account", label: "Minha conta", icon: Lock, superOnly: false },
] as const;

function Dashboard() {
  const { auth } = Route.useRouteContext();
  const isSuper = auth.role === "super";
  const visibleTabs = tabs.filter((t) => !t.superOnly || isSuper);
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("chats");
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
          {visibleTabs.map((t) => (
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
      <main className={cn("flex-1", tab === "chats" ? "p-2 md:p-4" : "p-6 md:p-10")}>
        <div className={cn("mx-auto", tab !== "chats" && "max-w-4xl")}>
          {tab === "companies" && <CompaniesPanel />}
          {tab === "knowledge" && <KnowledgePanel />}
          {tab === "settings" && isSuper && <SettingsPanel />}
          {tab === "users" && isSuper && <UsersPanel currentUser={auth.username} />}
          {tab === "test" && <TestPanel />}
          {tab === "chats" && <ConversationsPanel />}
          {tab === "quick" && <QuickRepliesPanel />}
          {tab === "account" && <PasswordCard username={auth.username} />}
        </div>
        <footer className="mt-10 pb-2 text-center text-xs text-muted-foreground">
          © 2026 Fotogrer — Todos os direitos reservados
        </footer>
      </main>
    </div>
  );
}
