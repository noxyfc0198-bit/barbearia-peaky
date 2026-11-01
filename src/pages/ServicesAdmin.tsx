import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatarReais, paraCentavos } from '../lib/money'

type Servico = { id: string; name: string; price_cents: number; duration_min: number; active: boolean; photo_url: string | null }
type Edicao = { name: string; preco: string; dur: string; foto: string }

export default function ServicesAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [est, setEst] = useState<string | null>(null)
  const [lista, setLista] = useState<Servico[]>([])
  const [edit, setEdit] = useState<Record<string, Edicao>>({})
  const [novo, setNovo] = useState<Edicao>({ name: '', preco: '', dur: '30', foto: '' })
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async (e: string) => {
    const { data } = await supabase.from('services').select('*').eq('establishment_id', e).order('name')
    const l = (data as Servico[]) ?? []
    setLista(l)
    setEdit(Object.fromEntries(l.map(s => [s.id, {
      name: s.name, preco: (s.price_cents / 100).toFixed(2).replace('.', ','), dur: String(s.duration_min), foto: s.photo_url ?? ''
    }])))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return nav(`/b/${slug}/barbeiro`, { replace: true })
      const { data: st } = await supabase.from('staff').select('establishment_id').maybeSingle()
      if (!st) return setMsg('Este usuário não está vinculado a nenhuma barbearia.')
      setEst(st.establishment_id)
      carregar(st.establishment_id)
    })
  }, [slug, nav, carregar])

  function validar(f: Edicao) {
    const preco = paraCentavos(f.preco)
    const dur = parseInt(f.dur, 10)
    if (f.name.trim().length < 2) return 'Informe o nome do serviço.'
    if (preco === null) return 'Preço inválido. Exemplo: 35,00'
    if (!(dur >= 5 && dur <= 480)) return 'A duração deve ficar entre 5 e 480 minutos.'
    return { preco, dur }
  }

  async function adicionar() {
    const v = validar(novo)
    if (typeof v === 'string') return setMsg(v)
    const { error } = await supabase.from('services').insert({
      establishment_id: est, name: novo.name.trim(), price_cents: v.preco, duration_min: v.dur,
      photo_url: novo.foto.trim() || null, active: false
    })
    if (error) return setMsg('Não foi possível cadastrar o serviço.')
    setNovo({ name: '', preco: '', dur: '30', foto: '' })
    setMsg('Serviço cadastrado. Ative para o cliente ver.')
    carregar(est!)
  }

  async function salvar(s: Servico) {
    const f = edit[s.id]
    const v = validar(f)
    if (typeof v === 'string') return setMsg(v)
    if (s.active && v.preco === 0) return setMsg('Serviço ativo precisa ter preço maior que zero.')
    const { error } = await supabase.from('services').update({
      name: f.name.trim(), price_cents: v.preco, duration_min: v.dur, photo_url: f.foto.trim() || null
    }).eq('id', s.id)
    setMsg(error ? 'Não foi possível salvar.' : 'Salvo. Agendamentos novos usam o novo preço.')
    carregar(est!)
  }

  async function alternar(s: Servico) {
    if (!s.active && s.price_cents === 0) return setMsg('Defina um preço maior que zero e salve antes de ativar.')
    const { error } = await supabase.from('services').update({ active: !s.active }).eq('id', s.id)
    if (error) setMsg('Não foi possível alterar.')
    carregar(est!)
  }

  async function excluir(s: Servico) {
    if (!confirm(`Excluir "${s.name}"? Agendamentos antigos continuam no histórico.`)) return
    const { error } = await supabase.from('services').delete().eq('id', s.id)
    setMsg(error ? 'Não foi possível excluir.' : 'Serviço excluído.')
    carregar(est!)
  }

  const atualizar = (id: string, campo: keyof Edicao, valor: string) =>
    setEdit(e => ({ ...e, [id]: { ...e[id], [campo]: valor } }))

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Gerenciar serviços</h2>
      {msg && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">{msg}</p>}

      <section className="mt-6 space-y-2 rounded-2xl border border-ouro/40 p-4">
        <h3 className="font-semibold">Novo serviço</h3>
        <input className="campo" placeholder="Nome" value={novo.name} onChange={e => setNovo({ ...novo, name: e.target.value })} />
        <div className="flex gap-2">
          <input className="campo" placeholder="Preço (R$)" inputMode="decimal" value={novo.preco} onChange={e => setNovo({ ...novo, preco: e.target.value })} />
          <input className="campo" placeholder="Minutos" inputMode="numeric" value={novo.dur} onChange={e => setNovo({ ...novo, dur: e.target.value })} />
        </div>
        <input className="campo" placeholder="Link da foto (opcional)" value={novo.foto} onChange={e => setNovo({ ...novo, foto: e.target.value })} />
        <button className="btn-ouro" onClick={adicionar} disabled={!est}>Cadastrar serviço</button>
      </section>

      <ul className="mt-6 space-y-4">
        {lista.map(s => (
          <li key={s.id} className="space-y-2 rounded-2xl border border-white/15 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{s.active ? 'Ativo' : 'Desativado'}, {formatarReais(s.price_cents)}</span>
              <button className="text-sm text-ouro underline" onClick={() => alternar(s)}>{s.active ? 'Desativar' : 'Ativar'}</button>
            </div>
            <input className="campo" value={edit[s.id]?.name ?? ''} onChange={e => atualizar(s.id, 'name', e.target.value)} />
            <div className="flex gap-2">
              <input className="campo" inputMode="decimal" value={edit[s.id]?.preco ?? ''} onChange={e => atualizar(s.id, 'preco', e.target.value)} />
              <input className="campo" inputMode="numeric" value={edit[s.id]?.dur ?? ''} onChange={e => atualizar(s.id, 'dur', e.target.value)} />
            </div>
            <input className="campo" placeholder="Link da foto (opcional)" value={edit[s.id]?.foto ?? ''} onChange={e => atualizar(s.id, 'foto', e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-ouro" onClick={() => salvar(s)}>Salvar</button>
              <button className="btn-borda" onClick={() => excluir(s)}>Excluir</button>
            </div>
          </li>
        ))}
      </ul>
      {lista.length === 0 && est && <p className="mt-6 text-white/60">Nenhum serviço cadastrado. Use o formulário acima.</p>}
    </main>
  )
}
