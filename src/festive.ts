export type FestiveChoice = 'on' | 'off'

export const FESTIVE_STORAGE_KEY = 'nethelper-festive'

export interface FestiveStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): FestiveStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Новогоднее оформление действует с 1 декабря по 14 января включительно. */
export function isFestiveSeason(date: Date): boolean {
  const month = date.getMonth()
  if (month === 11) return true
  return month === 0 && date.getDate() <= 14
}

/** Ручной выбор сильнее сезона; без выбора работает авто-режим. */
export function resolveFestive(choice: string | null | undefined, date: Date = new Date()): boolean {
  if (choice === 'on') return true
  if (choice === 'off') return false
  return isFestiveSeason(date)
}

export function readFestiveChoice(storage: FestiveStorage | null = browserStorage()): FestiveChoice | null {
  try {
    const value = storage?.getItem(FESTIVE_STORAGE_KEY)
    return value === 'on' || value === 'off' ? value : null
  } catch {
    return null
  }
}

export function writeFestiveChoice(choice: FestiveChoice | null, storage: FestiveStorage | null = browserStorage()): void {
  try {
    if (choice === null) storage?.removeItem(FESTIVE_STORAGE_KEY)
    else storage?.setItem(FESTIVE_STORAGE_KEY, choice)
  } catch {
    /* Оформление не должно мешать работе приложения. */
  }
}
