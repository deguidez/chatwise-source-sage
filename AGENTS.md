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
- WhatsApp via Evolution or YCloud webhooks (/api/public/{evolution,ycloud}/webhook?token=…); AI provider selectable (Gemini free tier, Ollama on the VPS, OpenAI) using keys from settings, never Lovable AI (app is self-hosted).
- Multi-company flow: menu picks a company, knowledge is filtered by companyId; handoff to Chatwoot (API inbox) when asked, menu option, or AI returns [TRANSFERIR]; AI stays silent until Chatwoot resolves the conversation (/api/public/chatwoot/webhook).
- Pure parsing/retrieval logic lives in src/lib/agent-core.ts so it stays unit-testable.
