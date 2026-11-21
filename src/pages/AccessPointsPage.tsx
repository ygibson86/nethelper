import { Download, Edit3, Globe, Loader2, Plus, Radio, Search, Terminal, Trash2, Upload, Wifi, WifiOff, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNetHelper } from '../store'
import type { NetworkSwitch } from '../types'
import { Modal } from '../components/Layout'
import { SafeAction } from '../components/SafeAction'
import { WebInterfaceLink } from '../components/WebInterfaceLink'
import { pingHosts } from '../api'
import { accessPoints, accessPointsCsv, buildApImport, isValidIpv4, isValidMac, normalizeMac, resolveUplink, type ApImportPlan } from '../accessPoints'
import { normalizeWebUrl } from '../webUrl'

type SortKey = 'hostname' | 'location' | 'switch'
type PingState = { status: 'checking' | 'up' | 'down'; rtt?: number; checkedAt: number }

const PING_INTERVAL_MS = 30_000
const PING_BATCH = 64
const AP_MODELS = ['WEP-30', 'WOL-30']

const emptyForm = { hostname: '', location: '', ip: '', mac: '', switchId: '', port: '', model: '', note: '', webUrl: '' }

function switchOptions(devices: NetworkSwitch[], selfId?: string) {
  return devices
    .filter((device) => device.deviceType !== 'access-point' && device.id !== selfId)
    .sort((left, right) => left.hostname.localeCompare(right.hostname, 'ru', { numeric: true }))
}

export function AccessPointsPage() {
  const { switches, topologies, addAccessPoint, updateSwitch, deleteSwitch, mergeAccessPoints } = useNetHelper()
  const navigate = useNavigate()
  const points = useMemo(() => accessPoints(switches), [switches])
  const { search } = useLocation()
  const linkedDeviceId = new URLSearchParams(search).get('device')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('hostname')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<NetworkSwitch | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [importPlan, setImportPlan] = useState<ApImportPlan | null>(null)
  const [importName, setImportName] = useState('')
  const [importError, setImportError] = useState('')
  const [ping, setPing] = useState<Record<string, PingState>>({})
  const [pingsActive, setPingsActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const byId = useMemo(() => new Map(switches.map((device) => [device.id, device])), [switches])
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const list = points.filter((device) => {
      if (!term) return true
      const uplink = resolveUplink(device, switches)
      return [
        device.hostname,
        device.ip,
        (device.mac ?? '').toLowerCase(),
        device.description,
        device.model,
        device.note ?? '',
        uplink?.switchDevice?.hostname ?? '',
        uplink?.address ?? '',
        uplink?.port ?? '',
      ].some((value) => value.toLowerCase().includes(term))
    })
    return list.sort((left, right) => {
      if (sort === 'location') return left.description.localeCompare(right.description, 'ru') || left.hostname.localeCompare(right.hostname, 'ru', { numeric: true })
      if (sort === 'switch') {
        const leftUplink = resolveUplink(left, switches)
        const rightUplink = resolveUplink(right, switches)
        return (leftUplink?.address ?? '').localeCompare(rightUplink?.address ?? '', 'ru', { numeric: true }) || (leftUplink?.port ?? '').localeCompare(rightUplink?.port ?? '', 'ru', { numeric: true })
      }
      return left.hostname.localeCompare(right.hostname, 'ru', { numeric: true })
    })
  }, [points, query, sort, switches])

  const unlinked = useMemo(() => points.filter((device) => !resolveUplink(device, switches)), [points, switches])
  const linkedDevice = linkedDeviceId ? byId.get(linkedDeviceId) : undefined
  const selected = (selectedId ? byId.get(selectedId) : null) ?? (linkedDevice?.deviceType === 'access-point' ? linkedDevice : null)

  useEffect(() => {
    if (!linkedDeviceId) return
    const timer = window.setTimeout(() => document.getElementById(`ap-${linkedDeviceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
    return () => window.clearTimeout(timer)
  }, [linkedDeviceId])

  useEffect(() => {
    if (!selectedId) return
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedId(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedId])

  /** ICMP опрашивается только пока страница точек открыта и видима. */
  useEffect(() => {
    const hosts = [...new Set(filtered.map((device) => device.ip.trim()).filter((ip) => isValidIpv4(ip)))]
    if (!hosts.length) return
    let disposed = false
    let timer: number | undefined
    const poll = async () => {
      if (disposed) return
      setPingsActive(true)
      const chunks: string[][] = []
      for (let index = 0; index < hosts.length; index += PING_BATCH) chunks.push(hosts.slice(index, index + PING_BATCH))
      try {
        const responses = await Promise.all(chunks.map((chunk) => pingHosts(chunk)))
        if (disposed) return
        const checkedAt = Date.now()
        const next: Record<string, PingState> = {}
        for (const response of responses) for (const result of response.results) {
          next[result.host] = { status: result.alive ? 'up' : 'down', rtt: result.rtt, checkedAt }
        }
        setPing((previous) => ({ ...previous, ...next }))
      } catch {
        /* тихо: индикатор просто останется прежним */
      } finally {
        if (!disposed) {
          setPingsActive(false)
          timer = window.setTimeout(() => { void poll() }, PING_INTERVAL_MS)
        }
      }
    }
    void poll()
    const wake = () => { if (document.visibilityState === 'visible') { window.clearTimeout(timer); void poll() } }
    document.addEventListener('visibilitychange', wake)
    return () => { disposed = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', wake) }
  }, [filtered])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, model: AP_MODELS[0] })
    setFormError('')
    setAdding(true)
  }
  const openEdit = (device: NetworkSwitch) => {
    const uplink = resolveUplink(device, switches)
    setAdding(false)
    setEditing(device)
    setFormError('')
    setForm({
      hostname: device.hostname,
      location: device.description,
      ip: device.ip,
      mac: device.mac ?? '',
      switchId: uplink?.switchDevice?.id ?? '',
      port: uplink?.port ?? '',
      model: device.model,
      note: device.note ?? '',
      webUrl: device.webUrl ?? '',
    })
  }
  const closeForm = () => { setAdding(false); setEditing(null); setFormError('') }

  const save = (event: FormEvent) => {
    event.preventDefault()
    const hostname = form.hostname.trim()
    const ip = form.ip.trim()
    if (!hostname) { setFormError('Укажите hostname.'); return }
    if (!isValidIpv4(ip)) { setFormError('IP-адрес должен быть корректным IPv4.'); return }
    if (!isValidMac(form.mac)) { setFormError('MAC должен быть в формате AA:BB:CC:DD:EE:FF.'); return }
    const duplicateHost = switches.find((device) => device.id !== editing?.id && device.hostname.trim().toLowerCase() === hostname.toLowerCase())
    if (duplicateHost) { setFormError(`Hostname уже занят устройством ${duplicateHost.hostname}.`); return }
    const duplicateIp = switches.find((device) => device.id !== editing?.id && device.ip.trim() === ip)
    if (duplicateIp) { setFormError(`IP уже занят устройством ${duplicateIp.hostname}.`); return }
    let webUrl: string
    try { webUrl = normalizeWebUrl(form.webUrl) } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'Некорректный адрес веб-интерфейса.'); return }
    const target = form.switchId ? byId.get(form.switchId) : undefined
    const payload: Partial<NetworkSwitch> = {
      hostname,
      ip,
      description: form.location.trim(),
      deviceType: 'access-point',
      model: form.model.trim(),
      mac: normalizeMac(form.mac) ?? undefined,
      note: form.note.trim() || undefined,
      webUrl: webUrl || undefined,
      uplinkSwitchId: target?.id,
      uplinkSwitchAddress: target ? undefined : undefined,
      uplinkPort: form.port.trim() || undefined,
    }
    if (editing) updateSwitch(editing.id, payload)
    else addAccessPoint({
      hostname,
      ip,
      description: payload.description ?? '',
      deviceType: 'access-point',
      model: payload.model ?? '',
      accessMethods: [],
      manufacturerId: 'eltex',
      mac: payload.mac,
      note: payload.note,
      webUrl: payload.webUrl,
      uplinkSwitchId: payload.uplinkSwitchId,
      uplinkPort: payload.uplinkPort,
    })
    closeForm()
  }

  const importCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const plan = buildApImport(text, useNetHelper.getState(), { defaultManufacturerId: 'eltex', defaultModel: '' })
      setImportName(file.name)
      if (!plan.rows.length) {
        setImportError(plan.issues[0]?.message ?? 'В файле нет строк для импорта.')
        return
      }
      setImportPlan(plan)
    }
    reader.onerror = () => setImportError('Не удалось прочитать файл.')
    reader.readAsText(file, 'utf-8')
  }

  const applyImport = () => {
    if (!importPlan) return
    mergeAccessPoints(importPlan.create, importPlan.update)
    setImportPlan(null)
    setImportName('')
  }

  const exportCsv = () => {
    const csv = accessPointsCsv(useNetHelper.getState())
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `nethelper-access-points-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const openTerminal = (switchId: string) => {
    window.open(`${window.location.origin}${window.location.pathname}#/terminal/${encodeURIComponent(switchId)}`, '_blank', 'noopener')
  }
  const openSwitchCard = (switchId: string) => navigate(`/racks?device=${encodeURIComponent(switchId)}`)
  const openSchematic = (device: NetworkSwitch) => {
    const node = topologies.flatMap((topology) => topology.nodes.filter((item) => item.switchId === device.id || (item.ip && item.ip === device.ip)).map((item) => ({ topologyId: topology.id, key: item.switchId ?? item.ip ?? item.id })))[0]
    if (node) { navigate(`/topology/${encodeURIComponent(node.topologyId)}?device=${encodeURIComponent(node.key)}`); return }
    if (device.topologyId) { navigate(`/topology/${encodeURIComponent(device.topologyId)}?device=${encodeURIComponent(device.id)}`); return }
    alert(`Коммутатор ${device.hostname} не найден ни на одной схеме.`)
  }

  const pingFor = (device: NetworkSwitch) => ping[device.ip.trim()]
  const counters = useMemo(() => {
    const models = new Map<string, number>()
    for (const device of points) if (device.model) models.set(device.model, (models.get(device.model) ?? 0) + 1)
    return { models: [...models.entries()].sort((left, right) => right[1] - left[1]) }
  }, [points])

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Беспроводная сеть</p><h1>Точки доступа</h1><p className="page-subtitle">Где установлена точка и в какой порт коммутатора включена</p></div>
      <div className="toolbar">
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv} />
        <button className="button" onClick={() => fileRef.current?.click()}><Upload size={17} /> Импорт CSV</button>
        <button className="button" onClick={exportCsv}><Download size={17} /> Экспорт CSV</button>
        <button className="button primary" onClick={openAdd}><Plus size={18} /> Добавить точку</button>
      </div>
    </header>

    <div className="ap-search-row">
      <div className="search-box"><Search size={19} /><input aria-label="Поиск точек доступа" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени, месту, IP, MAC, коммутатору и порту..." />{query && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={16} /></button>}</div>
      <label className="table-sort">Сортировка <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}><option value="hostname">По имени</option><option value="location">По месту</option><option value="switch">По коммутатору</option></select></label>
    </div>

    <div className="ap-summary" role="status">
      <span><strong>{points.length}</strong> точек</span>
      {counters.models.map(([model, count]) => <span key={model}>{model} — <strong>{count}</strong></span>)}
      <span className={unlinked.length ? 'ap-summary-warn' : ''}>{unlinked.length ? `Без привязки: ${unlinked.length}` : 'Все привязаны'}</span>
      <span className="ap-summary-ping">{pingsActive ? <><Loader2 size={13} className="ap-spin" /> проверка статуса…</> : 'Статус проверяется, пока открыта эта страница'}</span>
    </div>

    <div className="device-table-wrap">
      <table className="device-table ap-table">
        <thead><tr><th>Точка</th><th>Место установки</th><th>MAC</th><th>Коммутатор</th><th>Порт</th><th>Статус</th><th aria-label="Действия" /></tr></thead>
        <tbody>
          {filtered.map((device) => {
            const uplink = resolveUplink(device, switches)
            const state = pingFor(device)
            return <tr key={device.id} id={`ap-${device.id}`} className={selectedId === device.id ? 'highlighted' : ''} onClick={() => setSelectedId(device.id)}>
              <td><button className="table-device-link" onClick={(event) => { event.stopPropagation(); setSelectedId(device.id) }}>{device.hostname}</button><span>{[device.model, device.note].filter(Boolean).join(' · ') || 'модель не указана'}</span></td>
              <td>{device.description || <span>не указано</span>}</td>
              <td>{device.mac ?? <span>MAC не указан</span>}</td>
              <td>{uplink?.switchDevice?.hostname ?? uplink?.address ?? <span>не привязана</span>}<span>{uplink?.switchDevice ? uplink.address : uplink?.address ? 'вне инвентаря' : ''}</span></td>
              <td>{uplink?.port || '—'}</td>
              <td><div className="ap-status-cell"><span className={`ap-ping ap-ping-${state?.status ?? 'unknown'}`} title={state ? `${state.status === 'up' ? 'отвечает' : 'нет ответа'}${state.rtt ? `, ${state.rtt} мс` : ''} · ${new Date(state.checkedAt).toLocaleTimeString('ru')} · по последнему известному IP` : 'ещё не проверялось'}>{state?.status === 'up' ? <Wifi size={15} /> : state?.status === 'down' ? <WifiOff size={15} /> : <span className="ap-ping-dot" />}</span></div></td>
              <td><div className="toolbar" onClick={(event) => event.stopPropagation()}>
                {uplink?.switchDevice && <button className="icon-button" title={`Терминал ${uplink.switchDevice.hostname}`} aria-label={`Терминал ${uplink.switchDevice.hostname}`} onClick={() => openTerminal(uplink.switchDevice!.id)}><Terminal size={16} /></button>}
                <WebInterfaceLink url={device.webUrl} className="icon-button" compact label={`Веб-интерфейс ${device.hostname}`} />
                <button className="icon-button" title="Изменить" aria-label={`Изменить ${device.hostname}`} onClick={() => openEdit(device)}><Edit3 size={16} /></button>
              </div></td>
            </tr>
          })}
        </tbody>
      </table>
      {!filtered.length && <div className="ap-empty"><Radio size={34} /><h2>Точки не найдены</h2><p>{points.length ? 'Измените поисковый запрос.' : 'Добавьте первую точку вручную или импортируйте CSV.'}</p></div>}
    </div>

    {selected && (() => {
      const uplink = resolveUplink(selected, switches)
      const state = pingFor(selected)
      return <Modal title={selected.hostname} onClose={() => { setSelectedId(null); if (linkedDeviceId) navigate('/access-points', { replace: true }) }}>
        <div className="ap-detail">
          <section className="ap-detail-uplink">
            <p className="eyebrow">Подключение</p>
            <div className="ap-detail-switch">
              <strong>{uplink?.switchDevice?.hostname ?? uplink?.address ?? 'Не привязана'}</strong>
              <span className="ap-detail-port">{uplink?.port ? `порт ${uplink.port}` : 'порт не указан'}</span>
            </div>
            <p className="ap-detail-hint">{uplink?.switchDevice ? `${uplink.switchDevice.ip} · ${uplink.switchDevice.model || 'модель не указана'}` : uplink?.address ? 'Коммутатор не найден в инвентаре: доступен только адрес и порт.' : 'Укажите коммутатор и порт в карточке точки.'}</p>
            <div className="ap-detail-actions">
              <button className="button primary" disabled={!uplink?.switchDevice} onClick={() => uplink?.switchDevice && openTerminal(uplink.switchDevice.id)}><Terminal size={17} /> Терминал коммутатора</button>
              <button className="button" disabled={!uplink?.switchDevice} onClick={() => uplink?.switchDevice && openSwitchCard(uplink.switchDevice.id)}>Коммутатор в шкафу</button>
              <button className="button" disabled={!uplink?.switchDevice} onClick={() => uplink?.switchDevice && openSchematic(uplink.switchDevice)}>Схема</button>
              <WebInterfaceLink url={uplink?.switchDevice?.webUrl} className="button" label="Веб-интерфейс коммутатора" />
            </div>
          </section>
          <dl className="ap-detail-fields">
            <div><dt>Место установки</dt><dd>{selected.description || '—'}</dd></div>
            <div><dt>MAC</dt><dd>{selected.mac ?? '—'}</dd></div>
            <div><dt>Модель</dt><dd>{selected.model || '—'}</dd></div>
            <div><dt>Статус</dt><dd>{state ? (state.status === 'up' ? `отвечает${state.rtt ? `, ${state.rtt} мс` : ''}` : 'нет ответа') : 'не проверялось'}</dd></div>
            {selected.note && <div><dt>Примечание</dt><dd>{selected.note}</dd></div>}
            {selected.webUrl && <div><dt>Веб-интерфейс</dt><dd><Globe size={13} /> {selected.webUrl}</dd></div>}
          </dl>
          <div className="modal-actions">
            <SafeAction className="button danger-button" title={`Удалить ${selected.hostname}`} details={`Точка ${selected.hostname} будет удалена из инвентаря. Схемы и шкафы не изменятся.`} onConfirm={() => { deleteSwitch(selected.id); setSelectedId(null) }}><Trash2 size={16} /> Удалить</SafeAction>
            <button className="button primary" onClick={() => { openEdit(selected); setSelectedId(null) }}><Edit3 size={16} /> Изменить</button>
          </div>
        </div>
      </Modal>
    })()}

    {(adding || editing) && <Modal title={editing ? `Изменить ${editing.hostname}` : 'Новая точка доступа'} onClose={closeForm}>
      <form className="form-grid" onSubmit={save}>
        <label>Hostname<input required autoFocus value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} placeholder="RU02AP101" /></label>
        <label>Место установки<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Кабинет 101, потолок" /></label>
        <label>IP-адрес<input value={form.ip} onChange={(event) => setForm({ ...form, ip: event.target.value })} placeholder="10.109.41.21" /></label>
        <label>MAC<input value={form.mac} onChange={(event) => setForm({ ...form, mac: event.target.value })} onBlur={() => setForm({ ...form, mac: normalizeMac(form.mac) ?? form.mac })} placeholder="AA:BB:CC:DD:EE:FF" /></label>
        <label>Модель<input list="ap-models" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="WEP-30" /><datalist id="ap-models">{AP_MODELS.map((model) => <option key={model} value={model} />)}</datalist></label>
        <label>Коммутатор доступа<select value={form.switchId} onChange={(event) => setForm({ ...form, switchId: event.target.value })}><option value="">Не выбран</option>{switchOptions(switches, editing?.id).map((device) => <option key={device.id} value={device.id}>{device.hostname} · {device.ip}</option>)}</select></label>
        <label>Порт<input value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} placeholder="Например, 7 или Gi1/0/12" /></label>
        <label>Веб-интерфейс точки<input type="url" value={form.webUrl} onChange={(event) => setForm({ ...form, webUrl: event.target.value })} placeholder="https://..." /></label>
        <label className="full">Примечание<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Например, менять кабель" /></label>
        {formError && <p className="field-error full" role="alert">{formError}</p>}
        <div className="modal-actions full"><button type="button" className="button" onClick={closeForm}>Отмена</button><button className="button primary">{editing ? 'Сохранить' : 'Добавить'}</button></div>
      </form>
    </Modal>}

    {importPlan && <Modal title="Импорт точек доступа" onClose={() => setImportPlan(null)}>
      <div className="ap-import">
        <p className="page-subtitle">{importName}: строк в файле — {importPlan.rows.length}, новых — {importPlan.create.length}, обновится — {importPlan.update.length}{importPlan.skipped ? `, пропущено — ${importPlan.skipped}` : ''}.</p>
        {importPlan.issues.length > 0 && <div className="ap-import-issues">
          <p>Замечания ({importPlan.issues.length}):</p>
          <ul>{importPlan.issues.slice(0, 40).map((issue, index) => <li key={`${issue.line}-${index}`} className={issue.level === 'error' ? 'ap-import-error' : ''}>Строка {issue.line}: {issue.message}</li>)}{importPlan.issues.length > 40 && <li>…и ещё {importPlan.issues.length - 40}</li>}</ul>
        </div>}
        <p className="page-subtitle">Импорт только добавляет и обновляет точки: устройства с совпадающим hostname, MAC или IP обновляются, остальные создаются. Ничего не удаляется.</p>
        <div className="modal-actions"><button className="button" onClick={() => setImportPlan(null)}>Отмена</button><button className="button primary" onClick={applyImport}>Импортировать</button></div>
      </div>
    </Modal>}

    {importError && <Modal title="Импорт не выполнен" onClose={() => setImportError('')}><p role="alert">{importError}</p><div className="modal-actions"><button className="button" onClick={() => setImportError('')}>Закрыть</button></div></Modal>}
  </>
}

