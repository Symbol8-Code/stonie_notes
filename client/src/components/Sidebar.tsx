import { useState } from 'react'
import { useDeviceType } from '@/hooks/useMediaQuery'
import type { InputMode } from '@/types/models'

interface SidebarProps {
  activePage: string
  onNavigate: (page: string) => void
  inputMode: InputMode
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
 * See DESIGN.md Section 3.6 (Responsive Layout).
 */
export function Sidebar({ activePage, onNavigate, inputMode }: SidebarProps) {
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
          <span className="input-badge" title={`Active input: ${inputMode}`}>
            {inputMode}
          </span>
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
