import { Navigate, Route, Routes } from 'react-router-dom'
import Splash from './pages/Splash'
import Access from './pages/Access'
import CustomerRegister from './pages/CustomerRegister'
import CustomerHome from './pages/CustomerHome'
import BarberLogin from './pages/BarberLogin'
import ServicesAdmin from './pages/ServicesAdmin'
import Agendar from './pages/Agendar'
import AgendaAdmin from './pages/AgendaAdmin'
import HorariosAdmin from './pages/HorariosAdmin'
import PagamentoPix from './pages/PagamentoPix'
import ConfigAdmin from './pages/ConfigAdmin'
import ClientesAdmin from './pages/ClientesAdmin'
import BloqueiosAdmin from './pages/BloqueiosAdmin'
import QrAdmin from './pages/QrAdmin'

const defaultSlug = import.meta.env.VITE_DEFAULT_SLUG as string | undefined

// Cada barbearia tem seu próprio endereço: /b/<slug> (é o link que o QR Code abre).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={defaultSlug ? <Navigate to={`/b/${defaultSlug}`} replace /> : <p className="p-6">Abra o link da sua barbearia.</p>} />
      <Route path="/b/:slug" element={<Splash />} />
      <Route path="/b/:slug/acesso" element={<Access />} />
      <Route path="/b/:slug/cliente" element={<CustomerRegister />} />
      <Route path="/b/:slug/inicio" element={<CustomerHome />} />
      <Route path="/b/:slug/barbeiro" element={<BarberLogin />} />
      <Route path="/b/:slug/agendar" element={<Agendar />} />
      <Route path="/b/:slug/painel/agenda" element={<AgendaAdmin />} />
      <Route path="/b/:slug/painel/horarios" element={<HorariosAdmin />} />
      <Route path="/b/:slug/pagar/:id" element={<PagamentoPix />} />
      <Route path="/b/:slug/painel/config" element={<ConfigAdmin />} />
      <Route path="/b/:slug/painel/clientes" element={<ClientesAdmin />} />
      <Route path="/b/:slug/painel/bloqueios" element={<BloqueiosAdmin />} />
      <Route path="/b/:slug/painel/qrcode" element={<QrAdmin />} />
      <Route path="/b/:slug/painel/servicos" element={<ServicesAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
