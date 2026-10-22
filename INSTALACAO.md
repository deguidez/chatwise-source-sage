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
Em **Chaves e conexões → Atendimento humano**, escolha **Mesmo WhatsApp** para avisar o atendente em outro número com DDI. Ele responde pelo WhatsApp da empresa, e a IA fica pausada até clicar em **Conversas → Devolver para a IA**. Falhas de aviso aparecem em Conversas. Na YCloud, um aviso fora da janela de 24 horas pode exigir um modelo aprovado e ser recusado; essa opção envia avisos de texto.

Para continuar usando o Chatwoot, escolha **Chatwoot** como destino e preencha os dados abaixo. Configurações já existentes continuam no modo Chatwoot.

1. No Chatwoot, crie uma caixa de entrada do tipo **API** e anote o ID dela e o ID da conta (aparecem no endereço da página).
2. Em Perfil, copie o **Token de acesso**.
3. Em Configurações → Integrações → Webhooks, cole a URL do webhook do Chatwoot (mostrada no painel) e marque "Mensagem criada" e "Status da conversa alterado".
4. Quando o atendente **resolver** a conversa, a IA volta a atender aquele cliente.

## Lembrete sem resposta
O atendimento automático pergunta uma vez se o cliente quer cancelar ou tem outra dúvida após 2 minutos sem resposta. Não envia lembretes durante atendimento humano. Ao responder `cancelar`, o cliente encerra; uma nova mensagem abre o menu novamente.

Na VPS/hospedagem, configure `LOVABLE_CRON_SECRET` com um segredo forte e um agendador para enviar POST a `/api/public/jobs/inactivity` a cada minuto, com o cabeçalho `Authorization: Bearer <seu segredo>`. Não exponha o segredo no endereço. No Lovable, o agendamento é gerenciado. O envio ocorre entre 2 e 3 minutos em condições normais, conforme a próxima verificação; grandes filas podem levar mais tempo.
