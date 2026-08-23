import type { NetworkSwitch, Rack } from './types'

/**
 * Safe example data bundled with the public repository.
 * Operational infrastructure must be imported through the application UI,
 * never committed to source control.
 */
export const importedRacks: Rack[] = [
  { id: 'demo-rack-main', name: 'Demo rack A1', location: 'Server room', group: 'Demo infrastructure', switchIds: ['demo-switch-core'] },
  { id: 'demo-rack-floor', name: 'Demo rack F1', location: 'Floor 1', group: 'Demo infrastructure', switchIds: ['demo-switch-access'] },
]

export const importedSwitches: NetworkSwitch[] = [
  { id: 'demo-switch-core', hostname: 'DEMO-CORE-01', ip: '10.0.0.1', manufacturerId: 'cisco', deviceType: 'switch', model: 'Example core switch', accessMethods: ['ssh'], description: 'Example core switch', rackId: 'demo-rack-main', isCore: true },
  { id: 'demo-switch-access', hostname: 'DEMO-ACCESS-01', ip: '10.0.1.1', manufacturerId: 'eltex', deviceType: 'switch', model: 'Example access switch', accessMethods: ['ssh'], description: 'Example access switch', rackId: 'demo-rack-floor' },
]
