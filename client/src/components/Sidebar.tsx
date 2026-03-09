import { useState } from 'react'
import { useDeviceType } from '@/hooks/useMediaQuery'
import { useInputModeContext } from '@/contexts/InputModeContext'
import { useOnlineContext } from '@/contexts/OnlineContext'

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
}

const INPUT_MODE_ICONS: Record<string, string> = {
  pen: 'Pen',
  touch: 'Touch',
  keyboard: 'Keys',
  mouse: 'Mouse',
}

const NAV_ITEMS = [
  { id: 'inbox', label: 'Inbox', icon: '📥' },
  { id: 'boards', label: 'Boards', icon: '📋' },
  { id: 'canvases', label: 'Canvases', icon: '🎨' },
  { id: 'search', label: 'Search', icon: '🔍' },
]

/**
 * Navigation component.
 * Desktop: persistent vertical sidebar with labels.
 * Tablet: collapsible sidebar (icons only when collapsed, full when expanded).
 * Phone: bottom navigation bar.
 * Input mode badge shows current active input and adapts its color per mode.
 * See DESIGN.md Section 3.6 (Responsive Layout).
 */
export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { mode: inputMode, capabilities } = useInputModeContext()
  const { online } = useOnlineContext()
  const device = useDeviceType()
  const [collapsed, setCollapsed] = useState(device === 'tablet')

  if (device === 'phone') {
    return (
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`bottom-nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activePage === item.id ? 'page' : undefined}
            aria-label={item.label}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    )
  }

  const isCollapsed = device === 'tablet' && collapsed

  return (
    <aside
      className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar-header">
        {!isCollapsed && <h2>STonIE</h2>}
        {device === 'tablet' && (
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▶' : '◀'}
          </button>
        )}
        {!isCollapsed && (
          <>
            <span
              className={`input-badge input-badge-${inputMode}`}
              title={`Active: ${inputMode} | Capabilities: ${[
                capabilities.hasTouch && 'touch',
                capabilities.hasPen && 'pen',
                capabilities.hasMouse && 'mouse',
                capabilities.hasKeyboard && 'keyboard',
              ].filter(Boolean).join(', ')}`}
            >
              {INPUT_MODE_ICONS[inputMode] ?? inputMode}
            </span>
            {!online && (
              <span className="input-badge input-badge-offline" title="You are offline. Changes will sync when you reconnect.">
                Offline
              </span>
            )}
          </>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={activePage === item.id ? 'page' : undefined}
            title={isCollapsed ? item.label : undefined}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {!isCollapsed && <span className="nav-label">{item.label}</span>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
