-- TESTE RÁPIDO (SQL Editor). Rode DEPOIS de setup_completo.sql e 002, com 1 serviço ATIVO (preço > 0)
-- e horários de funcionamento cadastrados. Cria um cliente de teste, reserva, tenta duplicar,
-- cancela e apaga o cliente de teste. Mostra OK/FALHOU em cada passo.
create temp table r (n serial, passo text, resultado text);
do $$
declare est uuid; sv services; tok text; dia date; ini timestamptz; ap uuid; preco int; livre boolean;
begin
  select id into est from establishments where slug = 'peaky';
  if est is null then insert into r (passo, resultado) values ('barbearia peaky existe', 'FALHOU: rode o 002_criar_barbearia.sql'); return; end if;
  insert into r (passo, resultado) values ('barbearia peaky existe', 'OK');

  select * into sv from services where establishment_id = est and active limit 1;
  if sv.id is null then insert into r (passo, resultado) values ('serviço ativo', 'FALHOU: ative um serviço com preço (painel ou tabela services)'); return; end if;
  insert into r (passo, resultado) values ('serviço ativo', 'OK: ' || sv.name);

  select d::date into dia from generate_series(current_date + 1, current_date + 14, interval '1 day') d
   where exists (select 1 from business_hours h where h.establishment_id = est and h.weekday = extract(dow from d)) limit 1;
  if dia is null then insert into r (passo, resultado) values ('horários de funcionamento', 'FALHOU: cadastre no painel (HORÁRIOS)'); return; end if;
  insert into r (passo, resultado) values ('horários de funcionamento', 'OK: testando o dia ' || dia);

  tok := register_customer('peaky', 'Cliente de Teste', null, true);
  insert into r (passo, resultado) values ('cadastro do cliente', case when tok is not null then 'OK' else 'FALHOU' end);

  select slot into ini from get_available_slots('peaky', sv.id, dia) order by slot limit 1;
  if ini is null then insert into r (passo, resultado) values ('horários livres', 'FALHOU: nenhum horário livre no dia'); end if;
  if ini is not null then
    insert into r (passo, resultado) values ('horários livres', 'OK: primeiro às ' || ini);
    ap := book_appointment(tok, sv.id, ini);
    insert into r (passo, resultado) values ('reserva criada', case when ap is not null then 'OK' else 'FALHOU' end);

    begin
      perform book_appointment(tok, sv.id, ini);
      insert into r (passo, resultado) values ('duplicado barrado', 'FALHOU: aceitou o mesmo horário duas vezes');
    exception when others then
      insert into r (passo, resultado) values ('duplicado barrado', 'OK: ' || sqlerrm);
    end;

    select price_cents into preco from appointments where id = ap;
    insert into r (passo, resultado) values ('preço gravado vem do servidor', case when preco = sv.price_cents then 'OK: ' || preco else 'FALHOU' end);

    perform cancel_appointment(tok, ap);
    select exists (select 1 from get_available_slots('peaky', sv.id, dia) where slot = ini) into livre;
    insert into r (passo, resultado) values ('cancelar libera o horário', case when livre then 'OK' else 'FALHOU' end);
  end if;

  delete from customers where token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex');
  insert into r (passo, resultado) values ('limpeza do cliente de teste', 'OK');
exception when others then
  insert into r (passo, resultado) values ('ERRO inesperado', sqlerrm);
end $$;
select passo, resultado from r order by n;
