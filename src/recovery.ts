import { create } from 'zustand'
import { appSnapshot } from './backup'
import { mergeAppData } from './dataMerge'
import { useNetHelper } from './store'
import type { AppData } from './types'

type RecoveryEntry = { id: string; title: string; time: number; before: AppData; after: AppData }
const key = 'nethelper-recovery-v1'
function loadEntries(): RecoveryEntry[] {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '[]') } catch { return [] }
}
export const useRecovery = create<{ entries: RecoveryEntry[]; notice: string; setNotice: (notice: string) => void }>((set) => ({
  entries: loadEntries(), notice: '', setNotice: (notice) => set({ notice }),
}))

function saveEntries(entries: RecoveryEntry[]) {
  sessionStorage.setItem(key, JSON.stringify(entries))
  useRecovery.setState({ entries })
}

export function recoverable(title: string, action: () => void) {
  const before = appSnapshot(useNetHelper.getState())
  const oldEntries = useRecovery.getState().entries
  const entry: RecoveryEntry = { id: crypto.randomUUID(), title, time: Date.now(), before, after: before }
  const entries = [entry, ...oldEntries].slice(0, 5)
  // Save before applying a destructive operation; quota failure must leave working data intact.
  saveEntries(entries)
  try {
    action()
    entry.after = appSnapshot(useNetHelper.getState())
    saveEntries(entries)
    useRecovery.setState({ notice: title })
  } catch (error) {
    useNetHelper.setState(before)
    saveEntries(oldEntries)
    throw error
  }
}

export function restoreEntry(id: string) {
  const entry = useRecovery.getState().entries.find((item) => item.id === id)
  if (!entry) return
  const merged = mergeAppData(entry.after, appSnapshot(useNetHelper.getState()), entry.before)
  if (merged.conflicts.length) throw new Error('Данные после операции изменились в тех же полях. Автоматическое восстановление остановлено; скачайте копию из истории и восстановите нужные записи вручную.')
  const entries = useRecovery.getState().entries.filter((item) => item.id !== id)
  saveEntries(entries)
  useNetHelper.setState(merged.data)
  useRecovery.setState({ notice: '' })
}
