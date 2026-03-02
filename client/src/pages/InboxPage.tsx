import { useState, useEffect, useCallback } from 'react'
import { CardEditor } from '@/components/CardEditor'
import { listCards, createCard, archiveCard } from '@/services/api'
import type { Card, InputMode } from '@/types/models'

interface InboxPageProps {
  /** When true, immediately open the editor for a new note */
  startCreating?: boolean
  onCreatingDone?: () => void
  /** Current detected input mode — passed to CardEditor */
  inputMode?: InputMode
}

/**
 * Inbox: default landing zone for quick-captured items.
 * Lists cards with status 'open' and allows creating new ones.
 * See DESIGN.md Section 4.4 (Search & Organization — Inbox).
 */
export function InboxPage({ startCreating = false, onCreatingDone, inputMode }: InboxPageProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const fetchCards = useCallback(async () => {
    try {
      setError(null)
      const data = await listCards()
      setCards(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  // Respond to external trigger (FAB, keyboard shortcut)
  useEffect(() => {
    if (startCreating && !creating) {
      setCreating(true)
    }
  }, [startCreating, creating])

  const handleCreate = useCallback(
    async (data: { title: string; bodyText: string; source: 'keyboard' | 'pen'; imageDataUrl?: string; titleImageDataUrl?: string }) => {
      try {
        // For pen notes, store title image in title field and body image in bodyText
        const card = await createCard({
          title: data.titleImageDataUrl || data.title,
          bodyText: data.imageDataUrl || data.bodyText,
          source: data.source,
        })
        setCards((prev) => [card, ...prev])
        setCreating(false)
        onCreatingDone?.()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create card')
      }
    },
    [onCreatingDone],
  )

  const handleCancel = useCallback(() => {
    setCreating(false)
    onCreatingDone?.()
  }, [onCreatingDone])

  const handleArchive = useCallback(async (id: string) => {
    try {
      await archiveCard(id)
      setCards((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive card')
    }
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inbox</h1>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New Note
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {creating && (
        <CardEditor
          onSave={handleCreate}
          onCancel={handleCancel}
          inputMode={inputMode}
        />
      )}

      {loading && <p className="placeholder">Loading cards...</p>}

      {!loading && cards.length === 0 && !creating && (
        <p className="placeholder">
          No notes yet. Create one with the <strong>+ New Note</strong> button, <kbd>Alt+N</kbd>, or the + button.
        </p>
      )}

      {cards.length > 0 && (
        <div className="card-list">
          {cards.map((card) => (
            <div key={card.id} className="card-item">
              <div className="card-item-content">
                {card.title?.startsWith('data:image/') ? (
                  <img
                    className="card-item-title-drawing"
                    src={card.title}
                    alt="Pen title"
                  />
                ) : (
                  <h3 className="card-item-title">{card.title || 'Untitled'}</h3>
                )}
                {card.source === 'pen' && card.bodyText?.startsWith('data:image/') ? (
                  <img
                    className="card-item-drawing"
                    src={card.bodyText}
                    alt="Pen drawing"
                  />
                ) : card.bodyText ? (
                  <p className="card-item-body">{card.bodyText}</p>
                ) : null}
                <span className="card-item-meta">
                  {card.source === 'pen' ? 'Pen' : 'Keyboard'} &middot; {new Date(card.createdAt).toLocaleDateString()}
                </span>
              </div>
              <button
                className="card-item-archive"
                onClick={() => handleArchive(card.id)}
                aria-label={`Archive "${card.title}"`}
                title="Archive"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
