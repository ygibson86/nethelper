import { createContext, useContext } from 'react'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

export interface SaveState {
  status: SaveStatus
  message?: string
  retry?: () => void
}

export const SaveStateContext = createContext<SaveState>({ status: 'idle' })

export function useSaveState() {
  return useContext(SaveStateContext)
}
