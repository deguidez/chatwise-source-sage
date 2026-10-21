# Instalar na sua VPS

Requisitos: Node.js 22+ (ou Bun) e uma Evolution API já rodando.

```bash
git clone <seu-repo> agente && cd agente
npm install
NITRO_PRESET=node-server npm run build
DATA_DIR=/var/lib/agente PORT=3000 node .output/server/index.mjs
```

- `DATA_DIR`: pasta onde ficam senha, chaves, conteúdos e conversas (arquivos JSON). Faça backup dela.
- `COOKIE_SECURE=true`: use quando o site estiver em HTTPS (recomendado, via Nginx/Caddy).
- Use PM2 ou systemd para manter rodando: `pm2 start .output/server/index.mjs --name agente`.

## Primeiro acesso
1. Abra o site: crie sua senha.
2. Em **Chaves e agente**, preencha a chave da OpenAI e os dados da Evolution API.
3. Copie a **URL do webhook** e cole na Evolution (Webhook da instância), com o evento `MESSAGES_UPSERT` ativo.
4. Adicione textos, PDFs e sites em **Conhecimento** e teste em **Testar**.
