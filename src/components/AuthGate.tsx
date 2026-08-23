import { LockKeyhole, LogIn, Network } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { getServerData, getSession, login } from '../api'
import { initialData, useNetHelper } from '../store'
import type { AppData } from '../types'

function snapshot(state: AppData): AppData {
  return {
    version: state.version,
    manufacturers: state.manufacturers,
    switches: state.switches,
    racks: state.racks,
    topologies: state.topologies,
    corePanels: state.corePanels,
    settings: state.settings,
  }
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(password)
      onLogin()
    } catch {
      setError('Неверный пароль или сервер недоступен.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="login-brand"><span className="brand-mark"><Network size={25} /></span><span>NetHelper</span></div><p>Общая конфигурация сетевой инфраструктуры</p><form onSubmit={submit}><label>Пароль администратора<input type="password" autoFocus required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="login-error">{error}</div>}<button className="button primary" disabled={busy}><LogIn size={17} /> {busy ? 'Вход...' : 'Войти'}</button></form><small><LockKeyhole size={13} /> Данные защищены общей серверной сессией</small></section></main>
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'ready'>('loading')
  const replaceData = useNetHelper((state) => state.replaceData)

  const loadData = useCallback(async () => {
    try {
      const result = await getServerData()
      if (Array.isArray(result.data.racks) && Array.isArray(result.data.switches) && Array.isArray(result.data.topologies)) replaceData(result.data)
      else throw new Error('invalid_server_data')
    } catch {
      replaceData(initialData)
    }
    setStatus('ready')
  }, [replaceData])

  useEffect(() => {
    getSession().then(() => loadData()).catch(() => setStatus('login'))
  }, [loadData])

  useEffect(() => {
    if (status !== 'ready') return
    let timer: number | undefined
    const unsubscribe = useNetHelper.subscribe((state) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void fetch('/api/data', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot(state)) })
      }, 700)
    })
    return () => { window.clearTimeout(timer); unsubscribe() }
  }, [status])

  if (status === 'loading') return <main className="login-page"><div className="login-loading">Загрузка NetHelper...</div></main>
  if (status === 'login') return <LoginPage onLogin={loadData} />
  return <>{children}</>
}
