import { useEffect, useRef, useState } from 'react'

const OURO = '#d4af37'

// Salão sem figuras: cadeiras, espelhos, luminárias e brilho. É o plano B quando não há vídeo.
function Salao() {
  const cadeira = (x: number) => (
    <g transform={`translate(${x} 330)`}>
      <rect x="-26" y="-70" width="52" height="64" rx="14" fill="#141414" stroke={OURO} strokeOpacity=".5" />
      <rect x="-32" y="-8" width="64" height="18" rx="8" fill="#1c1c1c" stroke={OURO} strokeOpacity=".6" />
      <rect x="-38" y="-20" width="8" height="22" rx="4" fill="#222" />
      <rect x="30" y="-20" width="8" height="22" rx="4" fill="#222" />
      <rect x="-5" y="10" width="10" height="48" fill="#222" />
      <ellipse cy="62" rx="30" ry="7" fill="#1a1a1a" stroke={OURO} strokeOpacity=".4" />
      <rect x="-22" y="30" width="44" height="6" rx="3" fill="#1a1a1a" />
    </g>
  )
  return (
    <svg viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="chao" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#15110a" /><stop offset="1" stopColor="#000" /></linearGradient>
        <radialGradient id="brilho"><stop offset="0" stopColor={OURO} stopOpacity=".6" /><stop offset="1" stopColor={OURO} stopOpacity="0" /></radialGradient>
        <linearGradient id="varre" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="400" height="470" fill="#0a0a0a" />
      <rect y="470" width="400" height="230" fill="url(#chao)" />
      {[100, 300].map(x => (
        <g key={x}>
          <rect x={x - 56} y="130" width="112" height="170" rx="8" fill="#0c0c0c" stroke={OURO} strokeWidth="2.5" />
          <rect x={x - 50} y="136" width="100" height="158" rx="4" fill="#fff" opacity=".05" />
        </g>
      ))}
      {[70, 200, 330].map((x, i) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2="62" stroke="#333" />
          <path d={`M${x - 15} 80 L${x - 7} 62 L${x + 7} 62 L${x + 15} 80 Z`} fill="#222" stroke={OURO} />
          <circle className="anima" cx={x} cy="96" r="52" fill="url(#brilho)" style={{ animation: `luz 4s ease-in-out ${i}s infinite` }} />
        </g>
      ))}
      {cadeira(100)}
      {cadeira(300)}
      <rect className="anima" x="-120" y="0" width="120" height="700" fill="url(#varre)" style={{ animation: 'varre 9s ease-in-out infinite' }} />
    </svg>
  )
}

// Se existir public/fundo/barbearia.mp4 (vídeo real), ele toca em loop. Veja public/fundo/LEIA-ME.txt.
export default function Fundo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [semVideo, setSemVideo] = useState(false)
  const reduz = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    const f = () => (document.hidden ? ref.current?.pause() : ref.current?.play().catch(() => {}))
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [])

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-black">
      {semVideo || reduz ? (
        <Salao />
      ) : (
        <video
          ref={ref} className="h-full w-full object-cover" autoPlay muted loop playsInline preload="metadata"
          onError={() => setSemVideo(true)} onLoadedData={e => e.currentTarget.play().catch(() => {})}
        >
          <source src="/fundo/barbearia.mp4" type="video/mp4" onError={() => setSemVideo(true)} />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-black/85" />
    </div>
  )
}
