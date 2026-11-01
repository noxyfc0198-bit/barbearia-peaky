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
