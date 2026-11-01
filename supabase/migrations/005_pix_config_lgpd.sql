-- Rode depois do 004. Pix, intervalos, consentimento (LGPD) e exclusão de dados.

alter table business_hours add column break_start time, add column break_end time;
alter table customers add column consent_at timestamptz;
alter table payments add column proof_data text, add column proof_at timestamptz;

-- Horários livres agora respeitam o intervalo (almoço) de cada dia.
create or replace function _slots(est uuid, p_service uuid, p_date date)
returns table (slot timestamptz)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select e.timezone tz, h.opens, h.closes, h.break_start bs, h.break_end be, s.duration_min d
    from establishments e
    join business_hours h on h.establishment_id = e.id and h.weekday = extract(dow from p_date)
    join services s on s.id = p_service and s.establishment_id = e.id and s.active
    where e.id = est
  )
  select g from cfg,
    generate_series((p_date + opens) at time zone tz,
                    (p_date + closes) at time zone tz - make_interval(mins => d),
                    interval '30 minutes') g
  where g > now()
    and not exists (select 1 from appointments a where a.establishment_id = est and a.status <> 'cancelled'
                    and tstzrange(a.starts_at, a.ends_at) && tstzrange(g, g + make_interval(mins => d)))
    and not exists (select 1 from blocked_slots b where b.establishment_id = est
                    and tstzrange(b.starts_at, b.ends_at) && tstzrange(g, g + make_interval(mins => d)))
    and (bs is null or be is null or not (
          tstzrange(g, g + make_interval(mins => d)) && tstzrange((p_date + bs) at time zone tz, (p_date + be) at time zone tz)))
  order by g
$$;

-- Cadastro agora exige o aceite do uso dos dados (LGPD).
drop function if exists register_customer(text, text, text);
create function register_customer(p_slug text, p_name text, p_phone text, p_consent boolean) returns text
language plpgsql security definer set search_path = public as $$
declare est uuid; tok text;
begin
  if p_consent is not true then raise exception 'consentimento_obrigatorio'; end if;
  select id into est from establishments where slug = p_slug;
  if est is null then raise exception 'barbearia_nao_encontrada'; end if;
  if length(trim(p_name)) < 3 then raise exception 'nome_invalido'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into customers (establishment_id, full_name, phone, token_hash, consent_at)
  values (est, trim(p_name), nullif(trim(p_phone), ''), encode(sha256(convert_to(tok, 'utf8')), 'hex'), now());
  return tok;
end $$;

-- Comprovante Pix: o cliente envia uma imagem (reduzida no celular). Isso NÃO confirma o pagamento:
-- só muda para "Em análise". Quem confirma é o barbeiro.
create function submit_payment_proof(p_token text, p_appointment uuid, p_proof text) returns void
language plpgsql security definer set search_path = public as $$
declare c customers;
begin
  c := _cliente(p_token);
  if c.id is null then raise exception 'cliente_invalido'; end if;
  if p_proof is null or length(p_proof) > 600000 or p_proof not like 'data:image/%' then
    raise exception 'comprovante_invalido';
  end if;
  update payments set proof_data = p_proof, proof_at = now(), status = 'review'
  where appointment_id = p_appointment and status in ('awaiting', 'review')
    and exists (select 1 from appointments a where a.id = p_appointment and a.customer_id = c.id
                and a.status in ('pending', 'confirmed'));
  if not found then raise exception 'pagamento_invalido'; end if;
end $$;

-- LGPD: o cliente apaga os próprios dados (agendamentos e pagamentos dele vão junto).
create function delete_my_data(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare c customers;
begin
  c := _cliente(p_token);
  if c.id is null then raise exception 'cliente_invalido'; end if;
  delete from customers where id = c.id;
end $$;

revoke execute on function register_customer(text, text, text, boolean), submit_payment_proof(text, uuid, text),
  delete_my_data(text) from public;
grant execute on function register_customer(text, text, text, boolean), submit_payment_proof(text, uuid, text),
  delete_my_data(text) to anon, authenticated;
