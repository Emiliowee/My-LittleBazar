import { useEffect, useState } from 'react'
import {
  ScanLine, Shirt, WalletCards, ArrowUpRight, Search, Store
} from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { openPdvWindowAction } from '@/lib/openPdvWindow'
import { emojiDeCategoria, esRutaImagen, rutaAFileUrl } from '@/lib/categoriaEmoji'
import './inicio-monserrat.css'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function Dashboard({ onNavigate, settings }) {
  const [recientes, setRecientes] = useState([])
  const [resumen, setResumen] = useState(null)

  useEffect(() => {
    const api = window?.bazar?.db
    if (!api?.getInventoryList) return
    let alive = true
    api.getInventoryList({ search: '', estadoIndex: 0, vistaIndex: 0, listTab: 'main' })
      .then((rows) => { if (alive && Array.isArray(rows)) setRecientes(rows.slice(0, 4)) })
      .catch(() => {})
    if (api.getWelcomeSnapshot) {
      api.getWelcomeSnapshot().then((s) => { if (alive && s) setResumen(s) }).catch(() => {})
    }
    return () => { alive = false }
  }, [])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const dateLine = `${DAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}`

  const workspaceName = String(settings?.workspaceDisplayName || 'Mi Bazar').trim() || 'Mi Bazar'
  const categoriasMeta = settings?.categoriasMeta && typeof settings.categoriasMeta === 'object' ? settings.categoriasMeta : {}

  return (
    <div className="keeby-home-layout">
      
      {/* Spotlight Search */}
      <div className="keeby-spotlight" onClick={() => onNavigate?.('inventario')}>
        <Search size={24} className="keeby-icon-muted" />
        <span className="keeby-spotlight-text">Busca prendas, clientes o presiona...</span>
        <kbd className="keeby-kbd">F2</kbd>
      </div>

      {/* Hero Greeting */}
      <div className="keeby-hero">
        <div className="keeby-hero-icon">
          <Store size={36} className="keeby-icon-main" />
        </div>
        <div className="keeby-hero-text">
          <h1>{greeting}, {workspaceName}</h1>
          <p>{dateLine}</p>
        </div>
      </div>

      {/* Keeby Pads */}
      <div className="keeby-pad-grid">
        <button className="keeby-pad" onClick={() => void openPdvWindowAction()}>
          <div className="keeby-pad-icon" style={{ color: '#6ee7b7' }}>
            <ScanLine size={32} />
          </div>
          <div className="keeby-pad-content">
            <h3>Punto de Venta</h3>
            <p>Cobrar e iniciar terminal</p>
          </div>
        </button>

        <button className="keeby-pad" onClick={() => void onNavigate?.('inventario')}>
          <div className="keeby-pad-icon" style={{ color: '#93c5fd' }}>
            <Shirt size={32} />
          </div>
          <div className="keeby-pad-content">
            <h3>Inventario</h3>
            <p>Gestionar prendas y catálogo</p>
          </div>
        </button>

        <button className="keeby-pad" onClick={() => void onNavigate?.('saldos')}>
          <div className="keeby-pad-icon" style={{ color: '#fca5a5' }}>
            <WalletCards size={32} />
          </div>
          <div className="keeby-pad-content">
            <h3>Saldos</h3>
            <p>Cuentas de clientes</p>
          </div>
        </button>
      </div>

      {/* Resumen / Ingresos Recientes */}
      <div className="keeby-recent-section">
        <div className="keeby-recent-header">
          <h3>Ingresos Recientes</h3>
          <button className="keeby-link" onClick={() => void onNavigate?.('inventario')}>Ver todo</button>
        </div>
        
        <div className="keeby-recent-list">
          {recientes.length > 0 ? recientes.map((r, i) => {
            const ic = emojiDeCategoria(r.categoria, categoriasMeta)
            return (
              <div key={r.id ?? i} className="keeby-recent-item" onClick={() => void onNavigate?.('inventario')}>
                <div className="keeby-recent-emoji">
                  {esRutaImagen(ic) ? <img src={rutaAFileUrl(ic)} alt="" /> : ic}
                </div>
                <div className="keeby-recent-info">
                  <h4>{r?.descripcion || r?.codigo || 'Sin nombre'}</h4>
                  <p>{r?.codigo}</p>
                </div>
                <div className="keeby-recent-price">
                  {formatPrice(Number(r?.precio) || 0)}
                </div>
              </div>
            )
          }) : (
            <div className="keeby-recent-empty">
              No hay ingresos recientes. Abre el inventario para empezar.
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
