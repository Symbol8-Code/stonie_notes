import { useDeviceType } from '@/hooks/useMediaQuery'

interface FABProps {
  onClick: () => void
}

/**
 * Floating action button for quick capture.
 * Phone/Tablet: visible as a FAB above the bottom nav or in bottom-right.
 * Desktop: hidden (users have Alt+Q shortcut and toolbar).
 * See DESIGN.md Section 4.1 (Quick Capture — entry points).
 */
export function FloatingActionButton({ onClick }: FABProps) {
  const device = useDeviceType()

  // Desktop uses keyboard shortcut (Alt+Q) instead
  if (device === 'desktop') return null

  return (
    <button
      className="fab"
      onClick={onClick}
      aria-label="Quick capture — create a new note"
      title="New note (Alt+Q)"
    >
      <span aria-hidden="true">+</span>
    </button>
  )
}
