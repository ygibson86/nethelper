import assert from 'node:assert/strict'
import test from 'node:test'
import { globalSearch, ipSortKey } from '../src/search.ts'
import { inspectData } from '../src/dataQuality.ts'
import { mergeAppData } from '../src/dataMerge.ts'

const fixture = () => ({
  version: 8, manufacturers: [], settings: { theme: 'dark', fontSize: 16, portsPerRow: 14, pingEnabled: false }, groups: [], configTemplates: [],
  racks: [{ id: 'r1', name: 'Шкаф 1', group: 'Группа', location: '', switchIds: ['d1'] }],
  switches: [{ id: 'd1', hostname: 'SW-01', ip: '10.0.0.10', manufacturerId: '', deviceType: 'switch', model: '', accessMethods: [], description: '', rackId: 'r1' }],
  topologies: [{ id: 't1', name: 'Схема', description: '', nodes: [{ id: 'n1', label: 'SW-01', ip: '10.0.0.10', type: 'switch', switchId: 'd1', x: 0, y: 0, color: '#ffffff' }], links: [] }],
  corePanels: [{ id: 'c1', switchId: 'd1', model: '', layoutTemplate: 'custom', rows: [], ports: [{ id: 'p1', identifier: '1/0/1', ip: '10.0.0.10', label: '', status: 'inactive' }] }],
})
test('search finds inventory, exact node and Core port, case insensitive', () => {
  const data = fixture()
  assert.equal(globalSearch(data, 'sw-01').length, 3)
  const results = globalSearch(data, '10.0.0.10')
  assert.equal(results.length, 3)
  assert.equal(results.find((item) => item.kind === 'Узлы схем').to, '/topology/t1?node=n1')
  assert.equal(results.find((item) => item.kind === 'Core-порты').to, '/core?panel=c1&port=p1')
  assert.deepEqual(globalSearch(data, ''), [])
})
test('IP sorting numeric; other addresses then empty', () => {
  assert.deepEqual(['', '10.0.0.100', '10.0.0.2', 'host'].sort((a, b) => ipSortKey(a).localeCompare(ipSortKey(b))), ['10.0.0.2', '10.0.0.100', 'host', ''])
})
test('quality check clean fixture and diagnostics without mutation', () => {
  const data = fixture()
  assert.deepEqual(inspectData(data), [])
  data.switches.push({ ...data.switches[0], id: 'd2', hostname: 'SW-02' })
  data.topologies[0].nodes[0].ip = '10.0.0.99'
  data.topologies[0].links.push({ id: 'bad-link', source: 'missing', target: 'n1', sourcePort: '1', targetPort: '2', cableType: 'copper' })
  const before = JSON.stringify(data)
  const issues = inspectData(data)
  assert(issues.some((item) => item.category === 'Повторяющиеся IP'))
  assert(issues.some((item) => item.category === 'Расхождение IP'))
  assert(issues.some((item) => item.id === 'link:t1:bad-link'))
  assert.equal(JSON.stringify(data), before)
})
test('inverse merge restores deleted records and preserves independent edits', () => {
  const before = fixture()
  const after = structuredClone(before)
  after.switches = []
  after.racks[0].switchIds = []
  after.corePanels = []
  delete after.topologies[0].nodes[0].switchId
  const current = structuredClone(after)
  current.settings.fontSize = 18
  current.topologies[0].nodes[0].x = 250
  const restored = mergeAppData(after, current, before)
  assert.deepEqual(restored.conflicts, [])
  assert.equal(restored.data.switches.length, 1)
  assert.equal(restored.data.topologies[0].nodes[0].switchId, 'd1')
  assert.equal(restored.data.topologies[0].nodes[0].x, 250)
  assert.equal(restored.data.settings.fontSize, 18)
})
test('inverse merge reports conflicting relink instead of silently overriding it', () => {
  const before = fixture()
  const after = structuredClone(before)
  delete after.topologies[0].nodes[0].switchId
  const current = structuredClone(after)
  current.topologies[0].nodes[0].switchId = 'different-device'
  assert(mergeAppData(after, current, before).conflicts.length > 0)
})
