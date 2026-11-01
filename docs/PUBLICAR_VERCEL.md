# Publicar na Vercel (grátis) pelo celular

## 1. Colocar o projeto no GitHub
1. Descompacte o `barbearia-peaky.zip` no app Arquivos do Android.
2. github.com > New repository (privado) > "uploading an existing file". Envie **o conteúdo** da pasta `peaky` (index.html, package.json, src, public, supabase, docs, vercel.json...). Não envie `node_modules` nem `.env`.

## 2. Importar na Vercel
1. vercel.com > Add New > Project > escolha o repositório.
2. A Vercel reconhece sozinha: Framework **Vite**, Build Command `npm run build`, Output Directory `dist`. Não mude.
3. Em **Environment Variables**, antes do primeiro deploy:
   - `VITE_SUPABASE_URL` = `https://scbwmyylzdudnunkbtco.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = sua chave `sb_publishable_...`
   - `VITE_DEFAULT_SLUG` = `peaky`
4. Deploy.

## 3. Depois de publicar
- Mudou ou criou uma variável? Deployments > menu do último deploy > **Redeploy** (o Vite grava as variáveis na hora do build).
- No Chrome do Android: abra o link > menu > **Instalar app**.
- Entre como barbeiro > QR CODE para baixar o QR do endereço publicado.
- O `vercel.json` faz as rotas (`/b/peaky/...`) funcionarem ao recarregar a página.

## Se o build falhar
Abra o deploy com erro > Build Logs e me mande as últimas 20 linhas. O build roda `vite build`; a checagem de tipos fica à parte (`npm run typecheck`) para não travar a publicação por um detalhe de tipo.
