# Checklist de testes (faça nesta ordem)

## A. Banco (no Supabase)
1. SQL Editor > rode `supabase/teste_rapido.sql`. Cada linha deve dizer OK.
2. Table Editor: confira que as tabelas têm o ícone de cadeado (RLS ligada): establishments, staff, services, business_hours, blocked_slots, customers, appointments, payments, establishment_pix, establishment_secrets, payment_events.

## B. Segurança (o que NÃO pode acontecer)
1. Em janela anônima do navegador, abra o app como cliente e confirme que só aparecem os SEUS agendamentos.
2. Tente abrir `/b/peaky/painel/agenda` sem login: deve voltar para a tela do barbeiro.
3. No Supabase > SQL Editor: `select * from establishment_secrets;` só funciona para você (dono do projeto); o app nunca consegue ler essa tabela.

## C. Fluxo do app (celular)
1. Barbeiro: entrar com a senha, cadastrar chave Pix, horários e ativar um serviço com preço.
2. Cliente (outro navegador/aparelho): cadastrar nome, escolher serviço, data, hora, confirmar. Aparece em "Próximos".
3. Barbeiro: o agendamento aparece na Agenda (nome, telefone se informado, serviço, preço, pagamento).
4. Cliente B tenta o mesmo horário: deve ser barrado.
5. Cliente cancela: horário volta a ficar livre. Remarca: confere a disponibilidade de novo.
6. Barbeiro muda o preço do serviço: novos agendamentos usam o novo valor; o antigo mantém o preço original.
7. Barbeiro bloqueia um horário: o cliente não consegue marcar nele.
8. QR Code: baixar, ler com outro celular e abrir o agendamento.
9. Cliente: "Apagar meus dados" apaga cadastro e agendamentos dele.

## D. Pix
- Manual: cliente copia a chave, envia comprovante (fica "Em análise"); só o barbeiro marca "Pago".
- Automático: siga o teste com R$ 1,00 em `docs/PIX_AUTOMATICO.md`.
