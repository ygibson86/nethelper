import type { CorePanel, CorePort, CorePortRow } from './types'

export type CoreLayoutTemplate = CorePanel['layoutTemplate']

export interface CoreLayoutDefinition {
  id: CoreLayoutTemplate
  name: string
  description: string
  identifiers: string[][]
}

const rowIdentifiers = (member: 1 | 2) => [
  ...Array.from({ length: 24 }, (_, index) => `${member}/0/${index + 1}`),
  ...Array.from({ length: 4 }, (_, index) => `${member}/1/${index + 1}`),
]

export const coreLayoutDefinitions: CoreLayoutDefinition[] = [
  {
    id: 'single-28',
    name: '28 портов · один ряд',
    description: '1/0/1–1/0/24 + 1/1/1–1/1/4',
    identifiers: [rowIdentifiers(1)],
  },
  {
    id: 'stacked-56',
    name: '56 портов · два ряда',
    description: 'Первый ряд 1/x/x, второй ряд 2/x/x',
    identifiers: [rowIdentifiers(1), rowIdentifiers(2)],
  },
]

export function applyCoreLayout(panel: CorePanel, template: Exclude<CoreLayoutTemplate, 'custom'>): Pick<CorePanel, 'ports' | 'rows' | 'layoutTemplate'> {
  const definition = coreLayoutDefinitions.find((item) => item.id === template)!
  const existingByIdentifier = new Map(panel.ports.map((port) => [port.identifier, port]))
  const ports: CorePort[] = definition.identifiers.flat().map((identifier) => existingByIdentifier.get(identifier) ?? {
    id: `port-${panel.id}-${identifier.replaceAll('/', '-')}`,
    identifier,
    status: 'inactive',
    ip: '',
    label: '',
  })
  const idByIdentifier = new Map(ports.map((port) => [port.identifier, port.id]))
  const rows: CorePortRow[] = definition.identifiers.map((identifiers, index) => ({
    id: `${panel.id}-row-${index + 1}`,
    label: index === 0 ? 'Первый ряд' : 'Второй ряд',
    portIds: identifiers.map((identifier) => idByIdentifier.get(identifier)!),
  }))
  return { ports, rows, layoutTemplate: template }
}

export function inferCoreRows(panel: Pick<CorePanel, 'id' | 'ports'>): CorePortRow[] {
  if (!panel.ports.length) return []
  const firstRow = panel.ports.filter((port) => port.identifier.startsWith('1/'))
  const secondRow = panel.ports.filter((port) => port.identifier.startsWith('2/'))
  if (firstRow.length && firstRow.length + secondRow.length === panel.ports.length) {
    return [firstRow, secondRow].filter((row) => row.length).map((row, index) => ({ id: `${panel.id}-row-${index + 1}`, label: index === 0 ? 'Первый ряд' : 'Второй ряд', portIds: row.map((port) => port.id) }))
  }
  return [{ id: `${panel.id}-row-1`, label: 'Порты', portIds: panel.ports.map((port) => port.id) }]
}
