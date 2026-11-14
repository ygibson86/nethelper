import type { AppData } from './types'

export interface DataIssue { id: string; category: string; severity: 'warning' | 'info'; title: string; detail: string; to: string }
export function inspectData(data: AppData): DataIssue[] {
  const issues: DataIssue[] = []
  const add = (id: string, category: string, title: string, detail: string, to: string, severity: DataIssue['severity'] = 'warning') => issues.push({ id, category, title, detail, to, severity })
  const devices = new Map(data.switches.map((device) => [device.id, device]))
  const racks = new Map(data.racks.map((rack) => [rack.id, rack]))
  const topologyIds = new Set(data.topologies.map((topology) => topology.id))
  const vendors = new Set(data.manufacturers.map((vendor) => vendor.id))
  const byIp = new Map<string, typeof data.switches>()
  for (const device of data.switches) {
    const to = `/racks?device=${encodeURIComponent(device.id)}`
    const ip = device.ip.trim()
    if (ip) byIp.set(ip, [...(byIp.get(ip) ?? []), device])
    else add(`ip:${device.id}`, 'Без IP', device.hostname, 'IP не указан. Это может быть нормально для пассивного оборудования.', to, 'info')
    const rack = racks.get(device.rackId)
    if (!rack || !rack.switchIds.includes(device.id)) add(`rack:${device.id}`, 'Связи', device.hostname, 'Шкаф отсутствует или устройство не включено в его список.', to)
    if (device.topologyId && !topologyIds.has(device.topologyId)) add(`topology:${device.id}`, 'Связи', device.hostname, 'Связанная схема отсутствует.', to)
    if (device.manufacturerId && !vendors.has(device.manufacturerId)) add(`vendor:${device.id}`, 'Связи', device.hostname, 'Производитель отсутствует.', to)
  }
  for (const [ip, matches] of byIp) if (matches.length > 1) add(`duplicate:${ip}`, 'Повторяющиеся IP', ip, matches.map((device) => `${device.hostname} (${racks.get(device.rackId)?.name ?? 'нет шкафа'})`).join(', '), `/racks?ip=${encodeURIComponent(ip)}`)
  for (const rack of data.racks) for (const id of rack.switchIds) {
    if (!devices.has(id) || devices.get(id)?.rackId !== rack.id) add(`rack-ref:${rack.id}:${id}`, 'Связи', rack.name, `Список шкафа ссылается на отсутствующее устройство или на устройство другого шкафа: ${id}`, '/racks')
  }
  for (const topology of data.topologies) {
    const nodeIds = new Set(topology.nodes.map((node) => node.id))
    for (const node of topology.nodes) {
      const to = `/topology/${encodeURIComponent(topology.id)}?node=${encodeURIComponent(node.id)}`
      if (node.manufacturerId && !vendors.has(node.manufacturerId)) add(`node-vendor:${topology.id}:${node.id}`, 'Связи', node.label, `${topology.name}: производитель отсутствует.`, to)
      if (node.type === 'group' || node.type === 'text') continue
      const device = node.switchId ? devices.get(node.switchId) : undefined
      if (node.switchId && !device) add(`node-ref:${topology.id}:${node.id}`, 'Связи', node.label, `${topology.name}: связанное устройство отсутствует.`, to)
      else if (!node.switchId) add(`unlinked:${topology.id}:${node.id}`, 'Без привязки', node.label, `${topology.name}: узел не связан с инвентарём; самостоятельные узлы допустимы.`, to, 'info')
      if (device && (node.ip ?? '').trim() !== device.ip.trim()) add(`mismatch:${topology.id}:${node.id}`, 'Расхождение IP', node.label, `${topology.name}: узел ${node.ip || 'без IP'}, инвентарь ${device.ip || 'без IP'} (${device.hostname}).`, to)
    }
    for (const link of topology.links) if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) add(`link:${topology.id}:${link.id}`, 'Связи', topology.name, `Связь ${link.sourcePort} → ${link.targetPort} ссылается на отсутствующий узел.`, `/topology/${encodeURIComponent(topology.id)}`)
  }
  for (const panel of data.corePanels) {
    if (!devices.has(panel.switchId)) add(`panel:${panel.id}`, 'Связи', 'Core-панель', 'Связанное устройство отсутствует.', `/core?panel=${encodeURIComponent(panel.id)}`)
    const ports = new Set(panel.ports.map((port) => port.id))
    for (const row of panel.rows) if (row.portIds.some((id) => !ports.has(id))) add(`row:${panel.id}:${row.id}`, 'Связи', row.label, 'Ряд Core-панели ссылается на отсутствующие порты.', `/core?panel=${encodeURIComponent(panel.id)}`)
  }
  return issues.sort((left, right) => Number(left.severity === 'info') - Number(right.severity === 'info'))
}
