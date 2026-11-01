-- Rode depois do 001. Controle de serviços e histórico de preços.

alter table services add column photo_url text;
-- Um serviço só pode ficar ativo com preço maior que zero.
alter table services add constraint servico_ativo_com_preco check (not active or price_cents > 0);

-- O agendamento guarda uma cópia do nome e do preço da hora da reserva.
-- Assim, mudar ou excluir o serviço depois não altera o histórico.
alter table appointments add column service_name text;
alter table appointments add column price_cents int;
update appointments a set service_name = s.name, price_cents = s.price_cents from services s where s.id = a.service_id;
alter table appointments alter column service_name set not null;
alter table appointments alter column price_cents set not null;
alter table appointments alter column service_id drop not null;
alter table appointments drop constraint appointments_service_id_fkey;
alter table appointments add constraint appointments_service_id_fkey
  foreign key (service_id) references services (id) on delete set null;

-- O preço vem SEMPRE da tabela services, no servidor. A função não aceita valor do celular.
create or replace function book_appointment(p_token text, p_service uuid, p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare c customers; sv services; tz text; appt uuid;
begin
  c := _cliente(p_token);
  if c.id is null then raise exception 'cliente_invalido'; end if;
  select * into sv from services where id = p_service and establishment_id = c.establishment_id and active;
  if sv.id is null then raise exception 'servico_invalido'; end if;
  select timezone into tz from establishments where id = c.establishment_id;
  if not exists (select 1 from _slots(c.establishment_id, p_service, (p_starts_at at time zone tz)::date) where slot = p_starts_at) then
    raise exception 'horario_indisponivel';
  end if;
  insert into appointments (establishment_id, customer_id, service_id, service_name, price_cents, starts_at, ends_at)
  values (c.establishment_id, c.id, sv.id, sv.name, sv.price_cents, p_starts_at, p_starts_at + make_interval(mins => sv.duration_min))
  returning id into appt;
  insert into payments (appointment_id, establishment_id, amount_cents) values (appt, c.establishment_id, sv.price_cents);
  return appt;
exception when exclusion_violation then
  raise exception 'horario_indisponivel';
end $$;

-- A lista do cliente mostra o nome e o preço gravados no agendamento.
create or replace function my_appointments(p_token text)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, service_name text,
               price_cents int, status text, payment_status text)
language sql stable security definer set search_path = public as $$
  select a.id, a.starts_at, a.ends_at, a.service_name, a.price_cents, a.status, p.status
  from appointments a
  left join payments p on p.appointment_id = a.id
  where a.customer_id = (_cliente(p_token)).id
  order by a.starts_at desc
$$;
