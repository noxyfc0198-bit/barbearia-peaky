import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { salvarSessao } from '../lib/session'
import Fundo from '../components/Fundo'

export default function CustomerRegister() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aceite, setAceite] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (nome.trim().length < 3) return setErro('Informe seu nome completo.')
    if (!aceite) return setErro('Para continuar, aceite o uso dos seus dados para o agendamento.')
    setCarregando(true)
    const { data, error } = await supabase.rpc('register_customer', {
      p_slug: slug, p_name: nome.trim(), p_phone: telefone.trim() || null, p_consent: aceite
    })
    setCarregando(false)
    if (error || !data) return setErro('Não foi possível continuar. Verifique a conexão e tente de novo.')
    salvarSessao(slug, data as string, nome.trim())
    nav(`/b/${slug}/inicio`)
  }

  return (
    <main className="flex min-h-screen flex-col justify-end px-6 pb-16">
      <Fundo />
      <form onSubmit={enviar} className="space-y-4">
        <h2 className="font-titulo text-2xl text-ouro">Seus dados</h2>
        <input className="campo" placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} />
        <input className="campo" placeholder="Telefone (opcional)" inputMode="tel" value={telefone} onChange={e => setTelefone(e.target.value)} />
        <label className="flex items-start gap-2 text-sm text-white/80"><input type="checkbox" className="mt-1" checked={aceite} onChange={e => setAceite(e.target.checked)} />Concordo que a barbearia use meu nome e telefone apenas para gerenciar meus agendamentos (LGPD). Posso apagar meus dados a qualquer momento.</label>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button className="btn-ouro" disabled={carregando}>{carregando ? 'Salvando...' : 'CONTINUAR'}</button>
      </form>
    </main>
  )
}
