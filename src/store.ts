import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppData, AppSettings, CorePanel, Manufacturer, NetworkSwitch, Rack, Topology } from './types'
import { importedRacks, importedSwitches } from './importedInfrastructure'
import { applyCoreLayout, inferCoreRows } from './coreLayouts'

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const initialData: AppData = {
  version: 7,
  manufacturers: [
    { id: 'cisco', name: 'Cisco', abbreviation: 'C', color: '#3b82f6', deviceTypes: ['switch', 'router', 'firewall', 'access-point', 'phone'] },
    { id: 'huawei', name: 'Huawei', abbreviation: 'H', color: '#ef4444', deviceTypes: ['switch', 'router', 'firewall', 'access-point', 'phone', 'server'] },
    { id: 'eltex', name: 'Eltex', abbreviation: 'E', color: '#8b5cf6', deviceTypes: ['switch', 'router', 'access-point', 'phone'] },
    { id: 'mikrotik', name: 'MikroTik', abbreviation: 'M', color: '#ec4899', deviceTypes: ['switch', 'router', 'access-point'] },
    { id: 'ubiquiti', name: 'Ubiquiti', abbreviation: 'U', color: '#06b6d4', deviceTypes: ['switch', 'router', 'access-point', 'camera'] },
    { id: 'hp-aruba', name: 'HPE Aruba', abbreviation: 'A', color: '#f97316', deviceTypes: ['switch', 'router', 'access-point'] },
    { id: 'dell', name: 'Dell', abbreviation: 'D', color: '#0ea5e9', deviceTypes: ['server', 'pc', 'nas', 'switch'] },
    { id: 'apc', name: 'APC', abbreviation: 'APC', color: '#65a30d', deviceTypes: ['ups'] },
    { id: 'eaton', name: 'Eaton', abbreviation: 'ET', color: '#2563eb', deviceTypes: ['ups'] },
    { id: 'synology', name: 'Synology', abbreviation: 'SY', color: '#64748b', deviceTypes: ['nas'] },
    { id: 'hikvision', name: 'Hikvision', abbreviation: 'HK', color: '#dc2626', deviceTypes: ['camera'] },
    { id: 'hp', name: 'HP', abbreviation: 'HP', color: '#0284c7', deviceTypes: ['printer', 'pc', 'server'] },
    { id: 'generic', name: 'Без производителя', abbreviation: '—', color: '#64748b', deviceTypes: ['patch-panel', 'cloud'] },
  ],
  switches: importedSwitches,
  racks: importedRacks,
  groups: [...new Set(importedRacks.map((rack) => rack.group.trim()).filter(Boolean))],
  topologies: [{
    id: 'top-main',
    name: 'Главная сеть',
    description: 'Магистральные связи здания',
    nodes: [
      { id: 'group-access', x: 40, y: 245, label: 'Шкафы доступа · Главный корпус', type: 'group', color: '#64748b', width: 900, height: 175, handles: { top: 0, bottom: 0, left: 0, right: 0 } },
      { id: 'group-services', x: 40, y: 455, label: 'Серверы и конечные устройства', type: 'group', color: '#475569', width: 900, height: 175, handles: { top: 0, bottom: 0, left: 0, right: 0 } },
      { id: 'node-core', x: 410, y: 90, label: 'CORE-SW-01', type: 'switch', color: '#3b82f6', ip: '10.20.0.1' },
      { id: 'node-f1-1', x: 100, y: 300, label: 'SW-F1-01', type: 'switch', color: '#8b5cf6', ip: '10.20.1.11' },
      { id: 'node-f1-2', x: 410, y: 300, label: 'SW-F1-02', type: 'switch', color: '#ef4444', ip: '10.20.1.12' },
      { id: 'node-f2-1', x: 720, y: 300, label: 'SW-F2-01', type: 'switch', color: '#3b82f6', manufacturerId: 'cisco', ip: '10.20.2.11' },
      { id: 'node-firewall', x: 410, y: -90, label: 'FW-EDGE-01', type: 'firewall', color: '#ef4444', manufacturerId: 'huawei', ip: '10.20.0.254' },
      { id: 'node-cloud', x: 410, y: -250, label: 'Интернет', type: 'cloud', color: '#64748b', ip: '' },
      { id: 'node-server', x: 100, y: 500, label: 'SRV-VIRTUAL-01', type: 'server', color: '#8b5cf6', manufacturerId: 'eltex', ip: '10.20.10.10' },
      { id: 'node-ap', x: 410, y: 500, label: 'AP-OFFICE-01', type: 'access-point', color: '#3b82f6', manufacturerId: 'cisco', ip: '10.20.20.21' },
      { id: 'node-camera', x: 720, y: 500, label: 'CAM-ENTRY-01', type: 'camera', color: '#ef4444', manufacturerId: 'huawei', ip: '10.20.30.31' },
    ],
    links: [
      { id: 'link-1', source: 'node-core', target: 'node-f1-1', sourcePort: '1/0/1', targetPort: '1/0/48', cableType: 'fiber', label: 'Магистраль' },
      { id: 'link-2', source: 'node-core', target: 'node-f1-2', sourcePort: '1/0/2', targetPort: '1/0/48', cableType: 'fiber', label: 'Магистраль' },
      { id: 'link-3', source: 'node-core', target: 'node-f2-1', sourcePort: '1/0/3', targetPort: '1/0/48', cableType: 'fiber', label: 'Резервный uplink' },
      { id: 'link-4', source: 'node-cloud', target: 'node-firewall', sourcePort: 'WAN', targetPort: 'outside', cableType: 'fiber', label: 'Провайдер' },
      { id: 'link-5', source: 'node-firewall', target: 'node-core', sourcePort: 'inside', targetPort: '1/0/48', cableType: 'dac', label: 'Периметр' },
      { id: 'link-6', source: 'node-f1-1', target: 'node-server', sourcePort: '1/0/20', targetPort: 'eth0', cableType: 'copper', label: 'Сервер' },
      { id: 'link-7', source: 'node-f1-2', target: 'node-ap', sourcePort: '1/0/10', targetPort: 'LAN', cableType: 'copper', label: 'Wi-Fi' },
      { id: 'link-8', source: 'node-f2-1', target: 'node-camera', sourcePort: '1/0/8', targetPort: 'LAN', cableType: 'copper', label: 'CCTV' },
      { id: 'link-9', source: 'node-ap', target: 'node-camera', sourcePort: 'radio0', targetPort: 'wlan0', cableType: 'wireless', label: 'Пример wireless' },
    ],
  }],
  corePanels: [],
  settings: { theme: 'dark', fontSize: 15, portsPerRow: 24 },
}

interface NetHelperStore extends AppData {
  addRack: (name: string) => void
  updateRack: (id: string, patch: Partial<Rack>) => void
  deleteRack: (id: string) => void
  addGroup: (name: string) => void
  renameGroup: (oldName: string, newName: string) => void
  deleteGroup: (name: string) => void
  moveRack: (id: string, direction: -1 | 1) => void
  moveRackTo: (sourceId: string, targetId: string) => void
  addSwitch: (rackId: string, input: Omit<NetworkSwitch, 'id' | 'rackId'>) => void
  updateSwitch: (id: string, patch: Partial<NetworkSwitch>) => void
  deleteSwitch: (id: string) => void
  moveSwitch: (rackId: string, switchId: string, direction: -1 | 1) => void
  moveSwitchTo: (rackId: string, switchId: string, targetId: string, position: 'before' | 'after') => void
  addTopology: (name: string) => string
  updateTopology: (id: string, patch: Partial<Topology>) => void
  deleteTopology: (id: string) => void
  addCorePanel: (switchId: string, portCount: number) => void
  updateCorePanel: (id: string, patch: Partial<CorePanel>) => void
  addManufacturer: (input: Omit<Manufacturer, 'id'>) => void
  updateManufacturer: (id: string, patch: Partial<Manufacturer>) => void
  deleteManufacturer: (id: string) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  replaceData: (data: AppData) => void
  resetData: () => void
}

export const useNetHelper = create<NetHelperStore>()(persist((set, get) => ({
  ...initialData,
  addRack: (name) => set((state) => ({ racks: [...state.racks, { id: uid('rack'), name, location: '', group: '', switchIds: [] }] })),
  updateRack: (id, patch) => set((state) => ({ racks: state.racks.map((rack) => rack.id === id ? { ...rack, ...patch } : rack) })),
  deleteRack: (id) => set((state) => ({ racks: state.racks.filter((rack) => rack.id !== id), switches: state.switches.filter((item) => item.rackId !== id) })),
  addGroup: (name) => set((state) => ({ groups: [...new Set([...(state.groups ?? []), name.trim()])].filter(Boolean) })),
  renameGroup: (oldName, newName) => set((state) => ({
    groups: [...new Set((state.groups ?? []).map((group) => group === oldName ? newName.trim() : group))].filter(Boolean),
    racks: state.racks.map((rack) => rack.group.trim() === oldName ? { ...rack, group: newName.trim() } : rack),
  })),
  deleteGroup: (name) => set((state) => ({
    groups: (state.groups ?? []).filter((group) => group !== name),
    racks: state.racks.map((rack) => rack.group.trim() === name ? { ...rack, group: '' } : rack),
  })),
  moveRack: (id, direction) => set((state) => {
    const racks = [...state.racks]
    const current = racks.findIndex((rack) => rack.id === id)
    const target = current + direction
    if (current < 0 || target < 0 || target >= racks.length) return state
    ;[racks[current], racks[target]] = [racks[target], racks[current]]
    return { racks }
  }),
  moveRackTo: (sourceId, targetId) => set((state) => {
    const racks = [...state.racks]
    const source = racks.findIndex((rack) => rack.id === sourceId)
    const target = racks.findIndex((rack) => rack.id === targetId)
    if (source < 0 || target < 0 || source === target) return state
    const [moved] = racks.splice(source, 1)
    racks.splice(target, 0, moved)
    return { racks }
  }),
  addSwitch: (rackId, input) => {
    const id = uid('switch')
    set((state) => ({
      switches: [...state.switches, { ...input, id, rackId }],
      racks: state.racks.map((rack) => rack.id === rackId ? { ...rack, switchIds: [...rack.switchIds, id] } : rack),
    }))
  },
  updateSwitch: (id, patch) => set((state) => ({ switches: state.switches.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  deleteSwitch: (id) => set((state) => ({
    switches: state.switches.filter((item) => item.id !== id),
    racks: state.racks.map((rack) => ({ ...rack, switchIds: rack.switchIds.filter((switchId) => switchId !== id) })),
    corePanels: state.corePanels.filter((panel) => panel.switchId !== id),
  })),
  moveSwitch: (rackId, switchId, direction) => set((state) => ({ racks: state.racks.map((rack) => {
    if (rack.id !== rackId) return rack
    const items = [...rack.switchIds]
    const current = items.indexOf(switchId)
    const target = current + direction
    if (current < 0 || target < 0 || target >= items.length) return rack
    ;[items[current], items[target]] = [items[target], items[current]]
    return { ...rack, switchIds: items }
  }) })),
  moveSwitchTo: (rackId, switchId, targetId, position) => set((state) => ({ racks: state.racks.map((rack) => {
    if (rack.id !== rackId || switchId === targetId) return rack
    const items = [...rack.switchIds]
    const source = items.indexOf(switchId)
    const target = items.indexOf(targetId)
    if (source < 0 || target < 0) return rack
    items.splice(source, 1)
    const targetIndex = items.indexOf(targetId)
    items.splice(targetIndex + (position === 'after' ? 1 : 0), 0, switchId)
    return { ...rack, switchIds: items }
  }) })),
  addTopology: (name) => {
    const id = uid('topology')
    set((state) => ({ topologies: [...state.topologies, { id, name, description: '', nodes: [], links: [] }] }))
    return id
  },
  updateTopology: (id, patch) => set((state) => ({ topologies: state.topologies.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  deleteTopology: (id) => set((state) => ({ topologies: state.topologies.filter((item) => item.id !== id), switches: state.switches.map((item) => item.topologyId === id ? { ...item, topologyId: undefined } : item) })),
  addCorePanel: (switchId, portCount) => set((state) => {
    const panel: CorePanel = { id: uid('panel'), switchId, model: '', ports: [], rows: [], layoutTemplate: portCount >= 56 ? 'stacked-56' : 'single-28' }
    return { corePanels: [...state.corePanels, { ...panel, ...applyCoreLayout(panel, panel.layoutTemplate as 'single-28' | 'stacked-56') }] }
  }),
  updateCorePanel: (id, patch) => set((state) => ({ corePanels: state.corePanels.map((panel) => panel.id === id ? { ...panel, ...patch } : panel) })),
  addManufacturer: (input) => set((state) => ({ manufacturers: [...state.manufacturers, { ...input, id: uid('vendor') }] })),
  updateManufacturer: (id, patch) => set((state) => ({ manufacturers: state.manufacturers.map((item) => item.id === id ? { ...item, ...patch } : item) })),
  deleteManufacturer: (id) => {
    if (get().switches.some((item) => item.manufacturerId === id)) return
    set((state) => ({ manufacturers: state.manufacturers.filter((item) => item.id !== id) }))
  },
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  replaceData: (data) => set({ ...data }),
  resetData: () => set({ ...initialData }),
}), {
  name: 'nethelper-data',
  version: 7,
  migrate: (persisted, persistedVersion) => {
    const data = persisted as AppData
    const targetRacks = persistedVersion < 6 ? importedRacks : (data.racks ?? importedRacks)
    const targetSwitches = persistedVersion < 6 ? importedSwitches : (data.switches ?? importedSwitches)
    const switchIds = new Set(targetSwitches.map((device) => device.id))
    return {
      ...data,
      version: 7,
      racks: targetRacks,
      groups: data.groups ?? [...new Set(targetRacks.map((rack) => rack.group.trim()).filter(Boolean))],
      manufacturers: (data.manufacturers ?? initialData.manufacturers).map((manufacturer) => ({ ...manufacturer, deviceTypes: manufacturer.deviceTypes ?? initialData.manufacturers.find((item) => item.id === manufacturer.id)?.deviceTypes ?? ['switch', 'router', 'server', 'pc'] })),
      switches: targetSwitches,
      corePanels: (data.corePanels ?? []).filter((panel) => switchIds.has(panel.switchId)).map((panel) => ({
        ...panel,
        rows: panel.rows?.length ? panel.rows : inferCoreRows(panel),
        layoutTemplate: panel.layoutTemplate ?? (panel.ports.length === 56 ? 'stacked-56' : panel.ports.length === 28 ? 'single-28' : 'custom'),
      })),
      topologies: (data.topologies ?? []).map((topology) => {
        return {
          ...topology,
          nodes: topology.nodes.map((node) => ({ ...node, switchId: node.switchId && switchIds.has(node.switchId) ? node.switchId : undefined, handles: node.handles ?? { top: 1, bottom: 1, left: 1, right: 1 } })),
          links: topology.links.map((link) => ({
            ...link,
            sourcePort: link.sourcePort ?? '',
            targetPort: link.targetPort ?? '',
            cableType: String(link.cableType) === 'fiber-sm' || String(link.cableType) === 'fiber-mm' ? 'fiber' : link.cableType ?? 'copper',
          })),
        }
      }),
    }
  },
}))

export { initialData }
