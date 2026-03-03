import { useState, useCallback, useMemo } from 'react'
import { InputModeProvider, useInputModeContext } from '@/contexts/InputModeContext'
import { Sidebar } from '@/components/Sidebar'
import { FloatingActionButton } from '@/components/FloatingActionButton'
import { InboxPage } from '@/pages/InboxPage'
import { BoardsPage } from '@/pages/BoardsPage'
import { CanvasesPage } from '@/pages/CanvasesPage'
import { SearchPage } from '@/pages/SearchPage'
import { useDeviceType } from '@/hooks/useMediaQuery'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import './styles/app.css'

/**
 * Root app shell with responsive layout.
 * Desktop: persistent sidebar + main content + optional detail panel.
 * Tablet: collapsible sidebar + main content.
 * Phone: single-pane content + bottom nav + FAB.
 * See DESIGN.md Section 3.6 (Responsive Layout).
 */
function AppShell() {
  const [activePage, setActivePage] = useState('inbox')
  const [creatingNote, setCreatingNote] = useState(false)
  const { mode, capabilities } = useInputModeContext()
  const device = useDeviceType()

  const startNewNote = useCallback(() => {
    setActivePage('inbox')
    setCreatingNote(true)
  }, [])

  const handleCreatingDone = useCallback(() => {
    setCreatingNote(false)
  }, [])

  const shortcuts = useMemo(
    () => ({
      'alt+n': startNewNote,
      'ctrl+/': () => setActivePage('search'),
    }),
    [startNewNote],
  )

  useKeyboardShortcuts(shortcuts)

  const renderPage = () => {
    switch (activePage) {
      case 'inbox':
        return (
          <InboxPage
            startCreating={creatingNote}
            onCreatingDone={handleCreatingDone}
          />
        )
      case 'boards':
        return <BoardsPage />
      case 'canvases':
        return <CanvasesPage />
      case 'search':
        return <SearchPage />
      default:
        return (
          <InboxPage
            startCreating={creatingNote}
            onCreatingDone={handleCreatingDone}
          />
        )
    }
  }

  // Build capability classes for CSS targeting
  const capClasses = [
    capabilities.hasTouch ? 'cap-touch' : '',
    capabilities.hasPen ? 'cap-pen' : '',
    capabilities.hasMouse ? 'cap-mouse' : '',
    capabilities.hasKeyboard ? 'cap-keyboard' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`app-shell device-${device} input-${mode} ${capClasses}`}>
      {device !== 'phone' && (
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
        />
      )}

      <main className="main-content">
        {renderPage()}
      </main>

      <FloatingActionButton onClick={startNewNote} />

      {device === 'phone' && (
        <Sidebar
          activePage={activePage}
          onNavigate={setActivePage}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <InputModeProvider>
      <AppShell />
    </InputModeProvider>
  )
}

export default App
