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
- Self-hosted on a Node VPS (build with NITRO_PRESET=node-server); no Lovable Cloud — user wants everything on their VPS.
- Persistence is JSON files in DATA_DIR via src/lib/store.server.ts (single admin, low volume); keep all fs access there.
- Single-admin auth: scrypt password + session tokens in auth.json, httpOnly cookie; every server fn calls requireAdmin.
- WhatsApp via Evolution API webhook at /api/public/evolution/webhook?token=… (token checked); AI via user's own OpenAI key from settings.
- Pure parsing/retrieval logic lives in src/lib/agent-core.ts so it stays unit-testable.
