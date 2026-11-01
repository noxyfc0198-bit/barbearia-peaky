import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatarReais } from '../lib/money'
import { dataHora, mensagemErro, statusAgendamento, statusPagamento } from '../lib/datas'
import { lerNome, lerToken, sairCliente } from '../lib/session'

type Servico = { id: string; name: string; price_cents: number; duration_min: number; photo_url: string | null }
type Agendamento = {
  id: string; service_id: string | null; starts_at: string; service_name: string
  price_cents: number; status: string; payment_status: string | null
}

export default function CustomerHome() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const token = lerToken(slug)
  const [lista, setLista] = useState<Agendamento[] | null>(null)
  const [servicos, setServicos] = useState<Servico[] | null>(null)
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    if (!token) return
    const { data } = await supabase.rpc('my_appointments', { p_token: token })
    setLista((data as Agendamento[]) ?? [])
  }, [token])

  useEffect(() => {
    carregar()
    // O cliente só enxerga serviços ativos (regra do banco). O preço é só exibido, nunca enviado.
    supabase.from('services').select('id,name,price_cents,duration_min,photo_url').eq('active', true).order('name')
      .then(({ data }) => setServicos((data as Servico[]) ?? []))
    const t = setInterval(carregar, 10000) // mostra "Pago" assim que o servidor confirmar
    return () => clearInterval(t)
  }, [carregar])

  if (!token) return <Navigate to={`/b/${slug}/cliente`} replace />

  async function cancelar(a: Agendamento) {
    if (!confirm(`Cancelar ${a.service_name}, ${dataHora(a.starts_at)}? O horário será liberado.`)) return
    const { error } = await supabase.rpc('cancel_appointment', { p_token: token, p_id: a.id })
    setMsg(error ? mensagemErro(error.message) : 'Agendamento cancelado.')
    carregar()
  }

  const agora = Date.now()
  const ativo = (a: Agendamento) => ['pending', 'confirmed'].includes(a.status) && new Date(a.starts_at).getTime() > agora
  const proximos = (lista ?? []).filter(ativo).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const historico = (lista ?? []).filter(a => !ativo(a))

  return (
    <main className="px-6 py-10">
      <h2 className="font-titulo text-2xl text-ouro">Olá, {lerNome(slug)}</h2>
      <Link className="btn-ouro mt-6 block text-center" to={`/b/${slug}/agendar`}>AGENDAR HORÁRIO</Link>
      {msg && <p className="mt-4 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}

      <h3 className="mt-8 text-lg font-semibold">Serviços</h3>
      {servicos?.length === 0 && <p className="mt-2 text-white/60">Nenhum serviço disponível no momento.</p>}
      <ul className="mt-2 space-y-2">
        {servicos?.map(sv => (
          <li key={sv.id} className="flex items-center gap-3 rounded-xl border border-white/15 p-3">
            {sv.photo_url && <img src={sv.photo_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
            <div className="flex-1">{sv.name}<div className="text-sm text-white/50">{sv.duration_min} min</div></div>
            <div className="font-semibold text-ouro">{formatarReais(sv.price_cents)}</div>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-lg font-semibold">Próximos agendamentos</h3>
      {lista === null && <p className="mt-2 text-white/60">Carregando...</p>}
      {lista && proximos.length === 0 && <p className="mt-2 text-white/60">Você não tem horários marcados.</p>}
      <ul className="mt-2 space-y-2">
        {proximos.map(a => (
          <li key={a.id} className="space-y-2 rounded-xl border border-ouro/40 p-3">
            <div>{a.service_name}, {formatarReais(a.price_cents)}</div>
            <div className="text-sm text-white/70">{dataHora(a.starts_at)}, {statusAgendamento[a.status]}</div>
            <div className="text-sm text-white/50">Pagamento: {statusPagamento[a.payment_status ?? ''] ?? 'sem registro'}</div>
            {['awaiting', 'review'].includes(a.payment_status ?? '') && (
              <Link className="btn-ouro block text-center !py-2" to={`/b/${slug}/pagar/${a.id}`}>PAGAR COM PIX</Link>
            )}
            <div className="flex gap-2">
              {a.service_id && (
                <button className="btn-borda !py-2" onClick={() => nav(`/b/${slug}/agendar?remarcar=${a.id}&servico=${a.service_id}`)}>Remarcar</button>
              )}
              <button className="btn-borda !py-2" onClick={() => cancelar(a)}>Cancelar</button>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-lg font-semibold">Histórico</h3>
      {lista && historico.length === 0 && <p className="mt-2 text-white/60">Nenhum atendimento anterior.</p>}
      <ul className="mt-2 space-y-2">
        {historico.map(a => (
          <li key={a.id} className="rounded-xl border border-white/15 p-3 text-sm">
            {a.service_name}, {formatarReais(a.price_cents)}, {dataHora(a.starts_at)}, {statusAgendamento[a.status]}
          </li>
        ))}
      </ul>
      <button className="mt-10 text-sm text-white/50 underline" onClick={() => { sairCliente(slug); nav(`/b/${slug}`) }}>Sair</button>
      <button className="ml-6 mt-10 text-sm text-red-300 underline" onClick={async () => {
        if (!confirm('Apagar seus dados e todos os seus agendamentos? Isso não pode ser desfeito.')) return
        const { error } = await supabase.rpc('delete_my_data', { p_token: token })
        if (error) return setMsg('Não foi possível apagar agora.')
        sairCliente(slug); nav(`/b/${slug}`)
      }}>Apagar meus dados</button>
    </main>
  )
}
