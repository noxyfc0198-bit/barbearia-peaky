-- Rode depois do 003. Agendamento completo do cliente.

-- Agora a lista do cliente também devolve o serviço (necessário para remarcar).
drop function if exists my_appointments(text);
create function my_appointments(p_token text)
returns table (id uuid, service_id uuid, starts_at timestamptz, ends_at timestamptz, service_name text,
               price_cents int, status text, payment_status text)
language sql stable security definer set search_path = public as $$
  select a.id, a.service_id, a.starts_at, a.ends_at, a.service_name, a.price_cents, a.status, p.status
  from appointments a
  left join payments p on p.appointment_id = a.id
  where a.customer_id = (_cliente(p_token)).id
  order by a.starts_at desc
$$;

-- Remarcação: mantém serviço e preço original; só troca o horário.
-- Tudo acontece numa transação: se o novo horário não estiver livre, nada muda.
create function reschedule_appointment(p_token text, p_id uuid, p_new_start timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare c customers; a appointments; tz text; dur interval;
begin
  c := _cliente(p_token);
  if c.id is null then raise exception 'cliente_invalido'; end if;
  select * into a from appointments
    where id = p_id and customer_id = c.id and status in ('pending','confirmed') for update;
  if a.id is null then raise exception 'agendamento_invalido'; end if;
  if a.service_id is null then raise exception 'servico_indisponivel'; end if;
  select timezone into tz from establishments where id = a.establishment_id;
  dur := a.ends_at - a.starts_at;
  -- libera o horário antigo só dentro desta transação, para o novo cálculo de vagas
  update appointments set status = 'cancelled' where id = a.id;
  if not exists (select 1 from _slots(a.establishment_id, a.service_id, (p_new_start at time zone tz)::date)
                 where slot = p_new_start) then
    raise exception 'horario_indisponivel';
  end if;
  update appointments set starts_at = p_new_start, ends_at = p_new_start + dur, status = a.status where id = a.id;
exception when exclusion_violation then
  raise exception 'horario_indisponivel';
end $$;

-- Funções internas não ficam expostas ao público; as públicas ficam liberadas.
revoke execute on function _cliente(text), _slots(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function reschedule_appointment(text, uuid, timestamptz) from public;
grant execute on function my_appointments(text), reschedule_appointment(text, uuid, timestamptz) to anon, authenticated;
