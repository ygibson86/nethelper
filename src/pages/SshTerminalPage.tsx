import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { AlertTriangle, KeyRound, Plug, RotateCcw, SquareTerminal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useNetHelper } from '../store'

type TerminalStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'
type ServerMessage = { type: string; data?: string; encoding?: string; message?: string; code?: string; fingerprint?: string; expected?: string; hostname?: string; ip?: string }

export function SshTerminalPage() {
  const { deviceId = '' } = useParams()
  const location = useLocation()
  const presetHost = new URLSearchParams(location.search).get('host') ?? ''
  const manual = !deviceId
  const device = useNetHelper((state) => state.switches.find((item) => item.id === deviceId))
  const [host, setHost] = useState(presetHost)
  const terminalHost = useRef<HTMLDivElement>(null)
  const terminal = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const socket = useRef<WebSocket | null>(null)
  const passwordRef = useRef('')
  const awaitingFingerprint = useRef(false)
  const [username, setUsername] = useState(() => localStorage.getItem(`nethelper.ssh.username.${deviceId}`) ?? localStorage.getItem('nethelper.ssh.username') ?? '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<TerminalStatus>('idle')
  const [error, setError] = useState('')
  const [fingerprint, setFingerprint] = useState<{ value: string; changedFrom?: string } | null>(null)

  useEffect(() => {
    if (!terminalHost.current) return
    const instance = new Terminal({ cursorBlink: true, convertEol: true, fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: 14, theme: { background: '#0d131c', foreground: '#d8e1ec', cursor: '#36c98f', selectionBackground: '#36c98f55' }, scrollback: 5000 })
    const fit = new FitAddon()
    instance.loadAddon(fit)
    instance.open(terminalHost.current)
    fit.fit()
    terminal.current = instance
    fitAddon.current = fit
    const input = instance.onData((data) => {
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input', data }))
    })
    const resize = new ResizeObserver(() => {
      fit.fit()
      if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'resize', cols: instance.cols, rows: instance.rows }))
    })
    resize.observe(terminalHost.current)
    return () => { resize.disconnect(); input.dispose(); socket.current?.close(); instance.dispose() }
  }, [])

  const connect = useCallback((acceptedFingerprint?: string) => {
    const targetHost = device?.ip ?? host.trim()
    if ((!manual && !device) || !targetHost || !username.trim() || !passwordRef.current) return
    socket.current?.close()
    setStatus('connecting')
    setError('')
    setFingerprint(null)
    awaitingFingerprint.current = false
    terminal.current?.clear()
    terminal.current?.writeln(`\x1b[36mПодключение к ${device?.hostname ?? targetHost}…\x1b[0m`)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const endpoint = manual ? '/api/ssh/connect' : `/api/ssh/devices/${encodeURIComponent(device!.id)}`
    const ws = new WebSocket(`${protocol}//${window.location.host}${endpoint}`)
    socket.current = ws
    ws.addEventListener('open', () => {
      const fit = fitAddon.current
      fit?.fit()
      ws.send(JSON.stringify({ type: 'connect', host: manual ? targetHost : undefined, username: username.trim(), password: passwordRef.current, fingerprint: acceptedFingerprint, cols: terminal.current?.cols ?? 120, rows: terminal.current?.rows ?? 32 }))
    })
    ws.addEventListener('message', (event) => {
      if (socket.current !== ws) return
      let message: ServerMessage
      try { message = JSON.parse(String(event.data)) as ServerMessage } catch { return }
      if (message.type === 'output' && message.data) terminal.current?.write(message.encoding === 'base64' ? Uint8Array.from(atob(message.data), (char) => char.charCodeAt(0)) : message.data)
      if (message.type === 'ready') {
        awaitingFingerprint.current = false
        localStorage.setItem('nethelper.ssh.username', username.trim())
        if (device) localStorage.setItem(`nethelper.ssh.username.${device.id}`, username.trim())
        passwordRef.current = ''
        setPassword('')
        setStatus('connected')
        terminal.current?.focus()
      }
      if (message.type === 'host-key-unknown' && message.fingerprint) {
        awaitingFingerprint.current = true
        setFingerprint({ value: message.fingerprint })
        setStatus('idle')
      }
      if (message.type === 'host-key-changed' && message.fingerprint) {
        awaitingFingerprint.current = false
        passwordRef.current = ''
        setPassword('')
        setFingerprint({ value: message.fingerprint, changedFrom: message.expected })
        setStatus('error')
      }
      if (message.type === 'error') {
        if (!awaitingFingerprint.current) {
          passwordRef.current = ''
          setPassword('')
        }
        setError(message.message ?? 'Ошибка SSH-подключения.')
        setStatus('error')
      }
    })
    ws.addEventListener('close', () => {
      if (socket.current !== ws) return
      if (!awaitingFingerprint.current) { passwordRef.current = ''; setPassword('') }
      setStatus((current) => current === 'connected' ? 'closed' : current)
    })
    ws.addEventListener('error', () => {
      if (socket.current !== ws || awaitingFingerprint.current) return
      passwordRef.current = ''
      setPassword('')
      setError('WebSocket-соединение с NetHelper прервано.')
      setStatus('error')
    })
  }, [device, host, manual, username])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    passwordRef.current = password
    connect()
  }
  const forgetHostKey = async () => {
    if (!confirm('Удалить сохранённый SSH fingerprint? Делайте это только после проверки изменения ключа на устройстве.')) return
    const endpoint = manual ? `/api/ssh/host-keys/by-address/${encodeURIComponent(host.trim())}` : `/api/ssh/host-keys/${encodeURIComponent(deviceId)}`
    const response = await fetch(endpoint, { method: 'DELETE', credentials: 'same-origin' })
    if (!response.ok) { setError('Не удалось удалить сохранённый fingerprint.'); return }
    setFingerprint(null)
    setError('Fingerprint удалён. Подключитесь снова и сверьте новый ключ.')
    setStatus('idle')
  }
  const disconnect = () => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'close' }))
    socket.current?.close()
    passwordRef.current = ''
    setPassword('')
    setStatus('closed')
  }

  if (!manual && !device) return <div className="empty-state"><SquareTerminal size={44} /><h2>Устройство не найдено</h2><p>Проверьте ссылку или вернитесь к списку шкафов.</p></div>

  return <div className="ssh-terminal-page">
    <header className="page-header compact"><div><p className="eyebrow">Удалённый доступ</p><h1>{device ? `SSH · ${device.hostname}` : 'SSH-терминал'}</h1><p className="page-subtitle">{device ? `${device.ip} · ` : ''}пароль не сохраняется</p></div><div className={`ssh-status status-${status}`}><span />{status === 'idle' ? 'Не подключено' : status === 'connecting' ? 'Подключение…' : status === 'connected' ? 'Подключено' : status === 'closed' ? 'Сессия завершена' : 'Ошибка'}</div></header>
    {status !== 'connected' && <form className="ssh-login-card" onSubmit={submit}><div className="ssh-login-title"><KeyRound size={20} /><div><strong>Учётные данные SSH</strong><span>Вставьте пароль из Passbolt</span></div></div>{manual && <label>IPv4-адрес<input autoFocus required inputMode="decimal" value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.31.5" /></label>}<label>Пользователь<input autoFocus={!manual} required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" /></label><label>Пароль<input required type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); passwordRef.current = event.target.value }} /></label><button className="button primary" disabled={status === 'connecting'}><Plug size={17} /> {status === 'connecting' ? 'Подключение…' : 'Подключиться'}</button></form>}
    {fingerprint && !fingerprint.changedFrom && <section className="ssh-warning"><AlertTriangle size={22} /><div><strong>Новый ключ устройства</strong><p>Сверьте fingerprint устройства перед первым подключением.</p><code>{fingerprint.value}</code><div className="ssh-warning-actions"><button className="button primary" onClick={() => connect(fingerprint.value)}>Доверять и подключиться</button><button className="button" onClick={() => { awaitingFingerprint.current = false; passwordRef.current = ''; setPassword(''); setFingerprint(null) }}>Отмена</button></div></div></section>}
    {fingerprint?.changedFrom && <section className="ssh-warning danger"><AlertTriangle size={22} /><div><strong>SSH-ключ устройства изменился</strong><p>Подключение заблокировано. Проверьте устройство и удалите сохранённый ключ только после подтверждения изменения.</p><code>Сохранён: {fingerprint.changedFrom}</code><code>Получен: {fingerprint.value}</code><div className="ssh-warning-actions"><button className="button danger-button" onClick={() => void forgetHostKey()}>Забыть сохранённый ключ</button></div></div></section>}
    {error && <div className="ssh-error" role="alert">{error}</div>}
    <section className="ssh-console"><div className="ssh-console-toolbar"><span><SquareTerminal size={15} /> xterm-256color</span>{status === 'connected' ? <button className="button danger-button" onClick={disconnect}>Отключиться</button> : <button className="button" onClick={() => { terminal.current?.clear(); setError(''); setStatus('idle') }}><RotateCcw size={15} /> Очистить</button>}</div><div ref={terminalHost} className="ssh-terminal-host" /></section>
  </div>
}
