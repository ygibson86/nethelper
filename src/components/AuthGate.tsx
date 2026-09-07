import { LockKeyhole, LogIn, Network, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getServerData, getSession, login, saveServerData } from '../api'
import { initialData, useNetHelper } from '../store'
import type { AppData } from '../types'
import { parseAppData } from '../dataValidation'
import { SaveStateContext, type SaveState } from './saveState'

function snapshot(state: AppData): AppData {
  return {
    version: state.version,
    manufacturers: state.manufacturers,
    switches: state.switches,
    racks: state.racks,
    groups: state.groups,
    topologies: state.topologies,
    corePanels: state.corePanels,
    settings: state.settings,
    configTemplates: state.configTemplates,
  }
}

function LoginPage({ onLogin }: { onLogin: () => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(password)
      await onLogin()
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 401 ? 'Неверный пароль.' : 'Не удалось связаться с сервером. Повторите попытку.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="login-brand"><span className="brand-mark"><Network size={25} /></span><span>NetHelper</span></div><p>Общая конфигурация сетевой инфраструктуры</p><form onSubmit={submit}><label>Пароль администратора<input type="password" autoFocus required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="login-error" role="alert">{error}</div>}<button className="button primary" disabled={busy}><LogIn size={17} /> {busy ? 'Вход...' : 'Войти'}</button></form><small><LockKeyhole size={13} /> Данные защищены общей серверной сессией</small></section></main>
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'login' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const serverRevision = useRef<number | null>(null)
  const pendingChanges = useRef(false)
  const replaceData = useNetHelper((state) => state.replaceData)
  const retrySave = useCallback(() => {
    const current = useNetHelper.getState()
    useNetHelper.setState({ settings: { ...current.settings } })
  }, [])

  const loadData = useCallback(async () => {
    setStatus('loading')
    setLoadError('')
    try {
      const result = await getServerData()
      const isUninitialized = result.data && typeof result.data === 'object' && Object.keys(result.data).length === 0
      const initialized = isUninitialized ? await saveServerData(initialData, result.revision) : result
      const parsed = parseAppData(initialized.data)
      if (!parsed.data) throw new Error(parsed.errors.join(' '))
      replaceData(parsed.data)
      serverRevision.current = initialized.revision
      pendingChanges.current = false
      setSaveState({ status: 'saved' })
      setStatus('ready')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setStatus('login')
        return
      }
      setLoadError('Рабочие данные не удалось загрузить. Локальные данные не были заменены.')
      setStatus('error')
    }
  }, [replaceData])

  useEffect(() => {
    getSession().then(() => loadData()).catch(() => setStatus('login'))
  }, [loadData])

  useEffect(() => {
    if (status !== 'ready') return
    let timer: number | undefined
    let saving = false
    let queued = false
    let disposed = false

    const persist = async () => {
      if (saving) {
        queued = true
        return
      }
      const revision = serverRevision.current
      if (revision === null) return
      saving = true
      queued = false
      setSaveState({ status: 'saving' })
      try {
        const result = await saveServerData(snapshot(useNetHelper.getState()), revision)
        if (disposed) return
        serverRevision.current = result.revision
        pendingChanges.current = queued
        setSaveState(queued ? { status: 'dirty' } : { status: 'saved' })
      } catch (reason) {
        if (disposed) return
        if (reason instanceof ApiError && reason.status === 409) setSaveState({ status: 'conflict', message: 'Данные изменены в другом окне. Перезагрузите страницу перед продолжением.' })
        else if (reason instanceof ApiError && reason.status === 401) setSaveState({ status: 'error', message: 'Сессия истекла. Перезагрузите страницу и войдите снова.' })
        else if (reason instanceof ApiError && reason.status === 400) setSaveState({ status: 'error', message: 'Изменения не прошли серверную проверку. Экспортируйте данные перед перезагрузкой.' })
        else setSaveState({ status: 'error', message: 'Не удалось сохранить изменения. Проверьте соединение.' })
      } finally {
        saving = false
        if (queued && !disposed) {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => { void persist() }, 100)
        }
      }
    }

    const unsubscribe = useNetHelper.subscribe(() => {
      pendingChanges.current = true
      setSaveState({ status: 'dirty' })
      if (saving) queued = true
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { void persist() }, 700)
    })
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!saving && !pendingChanges.current) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.removeEventListener('beforeunload', warnBeforeUnload)
      unsubscribe()
    }
  }, [status])

  if (status === 'loading') return <main className="login-page" aria-busy="true"><div className="login-loading" role="status">Загрузка NetHelper...</div></main>
  if (status === 'login') return <LoginPage onLogin={loadData} />
  if (status === 'error') return <main className="login-page"><section className="login-card load-error"><div className="login-brand"><span className="brand-mark"><Network size={25} /></span><span>NetHelper</span></div><h1>Ошибка загрузки</h1><p role="alert">{loadError}</p><button className="button primary" onClick={() => void loadData()}><RefreshCw size={17} /> Повторить</button></section></main>
  return <SaveStateContext.Provider value={{ ...saveState, retry: retrySave }}>{children}</SaveStateContext.Provider>
}
