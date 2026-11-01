import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatarReais } from '../lib/money'
import { dataHora, diaISO, statusAgendamento, statusPagamento } from '../lib/datas'

type Pg = { status: string; proof_data: string | null; paid_via: string | null }
type Linha = {
  id: string; starts_at: string; service_name: string; price_cents: number; status: string
  customers: { full_name: string; phone: string | null } | null
  payments: Pg | Pg[] | null
}

// Mostra os mesmos agendamentos que os clientes criam, direto do banco. Atualiza a cada 20 s.
export default function AgendaAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [msg, setMsg] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('appointments')
      .select('id,starts_at,service_name,price_cents,status,customers(full_name,phone),payments(status,proof_data,paid_via)')
      .gte('starts_at', `${diaISO()}T00:00:00-03:00`).order('starts_at')
    if (error) return setMsg('Não foi possível carregar a agenda.')
    setLinhas((data as unknown as Linha[]) ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav(`/b/${slug}/barbeiro`, { replace: true })
      else carregar()
    })
    const t = setInterval(carregar, 20000)
    // Tempo real: quando o Pix for confirmado pelo webhook, a agenda atualiza na hora.
    const canal = supabase.channel('pagamentos').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => carregar()).subscribe()
    return () => { clearInterval(t); supabase.removeChannel(canal) }
  }, [slug, nav, carregar])

  async function mudar(l: Linha, status: 'confirmed' | 'cancelled' | 'done') {
    if (status === 'cancelled' && !confirm('Cancelar este agendamento? O horário será liberado.')) return
    const { error } = await supabase.from('appointments').update({ status }).eq('id', l.id)
    if (!error && status === 'cancelled') await supabase.from('payments').update({ status: 'cancelled' }).eq('appointment_id', l.id).neq('status', 'paid')
    setMsg(error ? 'Não foi possível atualizar.' : 'Atualizado.')
    carregar()
  }

  // Só o barbeiro marca "Pago", depois de conferir o dinheiro na conta. Comprovante sozinho não confirma nada.
  async function pagamento(l: Linha, acao: 'paid' | 'reject') {
    if (acao === 'paid' && !confirm('Confirmar que o dinheiro entrou na sua conta?')) return
    const dados = acao === 'paid' ? { status: 'paid', confirmed_at: new Date().toISOString() } : { status: 'awaiting', proof_data: null, proof_at: null }
    const { error } = await supabase.from('payments').update(dados).eq('appointment_id', l.id)
    setMsg(error ? 'Não foi possível atualizar o pagamento.' : acao === 'paid' ? 'Pagamento confirmado.' : 'Comprovante recusado. O cliente pode enviar outro.')
    carregar()
  }

  const pg = (l: Linha): Pg | undefined => (Array.isArray(l.payments) ? l.payments[0] : l.payments) ?? undefined
  const hoje = diaISO()
  const ehHoje = (l: Linha) => new Date(l.starts_at).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) === hoje
  const bloco = (titulo: string, itens: Linha[]) => (
    <section className="mt-6">
      <h3 className="font-semibold">{titulo}</h3>
      {itens.length === 0 && <p className="mt-2 text-white/60">Nenhum agendamento.</p>}
      <ul className="mt-2 space-y-2">
        {itens.map(l => {
          const p = pg(l)
          return (
            <li key={l.id} className="space-y-1 rounded-xl border border-white/15 p-3">
              <div>{dataHora(l.starts_at)}, {l.customers?.full_name ?? 'Cliente'}{l.customers?.phone ? `, ${l.customers.phone}` : ''}</div>
              <div className="text-sm text-white/70">{l.service_name}, {formatarReais(l.price_cents)}, {statusAgendamento[l.status]}</div>
              <div className="text-sm text-white/50">Pagamento: {statusPagamento[p?.status ?? ''] ?? 'sem registro'}{p?.paid_via === 'pix_automatico' ? ' (confirmado automaticamente pelo Pix)' : ''}</div>
              {p?.status === 'review' && p.proof_data && (
                <>
                  <button className="text-sm text-ouro underline" onClick={() => setAberto(aberto === l.id ? null : l.id)}>{aberto === l.id ? 'Esconder comprovante' : 'Ver comprovante'}</button>
                  {aberto === l.id && <img src={p.proof_data} alt="Comprovante enviado" className="mt-2 max-h-96 rounded-lg" />}
                </>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {['awaiting', 'review'].includes(p?.status ?? '') && l.status !== 'cancelled' && <button className="btn-ouro !w-auto !py-2" onClick={() => pagamento(l, 'paid')}>Confirmar pagamento</button>}
                {p?.status === 'review' && <button className="btn-borda !w-auto !py-2" onClick={() => pagamento(l, 'reject')}>Recusar comprovante</button>}
                {l.status === 'pending' && <button className="btn-ouro !w-auto !py-2" onClick={() => mudar(l, 'confirmed')}>Confirmar</button>}
                {l.status === 'confirmed' && <button className="btn-ouro !w-auto !py-2" onClick={() => mudar(l, 'done')}>Finalizar</button>}
                {['pending', 'confirmed'].includes(l.status) && <button className="btn-borda !w-auto !py-2" onClick={() => mudar(l, 'cancelled')}>Cancelar</button>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )

  const ativos = (linhas ?? []).filter(l => l.status !== 'cancelled')
  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Agenda</h2>
      {msg && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}
      {linhas === null ? <p className="mt-4 text-white/60">Carregando...</p> : (
        <>
          {bloco('Hoje', ativos.filter(ehHoje))}
          {bloco('Próximos dias', ativos.filter(l => !ehHoje(l)))}
        </>
      )}
      <button className="btn-borda mt-8" onClick={carregar}>Atualizar agora</button>
    </main>
  )
}
