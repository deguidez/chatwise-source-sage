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

Depois: configure a OpenAI e a Evolution API, copie a URL do webhook para a Evolution (evento `MESSAGES_UPSERT`).

Alternativa sem instalador: defina as variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` no app Node.
