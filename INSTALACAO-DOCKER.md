# Instalação na VPS com Portainer + Traefik

O sistema roda em três partes: o próprio sistema, o banco de dados dele e um pequeno temporizador que verifica clientes inativos a cada minuto.

## Passo a passo

1. **Domínio:** aponte seu domínio (ex.: `agente.evenon.com.br`) para o IP da VPS.
2. **GitHub:** no Lovable, conecte o projeto ao GitHub (botão GitHub → Connect).
3. **Portainer:** vá em **Stacks → Add stack → Repository**. Cole o endereço do repositório do GitHub e use o arquivo `docker-compose.yml`.
4. **Troque no arquivo os seus valores:**
   - `SEU_DOMINIO` → seu domínio
   - `TROQUE_SENHA_DB` → uma senha do banco (aparece 2 vezes)
   - `TROQUE_SENHA_ROOT` → outra senha
   - `TROQUE_SEGREDO_CRON` → qualquer frase secreta (aparece 2 vezes)
5. **Deploy:** clique em Deploy e abra `https://seudominio`. Login: `admin` / `Gui7845@@` (troque depois em Minha conta).
6. **Chaves:** cadastre novamente suas chaves (Gemini, Evolution ou YCloud, Chatwoot). Os dados atuais ficam no Lovable e não são transferidos. Atualize também o endereço do webhook no Evolution ou YCloud para o novo domínio (copie do painel em Chaves e conexões).

## Confira o Traefik

O arquivo considera que o Traefik usa a rede `OrionNet`, a entrada `websecure` e o certificado `letsencrypt`. Se os seus nomes forem outros, altere no arquivo antes do Deploy.

## Atualizar depois

No Portainer, abra a stack e clique em **Pull and redeploy**.

## Problemas comuns

- **"pull access denied":** o Portainer não construiu a imagem. Confira se a stack usa o arquivo `docker-compose.yml` deste repositório (que tem `build: .`). Se persistir, construa manualmente: no terminal da VPS, clone o repositório, rode `docker build -t fotogrer-agent .` dentro da pasta e, no Portainer, use "Web editor" apontando `image: fotogrer-agent`.
- **Rede não encontrada:** confira com `docker network ls` se o nome da rede do Traefik é `OrionNet` (sua rede atual é OrionNet).
- **Erro de certificado / 404:** confira o domínio, o DNS e os nomes do Traefik.
- **Nunca apague os volumes** `mysql_data` e `app_data`: eles guardam seus dados.
