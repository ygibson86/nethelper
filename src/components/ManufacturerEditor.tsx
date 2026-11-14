import { useState, type FormEvent } from 'react'
import { Modal } from './Layout'
import type { DeviceType, Manufacturer } from '../types'
import { useNetHelper } from '../store'

const types: { value: DeviceType; label: string }[] = [
  { value: 'switch', label: 'Коммутаторы' }, { value: 'router', label: 'Маршрутизаторы' }, { value: 'server', label: 'Серверы' }, { value: 'pc', label: 'Компьютеры' }, { value: 'firewall', label: 'Межсетевые экраны' }, { value: 'access-point', label: 'Точки доступа' }, { value: 'phone', label: 'IP-телефоны' }, { value: 'camera', label: 'Камеры' }, { value: 'ups', label: 'ИБП' }, { value: 'nas', label: 'NAS' }, { value: 'printer', label: 'Принтеры' }, { value: 'patch-panel', label: 'Патч-панели' },
]
export function ManufacturerEditor({ manufacturer, onClose }: { manufacturer: Manufacturer; onClose: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(manufacturer))
  const [error, setError] = useState('')
  const save = (event: FormEvent) => {
    event.preventDefault()
    const latest = useNetHelper.getState().manufacturers.find((item) => item.id === manufacturer.id)
    if (JSON.stringify(latest) !== JSON.stringify(manufacturer)) { setError('Производитель уже изменён. Закройте форму и откройте снова.'); return }
    if (!draft.name.trim() || !draft.abbreviation.trim()) return
    useNetHelper.getState().updateManufacturer(draft.id, { name: draft.name.trim(), abbreviation: draft.abbreviation.trim(), color: draft.color, deviceTypes: draft.deviceTypes })
    onClose()
  }
  return <Modal title="Редактировать производителя" onClose={onClose}><form className="form-grid" onSubmit={save}>
    <label>Название<input autoFocus required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label>Сокращение<input required maxLength={3} value={draft.abbreviation} onChange={(event) => setDraft({ ...draft, abbreviation: event.target.value.toUpperCase() })} /></label>
    <label>Цвет<input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label>
    <fieldset className="full vendor-types"><legend>Типы оборудования</legend>{types.map((type) => <label key={type.value}><input type="checkbox" checked={draft.deviceTypes.includes(type.value)} onChange={(event) => setDraft({ ...draft, deviceTypes: event.target.checked ? [...draft.deviceTypes, type.value] : draft.deviceTypes.filter((value) => value !== type.value) })} />{type.label}</label>)}</fieldset>
    <p className="page-subtitle full">Цвет обновится и у узлов с прежним цветом этого производителя. Свои цвета узлов сохранятся.</p>
    {error && <p className="field-error full" role="alert">{error}</p>}
    <div className="modal-actions full"><button className="button" type="button" onClick={onClose}>Отмена</button><button className="button primary">Сохранить</button></div>
  </form></Modal>
}
