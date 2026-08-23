import { Cable, Edit3, ExternalLink, Plus, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNetHelper } from '../store'
import { applyCoreLayout, coreLayoutDefinitions, inferCoreRows, type CoreLayoutTemplate } from '../coreLayouts'
import type { CorePanel, CorePort, PortStatus } from '../types'
import { Modal } from '../components/Layout'

const statusLabels: Record<PortStatus, string> = { active: 'Активен', inactive: 'Неактивен', disabled: 'Отключён' }

export function CorePage() {
  const { corePanels, switches, topologies, addCorePanel, updateCorePanel } = useNetHelper()
  const [editMode, setEditMode] = useState(false)
  const [editingPort, setEditingPort] = useState<{ panelId: string; portId: string } | null>(null)
  const [routeChoices, setRouteChoices] = useState<{ topologyId: string; topologyName: string; deviceKey: string; nodeLabel: string; portIdentifier: string }[]>([])
  const [layoutPanelId, setLayoutPanelId] = useState<string | null>(null)
  const navigate = useNavigate()
  const activePanel = corePanels.find((panel) => panel.id === editingPort?.panelId)
  const layoutPanel = corePanels.find((panel) => panel.id === layoutPanelId)
  const activePort = activePanel?.ports.find((port) => port.id === editingPort?.portId)
  const totalPorts = useMemo(() => corePanels.reduce((sum, panel) => sum + panel.ports.length, 0), [corePanels])

  const updatePort = (patch: Partial<CorePort>) => {
    if (!activePanel || !activePort) return
    updateCorePanel(activePanel.id, { ports: activePanel.ports.map((port) => port.id === activePort.id ? { ...port, ...patch } : port) })
  }
  const openTopology = (choice: { topologyId: string; deviceKey: string; portIdentifier: string }) => {
    setRouteChoices([])
    navigate(`/topology/${choice.topologyId}?device=${encodeURIComponent(choice.deviceKey)}&port=${encodeURIComponent(choice.portIdentifier)}`)
  }
  const followIp = (ip: string, portIdentifier: string) => {
    const matches = topologies.flatMap((topology) => topology.nodes.filter((node) => node.ip === ip).map((node) => ({ topologyId: topology.id, topologyName: topology.name, deviceKey: node.switchId ?? node.ip ?? '', nodeLabel: node.label, portIdentifier })))
    if (matches.length === 1) return openTopology(matches[0])
    if (matches.length > 1) return setRouteChoices(matches)
    const linkedSwitch = switches.find((item) => item.ip === ip)
    if (linkedSwitch?.topologyId) openTopology({ topologyId: linkedSwitch.topologyId, deviceKey: linkedSwitch.id, portIdentifier })
    else if (linkedSwitch) navigate(`/racks?device=${linkedSwitch.id}`)
    else alert(`Устройство с IP ${ip} не найдено на схемах`)
  }
  const configureLayout = (panel: CorePanel, template: Exclude<CoreLayoutTemplate, 'custom'>) => {
    const definition = coreLayoutDefinitions.find((item) => item.id === template)!
    const removedConfigured = panel.ports.filter((port) => !definition.identifiers.flat().includes(port.identifier) && (port.ip || port.label || port.status !== 'inactive'))
    if (removedConfigured.length && !confirm(`При смене шаблона будут удалены настройки ${removedConfigured.length} портов. Продолжить?`)) return
    updateCorePanel(panel.id, applyCoreLayout(panel, template))
    setLayoutPanelId(null)
  }
  const addPanel = () => {
    const available = switches.filter((item) => item.isCore && !corePanels.some((panel) => panel.switchId === item.id))
    if (!available.length) return alert('Все отмеченные Core-коммутаторы уже добавлены. Новое устройство можно отметить как Core на странице «Шкафы».')
    const selected = prompt(`Введите hostname: ${available.map((item) => item.hostname).join(', ')}`, available[0].hostname)
    const selectedSwitch = available.find((item) => item.hostname === selected)
    if (selectedSwitch) addCorePanel(selectedSwitch.id, 28)
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">Мониторинг портов</p><h1>Core-коммутаторы</h1><p className="page-subtitle">{corePanels.length} устройств · {totalPorts} портов</p></div><div className="toolbar"><button className="button" onClick={addPanel}><Plus size={17} /> Добавить панель</button><button className={`button ${editMode ? 'primary' : ''}`} onClick={() => setEditMode(!editMode)}>{editMode ? <Save size={17} /> : <Edit3 size={17} />}{editMode ? 'Готово' : 'Редактировать'}</button></div></header>
    {corePanels.length ? <div className="core-stack">{corePanels.map((panel) => {
      const device = switches.find((item) => item.id === panel.switchId)
      const stats = panel.ports.reduce((acc, port) => ({ ...acc, [port.status]: acc[port.status] + 1 }), { active: 0, inactive: 0, disabled: 0 })
      const rows = panel.rows?.length ? panel.rows : inferCoreRows(panel)
      const portsById = new Map(panel.ports.map((port) => [port.id, port]))
      return <article className="core-device" key={panel.id}>
        <section className="core-summary"><div className="core-ident"><span className="core-icon"><Cable size={25} /></span><div><strong>{device?.hostname ?? 'Неизвестное устройство'}</strong><span>{device?.model || 'Модель не указана'} · {device?.ip || 'IP не указан'}</span></div></div><div className="port-stats"><span><i className="status active" /> {stats.active} активных</span><span><i className="status inactive" /> {stats.inactive} неактивных</span><span><i className="status disabled" /> {stats.disabled} отключено</span></div><button className="button" onClick={() => setLayoutPanelId(panel.id)}><Cable size={16} /> {panel.ports.length} портов · {panel.rows?.length || 1} ряд.</button></section>
        <section className="front-panel"><div className="panel-screws"><i /><span>{device?.hostname} · {device?.model || 'FRONT VIEW'}</span><i /></div><div className="core-port-rows">{rows.map((row) => <div className="core-port-row" key={row.id}><span className="core-row-label">{row.label}</span><div className="core-ports-grid">{row.portIds.map((portId) => portsById.get(portId)).filter((port): port is CorePort => Boolean(port)).map((port) => <button key={port.id} className={`port ${port.status} ${port.identifier.includes('/1/') ? 'uplink-port' : ''} ${port.identifier.endsWith('/1/1') ? 'uplink-start' : ''}`} title={`${port.identifier} · ${statusLabels[port.status]}${port.label ? ` · ${port.label}` : ''}`} onClick={() => editMode ? setEditingPort({ panelId: panel.id, portId: port.id }) : port.ip && followIp(port.ip, port.identifier)}><span className="port-led" /><strong>{port.identifier}</strong><span className="port-socket"><i /><i /><i /><i /></span><small>{port.ip || '—'}</small>{port.ip && !editMode && <ExternalLink size={11} />}</button>)}</div></div>)}</div></section>
      </article>
    })}</div> : <div className="empty-state"><Cable size={44} /><h2>Core-панели не настроены</h2><p>Отметьте устройство как Core и добавьте для него панель.</p><button className="button primary" onClick={addPanel}><Plus size={17} /> Добавить панель</button></div>}
    <div className="port-legend"><span><i className="status active" /> Активен</span><span><i className="status inactive" /> Неактивен</span><span><i className="status disabled" /> Отключён администратором</span><small>{editMode ? 'Нажмите на порт для редактирования' : 'Нажмите на порт с IP для трассировки'}</small></div>
    {routeChoices.length > 0 && <Modal title="Устройство найдено на нескольких схемах" onClose={() => setRouteChoices([])}><div className="route-choices"><p>Выберите схему для продолжения трассировки:</p>{routeChoices.map((choice) => <button key={`${choice.topologyId}-${choice.deviceKey}`} className="route-choice" onClick={() => openTopology(choice)}><strong>{choice.topologyName}</strong><span>{choice.nodeLabel}</span></button>)}</div></Modal>}
    {layoutPanel && <Modal title="Схема лицевой панели" onClose={() => setLayoutPanelId(null)}><div className="layout-choices"><p>Выберите физическую компоновку портов. Настройки совпадающих номеров портов сохранятся.</p>{coreLayoutDefinitions.map((definition) => <button key={definition.id} className={`layout-choice ${layoutPanel.layoutTemplate === definition.id ? 'active' : ''}`} onClick={() => configureLayout(layoutPanel, definition.id as 'single-28' | 'stacked-56')}><span className="layout-choice-visual">{definition.identifiers.map((row, index) => <i key={index}>{row.length}</i>)}</span><span><strong>{definition.name}</strong><small>{definition.description}</small></span></button>)}</div></Modal>}
    {activePort && activePanel && <Modal title={`Порт ${activePort.identifier}`} onClose={() => setEditingPort(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); setEditingPort(null) }}><label>Идентификатор<input value={activePort.identifier} onChange={(event) => updatePort({ identifier: event.target.value })} /></label><label>Состояние<select value={activePort.status} onChange={(event) => updatePort({ status: event.target.value as PortStatus })}><option value="active">Активен</option><option value="inactive">Неактивен</option><option value="disabled">Отключён</option></select></label><label className="full">IP подключённого устройства<input value={activePort.ip} onChange={(event) => updatePort({ ip: event.target.value })} placeholder="10.20.0.10" /></label><label className="full">Подпись<input value={activePort.label} onChange={(event) => updatePort({ label: event.target.value })} placeholder="Назначение порта" /></label><div className="modal-actions full"><button type="button" className="button" onClick={() => setEditingPort(null)}>Отмена</button><button className="button primary">Сохранить</button></div></form></Modal>}
  </>
}
