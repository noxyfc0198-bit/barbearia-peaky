# Agenda da Barbearia (multi-barbearia) — BARBEARIA PEAKY

PWA em React + TypeScript + Tailwind + Supabase. Cada barbearia tem o próprio endereço `/b/<slug>`.
Seu projeto Supabase: `https://scbwmyylzdudnunkbtco.supabase.co` (já configurado como padrão no código).

## O que o app faz
- Tela inicial com fundo animado (vídeo real opcional, veja `public/fundo/LEIA-ME.txt`), SOU CLIENTE / SOU BARBEIRO.
- Cliente: nome (obrigatório), telefone (opcional), aceite LGPD, sem senha (código secreto no aparelho). Vê serviços ativos, agenda (serviço > data > hora), cancela, remarca, vê histórico, paga por Pix (automático ou manual) e pode apagar os próprios dados.
- Barbeiro (login só com senha): agenda, confirmar/cancelar/finalizar, pagamento, serviços e preços, horários e intervalos, bloqueios, clientes, configurações e Pix, QR Code.
- Preço sempre vem do banco; cada agendamento guarda o preço da hora da reserva.
- Pix automático (Mercado Pago) com webhook: `docs/PIX_AUTOMATICO.md`.

## PASSO A PASSO (tudo pelo navegador do celular)

### 1. Banco de dados
1. Supabase > SQL Editor > New query.
2. Abra `supabase/setup_completo.sql`, copie tudo, cole e toque em Run. (Em projeto vazio. Se der erro, me mande a mensagem.)

### 2. Usuário do barbeiro
1. Authentication > Users > Add user > Create new user. Marque **Auto Confirm User**.
   - E-mail: `barbeiro-peaky@example.com`
   - Senha: `peaky-` + a senha que o barbeiro vai digitar no app. Se ele digita `ABC12345`, cadastre `peaky-ABC12345`. (O Supabase exige 6+ caracteres; o app acrescenta o prefixo sozinho.) Use 8+ caracteres; senha curta pode ser descoberta por tentativas.
2. SQL Editor: rode `supabase/002_criar_barbearia.sql` (cria a barbearia `peaky`, liga o barbeiro a ela e cria 4 serviços desativados, sem preço).
3. Authentication > Sign In / Providers: desative "Allow new users to sign up" (só o barbeiro precisa de conta).

### 3. Chave publicável (segura de colocar no app)
1. Supabase > Project Settings > API Keys: copie a **Publishable key** (`sb_publishable_...`). Ou, em projetos antigos, a chave **anon public**.
2. NUNCA use nem cole em arquivo a chave **secret** / **service_role**.
3. Local: copie `.env.example` para `.env` e cole a chave em `VITE_SUPABASE_PUBLISHABLE_KEY`. Na Vercel: Settings > Environment Variables (veja abaixo).

### 4. Publicar de graça (Vercel)  — passo a passo completo em `docs/PUBLICAR_VERCEL.md`
1. Envie o projeto para um repositório no GitHub (descompacte o ZIP antes; no Chrome: Add file > Upload files) ou use o Claude Code no app.
2. Vercel > Add New > Project > escolha o repositório > Environment Variables:
   `VITE_SUPABASE_URL` = a URL acima, `VITE_SUPABASE_PUBLISHABLE_KEY` = a chave publicável, `VITE_DEFAULT_SLUG` = `peaky`. Deploy.
3. No Chrome do Android, abra o link > menu > Instalar app.

### 5. Primeiro uso (como barbeiro)
Entre com a senha e faça, nesta ordem: CONFIGURAÇÕES E PIX (nome e chave Pix), HORÁRIOS (dias, expediente e intervalo), GERENCIAR SERVIÇOS (defina preço e ative). Só então o cliente verá horários.

### 6. Testar
Veja `docs/CHECKLIST_TESTES.md` e rode `supabase/teste_rapido.sql` (testa cadastro, reserva, duplicado, preço e cancelamento no banco).

## Pix
- **Manual (padrão):** chave Pix + comprovante; só o barbeiro confirma "Pago".
- **Automático:** conecte o Mercado Pago em `docs/PIX_AUTOMATICO.md`. Sem isso o app usa o manual.

## Vídeo de fundo (pessoas reais)
Coloque `barbearia.mp4` em `public/fundo/` (fontes gratuitas em `LEIA-ME.txt`). Sem o arquivo, o app mostra um salão sem pessoas.

## LGPD
O cliente aceita o uso do nome e telefone (`customers.consent_at`) e pode apagar tudo em "Apagar meus dados". Só o barbeiro da barbearia vê os clientes dela (RLS).

## Segurança: pontos de atenção
- Cliente sem senha: o código secreto fica no aparelho. Se trocar de celular perde o acesso aos agendamentos antigos (o barbeiro ainda os vê).
- Uma agenda por barbearia (um profissional). Vários barbeiros na mesma barbearia exigem mudança na estrutura.
- Horários e bloqueios usam o fuso de Brasília (-03:00).
- Comprovante manual: imagem reduzida (~600 KB) guardada no banco.

## Revenda (R$ 30 por barbearia)
Cada barbearia nova = uma linha em `establishments` (novo `slug`), um usuário em Auth (`barbeiro-<slug>@example.com`) e uma linha em `staff`.
