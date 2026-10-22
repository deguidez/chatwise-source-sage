# Instalação na VPS com Portainer + Traefik

1. Aponte o DNS (registro A) do domínio, ex. `agente.seudominio.com.br`, para o IP da VPS.
2. Com Portainer e Traefik rodando, confirme o nome da rede do Traefik (ex. `traefik_public`) e o certresolver (ex. `letsencrypt`). Ajuste no `docker-compose.yml` se forem diferentes.
3. Envie o código para um repositório Git (GitHub) — no Lovable: botão GitHub > Connect.
4. Portainer > Stacks > Add stack > **Repository**: cole a URL do repositório, compose path `docker-compose.yml`.
5. Edite no arquivo: `SEU_DOMINIO`, `TROQUE_SENHA_DB` (2 lugares), `TROQUE_SENHA_ROOT`, `TROQUE_SEGREDO_CRON` (2 lugares).
6. Deploy. Acesse `https://SEU_DOMINIO` — login `admin` / `Gui7845@@`.
7. Configure de novo as chaves (Gemini, Evolution/YCloud, Chatwoot) e atualize a URL do webhook no Evolution/YCloud para o novo domínio.
8. Atualizar: Portainer > Stack > **Pull and redeploy**.
