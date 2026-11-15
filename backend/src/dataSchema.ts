import { z } from 'zod'
import { isWebUrl } from './webUrl.js'

const id = z.string().min(1).max(256)
const text = z.string().max(100_000)
const webUrl = z.string().max(2048).refine(isWebUrl, 'Expected an absolute HTTP(S) URL without credentials').optional()
const deviceType = z.enum(['switch', 'router', 'pc', 'server', 'firewall', 'access-point', 'printer', 'phone', 'camera', 'cloud', 'ups', 'nas', 'patch-panel', 'text', 'group'])
const handleLayout = z.object({ top: z.number().int().min(0).max(16), bottom: z.number().int().min(0).max(16), left: z.number().int().min(0).max(16), right: z.number().int().min(0).max(16) })
export const dataSchema = z.object({
  version: z.number().int().positive(),
  manufacturers: z.array(z.object({ id, name: text, abbreviation: z.string().max(16), color: z.string().max(64), deviceTypes: z.array(deviceType) })),
  switches: z.array(z.object({ id, hostname: text, ip: z.string().max(256), manufacturerId: z.string().max(256), deviceType, model: text, accessMethods: z.array(z.enum(['ssh', 'rdp'])), description: text, rackId: id, topologyId: id.optional(), webUrl, isCore: z.boolean().optional() })),
  racks: z.array(z.object({ id, name: text, location: text, group: text, switchIds: z.array(id) })),
  groups: z.array(text).optional(),
  topologies: z.array(z.object({ id, name: text, description: text, nodes: z.array(z.object({ id, x: z.number().finite(), y: z.number().finite(), label: text, text: text.optional(), name: text.optional(), type: deviceType, color: z.string().max(64), manufacturerId: id.optional(), handles: handleLayout.optional(), width: z.number().positive().max(5000).optional(), height: z.number().positive().max(5000).optional(), groupLabelPosition: z.enum(['top', 'center']).optional(), switchId: id.optional(), ip: z.string().max(256).optional(), webUrl, ping: z.boolean().optional(), fontSize: z.number().min(8).max(200).optional() })), links: z.array(z.object({ id, source: id, target: id, sourceHandle: id.optional(), targetHandle: id.optional(), sourcePort: text, targetPort: text, cableType: z.enum(['copper', 'fiber', 'dac', 'wireless']), label: text.optional(), showLabel: z.boolean().optional() })) })),
  corePanels: z.array(z.object({ id, switchId: id, model: text, ports: z.array(z.object({ id, identifier: text, status: z.enum(['active', 'inactive', 'disabled']), ip: z.string().max(256), label: text })), rows: z.array(z.object({ id, label: text, portIds: z.array(id) })), layoutTemplate: z.enum(['single-28', 'stacked-56', 'custom']) })),
  settings: z.object({ theme: z.enum(['dark', 'light']), fontSize: z.number().min(12).max(24), portsPerRow: z.number().int().min(1).max(128), pingEnabled: z.boolean().optional() }),
  configTemplates: z.array(z.object({ id, vendor: z.enum(['eltex', 'cisco']), title: text, description: text, body: text, updatedAt: z.string().max(128), favorite: z.boolean().optional() })),
}).strict()
