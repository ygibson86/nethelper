import assert from 'node:assert/strict'
import test from 'node:test'
import { filterTemplates, templateCopyDraft, templateSearchMatch } from '../src/templateLibrary.ts'

const fixture = () => [
  { id: 'a', vendor: 'cisco', title: 'Access', description: 'User port', body: 'switchport access vlan 930', favorite: false, updatedAt: '2026-01-01' },
  { id: 'b', vendor: 'eltex', title: 'Uplink', description: 'Fiber trunk', body: 'switchport mode trunk', favorite: true, updatedAt: '2026-01-01' },
  { id: 'c', vendor: 'cisco', title: 'MAC lookup', description: '', body: 'show mac address-table', favorite: true, updatedAt: '2026-01-01' },
]
test('template filters combine vendor, favorites and title/description/body search without mutation', () => {
  const data = fixture()
  const original = structuredClone(data)
  assert.deepEqual(filterTemplates(data, '', 'all', false).map((item) => item.id), ['c', 'b', 'a'])
  assert.deepEqual(filterTemplates(data, '', 'cisco', true).map((item) => item.id), ['c'])
  assert.deepEqual(filterTemplates(data, ' TRUNK ', 'eltex', true).map((item) => item.id), ['b'])
  assert.deepEqual(filterTemplates(data, '930', 'all', true), [])
  assert.deepEqual(filterTemplates(data, '930', 'all', false).map((item) => item.id), ['a'])
  assert.deepEqual(data, original)
})
test('search distinguishes body-only matches from title and description matches', () => {
  const [access, uplink] = fixture()
  assert.equal(templateSearchMatch(access, 'ACCESS'), 'title')
  assert.equal(templateSearchMatch(access, 'user'), 'description')
  assert.equal(templateSearchMatch(access, '930'), 'body')
  assert.equal(templateSearchMatch(uplink, 'trunk'), 'description')
  assert.equal(templateSearchMatch(access, '  '), null)
  assert.equal(templateSearchMatch(access, 'missing'), null)
})
test('copy draft preserves content but never reuses identity, favorite or update timestamp', () => {
  const source = fixture()[1]
  const original = structuredClone(source)
  assert.deepEqual(templateCopyDraft(source), { vendor: 'eltex', title: 'Uplink — копия', description: 'Fiber trunk', body: 'switchport mode trunk' })
  assert.deepEqual(source, original)
})
