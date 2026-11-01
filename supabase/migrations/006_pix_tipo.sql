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
