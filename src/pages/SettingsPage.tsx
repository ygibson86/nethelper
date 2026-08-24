import { Download, Moon, Plus, RotateCcw, Sun, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNetHelper } from '../store'
import type { AppData, DeviceType } from '../types'

const vendorDeviceTypes: { value: DeviceType; label: string }[] = [
  { value: 'switch', label: 'Коммутаторы' }, { value: 'router', label: 'Маршрутизаторы' }, { value: 'server', label: 'Серверы' }, { value: 'pc', label: 'Компьютеры' }, { value: 'firewall', label: 'Межсетевые экраны' }, { value: 'access-point', label: 'Точки доступа' }, { value: 'phone', label: 'IP-телефоны' }, { value: 'camera', label: 'Камеры' }, { value: 'ups', label: 'ИБП' }, { value: 'nas', label: 'NAS' }, { value: 'printer', label: 'Принтеры' }, { value: 'patch-panel', label: 'Патч-панели' },
]

export function SettingsPage() {
  const store = useNetHelper()
  const fileRef = useRef<HTMLInputElement>(null)
  const [vendor, setVendor] = useState({ name: '', abbreviation: '', color: '#22c55e', deviceTypes: ['switch'] as DeviceType[] })

  const exportData = () => {
    const data: AppData = { version: store.version, manufacturers: store.manufacturers, switches: store.switches, racks: store.racks, groups: store.groups, topologies: store.topologies, corePanels: store.corePanels, settings: store.settings }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nethelper-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  const importData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as AppData
        if (!Array.isArray(data.racks) || !Array.isArray(data.switches) || !Array.isArray(data.topologies) || !data.settings) throw new Error('Некорректная структура')
        if (confirm('Импорт заменит все текущие данные. Продолжить?')) store.replaceData(data)
      } catch {
        alert('Не удалось импортировать файл: формат резервной копии некорректен.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }
  const addVendor = (event: FormEvent) => {
    event.preventDefault()
    if (!vendor.name.trim() || !vendor.abbreviation.trim()) return
    store.addManufacturer({ name: vendor.name.trim(), abbreviation: vendor.abbreviation.trim().slice(0, 3).toUpperCase(), color: vendor.color, deviceTypes: vendor.deviceTypes })
    setVendor({ name: '', abbreviation: '', color: '#22c55e', deviceTypes: ['switch'] })
  }

  return <>
    <header className="page-header"><div><p className="eyebrow">Конфигурация</p><h1>Настройки</h1><p className="page-subtitle">Отображение, производители и резервные копии</p></div></header>
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-card-title"><div><h2>Внешний вид</h2><p>Глобальные параметры интерфейса</p></div></div>
        <div className="setting-row"><div><strong>Тема</strong><span>Цветовая схема приложения</span></div><div className="segmented"><button className={store.settings.theme === 'dark' ? 'active' : ''} onClick={() => store.updateSettings({ theme: 'dark' })}><Moon size={16} /> Тёмная</button><button className={store.settings.theme === 'light' ? 'active' : ''} onClick={() => store.updateSettings({ theme: 'light' })}><Sun size={16} /> Светлая</button></div></div>
        <div className="setting-row"><div><strong>Размер шрифта</strong><span>{store.settings.fontSize} px</span></div><input type="range" min="13" max="18" value={store.settings.fontSize} onChange={(event) => store.updateSettings({ fontSize: Number(event.target.value) })} /></div>
      </section>
      <section className="settings-card vendors-card">
        <div className="settings-card-title"><div><h2>Производители</h2><p>Цвета и короткие обозначения оборудования</p></div></div>
        <div className="vendor-list">{store.manufacturers.map((item) => {
          const inUse = store.switches.some((device) => device.manufacturerId === item.id)
          return <div className="vendor-row" key={item.id}>
            <input aria-label="Цвет" type="color" value={item.color} onChange={(event) => store.updateManufacturer(item.id, { color: event.target.value })} />
            <input value={item.abbreviation} maxLength={3} onChange={(event) => store.updateManufacturer(item.id, { abbreviation: event.target.value.toUpperCase() })} />
             <input value={item.name} onChange={(event) => store.updateManufacturer(item.id, { name: event.target.value })} title={item.deviceTypes.map((type) => vendorDeviceTypes.find((entry) => entry.value === type)?.label).filter(Boolean).join(', ')} />
            <button className="icon-button danger" disabled={inUse} title={inUse ? 'Производитель используется' : 'Удалить'} onClick={() => store.deleteManufacturer(item.id)}><Trash2 size={16} /></button>
          </div>
        })}</div>
        <form className="vendor-add" onSubmit={addVendor}><input type="color" value={vendor.color} onChange={(event) => setVendor({ ...vendor, color: event.target.value })} /><input required maxLength={3} placeholder="Код" value={vendor.abbreviation} onChange={(event) => setVendor({ ...vendor, abbreviation: event.target.value })} /><input required placeholder="Название" value={vendor.name} onChange={(event) => setVendor({ ...vendor, name: event.target.value })} /><button className="button primary"><Plus size={16} /> Добавить</button><div className="vendor-types">{vendorDeviceTypes.map((type) => <label key={type.value}><input type="checkbox" checked={vendor.deviceTypes.includes(type.value)} onChange={(event) => setVendor({ ...vendor, deviceTypes: event.target.checked ? [...vendor.deviceTypes, type.value] : vendor.deviceTypes.filter((item) => item !== type.value) })} /> {type.label}</label>)}</div></form>
      </section>
      <section className="settings-card backup-card">
        <div className="settings-card-title"><div><h2>Резервная копия</h2><p>Все данные сохраняются в одном JSON-файле</p></div></div>
        <div className="backup-actions"><button className="button primary" onClick={exportData}><Download size={18} /> Экспортировать данные</button><button className="button" onClick={() => fileRef.current?.click()}><Upload size={18} /> Импортировать данные</button><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importData} /></div>
        <div className="backup-stats"><span><strong>{store.racks.length}</strong> шкафов</span><span><strong>{store.switches.length}</strong> устройств</span><span><strong>{store.topologies.length}</strong> схем</span><span><strong>{store.corePanels.reduce((sum, panel) => sum + panel.ports.length, 0)}</strong> портов</span></div>
      </section>
      <section className="settings-card danger-zone">
        <div><h2>Сброс данных</h2><p>Вернуть исходные демонстрационные данные. Отменить это действие нельзя.</p></div><button className="button danger-button" onClick={() => confirm('Сбросить все данные NetHelper?') && store.resetData()}><RotateCcw size={17} /> Сбросить</button>
      </section>
    </div>
  </>
}
