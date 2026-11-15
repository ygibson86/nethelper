import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { globalSearch } from '../search'
import { useNetHelper } from '../store'
import { Modal } from './Layout'

export function GlobalSearch() {
  const data = useNetHelper()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const results = useMemo(() => globalSearch(data, query), [data, query])
  const visible = results.slice(0, 80)
  const navigate = useNavigate()
  const location = useLocation()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastCtrl = useRef(0)
  const ctrlDown = useRef(false)
  const chordUsed = useRef(false)
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Control') {
        if (!event.repeat && !ctrlDown.current) { ctrlDown.current = true; chordUsed.current = event.altKey || event.shiftKey || event.metaKey }
      } else { lastCtrl.current = 0; if (ctrlDown.current) chordUsed.current = true }
    }
    const up = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || !ctrlDown.current) return
      ctrlDown.current = false
      if (chordUsed.current || triggerRef.current?.closest('[inert]') || document.querySelector('[role="dialog"]') || location.pathname.startsWith('/terminal')) { lastCtrl.current = 0; return }
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],.xterm')) { lastCtrl.current = 0; return }
      const now = performance.now()
      if (lastCtrl.current && now - lastCtrl.current < 450) { setOpen(true); lastCtrl.current = 0 } else lastCtrl.current = now
    }
    const blur = () => { lastCtrl.current = 0; ctrlDown.current = false; chordUsed.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [location.pathname])
  const select = (to: string) => { setOpen(false); setQuery(''); setIndex(0); navigate(to) }
  return <>
    <button ref={triggerRef} className="global-search-trigger" onClick={() => setOpen(true)}><Search size={18} /><span>Найти устройство</span><kbd>Ctrl ×2</kbd></button>
    {open && <Modal title="Поиск по IP / hostname" onClose={() => setOpen(false)} className="global-search-modal"><div className="global-search-content" onKeyDown={(event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setIndex((value) => Math.min(value + 1, visible.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)) }
      if (event.key === 'Enter' && visible[index]) { event.preventDefault(); select(visible[index].to) }
    }}>
      <input autoFocus aria-label="IP или hostname" value={query} placeholder="Например, 10.109.33.48 или SW0048" onChange={(event) => { setQuery(event.target.value); setIndex(0) }} />
      <p className="page-subtitle">Устройства в шкафах, узлы схем и Core-порты. ↑ ↓ — выбор, Enter — открыть.</p>
      {!query.trim() ? <p>Введите IP или hostname.</p> : <><p role="status">Найдено: {results.length}{results.length > 80 && ' · показаны первые 80, уточните запрос'}</p><div className="global-search-results">{visible.map((result, resultIndex) => <button key={result.id} className={index === resultIndex ? 'selected' : ''} onFocus={() => setIndex(resultIndex)} onClick={() => select(result.to)}><small>{result.kind}</small><strong>{result.title}</strong><span>{result.subtitle}</span></button>)}{!results.length && <p>Совпадений нет.</p>}</div></>}
    </div></Modal>}
  </>
}
