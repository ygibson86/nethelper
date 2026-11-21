import assert from 'node:assert/strict'
import test from 'node:test'
import { accessPoints, accessPointsCsv, buildApImport, detectDelimiter, normalizeMac, parseCsv, resolveUplink } from '../src/accessPoints.ts'

const base = () => ({
  version: 8,
  manufacturers: [{ id: 'eltex', name: 'Eltex', abbreviation: 'E', color: '#8b5cf6', deviceTypes: ['access-point'] }],
  racks: [],
  groups: [],
  topologies: [],
  corePanels: [],
  settings: { theme: 'dark', fontSize: 16, portsPerRow: 24, pingEnabled: false },
  configTemplates: [],
  switches: [
    { id: 'sw1', hostname: 'SW-1', ip: '10.109.33.79', manufacturerId: 'eltex', deviceType: 'switch', model: 'MES', accessMethods: ['ssh'], description: '', rackId: '' },
    { id: 'sw2', hostname: 'SW-2', ip: '10.109.33.27', manufacturerId: 'eltex', deviceType: 'switch', model: 'MES', accessMethods: ['ssh'], description: '', rackId: '' },
  ],
})

test('MAC normalization accepts common notations and rejects junk', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF')
  assert.equal(normalizeMac('aabb.ccdd.eeff'), 'AA:BB:CC:DD:EE:FF')
  assert.equal(normalizeMac(' AABBCCDDEEFF '), 'AA:BB:CC:DD:EE:FF')
  assert.equal(normalizeMac('nope'), null)
  assert.equal(normalizeMac(''), null)
})

test('CSV parsing handles BOM, quotes and delimiter detection', () => {
  assert.equal(detectDelimiter('hostname;ip;mac'), ';')
  assert.equal(detectDelimiter('hostname,ip,mac'), ',')
  const parsed = parseCsv('\uFEFFhostname;location;ip\n"AP-1";"Кабинет 101; потолок";10.0.0.1\n')
  assert.deepEqual(parsed.header, ['hostname', 'location', 'ip'])
  assert.deepEqual(parsed.rows[0].cells, ['AP-1', 'Кабинет 101; потолок', '10.0.0.1'])
})

test('import creates points with uplink by switch IP and generates nothing else', () => {
  const data = base()
  const csv = 'hostname;location;ip;mac;switch;port\nRU02AP021;ИТ;10.109.41.21;aa:bb:cc:dd:ee:01;10.109.33.79;2\n'
  const plan = buildApImport(csv, data, { defaultManufacturerId: 'eltex' })
  assert.equal(plan.create.length, 1)
  assert.equal(plan.update.length, 0)
  const created = plan.create[0]
  assert.equal(created.uplinkSwitchId, 'sw1')
  assert.equal(created.uplinkPort, '2')
  assert.equal(created.mac, 'AA:BB:CC:DD:EE:01')
  assert.equal(created.description, 'ИТ')
  assert.equal(created.deviceType, 'access-point')
})

test('import keeps unknown switch address and warns without blocking', () => {
  const data = base()
  const csv = 'hostname;ip;switch;port\nRU02AP001;10.109.41.1;10.19.33.72;3\n'
  const plan = buildApImport(csv, data)
  assert.equal(plan.create.length, 1)
  assert.equal(plan.create[0].uplinkSwitchId, undefined)
  assert.equal(plan.create[0].uplinkSwitchAddress, '10.19.33.72')
  assert.ok(plan.issues.some((issue) => issue.level === 'warning' && issue.message.includes('не найден')))
})

test('import updates existing point matched by hostname and keeps its id', () => {
  const data = base()
  data.switches.push({ id: 'ap1', hostname: 'RU02AP021', ip: '10.109.41.21', manufacturerId: '', deviceType: 'access-point', model: 'WEP-30', accessMethods: [], description: 'old', rackId: '', uplinkSwitchId: 'sw1', uplinkPort: '2' })
  const csv = 'hostname;location;ip;mac;switch;port;note\nRU02AP021;Новое место;10.109.41.21;AA:BB:CC:DD:EE:02;10.109.33.27;9;менять кабель\n'
  const plan = buildApImport(csv, data)
  assert.equal(plan.create.length, 0)
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].id, 'ap1')
  assert.equal(plan.update[0].patch.uplinkSwitchId, 'sw2')
  assert.equal(plan.update[0].patch.uplinkPort, '9')
  assert.equal(plan.update[0].patch.note, 'менять кабель')
})

test('import skips rows without hostname or with broken IP', () => {
  const data = base()
  const csv = 'hostname;ip\n;10.0.0.1\nAP-X;10.0.0.400\n'
  const plan = buildApImport(csv, data)
  assert.equal(plan.rows.length, 0)
  assert.equal(plan.skipped, 2)
  assert_equal_errors(plan.issues)
})

function assert_equal_errors(issues) {
  assert.equal(issues.filter((issue) => issue.level === 'error').length, 2)
}

test('uplink resolution falls back to the stored address when the switch is not in inventory', () => {
  const data = base()
  const point = { id: 'ap2', hostname: 'AP-2', ip: '10.109.41.2', manufacturerId: '', deviceType: 'access-point', model: '', accessMethods: [], description: '', uplinkSwitchAddress: '10.19.33.72', uplinkPort: '3' }
  const uplink = resolveUplink(point, data.switches)
  assert.equal(uplink.switchDevice, undefined)
  assert.equal(uplink.address, '10.19.33.72')
  assert.equal(uplink.port, '3')
  assert.equal(uplink.inInventory, false)
})

test('CSV export round-trips hostname, location, uplink and note', () => {
  const data = base()
  data.switches.push({ id: 'ap3', hostname: 'RU02AP100', ip: '10.109.41.100', manufacturerId: 'eltex', deviceType: 'access-point', model: 'WOL-30', accessMethods: [], description: 'КПП; улица', rackId: '', uplinkSwitchId: 'sw2', uplinkPort: '12', note: 'кабель' })
  assert.equal(accessPoints(data.switches).length, 1)
  const csv = accessPointsCsv(data)
  assert.ok(csv.includes('RU02AP100'))
  const plan = buildApImport(csv, data)
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0].patch.uplinkSwitchId, 'sw2')
  assert.equal(plan.update[0].patch.uplinkPort, '12')
  assert.equal(plan.update[0].patch.description, 'КПП; улица')
})
