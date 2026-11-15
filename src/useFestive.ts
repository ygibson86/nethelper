import { useCallback, useSyncExternalStore } from 'react'
import { readFestiveChoice, resolveFestive, writeFestiveChoice, type FestiveChoice } from './festive'

let cachedChoice: FestiveChoice | null | undefined
const listeners = new Set<() => void>()

function snapshot(): FestiveChoice | null {
  if (cachedChoice === undefined) cachedChoice = readFestiveChoice()
  return cachedChoice
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function choose(next: FestiveChoice | null) {
  cachedChoice = next
  writeFestiveChoice(next)
  listeners.forEach((listener) => listener())
}

/** Общее состояние для бокового меню и настроек в пределах вкладки. */
export function useFestive() {
  const choice = useSyncExternalStore(subscribe, snapshot, () => null)
  const active = resolveFestive(choice)
  const toggle = useCallback(() => { choose(active ? 'off' : 'on') }, [active])
  const reset = useCallback(() => { choose(null) }, [])
  return { active, choice, toggle, reset }
}
