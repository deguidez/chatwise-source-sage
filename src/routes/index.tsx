import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Building2, BookOpen, KeyRound, Lock, LogOut, Menu, MessageCircle, MessagesSquare, FlaskConical, Users, Zap } from "lucide-react";
import { getAuthState, logout } from "@/lib/api.functions";
import { KnowledgePanel } from "@/components/dashboard/KnowledgePanel";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { ConversationsPanel } from "@/components/dashboard/ConversationsPanel";
import { CompaniesPanel } from "@/components/dashboard/CompaniesPanel";
import { QuickRepliesPanel } from "@/components/dashboard/QuickRepliesPanel";
import { UsersPanel } from "@/components/dashboard/UsersPanel";
import { PasswordCard } from "@/components/dashboard/PasswordCard";
import { TestPanel } from "@/components/dashboard/TestPanel";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  { id: "metrics", label: "Dashboard", icon: BarChart3, superOnly: true },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const activeTab = visibleTabs.find((t) => t.id === tab);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      if (!viewport || viewport.scale === 1) {
        document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? window.innerHeight}px`);
      }
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);

  const signOut = async () => {
    await logout();
    await router.navigate({ to: "/login" });
  };

  const navigation = (
    <nav aria-label="Menu principal" className="flex min-w-0 flex-col gap-1">
      {visibleTabs.map((t) => (
        <Button key={t.id} variant="ghost" aria-current={tab === t.id ? "page" : undefined}
          onClick={() => { setTab(t.id); setMenuOpen(false); }}
          className={cn("h-12 w-full justify-start gap-3 px-3 text-sm", tab === t.id ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground")}
        >
          <t.icon className="h-4 w-4" /> {t.label}
        </Button>
      ))}
    </nav>
  );

  return (
    <div className="dashboard-shell flex min-h-dvh min-w-0 flex-col lg:flex-row">
      <header className="grid h-16 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-sidebar px-4 text-sidebar-foreground lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <MessageCircle className="h-7 w-7 shrink-0 text-sidebar-primary" />
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold">Agente WhatsApp</p>
            <p className="truncate text-xs opacity-80">{activeTab?.label}</p>
          </div>
        </div>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild><Button size="icon" variant="ghost" aria-label="Abrir menu" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><Menu /></Button></SheetTrigger>
          <SheetContent side="left" aria-describedby={undefined} className="flex w-[min(88vw,320px)] flex-col overflow-y-auto bg-sidebar p-4 text-sidebar-foreground">
            <SheetTitle className="mb-4 pr-10 text-left text-sidebar-foreground">Agente WhatsApp</SheetTitle>
            {navigation}
            <div className="mt-auto border-t border-sidebar-border pt-4">
              <p className="mb-2 truncate px-3 text-xs opacity-80">{auth.username}</p>
              <Button variant="ghost" onClick={signOut} className="h-12 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"><LogOut /> Sair</Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 bg-sidebar p-4 text-sidebar-foreground lg:flex">
        <div className="mb-6 flex min-w-0 items-center gap-2 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold">Agente WhatsApp</span>
        </div>
        {navigation}
        <Button variant="ghost" onClick={signOut} className="mt-auto h-12 justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </aside>
      <main className={cn("min-w-0 flex-1", tab === "chats" ? "lg:p-4" : "px-4 py-6 sm:p-6 lg:p-10")}>
        <div className={cn("mx-auto min-w-0", tab !== "chats" && "dashboard-content max-w-4xl")}>
          {tab === "companies" && <CompaniesPanel />}
          {tab === "metrics" && isSuper && <MetricsPanel />}
          {tab === "knowledge" && <KnowledgePanel />}
          {tab === "settings" && isSuper && <SettingsPanel />}
          {tab === "users" && isSuper && <UsersPanel currentUser={auth.username} />}
          {tab === "test" && <TestPanel />}
          {tab === "chats" && <ConversationsPanel />}
          {tab === "quick" && <QuickRepliesPanel />}
          {tab === "account" && <PasswordCard username={auth.username} />}
        </div>
        <footer className={cn("px-2 text-center text-xs text-muted-foreground", tab === "chats" ? "flex h-8 items-center justify-center" : "mt-8 pb-2")}>
          © 2026 Fotogrer — Todos os direitos reservados
        </footer>
      </main>
    </div>
  );
}
