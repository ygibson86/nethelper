import assert from 'node:assert/strict'
import test from 'node:test'
import { FESTIVE_STORAGE_KEY, isFestiveSeason, readFestiveChoice, resolveFestive, writeFestiveChoice } from '../src/festive.ts'

const memoryStorage = () => {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
  }
}

test('festive season covers December and is off for the rest of the year', () => {
  assert.equal(isFestiveSeason(new Date(2026, 10, 30)), false)
  assert.equal(isFestiveSeason(new Date(2026, 11, 1)), true)
  assert.equal(isFestiveSeason(new Date(2026, 11, 31, 23, 59)), true)
  assert.equal(isFestiveSeason(new Date(2027, 0, 1)), false)
  assert.equal(isFestiveSeason(new Date(2027, 0, 14)), false)
  assert.equal(isFestiveSeason(new Date(2027, 6, 15)), false)
})

test('manual choice overrides the season and unknown values fall back to auto', () => {
  assert.equal(resolveFestive('on', new Date(2026, 6, 15)), true)
  assert.equal(resolveFestive('off', new Date(2026, 11, 20)), false)
  assert.equal(resolveFestive(null, new Date(2026, 11, 20)), true)
  assert.equal(resolveFestive(null, new Date(2026, 0, 10)), false)
  assert.equal(resolveFestive(null, new Date(2026, 6, 15)), false)
  assert.equal(resolveFestive('maybe', new Date(2026, 11, 10)), true)
})

test('choice roundtrip keeps only on and off, reset removes the key', () => {
  const storage = memoryStorage()
  assert.equal(readFestiveChoice(storage), null)
  writeFestiveChoice('on', storage)
  assert.equal(storage.data.get(FESTIVE_STORAGE_KEY), 'on')
  assert.equal(readFestiveChoice(storage), 'on')
  writeFestiveChoice('off', storage)
  assert.equal(readFestiveChoice(storage), 'off')
  storage.setItem(FESTIVE_STORAGE_KEY, 'broken')
  assert.equal(readFestiveChoice(storage), null)
  writeFestiveChoice('on', storage)
  writeFestiveChoice(null, storage)
  assert.equal(storage.data.has(FESTIVE_STORAGE_KEY), false)
  assert.equal(readFestiveChoice(storage), null)
})

test('storage failures never break the interface', () => {
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
  assert.equal(readFestiveChoice(broken), null)
  assert.doesNotThrow(() => writeFestiveChoice('on', broken))
  assert.doesNotThrow(() => writeFestiveChoice(null, broken))
})
