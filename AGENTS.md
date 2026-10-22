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
- Persistence goes through src/lib/store.server.ts as JSON documents, driver MySQL (app_data table, auto-created) or files, chosen in the /install wizard or DB_* env; keep all storage access there.
- Auth: username+scrypt hash in auth doc (default admin seeded as hash only), expiring sessions, per IP+user lockout; every server fn calls requireAdmin.
- WhatsApp via Evolution API webhook at /api/public/evolution/webhook?token=… (token checked); AI via user's own OpenAI key from settings.
- Pure parsing/retrieval logic lives in src/lib/agent-core.ts so it stays unit-testable.
