// O barbeiro (logado) conecta a conta Mercado Pago da barbearia. Os dados ficam só no servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u?.user) return json({ erro: 'nao_autenticado' }, 401)
    const { data: st } = await admin.from('staff').select('establishment_id').eq('user_id', u.user.id).maybeSingle()
    if (!st) return json({ erro: 'sem_permissao' }, 403)

    const { acao, access_token, webhook_secret } = await req.json()

    if (acao === 'status') {
      const { data: s } = await admin.from('establishment_secrets').select('mp_user_id').eq('establishment_id', st.establishment_id).maybeSingle()
      return json({ conectado: !!s, conta: s?.mp_user_id ?? null })
    }

    if (acao === 'salvar') {
      if (typeof access_token !== 'string' || access_token.length < 20 || typeof webhook_secret !== 'string' || webhook_secret.length < 8) {
        return json({ erro: 'dados_invalidos' }, 400)
      }
      // Confere o token no próprio Mercado Pago antes de guardar.
      const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${access_token}` } })
      if (!r.ok) return json({ erro: 'token_recusado' }, 422)
      const conta = await r.json()
      const { error } = await admin.from('establishment_secrets').upsert({
        establishment_id: st.establishment_id, mp_access_token: access_token, mp_webhook_secret: webhook_secret,
        mp_user_id: String(conta.id ?? ''), updated_at: new Date().toISOString()
      })
      if (error) return json({ erro: 'erro_banco' }, 500)
      return json({ conectado: true, conta: String(conta.id ?? '') })
    }

    if (acao === 'remover') {
      await admin.from('establishment_secrets').delete().eq('establishment_id', st.establishment_id)
      return json({ conectado: false })
    }
    return json({ erro: 'acao_invalida' }, 400)
  } catch (e) {
    console.error('salvar-credenciais-pix', e)
    return json({ erro: 'erro_interno' }, 500)
  }
})
