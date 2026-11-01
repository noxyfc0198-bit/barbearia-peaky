-- Rode por último. Ajustes de permissão e desempenho.

-- As regras RLS chamam is_staff_of(); visitantes e logados precisam poder executá-la.
grant execute on function is_staff_of(uuid) to anon, authenticated;

create index if not exists appointments_cliente_idx on appointments (customer_id);
create index if not exists appointments_agenda_idx on appointments (establishment_id, starts_at);
create index if not exists customers_barbearia_idx on customers (establishment_id);
create index if not exists services_barbearia_idx on services (establishment_id);
