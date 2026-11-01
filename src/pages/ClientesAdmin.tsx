import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Cliente = { id: string; full_name: string; phone: string | null; created_at: string }

export default function ClientesAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [lista, setLista] = useState<Cliente[] | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return nav(`/b/${slug}/barbeiro`, { replace: true })
      const { data: c } = await supabase.from('customers').select('id,full_name,phone,created_at').order('full_name')
      setLista((c as Cliente[]) ?? [])
    })
  }, [slug, nav])

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">Clientes</h2>
      {lista === null && <p className="mt-4 text-white/60">Carregando...</p>}
      {lista?.length === 0 && <p className="mt-4 text-white/60">Nenhum cliente cadastrado.</p>}
      <ul className="mt-4 space-y-2">
        {lista?.map(c => (
          <li key={c.id} className="rounded-xl border border-white/15 p-3">
            {c.full_name}
            {c.phone && <div className="text-sm text-white/60">{c.phone}</div>}
          </li>
        ))}
      </ul>
    </main>
  )
}
