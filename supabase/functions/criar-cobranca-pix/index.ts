// Cria uma cobrança Pix dinâmica (Mercado Pago) com o valor exato do agendamento.
// O Access Token fica só aqui no servidor (tabela establishment_secrets). O app nunca o vê.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function sha256hex(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { token, appointment_id } = await req.json()
    if (typeof token !== 'string' || typeof appointment_id !== 'string') return json({ erro: 'dados_invalidos' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // 1) Quem é o cliente (pelo código secreto do aparelho, comparado por hash).
    const { data: cli } = await admin.from('customers').select('id').eq('token_hash', await sha256hex(token)).maybeSingle()
    if (!cli) return json({ erro: 'cliente_invalido' }, 403)

    // 2) O pagamento tem que ser DESTE cliente e o valor vem do banco, nunca do celular.
    const { data: pg } = await admin.from('payments')
      .select('id, establishment_id, amount_cents, status, pix_copia_cola, pix_qr_base64, pix_expires_at, pix_attempt, appointments!inner(customer_id, status, service_name)')
      .eq('appointment_id', appointment_id).maybeSingle()
    // deno-lint-ignore no-explicit-any
    const ap: any = Array.isArray((pg as any)?.appointments) ? (pg as any).appointments[0] : (pg as any)?.appointments
    if (!pg || !ap || ap.customer_id !== cli.id) return json({ erro: 'pagamento_nao_encontrado' }, 404)
    if (pg.status === 'paid') return json({ status: 'paid' })
    if (!['pending', 'confirmed'].includes(ap.status) || pg.status === 'cancelled') return json({ erro: 'agendamento_invalido' }, 409)

    // 3) Credenciais da barbearia (servidor).
    const { data: seg } = await admin.from('establishment_secrets').select('mp_access_token').eq('establishment_id', pg.establishment_id).maybeSingle()
    if (!seg) return json({ erro: 'pix_automatico_nao_configurado' }, 409)

    // 4) Reaproveita a cobrança ainda válida (não gera Pix repetido).
    if (pg.pix_copia_cola && pg.pix_qr_base64 && pg.pix_expires_at && new Date(pg.pix_expires_at).getTime() > Date.now() + 60_000) {
      return json({ status: 'awaiting', copia_cola: pg.pix_copia_cola, qr_base64: pg.pix_qr_base64, expira_em: pg.pix_expires_at, valor_cents: pg.amount_cents })
    }

    const tentativa = (pg.pix_attempt ?? 0) + 1
    const expira = new Date(Date.now() + 30 * 60_000)
    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${seg.mp_access_token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${pg.id}-${tentativa}`
      },
      body: JSON.stringify({
        transaction_amount: pg.amount_cents / 100,
        description: String(ap.service_name ?? 'Agendamento').slice(0, 60),
        payment_method_id: 'pix',
        payer: { email: `cliente.${String(cli.id).slice(0, 8)}@example.com` },
        external_reference: pg.id, // identificador exclusivo deste pagamento
        notification_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-pix?est=${pg.establishment_id}`,
        date_of_expiration: expira.toISOString().replace('Z', '+00:00')
      })
    })
    if (!res.ok) {
      console.error('Mercado Pago recusou a cobrança', res.status, (await res.text()).slice(0, 500))
      return json({ erro: 'provedor_recusou' }, 502)
    }
    const mp = await res.json()
    const dados = mp?.point_of_interaction?.transaction_data
    if (!dados?.qr_code || !dados?.qr_code_base64) return json({ erro: 'provedor_sem_qr' }, 502)

    await admin.from('payments').update({
      provider: 'mercadopago', provider_payment_id: String(mp.id), pix_copia_cola: dados.qr_code,
      pix_qr_base64: dados.qr_code_base64, pix_expires_at: expira.toISOString(), pix_attempt: tentativa
    }).eq('id', pg.id)

    return json({ status: 'awaiting', copia_cola: dados.qr_code, qr_base64: dados.qr_code_base64, expira_em: expira.toISOString(), valor_cents: pg.amount_cents })
  } catch (e) {
    console.error('criar-cobranca-pix', e)
    return json({ erro: 'erro_interno' }, 500)
  }
})
