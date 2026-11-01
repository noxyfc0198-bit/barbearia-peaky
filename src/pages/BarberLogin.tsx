import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { emailDoBarbeiro, senhaParaServidor } from '../lib/barbeiro'
import Fundo from '../components/Fundo'

export default function BarberLogin() {
  const { slug = '' } = useParams()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [logado, setLogado] = useState(false)
  const [carregando, setCarregando] = useState(false)

  // Só vale se o usuário logado for equipe DESTA barbearia (conferido pelo banco, com RLS).
  const verificar = useCallback(async () => {
    const { data } = await supabase.from('staff').select('establishments(slug)').maybeSingle()
    const est = data?.establishments as { slug: string } | { slug: string }[] | null | undefined
    const meuSlug = Array.isArray(est) ? est[0]?.slug : est?.slug
    return meuSlug === slug
  }, [slug])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { if (data.session && (await verificar())) setLogado(true) })
  }, [verificar])

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!senha) return setErro('Digite a senha.')
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: emailDoBarbeiro(slug), password: senhaParaServidor(senha) })
    if (error || !(await verificar())) {
      await supabase.auth.signOut()
      setCarregando(false)
      return setErro('Senha incorreta.')
    }
    setCarregando(false)
    setLogado(true)
  }

  if (logado) {
    return (
      <main className="px-6 py-10">
        <h2 className="font-titulo text-2xl text-ouro">Painel do barbeiro</h2>
        <div className="mt-6 space-y-3">
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/agenda`}>AGENDA</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/servicos`}>GERENCIAR SERVIÇOS</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/horarios`}>HORÁRIOS</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/bloqueios`}>BLOQUEAR HORÁRIOS</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/clientes`}>CLIENTES</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/config`}>CONFIGURAÇÕES E PIX</Link>
          <Link className="btn-ouro block text-center" to={`/b/${slug}/painel/qrcode`}>QR CODE</Link>
        </div>
        <button className="mt-8 text-sm text-white/50 underline" onClick={async () => { await supabase.auth.signOut(); setLogado(false); setSenha('') }}>Sair</button>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col justify-end px-6 pb-16">
      <Fundo />
      <form onSubmit={entrar} className="space-y-4">
        <h2 className="font-titulo text-2xl text-ouro">Acesso do barbeiro</h2>
        <input className="campo" type="password" placeholder="Senha" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button className="btn-ouro" disabled={carregando}>{carregando ? 'Entrando...' : 'ENTRAR'}</button>
      </form>
    </main>
  )
}
