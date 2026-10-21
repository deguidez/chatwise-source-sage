import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/evolution/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSettings } = await import("@/lib/store.server");
        const settings = await getSettings();
        const token = new URL(request.url).searchParams.get("token");
        if (!token || token !== settings.webhookToken) {
          return new Response("unauthorized", { status: 401 });
        }
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const { parseEvolutionWebhook } = await import("@/lib/agent-core");
        const msg = parseEvolutionWebhook(body);
        if (!msg) return Response.json({ status: "ignored" });
        try {
          const { handleIncoming } = await import("@/lib/agent.server");
          const status = await handleIncoming(msg);
          return Response.json({ status });
        } catch (err) {
          console.error("Webhook error:", err);
          return Response.json({ status: "error", message: String(err) }, { status: 200 });
        }
      },
    },
  },
});
