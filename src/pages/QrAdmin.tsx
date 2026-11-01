import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'

export default function QrAdmin() {
  const { slug = '' } = useParams()
  const nav = useNavigate()
  const [img, setImg] = useState('')
  const [msg, setMsg] = useState('')
  const link = `${window.location.origin}/b/${slug}`

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) nav(`/b/${slug}/barbeiro`, { replace: true }) })
    QRCode.toDataURL(link, { width: 640, margin: 2, color: { dark: '#000000', light: '#ffffff' } }).then(setImg)
  }, [link, slug, nav])

  async function compartilhar() {
    try {
      if (navigator.share) await navigator.share({ title: 'BARBEARIA PEAKY', text: 'Agende seu horário:', url: link })
      else { await navigator.clipboard.writeText(link); setMsg('Link copiado.') }
    } catch { /* o usuário fechou a janela de compartilhar */ }
  }

  return (
    <main className="px-6 py-8">
      <Link to={`/b/${slug}/barbeiro`} className="text-sm text-white/50 underline">Voltar</Link>
      <h2 className="mt-2 font-titulo text-2xl text-ouro">QR Code da barbearia</h2>
      <p className="mt-2 break-all text-sm text-white/60">{link}</p>
      {img && <img src={img} alt="QR Code para agendar" className="mx-auto mt-5 w-full max-w-xs rounded-xl bg-white p-2" />}
      <div className="mt-5 space-y-3">
        <a className="btn-ouro block text-center" href={img} download={`qrcode-${slug}.png`}>BAIXAR QR CODE</a>
        <button className="btn-borda" onClick={compartilhar}>COMPARTILHAR LINK</button>
      </div>
      {msg && <p className="mt-4 text-sm">{msg}</p>}
    </main>
  )
}
