import { useNavigate, useParams } from 'react-router-dom'
import { supabaseConfigurado } from '../lib/supabase'
import Fundo from '../components/Fundo'

export default function Splash() {
  const { slug } = useParams()
  const nav = useNavigate()
  return (
    <main className="flex min-h-screen flex-col items-center justify-end px-6 pb-16 text-center">
      <Fundo />
      <h1 className="font-titulo text-4xl font-extrabold text-ouro drop-shadow">BARBEARIA PEAKY</h1>
      <p className="mt-2 text-white/70">Santana de Parnaíba, SP</p>
      <button className="btn-ouro mt-8 max-w-xs" onClick={() => nav(`/b/${slug}/acesso`)}>ENTRAR</button>
      {!supabaseConfigurado && (
        <p className="mt-6 text-sm text-red-400">Banco de dados não configurado. Preencha o arquivo .env (veja o README).</p>
      )}
    </main>
  )
}
