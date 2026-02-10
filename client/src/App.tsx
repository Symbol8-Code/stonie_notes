import { useState, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { FloatingActionButton } from '@/components/FloatingActionButton'
import { InboxPage } from '@/pages/InboxPage'
import { BoardsPage } from '@/pages/BoardsPage'
import { CanvasesPage } from '@/pages/CanvasesPage'
import { SearchPage } from '@/pages/SearchPage'
import { useInputMode } from '@/hooks/useInputMode'
import { useDeviceType } from '@/hooks/useMediaQuery'
import './styles/app.css'

/**
 * Root app shell with responsive layout.
 * Desktop: persistent sidebar + main content + optional detail panel.
 * Tablet: collapsible sidebar + main content.
 * Phone: single-pane content + bottom nav + FAB.
 * See DESIGN.md Section 3.6 (Responsive Layout).
 */
function App() {
  const [activePage, setActivePage] = useState('inbox')
  const inputMode = useInputMode()
  const device = useDeviceType()

  const handleQuickCapture = useCallback(() => {
    // TODO: Open quick capture modal (Issue #19)
    setActivePage('inbox')
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'inbox':
        return <InboxPage />
      case 'boards':
        return <BoardsPage />
      case 'canvases':
        return <CanvasesPage />
      case 'search':
        return <SearchPage />
      default:
        return <InboxPage />
    }
  }

  return (
    <div className={`app-shell device-${device} input-${inputMode}`}>
      {device !== 'phone' && (
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          inputMode={inputMode}
        />
      )}

      <main className="main-content">
        {renderPage()}
      </main>

      <FloatingActionButton onClick={handleQuickCapture} />

      {device === 'phone' && (
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
          inputMode={inputMode}
        />
      )}
    </div>
  )
}

export default App
