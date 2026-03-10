import { useState, useEffect, useCallback, useMemo } from 'react'
import { CardEditor } from '@/components/CardEditor'
import type { CardEditorSaveData } from '@/components/CardEditor'
import { StrokePreview } from '@/components/StrokePreview'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { listCards, createCard, updateCard, archiveCard, setBoardsForCard } from '@/services/api'
import { parseBlocks } from '@/utils/cardBlocks'
import { hasDrawing } from '@/types/models'
import { useOnlineContext } from '@/contexts/OnlineContext'
import {
  cacheCards,
  cacheCard,
  removeCachedCard,
  getCachedCards,
  enqueue,
} from '@/services/offlineStore'
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
type SortField = 'updatedAt' | 'createdAt' | 'title'
type SortDir = 'desc' | 'asc'

export function InboxPage({ startCreating = false, onCreatingDone }: InboxPageProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const { online, syncing, syncGeneration } = useOnlineContext()

  const fetchCards = useCallback(async () => {
    try {
      setError(null)
      const opts = showArchived ? { status: 'archived' } : undefined
      if (navigator.onLine) {
        const data = await listCards(opts)
        setCards(data)
        // Only populate cache when viewing non-archived (normal) cards
        if (!showArchived) cacheCards(data).catch(() => {})
      } else {
        // Serve from IndexedDB cache when offline
        const cached = await getCachedCards()
        cached.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setCards(cached)
      }
    } catch (err) {
      // Network failed — try cache as fallback
      try {
        const cached = await getCachedCards()
        cached.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setCards(cached)
      } catch {
        setError(err instanceof Error ? err.message : 'Failed to load cards')
      }
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => {
    setLoading(true)
    fetchCards()
  }, [fetchCards])

  // Re-fetch from server after sync completes (syncGeneration bumps after queue is replayed)
  useEffect(() => {
    if (syncGeneration > 0) {
      fetchCards()
    }
  }, [syncGeneration, fetchCards])

  // Respond to external trigger (FAB, keyboard shortcut)
  useEffect(() => {
    if (startCreating && !creating) {
      setCreating(true)
    }
  }, [startCreating, creating])

  const handleCreate = useCallback(
    async (data: CardEditorSaveData) => {
      const payload = { title: data.title, bodyText: data.bodyText, source: data.source }
      if (navigator.onLine) {
        try {
          const card = await createCard(payload)
          // Save board associations if any were selected
          if (data.boardIds && data.boardIds.length > 0) {
            setBoardsForCard(card.id, data.boardIds).catch(() => {})
          }
          setCards((prev) => [card, ...prev])
          cacheCard(card).catch(() => {})
          setCreating(false)
          onCreatingDone?.()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create card')
        }
      } else {
        // Build a temporary local card and queue for sync
        const localCard: Card = {
          id: `local-${Date.now()}`,
          workspaceId: '',
          title: data.title,
          bodyText: data.bodyText,
          source: data.source,
          status: 'open',
          tags: [],
          createdBy: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        setCards((prev) => [localCard, ...prev])
        cacheCard(localCard).catch(() => {})
        enqueue('create', localCard.id, payload).catch(() => {})
        setCreating(false)
        onCreatingDone?.()
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
      const payload = { title: data.title, bodyText: data.bodyText, source: data.source }
      if (navigator.onLine) {
        try {
          const updated = await updateCard(editingId, payload)
          setCards((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
          cacheCard(updated).catch(() => {})
          setEditingId(null)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to update card')
        }
      } else {
        // Optimistic local update + queue
        setCards((prev) =>
          prev.map((c) =>
            c.id === editingId
              ? { ...c, ...payload, updatedAt: new Date().toISOString() }
              : c,
          ),
        )
        const localUpdated = cards.find((c) => c.id === editingId)
        if (localUpdated) {
          cacheCard({ ...localUpdated, ...payload, updatedAt: new Date().toISOString() }).catch(() => {})
        }
        enqueue('update', editingId, payload).catch(() => {})
        setEditingId(null)
      }
    },
    [editingId, cards],
  )

  const handleAutoSave = useCallback(
    async (data: CardEditorSaveData) => {
      if (!editingId) return
      const payload = { title: data.title, bodyText: data.bodyText }
      if (navigator.onLine) {
        try {
          const updated = await updateCard(editingId, payload)
          setCards((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
          cacheCard(updated).catch(() => {})
        } catch {
          // Silently fail auto-save — user can still manually save
        }
      } else {
        // Cache locally while offline — queue for later sync
        const localCard = cards.find((c) => c.id === editingId)
        if (localCard) {
          const updated = { ...localCard, ...payload, updatedAt: new Date().toISOString() }
          cacheCard(updated).catch(() => {})
          setCards((prev) => prev.map((c) => (c.id === editingId ? updated : c)))
        }
        enqueue('update', editingId, payload).catch(() => {})
      }
    },
    [editingId, cards],
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const handleArchive = useCallback(async (id: string) => {
    if (navigator.onLine) {
      try {
        await archiveCard(id)
        setCards((prev) => prev.filter((c) => c.id !== id))
        removeCachedCard(id).catch(() => {})
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive card')
      }
    } else {
      // Optimistic remove + queue
      setCards((prev) => prev.filter((c) => c.id !== id))
      removeCachedCard(id).catch(() => {})
      enqueue('archive', id).catch(() => {})
    }
  }, [])

  const handleRestore = useCallback(async (id: string) => {
    if (navigator.onLine) {
      try {
        await updateCard(id, { status: 'open' })
        setCards((prev) => prev.filter((c) => c.id !== id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore card')
      }
    } else {
      setCards((prev) => prev.filter((c) => c.id !== id))
      enqueue('update', id, { status: 'open' }).catch(() => {})
    }
  }, [])

  const sortedCards = useMemo(() => {
    const sorted = [...cards]
    sorted.sort((a, b) => {
      let cmp: number
      if (sortField === 'title') {
        cmp = (a.title || '').localeCompare(b.title || '')
      } else {
        cmp = new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [cards, sortField, sortDir])

  return (
    <div className="page">
      <div className="page-header">
        <h1>{showArchived ? 'Archived' : 'Inbox'}</h1>
        {!creating && !showArchived && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New Note
          </button>
        )}
      </div>

      <div className="inbox-toolbar">
        <label className="inbox-filter-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <div className="inbox-sort-controls">
          <select
            className="inbox-sort-select"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
          >
            <option value="updatedAt">Updated</option>
            <option value="createdAt">Created</option>
            <option value="title">Title</option>
          </select>
          <button
            className="inbox-sort-dir"
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            aria-label={`Sort ${sortDir === 'desc' ? 'ascending' : 'descending'}`}
            title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortDir === 'desc' ? '\u2193' : '\u2191'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {creating && (
        <CardEditor
          onSave={handleCreate}
          onCancel={handleCancelCreate}
        />
      )}

      {loading && <p className="placeholder">Loading cards...</p>}

      {!loading && sortedCards.length === 0 && !creating && (
        <p className="placeholder">
          {showArchived
            ? 'No archived notes.'
            : <>No notes yet. Create one with the <strong>+ New Note</strong> button, <kbd>Alt+N</kbd>, or the + button.</>}
        </p>
      )}

      {sortedCards.length > 0 && (
        <div className="card-list">
          {sortedCards.map((card) => {
            const isLocal = card.id.startsWith('local-')
            const isSyncing = isLocal && syncing

            return editingId === card.id ? (
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
                className={`card-item ${isSyncing ? 'card-item-syncing' : ''}`}
                onClick={() => { if (!isSyncing) setEditingId(card.id) }}
                role="button"
                tabIndex={isSyncing ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSyncing) setEditingId(card.id)
                }}
              >
                <div className="card-item-content">
                  <CardBodyPreview bodyText={card.bodyText} title={card.title} />

                  <span className="card-item-meta">
                    {card.source === 'pen' ? 'Pen' : 'Keyboard'} &middot; {new Date(card.createdAt).toLocaleDateString()}
                    {isSyncing && <span className="card-sync-pill">Syncing</span>}
                    {isLocal && !syncing && <span className="card-local-pill">Pending</span>}
                  </span>
                </div>
                {!isSyncing && showArchived && (
                  <button
                    className="card-item-restore"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRestore(card.id)
                    }}
                    aria-label={`Restore "${card.title}"`}
                    title="Restore"
                  >
                    &#x21A9;
                  </button>
                )}
                {!isSyncing && !showArchived && (
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Renders all card content blocks (heading + body) directly */
function CardBodyPreview({ bodyText, title }: { bodyText: string; title: string }) {
  if (!bodyText) return null

  const blocks = parseBlocks(bodyText, title)
  if (blocks.length === 0) return null

  return (
    <div className="card-item-blocks">
      {blocks.map((block) => (
        <div key={block.id} className={`card-preview-section card-preview-${block.type}`}>
          {block.textContent.trim() && (
            block.type === 'heading' ? (
              <h3 className="card-item-title">{block.textContent}</h3>
            ) : (
              <MarkdownPreview
                content={block.textContent}
                className="card-item-body"
                maxLines={3}
              />
            )
          )}
          {hasDrawing(block.drawingContent) && (
            <StrokePreview
              strokes={block.drawingContent}
              className={block.type === 'heading' ? 'card-item-title-drawing' : 'card-item-drawing'}
            />
          )}
        </div>
      ))}
    </div>
  )
}
