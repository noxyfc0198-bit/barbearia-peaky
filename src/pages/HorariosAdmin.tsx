import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
type Dia = { aberto: boolean; opens: string; closes: string; bs: string; be: string }
const vazio = (): Dia[] => DIAS.map(() => ({ aberto: false, opens: '09:00', closes: '18:00', bs: '', be: '' }))

// Sem horários de funcionamento cadastrados, o cliente não vê horários livres.
export default function HorariosAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [est, setEst] = useState<string | null>(null)
  const [dias, setDias] = useState<Dia[]>(vazio())
  const [msg, setMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return nav(`/b/${slug}/barbeiro`, { replace: true })
      const { data: st } = await supabase.from('staff').select('establishment_id').maybeSingle()
      if (!st) return setMsg('Este usuário não está vinculado a nenhuma barbearia.')
      setEst(st.establishment_id)
      const { data: h } = await supabase.from('business_hours').select('weekday,opens,closes,break_start,break_end').eq('establishment_id', st.establishment_id)
      const novo = vazio()
      ;(h ?? []).forEach(r => {
        novo[r.weekday] = { aberto: true, opens: String(r.opens).slice(0, 5), closes: String(r.closes).slice(0, 5),
          bs: r.break_start ? String(r.break_start).slice(0, 5) : '', be: r.break_end ? String(r.break_end).slice(0, 5) : '' }
      })
      setDias(novo)
    })
  }, [slug, nav])

  const mudar = (i: number, p: Partial<Dia>) => setDias(d => d.map((x, k) => (k === i ? { ...x, ...p } : x)))

  async function salvar() {
    if (!est) return
    for (const d of dias) {
      if (!d.aberto) continue
      if (d.opens >= d.closes) return setMsg('A abertura deve ser antes do fechamento.')
      if ((d.bs && !d.be) || (!d.bs && d.be) || (d.bs && (d.bs >= d.be || d.bs < d.opens || d.be > d.closes)))
        return setMsg('Confira o intervalo: início antes do fim e dentro do expediente.')
    }
    for (let i = 0; i < 7; i++) {
      const d = dias[i]
      const r = d.aberto
        ? await supabase.from('business_hours').upsert(
            { establishment_id: est, weekday: i, opens: d.opens, closes: d.closes, break_start: d.bs || null, break_end: d.be || null },
            { onConflict: 'establishment_id,weekday' })
        : await supabase.from('business_hours').delete().eq('establishment_id', est).eq('weekday', i)
      if (r.error) return setMsg('Não foi possível salvar os horários.')
    }
    setMsg('Horários salvos.')
  }

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Horários de funcionamento</h2>
      {msg && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}
      <ul className="mt-5 space-y-3">
        {dias.map((d, i) => (
          <li key={i} className="rounded-xl border border-white/15 p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={d.aberto} onChange={e => mudar(i, { aberto: e.target.checked })} />
              {DIAS[i]}
            </label>
            {d.aberto && (
              <>
                <div className="mt-2 flex gap-2">
                  <input type="time" className="campo" value={d.opens} onChange={e => mudar(i, { opens: e.target.value })} />
                  <input type="time" className="campo" value={d.closes} onChange={e => mudar(i, { closes: e.target.value })} />
                </div>
                <p className="mt-2 text-sm text-white/50">Intervalo (almoço), opcional</p>
                <div className="flex gap-2">
                  <input type="time" className="campo" value={d.bs} onChange={e => mudar(i, { bs: e.target.value })} />
                  <input type="time" className="campo" value={d.be} onChange={e => mudar(i, { be: e.target.value })} />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <button className="btn-ouro mt-6" onClick={salvar} disabled={!est}>Salvar horários</button>
    </main>
  )
}
