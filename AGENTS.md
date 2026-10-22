<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Self-hosted on shared hosting/VPS with Node (npm run build:hosting, startup file app.cjs); no Lovable Cloud — user hosts everything.
- Persistence goes through src/lib/store.server.ts as JSON documents in an app_data table; driver auto-selects Lovable Cloud when hosted on Lovable (service role server-side, RLS with no policies), else MySQL/files from /install or DB_* env; keep all storage access there.
- Auth: username+scrypt hash in auth doc (default admin seeded as hash only), expiring sessions, per IP+user lockout; every server fn calls requireAdmin.
- WhatsApp via Evolution or YCloud webhooks (/api/public/{evolution,ycloud}/webhook?token=…); AI provider selectable (Gemini free tier, Ollama on the VPS, OpenAI) using keys from settings, never Lovable AI (app is self-hosted).
- Multi-company flow filters knowledge by companyId; handoff uses the configured WhatsApp staff notification or Chatwoot API inbox. Persist the destination per conversation so configuration changes cannot reroute active handoffs; human stage silences AI and reminders until manual dashboard return or Chatwoot resolution. WhatsApp notification failures remain visible without resuming AI.
- Pure parsing/retrieval logic lives in src/lib/agent-core.ts so it stays unit-testable.
- Inactivity uses persisted reminder claims in store.server.ts and a managed authenticated scheduled callback at /api/public/jobs/inactivity; do not use request-lifetime timers because reminders must work with the dashboard closed. Self-hosted schedulers call the same endpoint with LOVABLE_CRON_SECRET.
- In-app attendance: queue tab derives from stage/ticketStatus/closed via queueTab in agent-core; attachments are stored as separate media-<uuid> documents through store.server (never inside conversations.json) so the conversation document stays small.
- Dashboard navigation uses a mobile sheet below the desktop breakpoint; attendance keeps list and conversation as separate mobile views with independently scrolling messages and a viewport-height composer, so phone navigation and typing remain accessible.
- Analytics are immutable per-event JSON documents accessed only through store.server.ts; token usage records provider-reported counts per attempt with shared logical request IDs, never prompts or keys, and reports enforce requireSuper on the server.
- Standalone Portainer deployments use a locally prebuilt Node image, MySQL and a private scheduler network behind configurable Traefik labels; cookie-based app auth must not initialize unused managed-auth clients, so VPS installations require no Cloud credentials.
