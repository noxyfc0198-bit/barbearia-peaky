# O que foi testado e o que falta

Testado (no ambiente de geração):
- Sintaxe de todos os arquivos TypeScript/TSX (sem erros).
- Funções de preço, data e hora (testes em Node na etapa anterior).

NÃO testado (sem internet, banco ou navegador no ambiente):
- npm install, build e execução do app; PWA instalado.
- Todos os arquivos SQL (001, 003, 004, 005) em um Postgres real.
- Login do barbeiro, RLS, reserva sem duplicidade, remarcação, Pix com comprovante, QR Code.
- Aparência no celular e vídeo de fundo.
Rode o checklist do README no seu Supabase e me avise de qualquer erro.

## Pix automático (etapa atual)
Testado: assinatura HMAC do webhook contra um cálculo independente (aceita a certa; recusa adulterada, id diferente, segredo errado e ausência de cabeçalho); conversão de valores para centavos; sintaxe de todo o TypeScript.
NÃO testado: chamadas reais ao Mercado Pago, as 3 funções rodando no Supabase, `007_pix_automatico.sql` em um Postgres, o webhook real e o tempo real. Nenhum pagamento foi feito ou simulado. Siga o "Teste com dinheiro real" de docs/PIX_AUTOMATICO.md.

## Etapa Supabase (projeto scbwmyylzdudnunkbtco)
Preparado: setup_completo.sql (soma das migrações 001, 003 a 008), teste_rapido.sql, URL do projeto como padrão no código, config.toml das funções.
NÃO executado por mim: nenhum SQL foi rodado em Postgres/Supabase, nenhum login, reserva ou Pix foi feito. Eu não tenho acesso ao seu projeto nem à sua chave. O teste_rapido.sql e o CHECKLIST_TESTES.md servem para você validar.

## Prontidão para publicar (conferida por leitura e verificações simples)
Conferido: correção do ConfigAdmin presente; package.json e vercel.json válidos; arquivos exigidos pelo build existem; nenhum import quebrado; todas as 14 telas têm rota; nenhuma chave secreta no pacote; .env.example só com a URL e a chave em branco.
NÃO executado: `npm install` e `npm run build` (sem internet no ambiente de geração). O build foi configurado como `vite build`; a checagem de tipos completa (`npm run typecheck`) nunca foi rodada com as dependências instaladas e pode apontar ajustes.
