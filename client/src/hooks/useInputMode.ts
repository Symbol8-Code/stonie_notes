import { useState, useEffect, useCallback, useRef } from 'react'
import type { InputMode } from '@/types/models'

/**
 * Device capabilities detected via media queries and API checks.
 */
export interface DeviceCapabilities {
  /** Device has a touchscreen */
  hasTouch: boolean
  /** Device supports stylus/pen input (pen pointer events seen) */
  hasPen: boolean
  /** Device has a fine pointer (mouse) */
  hasMouse: boolean
  /** Device has a physical keyboard attached (heuristic) */
  hasKeyboard: boolean
}

export interface InputModeState {
  /** Currently active input mode based on last user interaction */
  mode: InputMode
  /** Detected device capabilities */
  capabilities: DeviceCapabilities
  /** Previous input mode (for transition detection) */
  previousMode: InputMode | null
}

const STORAGE_KEY = 'stonie-last-input-mode'

function detectCapabilities(): DeviceCapabilities {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const hasMouse = window.matchMedia('(pointer: fine)').matches
  const hasPen = window.matchMedia('(any-pointer: fine)').matches && hasTouch
  // Heuristic: if the device has a fine pointer or isn't purely touch, assume keyboard
  const hasKeyboard = hasMouse || !hasTouch

  return { hasTouch, hasPen, hasMouse, hasKeyboard }
}

/**
 * Detects the active input mode based on pointer and keyboard events,
 * and provides device capability information.
 *
 * See DESIGN.md Section 3.1 (Multi-Modal Input Philosophy).
 *
 * The app follows the user's input — when a pen is detected, pen tools
 * surface; when keyboard is active, keyboard affordances appear.
 */
export function useInputMode(): InputModeState {
  const [mode, setMode] = useState<InputMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return (saved as InputMode) ?? 'mouse'
  })
  const [previousMode, setPreviousMode] = useState<InputMode | null>(null)
  const [capabilities, setCapabilities] = useState<DeviceCapabilities>(detectCapabilities)
  const penSeenRef = useRef(false)

  // Re-detect capabilities on media query changes
  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)')
    const anyFinePointer = window.matchMedia('(any-pointer: fine)')

    const update = () => {
      const caps = detectCapabilities()
      if (penSeenRef.current) caps.hasPen = true
      setCapabilities(caps)
    }

    finePointer.addEventListener('change', update)
    anyFinePointer.addEventListener('change', update)
    return () => {
      finePointer.removeEventListener('change', update)
      anyFinePointer.removeEventListener('change', update)
    }
  }, [])

  const switchMode = useCallback((next: InputMode) => {
    setMode((prev) => {
      if (prev !== next) {
        setPreviousMode(prev)
        localStorage.setItem(STORAGE_KEY, next)
        return next
      }
      return prev
    })
  }, [])

  const handlePointer = useCallback((e: PointerEvent) => {
    switch (e.pointerType) {
      case 'pen':
        penSeenRef.current = true
        setCapabilities((prev) => prev.hasPen ? prev : { ...prev, hasPen: true })
        switchMode('pen')
        break
      case 'touch':
        switchMode('touch')
        break
      default:
        switchMode('mouse')
    }
  }, [switchMode])

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    // Only switch to keyboard mode for non-modifier key presses
    if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift') return
    switchMode('keyboard')
  }, [switchMode])

  useEffect(() => {
    // Listen to both pointerdown and pointermove for faster detection
    window.addEventListener('pointerdown', handlePointer)
    window.addEventListener('pointermove', handlePointer)
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      window.removeEventListener('pointerdown', handlePointer)
      window.removeEventListener('pointermove', handlePointer)
      window.removeEventListener('keydown', handleKeyboard)
    }
  }, [handlePointer, handleKeyboard])

  return { mode, capabilities, previousMode }
}
