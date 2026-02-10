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
 * Desktop/Tablet: vertical sidebar. Phone: bottom navigation bar.
 * See DESIGN.md Section 3.6 (Responsive Layout).
 */
export function Sidebar({ activePage, onNavigate, inputMode }: SidebarProps) {
  const device = useDeviceType()

  if (device === 'phone') {
    return (
      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`bottom-nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>STonIE</h2>
        <span className="input-badge" title={`Active input: ${inputMode}`}>
          {inputMode}
        </span>
      </div>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
