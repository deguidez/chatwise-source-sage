import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/jobs/inactivity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const failure = await authenticateCronRequest(request);
        if (failure) return failure;
        const { sendInactivityReminders } = await import("@/lib/agent.server");
        return Response.json(await sendInactivityReminders());
      },
    },
  },
});