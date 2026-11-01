-- Rode DEPOIS de criar o usuário do barbeiro em Authentication > Users > Add user:
--   e-mail: barbeiro-peaky@example.com   senha: peaky- seguido da senha que o barbeiro vai digitar no app
--   (marque "Auto Confirm User"). Exemplo: se o barbeiro digita ABC123, cadastre peaky-ABC123. Serviços, horários e Pix
-- você cadastra depois, pelo painel (próxima etapa) ou editando as tabelas no Supabase.
with nova as (
  insert into establishments (slug, name, city) values ('peaky', 'BARBEARIA PEAKY', 'Santana de Parnaíba, SP')
  returning id
)
insert into staff (user_id, establishment_id)
select u.id, nova.id from auth.users u, nova where u.email = 'barbeiro-peaky@example.com';

-- Serviços de exemplo. Ficam DESATIVADOS e com preço 0: defina o preço em
-- GERENCIAR SERVIÇOS e ative. Rode este bloco depois do 003_servicos.sql.
insert into services (establishment_id, name, price_cents, duration_min, active)
select e.id, v.nome, 0, v.dur, false
from establishments e,
     (values ('Corte de cabelo', 30), ('Barba', 20), ('Luzes', 90), ('Corte + barba', 50)) as v(nome, dur)
where e.slug = 'peaky';
