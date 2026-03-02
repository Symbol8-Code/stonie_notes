import { useEffect } from 'react'

interface ShortcutMap {
  [key: string]: () => void
}

/**
 * Global keyboard shortcuts.
 * Keys are formatted as modifier combos + key, e.g. "alt+n", "ctrl+shift+/".
 *
 * Shortcuts are suppressed when focus is inside an input, textarea, or
 * contenteditable element so they don't interfere with typing.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in an input
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) {
        return
      }

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.altKey) parts.push('alt')
      if (e.shiftKey) parts.push('shift')
      parts.push(e.key.toLowerCase())
      const combo = parts.join('+')

      const action = shortcuts[combo]
      if (action) {
        e.preventDefault()
        action()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [shortcuts])
}
