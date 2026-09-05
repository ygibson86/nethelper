export type Theme = 'dark' | 'light'
export type DeviceType = 'switch' | 'router' | 'pc' | 'server' | 'firewall' | 'access-point' | 'printer' | 'phone' | 'camera' | 'cloud' | 'ups' | 'nas' | 'patch-panel' | 'text' | 'group'
export type CableType = 'copper' | 'fiber' | 'dac' | 'wireless'
export type HandleSide = 'top' | 'bottom' | 'left' | 'right'
export type HandleLayout = Record<HandleSide, number>
export type PortStatus = 'active' | 'inactive' | 'disabled'

export type AccessMethod = 'ssh' | 'rdp'

export interface Manufacturer {
  id: string
  name: string
  abbreviation: string
  color: string
  deviceTypes: DeviceType[]
}

export interface NetworkSwitch {
  id: string
  hostname: string
  ip: string
  manufacturerId: string
  deviceType: DeviceType
  model: string
  accessMethods: AccessMethod[]
  description: string
  rackId: string
  topologyId?: string
  isCore?: boolean
}

export interface Rack {
  id: string
  name: string
  location: string
  group: string
  switchIds: string[]
}

export interface TopologyNode {
  id: string
  x: number
  y: number
  label: string
  text?: string
  name?: string
  type: DeviceType
  color: string
  manufacturerId?: string
  handles?: HandleLayout
  width?: number
  height?: number
  groupLabelPosition?: 'top' | 'center'
  switchId?: string
  ip?: string
  fontSize?: number
}

export interface TopologyLink {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  sourcePort: string
  targetPort: string
  cableType: CableType
  label?: string
  showLabel?: boolean
}

export interface Topology {
  id: string
  name: string
  description: string
  nodes: TopologyNode[]
  links: TopologyLink[]
}

export interface CorePort {
  id: string
  identifier: string
  status: PortStatus
  ip: string
  label: string
}

export interface CorePortRow {
  id: string
  label: string
  portIds: string[]
}

export interface CorePanel {
  id: string
  switchId: string
  model: string
  ports: CorePort[]
  rows: CorePortRow[]
  layoutTemplate: 'single-28' | 'stacked-56' | 'custom'
}

export interface AppSettings {
  theme: Theme
  fontSize: number
  portsPerRow: number
}

export interface ConfigTemplate {
  id: string
  vendor: 'eltex' | 'cisco'
  title: string
  description: string
  body: string
  updatedAt: string
}

export interface AppData {
  version: number
  manufacturers: Manufacturer[]
  switches: NetworkSwitch[]
  racks: Rack[]
  groups?: string[]
  topologies: Topology[]
  corePanels: CorePanel[]
  settings: AppSettings
  configTemplates: ConfigTemplate[]
}
