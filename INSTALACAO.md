# Instalação em hospedagem compartilhada (cPanel)

Requisito: plano com **Node.js 20+** (cPanel → "Setup Node.js App"; na Hostinger: "Node.js") e **MySQL**.

## 1. Gerar os arquivos (no seu computador)
```bash
npm install
npm run build:hosting
```
Envie para a hospedagem: a pasta `.output`, `app.cjs` e `package.json`.

## 2. Criar o banco
cPanel → **Bancos de dados MySQL**: crie um banco, um usuário, e adicione o usuário ao banco com **todos os privilégios**.

## 3. Criar o app Node
cPanel → **Setup Node.js App** → Create Application:
- Node.js version: 20 ou superior
- Application root: a pasta onde enviou os arquivos
- Application URL: seu domínio
- Application startup file: `app.cjs`

Clique em **Run NPM Install** e depois **Restart**. Opcional nas variáveis de ambiente: `COOKIE_SECURE=true` (se usar HTTPS).

## 4. Instalar
Abra seu domínio → página **/install** → preencha os dados do MySQL → **Instalar**. As tabelas são criadas sozinhas.

## 5. Entrar
Usuário: `admin` — use a senha definida para o admin. Troque-a em **Chaves e agente → Alterar senha**.

Depois: escolha a IA e o WhatsApp (Evolution ou YCloud) em Chaves e conexões, copie a URL do webhook para a Evolution (evento `MESSAGES_UPSERT`).

Alternativa sem instalador: defina as variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` no app Node.

## Rodar na VPS
`NITRO_PRESET=node-server npm run build` e depois `DATA_DIR=/var/lib/agente PORT=3000 node app.cjs` (use PM2 para manter ligado).

## IA gratuita
- **Gemini**: crie a chave grátis em aistudio.google.com/apikey e escolha "Google Gemini" em Chaves e conexões.
- **Ollama (na VPS)**: `curl -fsSL https://ollama.com/install.sh | sh` e `ollama pull qwen2.5:7b`. Precisa de uns 8 GB de RAM.

## Chatwoot
1. No Chatwoot, crie uma caixa de entrada do tipo **API** e anote o ID dela e o ID da conta (aparecem no endereço da página).
2. Em Perfil, copie o **Token de acesso**.
3. Em Configurações → Integrações → Webhooks, cole a URL do webhook do Chatwoot (mostrada no painel) e marque "Mensagem criada" e "Status da conversa alterado".
4. Quando o atendente **resolver** a conversa, a IA volta a atender aquele cliente.
