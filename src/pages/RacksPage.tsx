import { ArrowDown, ArrowUp, Edit3, Eye, Folder, FolderPlus, MapPin, Monitor, Plus, Search, Terminal, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNetHelper } from '../store'
import type { DeviceType, NetworkSwitch, Rack } from '../types'
import { Modal } from '../components/Layout'

const deviceTypes: Record<Exclude<DeviceType, 'group'>, string> = { switch: 'Коммутатор', router: 'Маршрутизатор', pc: 'Компьютер', server: 'Сервер', firewall: 'Межсетевой экран', 'access-point': 'Точка доступа', printer: 'Принтер', phone: 'IP-телефон', camera: 'Камера', cloud: 'Облачное устройство', ups: 'ИБП', nas: 'Сетевое хранилище', 'patch-panel': 'Патч-панель' }
const emptySwitch = { hostname: '', ip: '', manufacturerId: '', deviceType: 'switch' as Exclude<DeviceType, 'group'>, model: '', accessMethods: [] as ('ssh' | 'rdp')[], description: '', topologyId: '', isCore: false }
const createGroupValue = '__create_new_group__'

export function RacksPage() {
  const { racks, groups = [], switches, manufacturers, topologies, addRack, updateRack, deleteRack, addGroup: createGroup, renameGroup: renameStoredGroup, deleteGroup: deleteStoredGroup, moveRack, moveRackTo, addSwitch, updateSwitch, deleteSwitch, moveSwitchTo } = useNetHelper()
  const [query, setQuery] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [editing, setEditing] = useState<NetworkSwitch | null>(null)
  const [editingRack, setEditingRack] = useState<Rack | null>(null)
  const [addingToRack, setAddingToRack] = useState<string | null>(null)
  const [form, setForm] = useState(emptySwitch)
  const [rackForm, setRackForm] = useState({ name: '', location: '', group: '' })
  const [draggedRackId, setDraggedRackId] = useState<string | null>(null)
  const [draggedSwitchId, setDraggedSwitchId] = useState<string | null>(null)
  const [groupManagerOpen, setGroupManagerOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [groupDraft, setGroupDraft] = useState('')
  const [routeChoices, setRouteChoices] = useState<{ topologyId: string; topologyName: string; deviceKey: string; nodeLabel: string }[]>([])
  const navigate = useNavigate()

  const groupNames = useMemo(() => [...new Set([...groups, ...racks.map((rack) => rack.group.trim())].filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru')), [groups, racks])

  const filteredRacks = useMemo(() => {
    const term = query.trim().toLowerCase()
    return racks.map((rack) => {
      const rackMatches = !term || [rack.name, rack.location, rack.group].some((value) => value.toLowerCase().includes(term))
      const matchedSwitches = rack.switchIds.map((switchId) => switches.find((item) => item.id === switchId)).filter((item): item is NetworkSwitch => Boolean(item)).filter((item) => {
        if (rackMatches) return true
        const vendor = manufacturers.find((entry) => entry.id === item.manufacturerId)
        return [item.hostname, item.ip, item.model, item.description, deviceTypes[item.deviceType === 'group' ? 'switch' : item.deviceType], vendor?.name, vendor?.abbreviation].some((value) => value?.toLowerCase().includes(term))
      })
      return { rack, devices: matchedSwitches, visible: rackMatches || matchedSwitches.length > 0 }
    }).filter((item) => item.visible)
  }, [query, racks, switches, manufacturers])

  const groupedRacks = useMemo(() => {
    const groups = new Map<string, typeof filteredRacks>()
    filteredRacks.forEach((item) => {
      const group = item.rack.group.trim() || 'Без группы'
      groups.set(group, [...(groups.get(group) ?? []), item])
    })
    return [...groups.entries()]
  }, [filteredRacks])

  const openDeviceTopology = (item: NetworkSwitch) => {
    const matches = topologies.flatMap((topology) => topology.nodes.filter((node) => node.ip === item.ip || node.switchId === item.id || node.label.trim().toLowerCase() === item.hostname.trim().toLowerCase()).map((node) => ({ topologyId: topology.id, topologyName: topology.name, deviceKey: node.switchId ?? (node.ip === item.ip ? node.ip : item.hostname), nodeLabel: node.label })))
    if (matches.length === 1) {
      navigate(`/topology/${matches[0].topologyId}?device=${encodeURIComponent(matches[0].deviceKey)}`)
      return
    }
    if (matches.length > 1) {
      setRouteChoices(matches)
      return
    }
    if (item.topologyId) {
      navigate(`/topology/${item.topologyId}?device=${encodeURIComponent(item.id)}`)
      return
    }
    alert(`Устройство ${item.hostname}${item.ip ? ` (${item.ip})` : ''} не найдено ни на одной схеме.`)
  }
  const openRouteChoice = (choice: { topologyId: string; deviceKey: string }) => {
    setRouteChoices([])
    navigate(`/topology/${choice.topologyId}?device=${encodeURIComponent(choice.deviceKey)}`)
  }

  const openAdd = (rackId: string) => {
    setEditing(null)
    setAddingToRack(rackId)
    setForm({ ...emptySwitch, manufacturerId: '' })
  }
  const openEdit = (item: NetworkSwitch) => {
    setAddingToRack(null)
    setEditing(item)
    setForm({ hostname: item.hostname, ip: item.ip, manufacturerId: item.manufacturerId, deviceType: item.deviceType === 'group' ? 'switch' : item.deviceType, model: item.model, accessMethods: item.accessMethods ?? [], description: item.description, topologyId: item.topologyId ?? '', isCore: item.isCore ?? false })
  }
  const openRackEdit = (rack: Rack) => {
    setEditingRack(rack)
    setRackForm({ name: rack.name, location: rack.location, group: rack.group })
  }
  const saveSwitch = (event: FormEvent) => {
    event.preventDefault()
    const payload = { ...form, topologyId: form.topologyId || undefined }
    if (editing) updateSwitch(editing.id, payload)
    else if (addingToRack) addSwitch(addingToRack, payload)
    setEditing(null)
    setAddingToRack(null)
  }
  const saveRack = (event: FormEvent) => {
    event.preventDefault()
    if (editingRack) updateRack(editingRack.id, { name: rackForm.name.trim(), location: rackForm.location.trim(), group: rackForm.group.trim() })
    setEditingRack(null)
  }
  const addGroup = () => {
    const name = newGroupName.trim()
    if (!name) return
    if (groupNames.some((group) => group.toLowerCase() === name.toLowerCase())) {
      alert('Такая группа уже существует.')
      return
    }
    setNewGroupName('')
    createGroup(name)
  }
  const renameGroup = (oldName: string) => {
    const name = groupDraft.trim()
    if (!name || name === oldName) { setEditingGroup(null); return }
    if (groupNames.some((group) => group !== oldName && group.toLowerCase() === name.toLowerCase())) {
      alert('Такая группа уже существует.')
      return
    }
    renameStoredGroup(oldName, name)
    setEditingGroup(null)
  }
  const deleteGroup = (name: string) => {
    if (!confirm(`Удалить группу «${name}»? Шкафы останутся, но будут без группы.`)) return
    deleteStoredGroup(name)
  }

  return <>
    <header className="page-header">
      <div><p className="eyebrow">Инфраструктура</p><h1>Шкафы</h1><p className="page-subtitle">Физическое расположение сетевого оборудования</p></div>
      <div className="toolbar"><div className="mode-switch"><button className={!editMode ? 'active' : ''} onClick={() => setEditMode(false)}><Eye size={16} /> Просмотр</button><button className={editMode ? 'active' : ''} onClick={() => setEditMode(true)}><Edit3 size={16} /> Редактирование</button></div>{editMode && <><button className="button" onClick={() => setGroupManagerOpen(true)}><FolderPlus size={17} /> Группы</button><button className="button primary" onClick={() => { const name = prompt('Название нового шкафа'); if (name?.trim()) addRack(name.trim()) }}><Plus size={18} /> Добавить шкаф</button></>}</div>
    </header>
    <div className="search-box"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по шкафам, группам, расположению и оборудованию..." /><kbd>{filteredRacks.length} шкаф.</kbd></div>
    {groupedRacks.map(([group, items]) => <section className="rack-group" key={group}>
      <div className="rack-group-title"><Folder size={17} /><h2>{group}</h2><span>{items.length}</span></div>
      <div className="racks-grid">
        {items.map(({ rack, devices: rackSwitches }) => <article className={`rack ${editMode ? 'editable' : ''} ${draggedRackId === rack.id ? 'dragging' : ''}`} key={rack.id} draggable={editMode} onDragStart={(event) => { if (!editMode) return; setDraggedRackId(rack.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', rack.id) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId) { if (rack.group) updateRack(sourceId, { group: rack.group }); moveRackTo(sourceId, rack.id) } setDraggedRackId(null) }} onDragEnd={() => setDraggedRackId(null)}>
          <div className="rack-top">
            <div><h2>{rack.name}</h2><p><MapPin size={14} /> {rack.location || 'Расположение не указано'}</p></div>
            <div className="rack-actions">
              <span>{rackSwitches.length} устр.</span>
              {editMode && <><button className="icon-button" title="Переместить левее" disabled={racks[0]?.id === rack.id} onClick={() => moveRack(rack.id, -1)}><ArrowUp size={15} /></button>
              <button className="icon-button" title="Переместить правее" disabled={racks[racks.length - 1]?.id === rack.id} onClick={() => moveRack(rack.id, 1)}><ArrowDown size={15} /></button>
              <button className="icon-button" title="Редактировать шкаф" onClick={() => openRackEdit(rack)}><Edit3 size={15} /></button>
              <button className="icon-button danger" title="Удалить шкаф" onClick={() => confirm(`Удалить шкаф «${rack.name}» и все устройства?`) && deleteRack(rack.id)}><Trash2 size={15} /></button></>}
            </div>
          </div>
          <div className="rack-frame"><div className="rack-rail left" /><div className="rack-rail right" /><div className="rack-devices">
             {rackSwitches.map((item) => {
               const vendor = manufacturers.find((entry) => entry.id === item.manufacturerId)
               return <div className={`switch-card ${draggedSwitchId === item.id ? 'dragging' : ''}`} key={item.id} draggable={editMode} onDragStart={(event) => { event.stopPropagation(); setDraggedSwitchId(item.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', item.id) }} onDragOver={(event) => { if (editMode) { event.preventDefault(); event.stopPropagation() } }} onDrop={(event) => { if (!editMode) return; event.preventDefault(); event.stopPropagation(); const sourceId = event.dataTransfer.getData('text/plain'); if (sourceId) moveSwitchTo(rack.id, sourceId, item.id); setDraggedSwitchId(null) }} onDragEnd={() => setDraggedSwitchId(null)} onClick={() => openDeviceTopology(item)}>
                <span className="vendor-badge">{vendor?.abbreviation ?? '?'}</span><div className="switch-info"><strong>{item.hostname}</strong><span>{item.ip || 'IP не указан'}</span><small>{[deviceTypes[item.deviceType === 'group' ? 'switch' : item.deviceType], item.model, item.description].filter(Boolean).join(' · ') || vendor?.name}</small></div>{item.accessMethods?.length > 0 && <div className="switch-access" onClick={(event) => event.stopPropagation()}>{item.accessMethods.includes('ssh') && <button title="Подключение по SSH — будет реализовано позже" disabled><Terminal size={14} /></button>}{item.accessMethods.includes('rdp') && <button title="Подключение по RDP — будет реализовано позже" disabled><Monitor size={14} /></button>}</div>}
                 <div className="switch-controls" onClick={(event) => event.stopPropagation()}><button title="Изменить" onClick={() => openEdit(item)}><Edit3 size={14} /></button><button title="Удалить" onClick={() => confirm(`Удалить ${item.hostname}?`) && deleteSwitch(item.id)}><Trash2 size={14} /></button></div>
              </div>
            })}
            {rackSwitches.length === 0 && <div className="empty-slot">{query ? 'Нет совпадений' : 'Шкаф пуст'}</div>}
          </div></div>
          {editMode && <button className="button rack-add" onClick={() => openAdd(rack.id)}><Plus size={16} /> Добавить устройство</button>}
        </article>)}
      </div>
    </section>)}
    {filteredRacks.length === 0 && <div className="empty-state"><Search size={38} /><h2>Шкафы не найдены</h2><p>Измените поисковый запрос.</p></div>}
    {routeChoices.length > 0 && <Modal title="Устройство найдено на нескольких схемах" onClose={() => setRouteChoices([])}><div className="route-choices"><p>Выберите схему, которую нужно открыть:</p>{routeChoices.map((choice) => <button key={`${choice.topologyId}-${choice.nodeLabel}`} className="route-choice" onClick={() => openRouteChoice(choice)}><strong>{choice.topologyName}</strong><span>{choice.nodeLabel}</span></button>)}</div></Modal>}
         {groupManagerOpen && <Modal title="Управление группами шкафов" onClose={() => setGroupManagerOpen(false)}><div className="group-manager"><form className="group-create" onSubmit={(event) => { event.preventDefault(); addGroup() }}><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Название новой группы" /><button className="button primary"><Plus size={16} /> Добавить</button></form>{groupNames.length === 0 ? <p className="group-empty">Групп пока нет.</p> : <div className="group-list">{groupNames.map((group) => <div className="group-row" key={group}>{editingGroup === group ? <><input autoFocus value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} /><button type="button" className="icon-button" title="Сохранить" onClick={() => renameGroup(group)}><Edit3 size={15} /></button></> : <><strong>{group}</strong><button type="button" className="icon-button" title="Переименовать" onClick={() => { setEditingGroup(group); setGroupDraft(group) }}><Edit3 size={15} /></button><button type="button" className="icon-button danger" title="Удалить группу" onClick={() => deleteGroup(group)}><Trash2 size={15} /></button></>}</div>)}</div>}</div></Modal>}
     {editingRack && <Modal title="Редактировать шкаф" onClose={() => setEditingRack(null)}><form className="form-grid" onSubmit={saveRack}><label className="full">Название<input required autoFocus value={rackForm.name} onChange={(event) => setRackForm({ ...rackForm, name: event.target.value })} /></label><label>Расположение<input value={rackForm.location} onChange={(event) => setRackForm({ ...rackForm, location: event.target.value })} /></label><label>Группа<select value={rackForm.group} onChange={(event) => { if (event.target.value !== createGroupValue) { setRackForm({ ...rackForm, group: event.target.value }); return } const name = prompt('Название новой группы'); if (name?.trim()) setRackForm({ ...rackForm, group: name.trim() }) }}><option value="">Без группы</option>{groupNames.map((group) => <option key={group} value={group}>{group}</option>)}<option value={createGroupValue}>＋ Создать новую группу…</option></select></label><div className="modal-actions full"><button type="button" className="button" onClick={() => setEditingRack(null)}>Отмена</button><button className="button primary">Сохранить</button></div></form></Modal>}
    {(editing || addingToRack) && <Modal title={editing ? 'Изменить устройство' : 'Новое устройство'} onClose={() => { setEditing(null); setAddingToRack(null) }}><form className="form-grid" onSubmit={saveSwitch}><label>Hostname<input required autoFocus value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} /></label><label>IP-адрес<input value={form.ip} onChange={(event) => setForm({ ...form, ip: event.target.value })} placeholder="10.20.0.1" /></label><label>Тип устройства<select value={form.deviceType} onChange={(event) => { const deviceType = event.target.value as Exclude<DeviceType, 'group'>; const compatible = manufacturers.filter((manufacturer) => manufacturer.deviceTypes.includes(deviceType)); setForm({ ...form, deviceType, manufacturerId: !form.manufacturerId || compatible.some((item) => item.id === form.manufacturerId) ? form.manufacturerId : compatible[0]?.id ?? '', isCore: deviceType === 'switch' ? form.isCore : false }) }}>{Object.entries(deviceTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Модель<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="Например, Catalyst 9300-48T" /></label><label>Производитель<select value={form.manufacturerId} onChange={(event) => setForm({ ...form, manufacturerId: event.target.value })}><option value="">Не указан</option>{manufacturers.filter((item) => item.deviceTypes.includes(form.deviceType)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Связанная схема<select value={form.topologyId} onChange={(event) => setForm({ ...form, topologyId: event.target.value })}><option value="">Не выбрана</option>{topologies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="full">Описание<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="access-methods full"><strong>Будущие способы подключения</strong><label className="checkbox"><input type="checkbox" checked={form.accessMethods.includes('ssh')} onChange={(event) => setForm({ ...form, accessMethods: event.target.checked ? [...form.accessMethods, 'ssh'] : form.accessMethods.filter((method) => method !== 'ssh') })} /> SSH</label><label className="checkbox"><input type="checkbox" checked={form.accessMethods.includes('rdp')} onChange={(event) => setForm({ ...form, accessMethods: event.target.checked ? [...form.accessMethods, 'rdp'] : form.accessMethods.filter((method) => method !== 'rdp') })} /> RDP</label></div>{form.deviceType === 'switch' && <label className="checkbox full"><input type="checkbox" checked={form.isCore} onChange={(event) => setForm({ ...form, isCore: event.target.checked })} /> Core-коммутатор</label>}<div className="modal-actions full"><button type="button" className="button" onClick={() => { setEditing(null); setAddingToRack(null) }}>Отмена</button><button className="button primary">Сохранить</button></div></form></Modal>}
  </>
}
