import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dataHora, diaISO } from '../lib/datas'

type Bloqueio = { id: string; starts_at: string; ends_at: string; reason: string | null }

// Fuso fixo de Brasília (-03:00), o mesmo usado nos horários da agenda.
export default function BloqueiosAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [est, setEst] = useState<string | null>(null)
  const [lista, setLista] = useState<Bloqueio[]>([])
  const [dia, setDia] = useState('')
  const [de, setDe] = useState('12:00')
  const [ate, setAte] = useState('13:00')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('blocked_slots').select('id,starts_at,ends_at,reason').gte('ends_at', new Date().toISOString()).order('starts_at')
    setLista((data as Bloqueio[]) ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return nav(`/b/${slug}/barbeiro`, { replace: true })
      const { data: st } = await supabase.from('staff').select('establishment_id').maybeSingle()
      if (st) { setEst(st.establishment_id); carregar() }
    })
  }, [slug, nav, carregar])

  async function bloquear() {
    if (!est || !dia) return setMsg('Escolha a data.')
    if (de >= ate) return setMsg('O início deve ser antes do fim.')
    const { error } = await supabase.from('blocked_slots').insert({
      establishment_id: est, starts_at: `${dia}T${de}:00-03:00`, ends_at: `${dia}T${ate}:00-03:00`, reason: motivo.trim() || null
    })
    setMsg(error ? 'Não foi possível bloquear.' : 'Horário bloqueado. Agendamentos já feitos nesse período não são cancelados automaticamente.')
    carregar()
  }

  async function remover(id: string) {
    await supabase.from('blocked_slots').delete().eq('id', id)
    carregar()
  }

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Bloquear horários</h2>
      {msg && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}
      <div className="mt-5 space-y-2">
        <input type="date" className="campo" min={diaISO()} value={dia} onChange={e => setDia(e.target.value)} />
        <div className="flex gap-2">
          <input type="time" className="campo" value={de} onChange={e => setDe(e.target.value)} />
          <input type="time" className="campo" value={ate} onChange={e => setAte(e.target.value)} />
        </div>
        <input className="campo" placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        <button className="btn-ouro" onClick={bloquear} disabled={!est}>Bloquear</button>
      </div>
      <h3 className="mt-8 font-semibold">Bloqueios futuros</h3>
      {lista.length === 0 && <p className="mt-2 text-white/60">Nenhum bloqueio.</p>}
      <ul className="mt-2 space-y-2">
        {lista.map(b => (
          <li key={b.id} className="rounded-xl border border-white/15 p-3">
            {dataHora(b.starts_at)} até {dataHora(b.ends_at)}{b.reason ? `, ${b.reason}` : ''}
            <button className="btn-borda mt-2 !py-2" onClick={() => remover(b.id)}>Remover bloqueio</button>
          </li>
        ))}
      </ul>
    </main>
  )
}
