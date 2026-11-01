-- INSTALAÇÃO COMPLETA (cole tudo no Supabase > SQL Editor > New query > Run).
-- É a soma, na ordem certa, de 001, 003, 004, 005, 006, 007 e 008. Depois rode 002_criar_barbearia.sql.
-- Use em um projeto NOVO/vazio. Rodar duas vezes dá erro de tabela já existente.

-- ===================== 001_schema =====================
-- Agenda multi-barbearia. Rode no Supabase: SQL Editor > New query > colar > Run.
create extension if not exists btree_gist;

create table establishments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  city text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now()
);

-- A chave Pix fica separada: nunca é lida diretamente por clientes.
create table establishment_pix (
  establishment_id uuid primary key references establishments on delete cascade,
  pix_key text not null,
  holder_name text
);

create table staff (
  user_id uuid primary key references auth.users on delete cascade,
  establishment_id uuid not null references establishments on delete cascade,
  role text not null default 'owner'
);

create table services (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  name text not null,
  price_cents int not null check (price_cents >= 0),
  duration_min int not null check (duration_min between 5 and 480),
  active boolean not null default true
);

create table business_hours (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens time not null,
  closes time not null,
  unique (establishment_id, weekday)
);

create table blocked_slots (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  full_name text not null,
  phone text,
  token_hash text unique not null,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references establishments on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  service_id uuid not null references services,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','confirmed','cancelled','done')),
  created_at timestamptz not null default now(),
  -- Impede dois agendamentos no mesmo horário (uma agenda por barbearia nesta versão).
  constraint sem_conflito exclude using gist (
    establishment_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled')
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid unique not null references appointments on delete cascade,
  establishment_id uuid not null references establishments on delete cascade,
  amount_cents int not null,
  status text not null default 'awaiting' check (status in ('awaiting','review','paid','cancelled')),
  proof_path text,
  confirmed_at timestamptz
);

-- Segurança (RLS)
create function is_staff_of(est uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and establishment_id = est)
$$;

alter table establishments enable row level security;
alter table establishment_pix enable row level security;
alter table staff enable row level security;
alter table services enable row level security;
alter table business_hours enable row level security;
alter table blocked_slots enable row level security;
alter table customers enable row level security;
alter table appointments enable row level security;
alter table payments enable row level security;

create policy "publico le barbearias" on establishments for select using (true);
create policy "equipe edita barbearia" on establishments for update using (is_staff_of(id)) with check (is_staff_of(id));
create policy "equipe ve seu vinculo" on staff for select using (user_id = auth.uid());
create policy "publico le servicos ativos" on services for select using (active);
create policy "equipe gerencia servicos" on services for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));
create policy "publico le horarios" on business_hours for select using (true);
create policy "equipe gerencia horarios" on business_hours for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));
create policy "equipe gerencia pix" on establishment_pix for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));
create policy "equipe gerencia bloqueios" on blocked_slots for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));
create policy "equipe ve clientes" on customers for select using (is_staff_of(establishment_id));
create policy "equipe gerencia agendamentos" on appointments for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));
create policy "equipe gerencia pagamentos" on payments for all using (is_staff_of(establishment_id)) with check (is_staff_of(establishment_id));

-- Funções para clientes (sem login). O cliente prova quem é com um código secreto
-- guardado no aparelho; o banco guarda só o hash. Clientes nunca leem as tabelas direto.
create function _cliente(p_token text) returns customers
language sql stable security definer set search_path = public as $$
  select * from customers where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
$$;

create function register_customer(p_slug text, p_name text, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare est uuid; tok text;
begin
  select id into est from establishments where slug = p_slug;
  if est is null then raise exception 'barbearia_nao_encontrada'; end if;
  if length(trim(p_name)) < 3 then raise exception 'nome_invalido'; end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into customers (establishment_id, full_name, phone, token_hash)
  values (est, trim(p_name), nullif(trim(p_phone), ''), encode(sha256(convert_to(tok, 'utf8')), 'hex'));
  return tok;
end $$;

create function _slots(est uuid, p_service uuid, p_date date)
returns table (slot timestamptz)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select e.timezone tz, h.opens, h.closes, s.duration_min d
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
  order by g
$$;

create function get_available_slots(p_slug text, p_service uuid, p_date date)
returns table (slot timestamptz)
language sql stable security definer set search_path = public as $$
  select s.slot from establishments e, lateral _slots(e.id, p_service, p_date) s where e.slug = p_slug
$$;

create function book_appointment(p_token text, p_service uuid, p_starts_at timestamptz) returns uuid
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
  insert into appointments (establishment_id, customer_id, service_id, starts_at, ends_at)
  values (c.establishment_id, c.id, sv.id, p_starts_at, p_starts_at + make_interval(mins => sv.duration_min))
  returning id into appt;
  insert into payments (appointment_id, establishment_id, amount_cents) values (appt, c.establishment_id, sv.price_cents);
  return appt;
exception when exclusion_violation then
  raise exception 'horario_indisponivel';
end $$;

create function my_appointments(p_token text)
returns table (id uuid, starts_at timestamptz, ends_at timestamptz, service_name text,
               price_cents int, status text, payment_status text)
language sql stable security definer set search_path = public as $$
  select a.id, a.starts_at, a.ends_at, s.name, s.price_cents, a.status, p.status
  from appointments a
  join services s on s.id = a.service_id
  left join payments p on p.appointment_id = a.id
  where a.customer_id = (_cliente(p_token)).id
  order by a.starts_at desc
$$;

create function cancel_appointment(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := (_cliente(p_token)).id;
begin
  update appointments set status = 'cancelled'
  where id = p_id and customer_id = cid and status in ('pending','confirmed');
  if not found then raise exception 'nao_foi_possivel_cancelar'; end if;
  update payments set status = 'cancelled' where appointment_id = p_id and status <> 'paid';
end $$;

create function get_pix_info(p_token text, p_appointment uuid)
returns table (pix_key text, holder_name text, amount_cents int)
language sql stable security definer set search_path = public as $$
  select x.pix_key, x.holder_name, p.amount_cents
  from appointments a
  join payments p on p.appointment_id = a.id
  join establishment_pix x on x.establishment_id = a.establishment_id
  where a.id = p_appointment and a.customer_id = (_cliente(p_token)).id
$$;

-- Só as funções públicas ficam liberadas para visitantes.
revoke execute on all functions in schema public from public;
grant execute on function register_customer, get_available_slots, book_appointment,
  my_appointments, cancel_appointment, get_pix_info to anon, authenticated;
grant execute on function is_staff_of to authenticated;

-- ===================== 003_servicos =====================
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

-- ===================== 004_agendamento =====================
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

-- ===================== 005_pix_config_lgpd =====================
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

-- ===================== 006_pix_tipo =====================
-- Rode depois do 005. Tipo da chave Pix e nome da barbearia na tela de pagamento.
alter table establishment_pix add column key_type text;

drop function if exists get_pix_info(text, uuid);
create function get_pix_info(p_token text, p_appointment uuid)
returns table (pix_key text, holder_name text, key_type text, establishment_name text, amount_cents int)
language sql stable security definer set search_path = public as $$
  select x.pix_key, x.holder_name, x.key_type, e.name, p.amount_cents
  from appointments a
  join payments p on p.appointment_id = a.id
  join establishment_pix x on x.establishment_id = a.establishment_id
  join establishments e on e.id = a.establishment_id
  where a.id = p_appointment and a.customer_id = (_cliente(p_token)).id
$$;

revoke execute on function get_pix_info(text, uuid) from public;
grant execute on function get_pix_info(text, uuid) to anon, authenticated;

-- ===================== 007_pix_automatico =====================
-- Rode depois do 006. Pix automático (Mercado Pago): credenciais no servidor, cobranças e confirmação por webhook.

-- Credenciais de cada barbearia. Sem nenhuma policy e sem GRANT: o app (anon/authenticated) NUNCA lê esta tabela.
-- Só as Edge Functions (service_role) acessam.
create table establishment_secrets (
  establishment_id uuid primary key references establishments on delete cascade,
  mp_access_token text not null,
  mp_webhook_secret text not null,
  mp_user_id text,
  updated_at timestamptz not null default now()
);
alter table establishment_secrets enable row level security;
revoke all on establishment_secrets from anon, authenticated;

alter table payments
  add column provider text,
  add column provider_payment_id text,
  add column pix_copia_cola text,
  add column pix_qr_base64 text,
  add column pix_expires_at timestamptz,
  add column pix_attempt int not null default 0,
  add column paid_via text;   -- 'pix_automatico' (webhook) ou 'manual' (barbeiro)

-- Cada evento de pagamento é registrado uma única vez (impede confirmação duplicada).
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null unique,
  payment_id uuid references payments on delete set null,
  note text,
  created_at timestamptz not null default now()
);
alter table payment_events enable row level security;
revoke all on payment_events from anon, authenticated;

-- Única porta para marcar "pago" automaticamente: só o service_role (webhook) executa.
create function mark_payment_paid(p_payment_id uuid, p_provider_id text, p_amount_cents int, p_event_key text)
returns text
language plpgsql security definer set search_path = public as $$
declare p payments;
begin
  insert into payment_events (provider, event_key, payment_id) values ('mercadopago', p_event_key, p_payment_id)
  on conflict (event_key) do nothing;
  if not found then return 'duplicado'; end if;

  select * into p from payments where id = p_payment_id for update;
  if p.id is null then return 'nao_encontrado'; end if;
  if p.amount_cents <> p_amount_cents then
    update payment_events set note = 'valor_diferente' where event_key = p_event_key;
    return 'valor_diferente';
  end if;
  if p.status = 'paid' then return 'ja_pago'; end if;
  if p.status = 'cancelled' then
    update payment_events set note = 'pago_apos_cancelamento: devolver ao cliente' where event_key = p_event_key;
    return 'cancelado';
  end if;

  update payments set status = 'paid', confirmed_at = now(), paid_via = 'pix_automatico',
    provider = 'mercadopago', provider_payment_id = p_provider_id
  where id = p.id;
  return 'pago';
end $$;
revoke execute on function mark_payment_paid(uuid, text, int, text) from public, anon, authenticated;
grant execute on function mark_payment_paid(uuid, text, int, text) to service_role;

-- Painel do barbeiro em tempo real quando o pagamento mudar.
do $$ begin alter publication supabase_realtime add table payments; exception when others then null; end $$;

-- ===================== 008_ajustes =====================
-- Rode por último. Ajustes de permissão e desempenho.

-- As regras RLS chamam is_staff_of(); visitantes e logados precisam poder executá-la.
grant execute on function is_staff_of(uuid) to anon, authenticated;

create index if not exists appointments_cliente_idx on appointments (customer_id);
create index if not exists appointments_agenda_idx on appointments (establishment_id, starts_at);
create index if not exists customers_barbearia_idx on customers (establishment_id);
create index if not exists services_barbearia_idx on services (establishment_id);
