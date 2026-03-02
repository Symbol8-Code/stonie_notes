import { useState, useEffect, useCallback } from 'react'
import type { InputMode } from '@/types/models'

/**
 * Detects the active input mode based on pointer and keyboard events.
 * See DESIGN.md Section 3.1 (Multi-Modal Input Philosophy).
 *
 * The app follows the user's input — when a pen is detected, pen tools
 * surface; when keyboard is active, keyboard affordances appear.
 */
export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(() => {
    const saved = localStorage.getItem('stonie-last-input-mode')
    return (saved as InputMode) ?? 'mouse'
  })

  const handlePointer = useCallback((e: PointerEvent) => {
    let next: InputMode
    switch (e.pointerType) {
      case 'pen':
        next = 'pen'
        break
      case 'touch':
        next = 'touch'
        break
      default:
        next = 'mouse'
    }
    setMode((prev) => {
      if (prev !== next) {
        localStorage.setItem('stonie-last-input-mode', next)
        return next
      }
      return prev
    })
  }, [])

  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    // Only switch to keyboard mode for non-modifier key presses
    // that aren't from within the shortcut system
    if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta' || e.key === 'Shift') return
    setMode((prev) => {
      if (prev !== 'keyboard') {
        localStorage.setItem('stonie-last-input-mode', 'keyboard')
        return 'keyboard'
      }
      return prev
    })
  }, [])

  useEffect(() => {
    window.addEventListener('pointerdown', handlePointer)
    window.addEventListener('keydown', handleKeyboard)
    return () => {
      window.removeEventListener('pointerdown', handlePointer)
      window.removeEventListener('keydown', handleKeyboard)
    }
  }, [handlePointer, handleKeyboard])

  return mode
}
