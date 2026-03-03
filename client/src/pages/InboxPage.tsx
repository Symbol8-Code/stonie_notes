import { useState, useEffect, useCallback } from 'react'
import { CardEditor } from '@/components/CardEditor'
import type { CardEditorSaveData } from '@/components/CardEditor'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { listCards, createCard, updateCard, archiveCard } from '@/services/api'
import { parseBlocks } from '@/utils/cardBlocks'
import type { Card } from '@/types/models'

interface InboxPageProps {
  /** When true, immediately open the editor for a new note */
  startCreating?: boolean
  onCreatingDone?: () => void
}

/**
 * Inbox: default landing zone for quick-captured items.
 * Lists cards with status 'open' and allows creating and editing.
 * CardEditor reads input mode from InputModeContext automatically.
 * See DESIGN.md Section 4.4 (Search & Organization — Inbox).
 */
export function InboxPage({ startCreating = false, onCreatingDone }: InboxPageProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

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
    async (data: CardEditorSaveData) => {
      try {
        const card = await createCard({
          title: data.title,
          bodyText: data.bodyText,
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

  const handleCancelCreate = useCallback(() => {
    setCreating(false)
    onCreatingDone?.()
  }, [onCreatingDone])

  const handleEdit = useCallback(
    async (data: CardEditorSaveData) => {
      if (!editingId) return
      try {
        const updated = await updateCard(editingId, {
          title: data.title,
          bodyText: data.bodyText,
          source: data.source,
        })
        setCards((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
        setEditingId(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update card')
      }
    },
    [editingId],
  )

  const handleAutoSave = useCallback(
    async (data: CardEditorSaveData) => {
      if (!editingId) return
      try {
        const updated = await updateCard(editingId, {
          title: data.title,
          bodyText: data.bodyText,
        })
        setCards((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
      } catch {
        // Silently fail auto-save — user can still manually save
      }
    },
    [editingId],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

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
          onCancel={handleCancelCreate}
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
          {cards.map((card) =>
            editingId === card.id ? (
              <CardEditor
                key={card.id}
                card={card}
                onSave={handleEdit}
                onCancel={handleCancelEdit}
                onAutoSave={handleAutoSave}
              />
            ) : (
              <div
                key={card.id}
                className="card-item"
                onClick={() => setEditingId(card.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditingId(card.id)
                }}
              >
                <div className="card-item-content">
                  {/* Title — derived from first heading block via card.title */}
                  {card.title?.startsWith('data:image/') ? (
                    <img
                      className="card-item-title-drawing"
                      src={card.title}
                      alt="Pen title"
                    />
                  ) : (
                    <h3 className="card-item-title">{card.title || 'Untitled'}</h3>
                  )}

                  {/* Body — render non-heading blocks */}
                  <CardBodyPreview bodyText={card.bodyText} title={card.title} source={card.source} />

                  <span className="card-item-meta">
                    {card.source === 'pen' ? 'Pen' : 'Keyboard'} &middot; {new Date(card.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="card-item-archive"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleArchive(card.id)
                  }}
                  aria-label={`Archive "${card.title}"`}
                  title="Archive"
                >
                  &times;
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/** Renders card body content, skipping the first heading (already shown as card title) */
function CardBodyPreview({ bodyText, title, source }: { bodyText: string; title: string; source: string }) {
  if (!bodyText) return null

  const blocks = parseBlocks(bodyText, title, source)
  // Skip the first heading block — it's already displayed as the card title
  const displayBlocks = blocks.filter((b, i) => !(i === 0 && b.type === 'heading'))
  if (displayBlocks.length === 0) return null

  return (
    <div className="card-item-blocks">
      {displayBlocks.map((block) => (
        <div key={block.id} className={`card-preview-section card-preview-${block.type}`}>
          {block.textContent.trim() && (
            block.type === 'heading' ? (
              <h4 className="card-item-subheading">{block.textContent}</h4>
            ) : (
              <MarkdownPreview
                content={block.textContent}
                className="card-item-body"
                maxLines={3}
              />
            )
          )}
          {block.drawingContent && (
            <img
              className={block.type === 'heading' ? 'card-item-title-drawing' : 'card-item-drawing'}
              src={block.drawingContent}
              alt={block.type === 'heading' ? 'Pen heading' : 'Drawing'}
            />
          )}
        </div>
      ))}
    </div>
  )
}
