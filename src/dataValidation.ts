import type { AppData, DeviceType } from './types'

const deviceTypes = new Set<DeviceType>(['switch', 'router', 'pc', 'server', 'firewall', 'access-point', 'printer', 'phone', 'camera', 'cloud', 'ups', 'nas', 'patch-panel', 'text', 'group'])
const cableTypes = new Set(['copper', 'fiber', 'dac', 'wireless'])
const portStatuses = new Set(['active', 'inactive', 'disabled'])
const accessMethods = new Set(['ssh', 'rdp'])

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length <= 100_000)
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 256)
const requiredStrings = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === 'string' && (value[key] as string).length <= 100_000)
const nonEmptyStrings = (value: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= 256)
const validOptionalString = (value: unknown, max = 100_000) => value === undefined || (typeof value === 'string' && value.length <= max)
const validOptionalId = (value: unknown) => value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= 256)
const validHandles = (value: unknown) => value === undefined || (record(value) && ['top', 'bottom', 'left', 'right'].every((key) => Number.isInteger(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= 16))

export function parseAppData(input: unknown): { data?: AppData; errors: string[] } {
  const errors: string[] = []
  if (!record(input)) return { errors: ['Корневое значение должно быть объектом.'] }

  const manufacturers = Array.isArray(input.manufacturers) ? input.manufacturers : null
  if (!manufacturers || !manufacturers.every((item) => record(item) && nonEmptyStrings(item, ['id']) && requiredStrings(item, ['name', 'abbreviation', 'color']) && (item.abbreviation as string).length <= 16 && (item.color as string).length <= 64 && Array.isArray(item.deviceTypes) && item.deviceTypes.every((type) => deviceTypes.has(type as DeviceType)))) errors.push('Некорректный список производителей.')

  const switches = Array.isArray(input.switches) ? input.switches : null
  if (!switches || !switches.every((item) => record(item) && nonEmptyStrings(item, ['id', 'rackId']) && requiredStrings(item, ['hostname', 'ip', 'manufacturerId', 'model', 'description']) && (item.ip as string).length <= 256 && (item.manufacturerId as string).length <= 256 && deviceTypes.has(item.deviceType as DeviceType) && validOptionalId(item.topologyId) && (item.isCore === undefined || typeof item.isCore === 'boolean') && (!('accessMethods' in item) || (Array.isArray(item.accessMethods) && item.accessMethods.every((method) => accessMethods.has(String(method))))))) errors.push('Некорректный список устройств.')

  const racks = Array.isArray(input.racks) ? input.racks : null
  if (!racks || !racks.every((item) => record(item) && nonEmptyStrings(item, ['id']) && requiredStrings(item, ['name', 'location', 'group']) && ids(item.switchIds))) errors.push('Некорректный список шкафов.')

  const topologies = Array.isArray(input.topologies) ? input.topologies : null
  if (!topologies || !topologies.every((topology) => record(topology) && nonEmptyStrings(topology, ['id']) && requiredStrings(topology, ['name', 'description']) && Array.isArray(topology.nodes) && topology.nodes.every((node) => record(node) && nonEmptyStrings(node, ['id']) && requiredStrings(node, ['label', 'color']) && (node.color as string).length <= 64 && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y) && deviceTypes.has(node.type as DeviceType) && validOptionalString(node.text) && validOptionalString(node.name) && validOptionalId(node.manufacturerId) && validOptionalId(node.switchId) && validOptionalString(node.ip, 256) && validHandles(node.handles) && (node.width === undefined || (typeof node.width === 'number' && node.width > 0 && node.width <= 5000)) && (node.height === undefined || (typeof node.height === 'number' && node.height > 0 && node.height <= 5000)) && (node.fontSize === undefined || (typeof node.fontSize === 'number' && node.fontSize >= 8 && node.fontSize <= 200)) && (node.groupLabelPosition === undefined || ['top', 'center'].includes(String(node.groupLabelPosition)))) && Array.isArray(topology.links) && topology.links.every((link) => record(link) && nonEmptyStrings(link, ['id', 'source', 'target']) && requiredStrings(link, ['sourcePort', 'targetPort']) && cableTypes.has(String(link.cableType)) && validOptionalId(link.sourceHandle) && validOptionalId(link.targetHandle) && validOptionalString(link.label) && (link.showLabel === undefined || typeof link.showLabel === 'boolean')))) errors.push('Некорректный список схем или их элементов.')

  const corePanels = Array.isArray(input.corePanels) ? input.corePanels : null
  if (!corePanels || !corePanels.every((panel) => record(panel) && nonEmptyStrings(panel, ['id', 'switchId']) && requiredStrings(panel, ['model']) && ['single-28', 'stacked-56', 'custom'].includes(String(panel.layoutTemplate ?? (Array.isArray(panel.ports) && panel.ports.length === 56 ? 'stacked-56' : 'single-28'))) && Array.isArray(panel.ports) && panel.ports.every((port) => record(port) && nonEmptyStrings(port, ['id']) && requiredStrings(port, ['identifier', 'ip', 'label']) && (port.ip as string).length <= 256 && portStatuses.has(String(port.status))) && (!('rows' in panel) || (Array.isArray(panel.rows) && panel.rows.every((row) => record(row) && nonEmptyStrings(row, ['id']) && requiredStrings(row, ['label']) && ids(row.portIds)))))) errors.push('Некорректные Core-панели.')

  const settings = record(input.settings) ? input.settings : null
  if (!settings || !['dark', 'light'].includes(String(settings.theme)) || typeof settings.fontSize !== 'number' || settings.fontSize < 12 || settings.fontSize > 24 || (settings.portsPerRow !== undefined && (!Number.isInteger(settings.portsPerRow) || Number(settings.portsPerRow) < 1 || Number(settings.portsPerRow) > 128))) errors.push('Некорректные настройки интерфейса.')

  const templates = input.configTemplates === undefined ? [] : input.configTemplates
  if (!Array.isArray(templates) || !templates.every((template) => record(template) && nonEmptyStrings(template, ['id']) && requiredStrings(template, ['title', 'description', 'body', 'updatedAt']) && String(template.updatedAt).length <= 128 && ['eltex', 'cisco'].includes(String(template.vendor)))) errors.push('Некорректные шаблоны конфигураций.')

  const groups = input.groups === undefined ? undefined : input.groups
  if (groups !== undefined && !strings(groups)) errors.push('Некорректный список групп шкафов.')
  if (!Number.isInteger(input.version) || Number(input.version) <= 0) errors.push('Не указана корректная версия формата данных.')
  if (errors.length || !manufacturers || !switches || !racks || !topologies || !corePanels || !settings || !Array.isArray(templates)) return { errors }

  const switchByIp = new Map<string, typeof switches>()
  switches.forEach((device) => {
    const ip = String((device as Record<string, unknown>).ip).trim()
    if (ip) switchByIp.set(ip, [...(switchByIp.get(ip) ?? []), device])
  })
  const normalizedTopologies = topologies.map((topology) => ({
    ...topology,
    nodes: ((topology as Record<string, unknown>).nodes as Record<string, unknown>[]).map((node) => {
      if (node.switchId || typeof node.ip !== 'string' || !node.ip.trim()) return node
      const matches = switchByIp.get(node.ip.trim()) ?? []
      return matches.length === 1 ? { ...node, switchId: String((matches[0] as Record<string, unknown>).id) } : node
    }),
  }))
  const normalized = {
    ...input,
    groups: groups ?? [...new Set(racks.map((rack) => String((rack as Record<string, unknown>).group)).filter(Boolean))],
    settings: { ...settings, portsPerRow: typeof settings.portsPerRow === 'number' ? settings.portsPerRow : 24 },
    switches: switches.map((item) => ({ ...item, accessMethods: Array.isArray((item as Record<string, unknown>).accessMethods) ? (item as Record<string, unknown>).accessMethods : [] })),
    topologies: normalizedTopologies,
    corePanels: corePanels.map((panel) => ({ ...panel, rows: Array.isArray((panel as Record<string, unknown>).rows) ? (panel as Record<string, unknown>).rows : [], layoutTemplate: (panel as Record<string, unknown>).layoutTemplate ?? (((panel as Record<string, unknown>).ports as unknown[]).length === 56 ? 'stacked-56' : 'single-28') })),
    configTemplates: templates,
  }
  return { data: normalized as unknown as AppData, errors: [] }
}
