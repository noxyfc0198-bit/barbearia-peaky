import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, supabaseUrl } from '../lib/supabase'
import { credenciais } from '../lib/pixAuto'

export default function ConfigAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [est, setEst] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [pix, setPix] = useState('')
  const [titular, setTitular] = useState('')
  const [tipo, setTipo] = useState('CPF')
  const [msg, setMsg] = useState('')
  const [mpToken, setMpToken] = useState('')
  const [mpSegredo, setMpSegredo] = useState('')
  const [conta, setConta] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return nav(`/b/${slug}/barbeiro`, { replace: true })
      const { data: st } = await supabase.from('staff').select('establishment_id').maybeSingle()
      if (!st) return setMsg('Este usuário não está vinculado a nenhuma barbearia.')
      setEst(st.establishment_id)
      credenciais({ acao: 'status' }).then(r => setConta(r.data?.conectado ? (r.data.conta ?? '') : null))
      const { data: e } = await supabase.from('establishments').select('name,city').eq('id', st.establishment_id).maybeSingle()
      setNome(e?.name ?? ''); setCidade(e?.city ?? '')
      const { data: p } = await supabase.from('establishment_pix').select('pix_key,holder_name,key_type').eq('establishment_id', st.establishment_id).maybeSingle()
      setPix(p?.pix_key ?? ''); setTitular(p?.holder_name ?? ''); setTipo(p?.key_type ?? 'CPF')
    })
  }, [slug, nav])

  async function salvar() {
    if (!est) return
    if (nome.trim().length < 2) return setMsg('Informe o nome da barbearia.')
    const a = await supabase.from('establishments').update({ name: nome.trim(), city: cidade.trim() || null }).eq('id', est)
    const b = pix.trim()
      ? await supabase.from('establishment_pix').upsert({ establishment_id: est, pix_key: pix.trim(), holder_name: titular.trim() || null, key_type: tipo })
      : await supabase.from('establishment_pix').delete().eq('establishment_id', est)
    setMsg(a.error || b.error ? 'Não foi possível salvar.' : 'Salvo e confirmado pelo banco de dados.')
  }

  async function conectar() {
    setMsg('')
    const r = await credenciais({ acao: 'salvar', access_token: mpToken.trim(), webhook_secret: mpSegredo.trim() })
    if (r.codigo === 'token_recusado') return setMsg('O Mercado Pago recusou esse Access Token. Confira se é o de PRODUÇÃO.')
    if (r.codigo) return setMsg('Não foi possível conectar. Confira os dados e se as funções do servidor foram publicadas.')
    setConta(r.data?.conta ?? ''); setMpToken(''); setMpSegredo('')
    setMsg('Pix automático conectado. Falta só cadastrar o webhook no Mercado Pago (veja o endereço abaixo).')
  }

  async function desconectar() {
    if (!confirm('Desconectar o Pix automático? Os clientes voltam a pagar pela chave Pix com comprovante.')) return
    const r = await credenciais({ acao: 'remover' })
    if (!r.codigo) setConta(null)
  }

  const webhook = `${supabaseUrl}/functions/v1/webhook-pix?est=${est ?? ''}`

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Configurações</h2>
      {msg && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}
      <div className="mt-5 space-y-3">
        <input className="campo" placeholder="Nome da barbearia" value={nome} onChange={e => setNome(e.target.value)} />
        <input className="campo" placeholder="Cidade" value={cidade} onChange={e => setCidade(e.target.value)} />
        <h3 className="pt-2 font-semibold">Pix (o dinheiro vai direto para a sua conta)</h3>
        <select className="campo" value={tipo} onChange={e => setTipo(e.target.value)}>
          {['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Chave aleatória'].map(t => <option key={t}>{t}</option>)}
        </select>
        <input className="campo" placeholder="Sua chave Pix" value={pix} onChange={e => setPix(e.target.value)} />
        <input className="campo" placeholder="Nome do titular (opcional)" value={titular} onChange={e => setTitular(e.target.value)} />
        <button className="btn-ouro" onClick={salvar} disabled={!est}>Salvar</button>
      </div>

      <section className="mt-8 space-y-3 rounded-2xl border border-ouro/40 p-4">
        <h3 className="font-semibold">Pix automático (Mercado Pago)</h3>
        <p className="text-sm text-white/60">O cliente paga por QR Code e o app marca PAGO sozinho quando o Mercado Pago confirmar. O dinheiro vai para a conta Mercado Pago da barbearia.</p>
        <p className="text-sm">Situação: <b>{conta === undefined ? 'verificando...' : conta === null ? 'não conectado' : `conectado${conta ? ` (conta ${conta})` : ''}`}</b></p>
        <input className="campo" type="password" placeholder="Access Token de produção" value={mpToken} onChange={e => setMpToken(e.target.value)} autoComplete="off" />
        <input className="campo" type="password" placeholder="Assinatura secreta do webhook" value={mpSegredo} onChange={e => setMpSegredo(e.target.value)} autoComplete="off" />
        <button className="btn-ouro" onClick={conectar} disabled={!est || !mpToken || !mpSegredo}>CONECTAR</button>
        {conta !== null && conta !== undefined && <button className="btn-borda" onClick={desconectar}>DESCONECTAR</button>}
        <p className="text-sm text-white/60">Endereço de notificação (cole no painel do Mercado Pago, evento "Pagamentos"):</p>
        <p className="break-all rounded-xl border border-white/15 p-3 text-xs">{webhook}</p>
        <button className="btn-borda" onClick={() => navigator.clipboard.writeText(webhook).then(() => setMsg('Endereço copiado.'))}>COPIAR ENDEREÇO</button>
      </section>
    </main>
  )
}
