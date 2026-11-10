import { LockKeyhole, LogIn, Network, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getServerData, getSession, login, saveServerData } from '../api'
import { initialData, useNetHelper } from '../store'
import type { AppData } from '../types'
import { parseAppData } from '../dataValidation'
import { mergeAppData } from '../dataMerge'
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
  const serverSnapshot = useRef<AppData | null>(null)
  const pendingChanges = useRef(false)
  const conflicted = useRef(false)
  const applyingRemote = useRef(false)
  const replaceData = useNetHelper((state) => state.replaceData)
  const retrySave = useCallback(() => {
    conflicted.current = false
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
      const migrated = JSON.stringify(parsed.data) !== JSON.stringify(initialized.data) ? await saveServerData(parsed.data, initialized.revision) : initialized
      replaceData(parsed.data)
      serverRevision.current = migrated.revision
      serverSnapshot.current = migrated.data
      pendingChanges.current = false
      conflicted.current = false
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
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('nethelper-data')

    const broadcast = (revision: number, data: AppData) => {
      channel?.postMessage({ type: 'saved', tabId, revision, data })
    }

    const conflictMessage = (details?: string) => details
      ? `Изменения в другой вкладке пересеклись с вашими (${details}). Нажмите «Объединить изменения» или загрузите серверную версию.`
      : 'Данные в другой вкладке изменились. Нажмите «Объединить изменения», скачайте свои изменения или загрузите серверную версию.'

    const persist = async () => {
      if (saving) {
        queued = true
        return
      }
      if (conflicted.current || serverRevision.current === null) return
      saving = true
      queued = false
      setSaveState({ status: 'saving' })
      try {
        let local = snapshot(useNetHelper.getState())
        let revision = serverRevision.current
        let attempts = 0
        while (true) {
          try {
            const result = await saveServerData(local, revision)
            if (disposed) return
            serverRevision.current = result.revision
            serverSnapshot.current = result.data
            pendingChanges.current = queued
            setSaveState(queued ? { status: 'dirty' } : { status: 'saved' })
            broadcast(result.revision, result.data)
            break
          } catch (reason) {
            if (disposed) return
            if (reason instanceof ApiError && reason.status === 409) {
              if (attempts >= 3) {
                conflicted.current = true
                setSaveState({ status: 'conflict', message: conflictMessage() })
                return
              }
              attempts += 1
              const latest = await getServerData()
              if (disposed) return
              const current = snapshot(useNetHelper.getState())
              const merged = serverSnapshot.current ? mergeAppData(serverSnapshot.current, current, latest.data) : null
              const parsed = merged && !merged.conflicts.length ? parseAppData(merged.data) : null
              if (!merged || merged.conflicts.length || !parsed?.data) {
                conflicted.current = true
                setSaveState({ status: 'conflict', message: conflictMessage(merged?.conflicts.slice(0, 3).join(', ')) })
                return
              }
              applyingRemote.current = true
              try { replaceData(parsed.data) } finally { applyingRemote.current = false }
              local = snapshot(useNetHelper.getState())
              revision = latest.revision
              serverRevision.current = latest.revision
              serverSnapshot.current = latest.data
              setSaveState({ status: 'saving' })
              continue
            }
            throw reason
          }
        }
      } catch (reason) {
        if (disposed) return
        if (reason instanceof ApiError && reason.status === 401) setSaveState({ status: 'error', message: 'Сессия истекла. Перезагрузите страницу и войдите снова.' })
        else if (reason instanceof ApiError && reason.status === 400) setSaveState({ status: 'error', message: 'Изменения не прошли серверную проверку. Экспортируйте данные перед перезагрузкой.' })
        else setSaveState({ status: 'error', message: 'Не удалось сохранить изменения. Проверьте соединение.' })
      } finally {
        saving = false
        if (queued && !disposed && !conflicted.current) {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => { void persist() }, 100)
        }
      }
    }

    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        if (disposed || saving) return
        const message = event.data as { type?: string; tabId?: string; revision?: number; data?: unknown } | null
        if (message?.type !== 'saved' || message.tabId === tabId || typeof message.revision !== 'number' || message.data === undefined) return
        const parsed = parseAppData(message.data)
        if (!parsed.data) return

        if (!pendingChanges.current && !conflicted.current) {
          applyingRemote.current = true
          try { replaceData(parsed.data) } finally { applyingRemote.current = false }
          serverRevision.current = message.revision
          serverSnapshot.current = parsed.data
          setSaveState({ status: 'saved' })
          return
        }

        const base = serverSnapshot.current
        if (!base) return
        const merged = mergeAppData(base, snapshot(useNetHelper.getState()), parsed.data)
        const mergedParsed = merged.conflicts.length ? null : parseAppData(merged.data)
        if (!mergedParsed?.data) return
        applyingRemote.current = true
        try { replaceData(mergedParsed.data) } finally { applyingRemote.current = false }
        conflicted.current = false
        serverRevision.current = message.revision
        serverSnapshot.current = parsed.data
        pendingChanges.current = true
        setSaveState({ status: 'dirty' })
        window.clearTimeout(timer)
        timer = window.setTimeout(() => { void persist() }, 200)
      }
    }

    const unsubscribe = useNetHelper.subscribe(() => {
      if (applyingRemote.current) return
      pendingChanges.current = true
      if (conflicted.current) return
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
      channel?.close()
    }
  }, [status, replaceData])

  if (status === 'loading') return <main className="login-page" aria-busy="true"><div className="login-loading" role="status">Загрузка NetHelper...</div></main>
  if (status === 'login') return <LoginPage onLogin={loadData} />
  if (status === 'error') return <main className="login-page"><section className="login-card load-error"><div className="login-brand"><span className="brand-mark"><Network size={25} /></span><span>NetHelper</span></div><h1>Ошибка загрузки</h1><p role="alert">{loadError}</p><button className="button primary" onClick={() => void loadData()}><RefreshCw size={17} /> Повторить</button></section></main>
  return <SaveStateContext.Provider value={{ ...saveState, retry: retrySave }}>{children}</SaveStateContext.Provider>
}
