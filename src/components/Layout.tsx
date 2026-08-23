import { Boxes, Cable, LogOut, Moon, Network, Settings, Sun } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useNetHelper } from '../store'
import { logout } from '../api'

const pageNames: Record<string, string> = {
  racks: 'Шкафы',
  topology: 'Схемы',
  core: 'Core-коммутаторы',
  settings: 'Настройки',
}

export function Layout() {
  const settings = useNetHelper((state) => state.settings)
  const updateSettings = useNetHelper((state) => state.updateSettings)
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.style.fontSize = `${settings.fontSize}px`
  }, [settings])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Network size={22} /></span><span>NetHelper</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <NavLink to="/racks"><Boxes size={19} /> Шкафы</NavLink>
          <NavLink to="/topology"><Network size={19} /> Схемы</NavLink>
          <NavLink to="/core"><Cable size={19} /> Core-коммутаторы</NavLink>
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings"><Settings size={19} /> Настройки</NavLink>
          <button className="theme-toggle" onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
            {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          <button className="theme-toggle" onClick={() => { void logout().finally(() => window.location.reload()) }}><LogOut size={18} /> Выйти</button>
          <div className="storage-note"><span className="status-dot" /> Данные сохранены локально</div>
        </div>
      </aside>
      <main className="main-content">
        <div className="breadcrumbs"><span>NetHelper</span>{parts.map((part, index) => <span key={`${part}-${index}`}>/ {pageNames[part] ?? decodeURIComponent(part)}</span>)}</div>
        <Outlet />
      </main>
    </div>
  )
}

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>
      {children}
    </section>
  </div>
}
