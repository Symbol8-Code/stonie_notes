import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useInputMode } from '@/hooks/useInputMode'
import type { InputModeState } from '@/hooks/useInputMode'
import type { InputMode } from '@/types/models'

const defaultState: InputModeState = {
  mode: 'mouse' as InputMode,
  capabilities: { hasTouch: false, hasPen: false, hasMouse: true, hasKeyboard: true },
  previousMode: null,
}

const InputModeContext = createContext<InputModeState>(defaultState)

/**
 * Provides input mode state to the entire component tree.
 * Wrap the app root with this provider so any component can
 * access the current input mode and device capabilities
 * without prop drilling.
 */
export function InputModeProvider({ children }: { children: ReactNode }) {
  const state = useInputMode()

  return (
    <InputModeContext.Provider value={state}>
      {children}
    </InputModeContext.Provider>
  )
}

/**
 * Access the current input mode and device capabilities from any component.
 */
export function useInputModeContext(): InputModeState {
  return useContext(InputModeContext)
}
