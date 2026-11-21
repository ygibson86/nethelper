import type { AppData } from './types'

export interface SearchResult { id: string; title: string; subtitle: string; to: string; kind: 'Устройства' | 'Узлы схем' | 'Core-порты' | 'Точки доступа' }
export function globalSearch(data: AppData, query: string): SearchResult[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const results: SearchResult[] = []
  for (const device of data.switches) {
    if (![device.hostname, device.ip, device.mac ?? ''].some((value) => value.toLowerCase().includes(term))) continue
    const rack = data.racks.find((item) => item.id === device.rackId)
    if (device.deviceType === 'access-point') {
      results.push({ id: `device:${device.id}`, kind: 'Точки доступа', title: device.hostname || device.ip, subtitle: [device.ip, device.description].filter(Boolean).join(' · '), to: `/access-points?device=${encodeURIComponent(device.id)}` })
      continue
    }
    results.push({ id: `device:${device.id}`, kind: 'Устройства', title: device.hostname || device.ip, subtitle: [device.ip, rack?.name ?? 'Шкаф не найден', rack?.group].filter(Boolean).join(' · '), to: `/racks?device=${encodeURIComponent(device.id)}` })
  }
  for (const topology of data.topologies) for (const node of topology.nodes) {
    if (node.type === 'group' || node.type === 'text' || ![node.label, node.ip ?? ''].some((value) => value.toLowerCase().includes(term))) continue
    results.push({ id: `node:${topology.id}:${node.id}`, kind: 'Узлы схем', title: node.label, subtitle: [node.ip, topology.name].filter(Boolean).join(' · '), to: `/topology/${encodeURIComponent(topology.id)}?node=${encodeURIComponent(node.id)}` })
  }
  for (const panel of data.corePanels) for (const port of panel.ports) {
    const device = data.switches.find((item) => item.id === panel.switchId)
    if (!port.ip.toLowerCase().includes(term) && !device?.hostname.toLowerCase().includes(term)) continue
    results.push({ id: `port:${panel.id}:${port.id}`, kind: 'Core-порты', title: `${device?.hostname ?? 'Core'} · ${port.identifier}`, subtitle: [port.ip, port.label].filter(Boolean).join(' · '), to: `/core?panel=${encodeURIComponent(panel.id)}&port=${encodeURIComponent(port.id)}` })
  }
  return results
}

export function ipSortKey(ip: string) {
  const value = ip.trim()
  if (!value) return '2:'
  const parts = value.split('.')
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return `0:${parts.map((part) => Number(part).toString().padStart(3, '0')).join('.')}`
  return `1:${value}`
}
