# Instalação na VPS com Portainer + Traefik

Domínio configurado: **https://agente.evenon.com.br**.
Esta stack é para **Docker Standalone**, não Docker Swarm. O Portainer deve controlar o mesmo Docker em que a imagem será construída. Traefik deve estar instalado, com HTTPS configurado e portas 80/443 disponíveis.

## 1. DNS e Traefik

No provedor DNS, crie o registro A `agente` apontando para o IP público da VPS. Se existir um AAAA antigo, remova-o ou aponte-o para o IPv6 correto. Para a primeira emissão do certificado, deixe o registro sem proxy.

Confira no Traefik o nome da rede, o ponto de entrada HTTPS e o emissor de certificado. A stack usa por padrão `traefik_public`, `websecure` e `letsencrypt`; se forem diferentes, informe os valores reais nas variáveis do Portainer. Não crie uma rede nova desconectada do Traefik.

## 2. Construir a imagem na VPS

Conecte este projeto ao GitHub e copie seu código para a VPS (por clone do seu repositório ou upload do código). No terminal, dentro da pasta que contém `Dockerfile`:

```bash
docker build --pull -t fotogrer-agent:latest .
docker image inspect fotogrer-agent:latest --format '{{.Id}}'
```

Não use apenas o editor de stack para construir: ele não recebe os arquivos do projeto. A imagem precisa existir antes de instalar a stack. O Dockerfile já compila para Node e não copia arquivos `.env` nem dados locais.

## 3. Criar a stack no Portainer

Abra **Stacks → Add stack → Web editor**, nome `fotogrer-agent`, e cole o conteúdo de `docker-compose.yml`.

Em **Environment variables**, cadastre:

| Variável | Valor |
| --- | --- |
| `DB_PASSWORD` | Uma senha forte nova para o banco do aplicativo |
| `MYSQL_ROOT_PASSWORD` | Outra senha forte, diferente da anterior |
| `LOVABLE_CRON_SECRET` | Um segredo aleatório para a rotina de inatividade |
| `TRAEFIK_NETWORK` | Nome da rede externa usada pelo Traefik (padrão `traefik_public`) |
| `TRAEFIK_ENTRYPOINT` | Ponto de entrada HTTPS do Traefik (padrão `websecure`) |
| `TRAEFIK_CERTRESOLVER` | Emissor de certificado do Traefik (padrão `letsencrypt`) |

Para gerar cada um dos três segredos, execute separadamente `openssl rand -hex 32` no terminal da VPS. Guarde os valores em local seguro; não publique senhas no repositório.

Clique **Deploy the stack**. Não marque a opção de forçar a busca da imagem do aplicativo em um registro público: ela foi construída localmente. MySQL e o serviço de inatividade são baixados normalmente.

## 4. Primeiro acesso e conexões

Aguarde MySQL e aplicativo ficarem saudáveis e abra **https://agente.evenon.com.br**. Use o usuário `admin` e a senha inicial já combinada; troque-a imediatamente em **Minha conta**.

O banco e a tabela `app_data` são criados automaticamente. Esta instalação usa MySQL na sua VPS e **não precisa das variáveis públicas de Lovable Cloud enviadas no chat**. Essas variáveis, sozinhas, não dão acesso aos dados privados e não migram os dados existentes.

**É uma instalação nova:** usuários adicionais, conversas, conhecimento, chaves e relatórios que estão na hospedagem atual não são copiados automaticamente. Não desligue a instalação atual antes de preparar a transferência dos dados, caso queira preservá-los.

Configure Gemini/OpenAI/Ollama e Evolution/YCloud em **Chaves e conexões**. Copie a URL de webhook mostrada pelo aplicativo já neste domínio:

- Evolution: `https://agente.evenon.com.br/api/public/evolution/webhook?token=TOKEN_DO_PAINEL`
- YCloud: `https://agente.evenon.com.br/api/public/ycloud/webhook?token=TOKEN_DO_PAINEL`
- Chatwoot, se usado: `https://agente.evenon.com.br/api/public/chatwoot/webhook?token=TOKEN_DO_PAINEL`

`TOKEN_DO_PAINEL` é apenas indicação; copie o endereço completo fornecido pelo painel. No Evolution, deixe **Webhook by Events desligado** e habilite o evento de mensagens conforme sua configuração atual.

## 5. Conferência

- Faça login, teste uma pergunta na aba Testar e confira o consumo no Dashboard.
- Envie uma mensagem real pelo WhatsApp e confirme que chega no Atendimento e recebe resposta.
- Confira os logs do serviço `cron`: ele chama a rotina autenticada a cada minuto, mesmo com o painel fechado.
- O banco não publica porta externa e somente o aplicativo é exposto pelo Traefik.

## 6. Atualizações e backup

Antes de atualizar, faça backup do MySQL e dos volumes `mysql_data` e `app_data`, pelo seu procedimento de backup da VPS. Nunca exclua os volumes ao remover/recriar a stack: isso apaga os dados.

Copie o código atualizado para a pasta da VPS e reconstrua a imagem:

```bash
docker build --pull -t fotogrer-agent:latest .
```

No Portainer, recrie **somente o contêiner do aplicativo**, usando a imagem local nova e mantendo os volumes e as variáveis. Não use “Pull latest image” para a imagem local. Alterar as variáveis de senha do MySQL não muda a senha de um banco já inicializado; uma troca futura precisa ser feita também dentro do MySQL.

## Problemas comuns

- **Imagem não encontrada:** construa a imagem no mesmo host Docker selecionado no Portainer.
- **Rede externa não encontrada:** informe a rede existente do Traefik em `TRAEFIK_NETWORK`.
- **404/erro de certificado:** confira DNS, nomes de `entrypoint` e `certresolver`, logs do Traefik e portas 80/443.
- **Banco não saudável:** confira senhas e logs do MySQL; não exclua volumes para resolver sem backup.
- **Stack no Swarm:** este arquivo não é para Swarm; nesse caso é necessário publicar a imagem em um registro e adaptar serviços/rede overlay.
