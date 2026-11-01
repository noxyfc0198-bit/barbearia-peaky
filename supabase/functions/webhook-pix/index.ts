// Recebe o aviso do Mercado Pago. Desative "Verify JWT" nesta função (o Mercado Pago não envia JWT do Supabase).
// Segurança em 3 camadas: assinatura HMAC, consulta direta à API do provedor e conferência de valor/dono.
// Comprovante ou mensagem do cliente NUNCA passa por aqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const resp = (texto: string, status = 200) => new Response(texto, { status })

async function hmacHex(chave: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(chave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const b = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}
// x-signature: "ts=...,v1=..."; mensagem assinada: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
async function assinaturaValida(segredo: string, assinatura: string | null, requestId: string | null, dataId: string) {
  if (!assinatura) return false
  const partes = Object.fromEntries(assinatura.split(',').map(p => p.trim().split('=') as [string, string]))
  if (!partes.ts || !partes.v1) return false
  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId ?? ''};ts:${partes.ts};`
  return iguais(await hmacHex(segredo, manifesto), partes.v1)
}

Deno.serve(async req => {
  try {
    const url = new URL(req.url)
    const est = url.searchParams.get('est')
    const corpo = await req.json().catch(() => ({}))
    const tipo = corpo?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
    const dataId = String(url.searchParams.get('data.id') ?? corpo?.data?.id ?? '')
    if (!est || !dataId) return resp('ignorado')
    if (tipo !== 'payment') return resp('ignorado')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: seg } = await admin.from('establishment_secrets').select('mp_access_token, mp_webhook_secret').eq('establishment_id', est).maybeSingle()
    if (!seg) return resp('barbearia_sem_credenciais', 404)

    // Camada 1: o aviso foi realmente assinado pelo Mercado Pago?
    if (!(await assinaturaValida(seg.mp_webhook_secret, req.headers.get('x-signature'), req.headers.get('x-request-id'), dataId))) {
      return resp('assinatura_invalida', 401)
    }

    // Camada 2: pergunta direto ao Mercado Pago (não confia no corpo do aviso).
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${seg.mp_access_token}` }
    })
    if (r.status === 404) return resp('pagamento_desconhecido')
    if (!r.ok) return resp('erro_provedor', 502) // o Mercado Pago tenta de novo
    const mp = await r.json()
    if (mp.status !== 'approved') return resp(`status_${mp.status}`) // pendente/cancelado: continua AGUARDANDO

    // Camada 3: o pagamento é desta barbearia e o valor bate?
    const pagamentoId = String(mp.external_reference ?? '')
    const { data: pg } = await admin.from('payments').select('id').eq('id', pagamentoId).eq('establishment_id', est).maybeSingle()
    if (!pg) return resp('referencia_invalida')

    const { data: resultado, error } = await admin.rpc('mark_payment_paid', {
      p_payment_id: pg.id,
      p_provider_id: String(mp.id),
      p_amount_cents: Math.round(Number(mp.transaction_amount) * 100),
      p_event_key: `mercadopago:${mp.id}:approved`
    })
    if (error) { console.error('mark_payment_paid', error); return resp('erro_banco', 500) }
    return resp(String(resultado))
  } catch (e) {
    console.error('webhook-pix', e)
    return resp('erro_interno', 500)
  }
})
