import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/chatwoot/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getSettings } = await import("@/lib/store.server");
        const settings = await getSettings();
        const token = new URL(request.url).searchParams.get("token");
        if (!token || token !== settings.webhookToken) return new Response("unauthorized", { status: 401 });
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        try {
          const { handleChatwootEvent } = await import("@/lib/agent.server");
          return Response.json({ status: await handleChatwootEvent(body) });
        } catch (err) {
          console.error("Chatwoot webhook error:", err);
          return Response.json({ status: "error" });
        }
      },
    },
  },
});
