import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { lerToken } from '../lib/session'
import { formatarReais } from '../lib/money'
import { diaISO, hora, mensagemErro } from '../lib/datas'

type Servico = { id: string; name: string; price_cents: number; duration_min: number; photo_url: string | null }

// Serve para agendar e para remarcar (?remarcar=<id>&servico=<id>).
export default function Agendar() {
  const { slug = '' } = useParams()
  const [q] = useSearchParams()
  const remarcarId = q.get('remarcar')
  const nav = useNavigate()
  const token = lerToken(slug)

  const [servicos, setServicos] = useState<Servico[]>([])
  const [servicoId, setServicoId] = useState<string | null>(q.get('servico'))
  const [data, setData] = useState('')
  const [horarios, setHorarios] = useState<string[] | null>(null)
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    supabase.from('services').select('id,name,price_cents,duration_min,photo_url').eq('active', true).order('name')
      .then(({ data: d }) => setServicos((d as Servico[]) ?? []))
  }, [])

  async function carregarHorarios() {
    if (!servicoId || !data) return
    setHorarios(null); setEscolhido(null)
    const { data: d, error } = await supabase.rpc('get_available_slots', { p_slug: slug, p_service: servicoId, p_date: data })
    if (error) { setMsg('Não foi possível carregar os horários.'); return setHorarios([]) }
    setHorarios(((d as { slot: string }[]) ?? []).map(x => x.slot))
  }
  useEffect(() => { carregarHorarios() }, [servicoId, data]) // eslint-disable-line

  if (!token) return <Navigate to={`/b/${slug}/cliente`} replace />
  const servico = servicos.find(s => s.id === servicoId)

  async function confirmar() {
    if (!escolhido || !servicoId || !token) return
    setSalvando(true); setMsg('')
    const { error } = remarcarId
      ? await supabase.rpc('reschedule_appointment', { p_token: token, p_id: remarcarId, p_new_start: escolhido })
      : await supabase.rpc('book_appointment', { p_token: token, p_service: servicoId, p_starts_at: escolhido })
    setSalvando(false)
    if (error) { setMsg(mensagemErro(error.message)); return carregarHorarios() }
    nav(`/b/${slug}/inicio`)
  }

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/inicio`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">{remarcarId ? 'Remarcar horário' : 'Agendar horário'}</h2>

      {!remarcarId && (
        <section className="mt-5">
          <h3 className="font-semibold">1. Serviço</h3>
          {servicos.length === 0 && <p className="mt-2 text-white/60">Nenhum serviço disponível no momento.</p>}
          <ul className="mt-2 space-y-2">
            {servicos.map(s => (
              <li key={s.id}>
                <button onClick={() => setServicoId(s.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${s.id === servicoId ? 'border-ouro bg-ouro/10' : 'border-white/15'}`}>
                  {s.photo_url && <img src={s.photo_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                  <span className="flex-1">{s.name}<span className="block text-sm text-white/50">{s.duration_min} min</span></span>
                  <span className="font-semibold text-ouro">{formatarReais(s.price_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {remarcarId && servico && <p className="mt-3 text-white/70">{servico.name}, {servico.duration_min} min. O preço do agendamento original é mantido.</p>}

      {servicoId && (
        <section className="mt-6">
          <h3 className="font-semibold">{remarcarId ? '1. Nova data' : '2. Data'}</h3>
          <input type="date" className="campo mt-2" min={diaISO()} max={diaISO(60)} value={data} onChange={e => setData(e.target.value)} />
        </section>
      )}

      {servicoId && data && (
        <section className="mt-6">
          <h3 className="font-semibold">{remarcarId ? '2. Novo horário' : '3. Horário'}</h3>
          {horarios === null && <p className="mt-2 text-white/60">Carregando horários...</p>}
          {horarios?.length === 0 && <p className="mt-2 text-white/60">Sem horários livres neste dia. Escolha outra data.</p>}
          <div className="mt-2 grid grid-cols-3 gap-2">
            {horarios?.map(h => (
              <button key={h} onClick={() => setEscolhido(h)}
                className={`rounded-xl border py-3 ${h === escolhido ? 'border-ouro bg-ouro text-black' : 'border-white/20'}`}>{hora(h)}</button>
            ))}
          </div>
        </section>
      )}

      {escolhido && servico && (
        <section className="mt-6 rounded-2xl border border-ouro/40 p-4">
          <p>{servico.name}, às {hora(escolhido)}</p>
          {!remarcarId && <p className="mt-1">Valor: <b className="text-ouro">{formatarReais(servico.price_cents)}</b> <span className="text-sm text-white/50">(preço fixo da barbearia)</span></p>}
          <button className="btn-ouro mt-4" disabled={salvando} onClick={confirmar}>
            {salvando ? 'Confirmando...' : remarcarId ? 'Confirmar remarcação' : 'Confirmar agendamento'}
          </button>
        </section>
      )}
      {msg && <p className="mt-4 rounded-lg bg-white/10 p-3 text-sm text-red-300">{msg}</p>}
    </main>
  )
}
