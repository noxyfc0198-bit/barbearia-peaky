# Pix automático (Mercado Pago)

## Como funciona
1. O cliente agenda e toca em PAGAR COM PIX.
2. O app chama a função `criar-cobranca-pix`. O servidor confere que o agendamento é do cliente, lê o valor no banco e pede ao Mercado Pago um Pix dinâmico (identificador exclusivo = id do pagamento, validade 30 min).
3. O cliente vê o QR Code e o botão COPIAR PIX.
4. Quando o cliente paga, o Mercado Pago avisa a função `webhook-pix`. Ela: (a) confere a assinatura HMAC do aviso; (b) consulta o pagamento direto na API do Mercado Pago; (c) confere que o pagamento é da barbearia certa e que o valor bate; (d) chama `mark_payment_paid`, que grava PAGO uma única vez.
5. A tela do cliente e o painel do barbeiro (tempo real) mostram PAGO.
6. Sem confirmação do provedor, o pagamento continua AGUARDANDO PAGAMENTO. Comprovante enviado pelo cliente nunca marca PAGO.

## Onde o dinheiro cai
Na conta **Mercado Pago do estabelecimento** (cada barbearia usa as próprias credenciais). De lá o dono transfere para o banco quando quiser. Confira no Mercado Pago as tarifas do Pix e o prazo de liberação da sua conta. Não é dinheiro que passa pela sua conta nem pela minha.

## Credenciais necessárias (por barbearia)
- **Access Token de produção** (começa com `APP_USR-`).
- **Assinatura secreta do webhook** (aparece quando você cadastra o webhook).
Elas são guardadas só no servidor (tabela `establishment_secrets`, sem acesso do app) e nunca vão para o celular.

## Passo a passo
### A. Conta Mercado Pago do estabelecimento
1. Crie ou use uma conta Mercado Pago do dono (CPF ou CNPJ) e conclua a verificação de identidade.
2. Cadastre uma chave Pix na conta e confirme que consegue receber Pix.

### B. Aplicação (credenciais)
1. Acesse mercadopago.com.br/developers > Suas integrações > Criar aplicação (tipo: pagamentos online / Checkout API).
2. Em Credenciais de produção, ative as credenciais (pode pedir dados do negócio) e copie o **Access Token**.

### C. Funções no Supabase (pelo navegador do celular)
1. Rode `supabase/migrations/007_pix_automatico.sql` no SQL Editor (depois do 006).
2. Supabase > Edge Functions > Deploy a new function > Via Editor. Crie 3 funções com **estes nomes exatos** e cole o conteúdo de cada `index.ts`:
   - `criar-cobranca-pix`
   - `webhook-pix`
   - `salvar-credenciais-pix`
   Nas configurações de **cada uma das 3**, desligue **Verify JWT** (a chave publicável não é um JWT; as funções já se protegem sozinhas).
3. Não precisa criar variáveis: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem dentro das funções.

### D. Webhook no Mercado Pago
1. No app, entre como barbeiro > CONFIGURAÇÕES E PIX. Copie o "Endereço de notificação" (termina com `?est=...`).
2. Mercado Pago > sua aplicação > Webhooks > Configurar notificações (modo produção): cole o endereço, marque o evento **Pagamentos** e salve.
3. Copie a **Assinatura secreta** que o Mercado Pago mostra.

### E. Conectar no app
Em CONFIGURAÇÕES E PIX > Pix automático: cole o Access Token e a Assinatura secreta > CONECTAR. O app valida o token no Mercado Pago antes de guardar.

## Teste com dinheiro real (obrigatório antes de usar com clientes)
Crie um serviço de R$ 1,00, agende como cliente, pague o QR Code e confira: a tela do cliente mostra "Pagamento confirmado" e a Agenda do barbeiro mostra "Pago (confirmado automaticamente pelo Pix)". Depois faça um teste de Pix que você NÃO paga: deve continuar "Aguardando pagamento".

## Casos tratados
- Webhook repetido: ignorado (tabela `payment_events`, chave única).
- Valor pago diferente do esperado: não marca PAGO.
- Pix pago depois de o agendamento ser cancelado: não marca PAGO; fica registrado em `payment_events` com a nota "devolver ao cliente". Você precisa devolver o valor pelo Mercado Pago.
- Pix expirado sem pagamento: continua AGUARDANDO; o cliente pode gerar outro.
- Barbearia sem Pix automático conectado: o cliente usa o Pix manual (chave + comprovante) e o barbeiro confirma.

## Limites
- Um e-mail genérico (`cliente.xxxx@example.com`) é enviado ao Mercado Pago como pagador; recibos por e-mail não chegam ao cliente.
- Não há limite de tentativas na função de gerar cobrança; para uso comercial, ative proteção de abuso no Supabase.
- Outros provedores (Asaas, Efí) funcionam de forma parecida, mas exigem outras funções.
