import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { isWebUrl, normalizeWebUrl, resolveWebUrl } from '../src/webUrl.ts'
import { isWebUrl as apiIsWebUrl } from '../backend/src/webUrl.ts'
import { dataSchema } from '../backend/dist/dataSchema.js'

const source = await readFile(new URL('../src/dataValidation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const moduleCode = compiled.replace("'./webUrl'", JSON.stringify(new URL('../src/webUrl.ts', import.meta.url).href))
const { parseAppData } = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`)
const fixture = () => ({
  version: 8, manufacturers: [], groups: [], configTemplates: [], corePanels: [],
  settings: { theme: 'dark', fontSize: 16, portsPerRow: 14, pingEnabled: false },
  racks: [{ id: 'r1', name: 'Rack', group: '', location: '', switchIds: ['d1'] }],
  switches: [{ id: 'd1', rackId: 'r1', hostname: 'SW-01', ip: '10.0.0.1', manufacturerId: '', deviceType: 'switch', model: '', accessMethods: [], description: '' }],
  topologies: [{ id: 't1', name: 'Topology', description: '', nodes: [{ id: 'n1', label: 'SW-01', type: 'switch', color: '#ffffff', x: 30, y: 50, switchId: 'd1' }], links: [] }],
})
const valid = ['', 'http://10.0.0.1', 'https://switch.local:8443/admin?tab=1#status', 'HTTPS://SWITCH.LOCAL', 'http://[::1]:8080/', 'https://пример.рф/панель', `https://a/${'x'.repeat(2038)}`]
const invalid = ['10.0.0.1', '//switch.local', 'javascript:alert(1)', 'data:text/html,x', 'file:///a', 'ftp://switch.local', 'https://', 'https://a:99999', 'https://user:password@a', 'http://user@a', 'https://:password@a', 'https://a/has space', ' https://a', 'https://a\n', 'https://a/\u0000', 'https://a/\u007f', `https://a/${'x'.repeat(2039)}`, `https://a/${'я'.repeat(500)}`]

test('browser and API URL validators accept only safe HTTP(S) addresses with matching limits', () => {
  for (const url of valid) { assert.equal(isWebUrl(url), true, url); assert.equal(apiIsWebUrl(url), true, url) }
  for (const url of invalid) { assert.equal(isWebUrl(url), false, url); assert.equal(apiIsWebUrl(url), false, url) }
})
test('URL normalization is explicit, stable and rejects unsafe addresses', () => {
  assert.equal(normalizeWebUrl('  HTTPS://SWITCH.LOCAL:443/admin  '), 'https://switch.local/admin')
  assert.equal(normalizeWebUrl('   '), '')
  for (const url of invalid.filter((url) => url.trim() === url)) assert.throws(() => normalizeWebUrl(url))
})
test('node URL overrides device URL; blank inherits; invalid override does not fall back', () => {
  assert.equal(resolveWebUrl('http://node.local:8080', 'https://device.local'), 'http://node.local:8080/')
  assert.equal(resolveWebUrl('', 'https://device.local'), 'https://device.local/')
  assert.equal(resolveWebUrl(undefined, 'https://device.local'), 'https://device.local/')
  assert.equal(resolveWebUrl('javascript:alert(1)', 'https://device.local'), undefined)
  assert.equal(resolveWebUrl(undefined, 'file:///bad'), undefined)
  assert.equal(resolveWebUrl(), undefined)
})
test('old data without web URLs remains valid and is not mutated', () => {
  const data = fixture()
  const before = structuredClone(data)
  assert.deepEqual(parseAppData(data).errors, [])
  assert.equal(dataSchema.safeParse(data).success, true)
  assert.deepEqual(data, before)
  assert.equal(parseAppData(data).data.switches[0].webUrl, undefined)
})
test('import and API preserve device/node URLs, reject unsafe and non-string fields', () => {
  for (const url of [...valid, ...invalid, null, 42, {}]) {
    for (const target of ['device', 'node']) {
      const data = fixture()
      const item = target === 'device' ? data.switches[0] : data.topologies[0].nodes[0]
      item.webUrl = url
      const expected = valid.includes(url)
      const imported = parseAppData(data)
      const api = dataSchema.safeParse(data)
      assert.equal(imported.errors.length === 0, expected, `${target}: ${url}`)
      assert.equal(api.success, expected, `${target}: ${url}`)
      if (expected) {
        assert.equal(imported.data.switches[0].webUrl, target === 'device' ? url : undefined)
        assert.equal(imported.data.topologies[0].nodes[0].webUrl, target === 'node' ? url : undefined)
        assert.equal(api.data.switches[0].webUrl, target === 'device' ? url : undefined)
        assert.equal(api.data.topologies[0].nodes[0].webUrl, target === 'node' ? url : undefined)
      }
    }
  }
})
