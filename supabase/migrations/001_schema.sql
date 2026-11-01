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
