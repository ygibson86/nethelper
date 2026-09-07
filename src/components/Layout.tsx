import { Boxes, Cable, FileCode2, LogOut, Menu, Moon, Network, Settings, Sun, X } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useId, useRef, useState } from 'react'
import { useNetHelper } from '../store'
import { logout } from '../api'
import { useSaveState } from './saveState'

const pageNames: Record<string, string> = {
  racks: 'Шкафы',
  topology: 'Схемы',
  core: 'Core-коммутаторы',
  templates: 'Шаблоны',
  settings: 'Настройки',
}

export function Layout() {
  const settings = useNetHelper((state) => state.settings)
  const updateSettings = useNetHelper((state) => state.updateSettings)
  const topologies = useNetHelper((state) => state.topologies)
  const location = useLocation()
  const saveState = useSaveState()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const parts = location.pathname.split('/').filter(Boolean)
  const saveLabel = saveState.status === 'saving' ? 'Сохранение…' : saveState.status === 'dirty' ? 'Есть несохранённые изменения' : saveState.status === 'error' ? 'Ошибка сохранения' : saveState.status === 'conflict' ? 'Конфликт изменений' : 'Все изменения сохранены'
  const recoveryData = () => {
    const state = useNetHelper.getState()
    return { version: state.version, manufacturers: state.manufacturers, switches: state.switches, racks: state.racks, groups: state.groups, topologies: state.topologies, corePanels: state.corePanels, settings: state.settings, configTemplates: state.configTemplates }
  }
  const downloadRecovery = () => {
    const blob = new Blob([JSON.stringify(recoveryData(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nethelper-recovery-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const loadServerVersion = () => {
    if (!confirm('Серверная версия заменит текущие изменения. Резервная копия будет сохранена в браузере. Продолжить?')) return
    localStorage.setItem('nethelper-conflict-recovery', JSON.stringify(recoveryData()))
    downloadRecovery()
    window.location.reload()
  }
  const signOut = async () => {
    if (['dirty', 'saving', 'error', 'conflict'].includes(saveState.status)) {
      alert('Перед выходом дождитесь сохранения данных или скачайте резервную копию изменений.')
      return
    }
    await logout().finally(() => window.location.reload())
  }

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.style.fontSize = `${settings.fontSize}px`
  }, [settings])

  useEffect(() => {
    const section = location.pathname.split('/').filter(Boolean)[0]
    document.title = `${pageNames[section] ?? 'NetHelper'} — NetHelper`
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const sidebar = sidebarRef.current
    const focusable = () => [...(sidebar?.querySelectorAll<HTMLElement>('a, button:not([disabled])') ?? [])]
    focusable()[0]?.focus()
    const handleMenuKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleMenuKey)
    return () => document.removeEventListener('keydown', handleMenuKey)
  }, [mobileNavOpen])

  return (
    <div className="app-shell">
      <button ref={menuButtonRef} className="mobile-menu-button" aria-controls="main-sidebar" aria-label={mobileNavOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={21} /> : <Menu size={21} />}</button>
      {mobileNavOpen && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMobileNavOpen(false)} />}
      <aside ref={sidebarRef} id="main-sidebar" className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Network size={22} /></span><span>NetHelper</span></div>
        <nav className="main-nav" aria-label="Основная навигация">
          <NavLink to="/racks" onClick={() => setMobileNavOpen(false)}><Boxes size={19} /> Шкафы</NavLink>
          <NavLink to="/topology" onClick={() => setMobileNavOpen(false)}><Network size={19} /> Схемы</NavLink>
          <NavLink to="/core" onClick={() => setMobileNavOpen(false)}><Cable size={19} /> Core-коммутаторы</NavLink>
          <NavLink to="/templates" onClick={() => setMobileNavOpen(false)}><FileCode2 size={19} /> Шаблоны</NavLink>
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" onClick={() => setMobileNavOpen(false)}><Settings size={19} /> Настройки</NavLink>
          <button className="theme-toggle" aria-pressed={settings.theme === 'light'} onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
            {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            {settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          <button className="theme-toggle" onClick={() => { void signOut() }}><LogOut size={18} /> Выйти</button>
          <div className={`storage-note save-${saveState.status}`} role="status"><span className="status-dot" /> {saveLabel}</div>
          {saveState.message && <p className="save-message" role="alert">{saveState.message}</p>}
          {saveState.status === 'error' && <><button className="save-action" onClick={saveState.retry}>Повторить сохранение</button><button className="save-action" onClick={downloadRecovery}>Скачать мои изменения</button><button className="save-action" onClick={loadServerVersion}>Перезагрузить и войти снова</button></>}
          {saveState.status === 'conflict' && <><button className="save-action" onClick={downloadRecovery}>Скачать мои изменения</button><button className="save-action" onClick={loadServerVersion}>Загрузить серверную версию</button></>}
        </div>
      </aside>
      <main className="main-content">
        <nav className="breadcrumbs" aria-label="Хлебные крошки"><span>NetHelper</span>{parts.map((part, index) => <span key={`${part}-${index}`}>/ {pageNames[part] ?? (index === 1 && parts[0] === 'topology' ? topologies.find((item) => item.id === part)?.name : undefined) ?? decodeURIComponent(part)}</span>)}</nav>
        <Outlet />
      </main>
    </div>
  )
}

interface ModalProps {
  title: string
  children: React.ReactNode
  onClose: () => void
  className?: string
}

export function Modal({ title, children, onClose, className }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const previousOverflow = document.body.style.overflow
    const inerted: { element: HTMLElement; wasInert: boolean }[] = []
    let branch: HTMLElement | null = backdropRef.current
    while (branch?.parentElement && branch.parentElement !== document.body) {
      const parent: HTMLElement = branch.parentElement
      for (const sibling of parent.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inerted.push({ element: sibling, wasInert: sibling.inert })
          sibling.inert = true
        }
      }
      branch = parent
    }
    document.body.style.overflow = 'hidden'
    const preferredFocus = dialog?.querySelector<HTMLElement>('[autofocus]')
    const focusable = dialog?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    ;(preferredFocus ?? focusable ?? dialog)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const elements = [...dialog.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      inerted.forEach(({ element, wasInert }) => { element.inert = wasInert })
      previousFocus?.focus()
    }
  }, [])

  return <div ref={backdropRef} className="modal-backdrop">
    <section ref={dialogRef} tabIndex={-1} className={className ? `modal ${className}` : 'modal'} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">×</button></div>
      {children}
    </section>
  </div>
}
