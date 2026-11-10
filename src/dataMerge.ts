import type { AppData } from './types'

type JsonRecord = Record<string, unknown>

export interface MergeResult {
  data: AppData
  conflicts: string[]
}

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value)

function canonical(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value) as string
}

const equal = (left: unknown, right: unknown) => canonical(left) === canonical(right)

const itemId = (item: unknown) => isRecord(item) && typeof item.id === 'string' ? item.id : null

function isKeyedArray(items: unknown[]): boolean {
  if (!items.every((item) => itemId(item) !== null)) return false
  const ids = items.map((item) => itemId(item))
  return new Set(ids).size === ids.length
}

function idsOf(items: unknown[]): string[] {
  return items.map((item) => itemId(item) as string)
}

const isPrimitive = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value)
const isPrimitiveArray = (items: unknown[]) => items.every(isPrimitive)

function mergePrimitiveArray(base: unknown[], local: unknown[], remote: unknown[]): unknown[] {
  const baseSet = new Set(base)
  const localSet = new Set(local)
  const remoteSet = new Set(remote)
  const order = [...remote, ...local.filter((item) => !remoteSet.has(item))]
  return order.filter((item) => {
    const inBase = baseSet.has(item)
    const inLocal = localSet.has(item)
    const inRemote = remoteSet.has(item)
    if (inLocal && inRemote) return true
    return !inBase && (inLocal || inRemote)
  })
}

function mergeObject(base: JsonRecord, local: JsonRecord, remote: JsonRecord, path: string, conflicts: string[]): JsonRecord {
  const merged: JsonRecord = {}
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
  for (const key of keys) {
    const value = mergeValue(base[key], local[key], remote[key], `${path}.${key}`, conflicts)
    if (value !== undefined) merged[key] = value
  }
  return merged
}

function mergeKeyedArray(base: unknown[], local: unknown[], remote: unknown[], path: string, conflicts: string[]): unknown[] {
  const baseMap = new Map(base.map((item) => [itemId(item) as string, item]))
  const localMap = new Map(local.map((item) => [itemId(item) as string, item]))
  const remoteMap = new Map(remote.map((item) => [itemId(item) as string, item]))
  const baseOrder = idsOf(base)
  const localOrder = idsOf(local)
  const remoteOrder = idsOf(remote)

  const localReordered = localOrder.join('\u0000') !== baseOrder.join('\u0000')
  const remoteReordered = remoteOrder.join('\u0000') !== baseOrder.join('\u0000')
  const order = localReordered && !remoteReordered
    ? [...localOrder]
    : [...remoteOrder, ...localOrder.filter((id) => !remoteOrder.includes(id))]

  const seen = new Set(order)
  for (const id of [...baseOrder, ...localOrder, ...remoteOrder]) {
    if (!seen.has(id)) {
      order.push(id)
      seen.add(id)
    }
  }

  const merged: unknown[] = []
  for (const id of order) {
    const baseItem = baseMap.get(id)
    const localItem = localMap.get(id)
    const remoteItem = remoteMap.get(id)
    const itemPath = `${path}[${id}]`

    if (localItem === undefined) {
      if (remoteItem === undefined) continue
      if (baseItem !== undefined && equal(remoteItem, baseItem)) continue
      if (baseItem !== undefined) conflicts.push(itemPath)
      merged.push(remoteItem)
      continue
    }

    if (remoteItem === undefined) {
      if (baseItem !== undefined && equal(localItem, baseItem)) continue
      if (baseItem !== undefined) conflicts.push(itemPath)
      merged.push(localItem)
      continue
    }

    const value = mergeValue(baseItem, localItem, remoteItem, itemPath, conflicts)
    if (value !== undefined) merged.push(value)
  }
  return merged
}

function mergeValue(base: unknown, local: unknown, remote: unknown, path: string, conflicts: string[]): unknown {
  if (equal(local, base)) return remote
  if (equal(remote, base)) return local
  if (equal(local, remote)) return local
  if (isRecord(base) && isRecord(local) && isRecord(remote)) return mergeObject(base, local, remote, path, conflicts)
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    if (isKeyedArray(base) && isKeyedArray(local) && isKeyedArray(remote)) return mergeKeyedArray(base, local, remote, path, conflicts)
    if (isPrimitiveArray(base) && isPrimitiveArray(local) && isPrimitiveArray(remote)) return mergePrimitiveArray(base, local, remote)
  }
  conflicts.push(path)
  return local
}

export function mergeAppData(base: AppData, local: AppData, remote: AppData): MergeResult {
  const conflicts: string[] = []
  const data = mergeValue(base, local, remote, 'data', conflicts) as AppData
  return { data, conflicts }
}
