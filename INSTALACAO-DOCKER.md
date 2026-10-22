# Instalação na VPS com Portainer + Traefik

O sistema roda em três partes: o próprio sistema, o banco de dados dele e um pequeno temporizador que verifica clientes inativos a cada minuto.

## Passo a passo

1. **Domínio:** aponte seu domínio (ex.: `agente.evenon.com.br`) para o IP da VPS.
2. **GitHub:** no Lovable, conecte o projeto ao GitHub (botão GitHub → Connect) e sincronize.
3. **Construir a imagem no terminal da VPS** (o Portainer não constrói a imagem, só usa a que já existe):

   ```bash
   git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git /opt/fotogrer-agent
   cd /opt/fotogrer-agent
   docker build -t fotogrer-agent:latest .
   ```

   A primeira construção leva alguns minutos. Para conferir: `docker images | grep fotogrer-agent`.

4. **Portainer:** vá em **Stacks → Add stack → Web editor** e cole o conteúdo do arquivo `docker-compose.yml`. Troque os seus valores:
   - `SEU_DOMINIO` → seu domínio
   - `TROQUE_SENHA_DB` → uma senha do banco (aparece 2 vezes)
   - `TROQUE_SENHA_ROOT` → outra senha
   - `TROQUE_SEGREDO_CRON` → qualquer frase secreta (aparece 2 vezes)
5. **Deploy:** clique em Deploy e abra `https://seudominio`. Login: `admin` / `Gui7845@@` (troque depois em Minha conta).
6. **Chaves:** cadastre novamente suas chaves (Gemini, Evolution ou YCloud, Chatwoot). Os dados atuais ficam no Lovable e não são transferidos. Atualize também o endereço do webhook no Evolution ou YCloud para o novo domínio (copie do painel em Chaves e conexões).

## Confira o Traefik

O arquivo considera que o Traefik usa a rede `OrionNet`, a entrada `websecure` e o certificado `letsencrypt`. Se os seus nomes forem outros, altere no arquivo antes do Deploy.

## Atualizar depois

No terminal da VPS, dentro da pasta do repositório:

```bash
cd /opt/fotogrer-agent
git pull
docker build -t fotogrer-agent:latest .
```

Depois, no Portainer, abra a stack e clique em **Pull and redeploy**.

## Problemas comuns

- **"pull access denied":** a imagem ainda não foi construída na VPS. Faça o passo 3 antes do Deploy.
- **"no image specified" / erro de build:** use "Web editor" no Portainer e garanta que a imagem `fotogrer-agent:latest` existe (`docker images`).
- **Rede não encontrada:** confira com `docker network ls` se o nome da rede do Traefik é `OrionNet`.
- **Erro de certificado / 404:** confira o domínio, o DNS e os nomes do Traefik.
- **Nunca apague os volumes** `mysql_data` e `app_data`: eles guardam seus dados.
