import { useNavigate, useParams } from 'react-router-dom'
import Fundo from '../components/Fundo'

export default function Access() {
  const { slug } = useParams()
  const nav = useNavigate()
  return (
    <main className="flex min-h-screen flex-col items-center justify-end gap-4 px-6 pb-16">
      <Fundo />
      <h2 className="mb-2 text-center font-titulo text-2xl text-ouro">Como você deseja entrar?</h2>
      <button className="btn-ouro max-w-xs" onClick={() => nav(`/b/${slug}/cliente`)}>SOU CLIENTE</button>
      <button className="btn-borda max-w-xs bg-black/60" onClick={() => nav(`/b/${slug}/barbeiro`)}>SOU BARBEIRO</button>
    </main>
  )
}
