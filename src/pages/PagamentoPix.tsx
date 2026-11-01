import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { lerToken } from '../lib/session'
import { formatarReais } from '../lib/money'
import { statusPagamento } from '../lib/datas'
import { Cobranca, criarCobranca } from '../lib/pixAuto'

type Pix = { pix_key: string; holder_name: string | null; key_type: string | null; establishment_name: string; amount_cents: number }

// Reduz a foto do comprovante no celular (JPEG, até 1000 px) antes de enviar.
function reduzir(file: File): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      ok(c.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = falha
    img.src = URL.createObjectURL(file)
  })
}

type Modo = 'carregando' | 'auto' | 'manual' | 'pago' | 'erro'

export default function PagamentoPix() {
  const { slug = '', id = '' } = useParams()
  const token = lerToken(slug)
  const [modo, setModo] = useState<Modo>('carregando')
  const [cobranca, setCobranca] = useState<Cobranca | null>(null)
  const [pix, setPix] = useState<Pix | null>(null)
  const [pagamento, setPagamento] = useState('')
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [agora, setAgora] = useState(Date.now())

  const statusAtual = useCallback(async () => {
    const { data } = await supabase.rpc('my_appointments', { p_token: token })
    const st = ((data as { id: string; payment_status: string }[]) ?? []).find(a => a.id === id)?.payment_status ?? ''
    setPagamento(st)
    return st
  }, [token, id])

  const iniciar = useCallback(async () => {
    if (!token) return
    setModo('carregando'); setMsg('')
    if ((await statusAtual()) === 'paid') return setModo('pago')
    const r = await criarCobranca(token, id)
    if (r.ok && r.pago) return setModo('pago')
    if (r.ok && r.cobranca) { setCobranca(r.cobranca); return setModo('auto') }
    if (!r.ok && r.codigo === 'pix_automatico_nao_configurado') {
      // A barbearia não conectou o Pix automático: cai no Pix manual (chave + comprovante).
      const { data } = await supabase.rpc('get_pix_info', { p_token: token, p_appointment: id })
      setPix((data as Pix[])?.[0] ?? null)
      return setModo('manual')
    }
    setMsg('Não foi possível gerar o Pix agora. Tente de novo em instantes.')
    setModo('erro')
  }, [token, id, statusAtual])

  useEffect(() => { iniciar() }, [iniciar])

  // Enquanto espera o pagamento, consulta o banco a cada 4 s. Só vira "pago" quando o servidor confirmar.
  useEffect(() => {
    if (modo !== 'auto' && modo !== 'manual') return
    const t = setInterval(async () => { setAgora(Date.now()); if ((await statusAtual()) === 'paid') setModo('pago') }, 4000)
    return () => clearInterval(t)
  }, [modo, statusAtual])

  if (!token) return <Navigate to={`/b/${slug}/cliente`} replace />

  async function copiar(texto: string, ok: string) {
    try { await navigator.clipboard.writeText(texto); setMsg(ok) } catch { setMsg('Não foi possível copiar. Selecione e copie manualmente.') }
  }

  async function enviar(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setEnviando(true); setMsg('')
    try {
      const dados = await reduzir(f)
      const { error } = await supabase.rpc('submit_payment_proof', { p_token: token, p_appointment: id, p_proof: dados })
      setMsg(error ? 'Não foi possível enviar o comprovante.' : 'Comprovante enviado. O pagamento só vale depois que o barbeiro confirmar.')
      statusAtual()
    } catch { setMsg('Não foi possível ler essa imagem.') }
    setEnviando(false)
  }

  const expirou = cobranca ? new Date(cobranca.expira_em).getTime() < agora : false
  const minutos = cobranca ? Math.max(0, Math.ceil((new Date(cobranca.expira_em).getTime() - agora) / 60000)) : 0

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/inicio`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Pagamento por Pix</h2>

      {modo === 'carregando' && <p className="mt-4 text-white/60">Carregando...</p>}

      {modo === 'pago' && (
        <div className="mt-6 rounded-2xl border border-green-400/60 p-5 text-center">
          <p className="text-4xl">✔</p>
          <p className="mt-2 text-xl font-semibold text-green-300">Pagamento confirmado</p>
          <p className="mt-1 text-sm text-white/60">O Pix foi confirmado pelo provedor de pagamentos.</p>
        </div>
      )}

      {modo === 'auto' && cobranca && (
        <section className="mt-5 space-y-3 text-center">
          <p>Valor exato: <b className="text-ouro">{formatarReais(cobranca.valor_cents)}</b></p>
          {!expirou ? (
            <>
              <img src={`data:image/png;base64,${cobranca.qr_base64}`} alt="QR Code Pix" className="mx-auto w-64 max-w-full rounded-xl bg-white p-2" />
              <p className="text-sm text-white/60">Abra o app do seu banco, escolha Pix e leia o QR Code. Vale por mais {minutos} min.</p>
              <button className="btn-ouro" onClick={() => copiar(cobranca.copia_cola, 'Pix copia e cola copiado.')}>COPIAR PIX</button>
              <p className="break-all rounded-xl border border-white/15 p-3 text-left text-xs text-white/50">{cobranca.copia_cola}</p>
              <p className="text-sm">Situação: <b>{statusPagamento[pagamento] ?? 'Aguardando pagamento'}</b></p>
              <p className="text-xs text-white/50">Esta tela atualiza sozinha quando o pagamento for confirmado. Comprovante enviado por você não confirma pagamento.</p>
            </>
          ) : (
            <>
              <p className="text-white/70">Este Pix expirou e nenhum pagamento foi recebido.</p>
              <button className="btn-ouro" onClick={iniciar}>GERAR NOVO PIX</button>
            </>
          )}
        </section>
      )}

      {modo === 'manual' && (
        <section className="mt-5 space-y-3">
          {!pix ? <p className="text-white/70">A barbearia ainda não cadastrou a chave Pix.</p> : (
            <>
              <p className="text-sm text-white/60">Esta barbearia ainda não usa confirmação automática. Pague na chave abaixo e envie o comprovante; o barbeiro confirma manualmente.</p>
              <p className="text-white/70">{pix.establishment_name}{pix.holder_name ? `, recebedor: ${pix.holder_name}` : ''}</p>
              {pix.key_type && <p className="text-sm text-white/50">Tipo de chave: {pix.key_type}</p>}
              <p>Valor exato: <b className="text-ouro">{formatarReais(pix.amount_cents)}</b></p>
              <div className="break-all rounded-xl border border-ouro/40 p-3">{pix.pix_key}</div>
              <button className="btn-ouro" onClick={() => copiar(pix.pix_key, 'Chave Pix copiada.')}>COPIAR CHAVE PIX</button>
              <p>Situação: <b>{statusPagamento[pagamento] ?? 'sem registro'}</b></p>
              {['awaiting', 'review'].includes(pagamento) && (
                <label className="btn-borda block cursor-pointer text-center">
                  {enviando ? 'Enviando...' : 'ENVIAR COMPROVANTE'}
                  <input type="file" accept="image/*" className="hidden" onChange={enviar} disabled={enviando} />
                </label>
              )}
            </>
          )}
        </section>
      )}

      {modo === 'erro' && <button className="btn-ouro mt-6" onClick={iniciar}>TENTAR DE NOVO</button>}
      {msg && <p className="mt-4 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}
    </main>
  )
}
