import type { AppData } from './types'

export function appSnapshot(data: AppData): AppData {
  return structuredClone({ version: data.version, manufacturers: data.manufacturers, switches: data.switches, racks: data.racks, groups: data.groups, topologies: data.topologies, corePanels: data.corePanels, settings: data.settings, configTemplates: data.configTemplates })
}

export function downloadBackup(data: AppData, prefix = 'nethelper-backup') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(appSnapshot(data), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
