/**
 * Boards listing and board detail view.
 * Boards are topic groupings for notes. A note can belong to multiple boards.
 */
import { useState, useEffect, useCallback } from 'react'
import { CardEditor } from '@/components/CardEditor'
import type { CardEditorSaveData } from '@/components/CardEditor'
import { StrokePreview } from '@/components/StrokePreview'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import {
  listBoards,
  createBoard,
  updateBoard,
  deleteBoard,
  getBoard,
} from '@/services/api'
import { parseBlocks } from '@/utils/cardBlocks'
import { hasDrawing } from '@/types/models'
import type { Board, Card } from '@/types/models'

type BoardsView = 'list' | 'detail'

export function BoardsPage() {
  const [view, setView] = useState<BoardsView>('list')
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingBoard, setEditingBoard] = useState<Board | null>(null)

  const fetchBoards = useCallback(async () => {
    try {
      setError(null)
      const data = await listBoards()
      setBoards(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load boards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBoards()
  }, [fetchBoards])

  const handleOpenBoard = useCallback(async (boardId: string) => {
    try {
      setError(null)
      const board = await getBoard(boardId)
      setSelectedBoard(board)
      setView('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board')
    }
  }, [])

  const handleCreateBoard = useCallback(async (data: CardEditorSaveData) => {
    try {
      const board = await createBoard({ name: data.title, description: data.bodyText })
      setBoards((prev) => [board, ...prev])
      setCreating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board')
    }
  }, [])

  const handleUpdateBoard = useCallback(async (data: CardEditorSaveData) => {
    if (!editingBoard) return
    try {
      const updated = await updateBoard(editingBoard.id, {
        name: data.title,
        description: data.bodyText,
      })
      setBoards((prev) => prev.map((b) => (b.id === editingBoard.id ? updated : b)))
      if (selectedBoard?.id === editingBoard.id) {
        setSelectedBoard({ ...selectedBoard, ...updated })
      }
      setEditingBoard(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update board')
    }
  }, [editingBoard, selectedBoard])

  const handleDeleteBoard = useCallback(async (id: string) => {
    try {
      await deleteBoard(id)
      setBoards((prev) => prev.filter((b) => b.id !== id))
      if (selectedBoard?.id === id) {
        setSelectedBoard(null)
        setView('list')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board')
    }
  }, [selectedBoard])

  const handleBackToList = useCallback(() => {
    setSelectedBoard(null)
    setView('list')
    fetchBoards()
  }, [fetchBoards])

  if (view === 'detail' && selectedBoard) {
    return (
      <BoardDetailView
        board={selectedBoard}
        onBack={handleBackToList}
        onEdit={() => setEditingBoard(selectedBoard)}
        onDelete={() => handleDeleteBoard(selectedBoard.id)}
        editingBoard={editingBoard}
        onSaveEdit={handleUpdateBoard}
        onCancelEdit={() => setEditingBoard(null)}
        error={error}
      />
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Boards</h1>
        {!creating && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New Board
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {creating && (
        <div className="board-create-editor">
          <h2 className="board-create-heading">Create Board</h2>
          <CardEditor
            onSave={handleCreateBoard}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {loading && <p className="placeholder">Loading boards...</p>}

      {!loading && boards.length === 0 && !creating && (
        <p className="placeholder">
          No boards yet. Create one with the <strong>+ New Board</strong> button to start organizing your notes by topic.
        </p>
      )}

      {boards.length > 0 && (
        <div className="board-list">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onClick={() => handleOpenBoard(board.id)}
              onDelete={() => handleDeleteBoard(board.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── BoardCard ─────────────────────────────────── */

interface BoardCardProps {
  board: Board
  onClick: () => void
  onDelete: () => void
}

function BoardCard({ board, onClick, onDelete }: BoardCardProps) {
  return (
    <div
      className="board-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
      <div className="board-card-content">
        <h3 className="board-card-title">{board.name || 'Untitled Board'}</h3>
        <BoardDescriptionPreview description={board.description} />
        <span className="board-card-meta">
          {new Date(board.createdAt).toLocaleDateString()}
        </span>
      </div>
      <button
        className="board-card-delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label={`Delete "${board.name}"`}
        title="Delete board"
      >
        &times;
      </button>
    </div>
  )
}

/* ── BoardDescriptionPreview ───────────────────── */

function BoardDescriptionPreview({ description }: { description: string }) {
  if (!description) return null

  const blocks = parseBlocks(description)
  if (blocks.length === 0) return null

  return (
    <div className="board-description-preview">
      {blocks.map((block) => (
        <div key={block.id} className={`card-preview-section card-preview-${block.type}`}>
          {block.textContent.trim() && block.type !== 'heading' && (
            <MarkdownPreview
              content={block.textContent}
              className="board-card-description"
              maxLines={2}
            />
          )}
          {hasDrawing(block.drawingContent) && (
            <StrokePreview
              strokes={block.drawingContent}
              className="board-card-drawing"
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ── BoardDetailView ───────────────────────────── */

interface BoardDetailViewProps {
  board: Board
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  editingBoard: Board | null
  onSaveEdit: (data: CardEditorSaveData) => void
  onCancelEdit: () => void
  error: string | null
}

function BoardDetailView({
  board,
  onBack,
  onEdit,
  onDelete,
  editingBoard,
  onSaveEdit,
  onCancelEdit,
  error,
}: BoardDetailViewProps) {
  const boardCards = board.cards || []

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn btn-secondary board-back-btn" onClick={onBack}>
          &larr; Boards
        </button>
        <h1>{board.name || 'Untitled Board'}</h1>
        <div className="board-detail-actions">
          <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          <button className="btn btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {editingBoard && (
        <div className="board-create-editor">
          <h2 className="board-create-heading">Edit Board</h2>
          <CardEditor
            card={{
              id: editingBoard.id,
              workspaceId: '',
              title: editingBoard.name,
              bodyText: editingBoard.description,
              source: 'keyboard',
              status: 'open',
              tags: [],
              createdBy: '',
              createdAt: editingBoard.createdAt,
              updatedAt: editingBoard.updatedAt,
            }}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
        </div>
      )}

      {!editingBoard && board.description && (
        <div className="board-detail-description">
          <BoardDescriptionPreview description={board.description} />
        </div>
      )}

      <div className="board-detail-notes">
        <h2>Notes ({boardCards.length})</h2>
        {boardCards.length === 0 && (
          <p className="placeholder">
            No notes in this board yet. Assign notes to this board from the note editor.
          </p>
        )}
        {boardCards.length > 0 && (
          <div className="card-list">
            {boardCards.map((card) => (
              <BoardNotePreview key={card.id} card={card} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── BoardNotePreview ──────────────────────────── */

function BoardNotePreview({ card }: { card: Card }) {
  const blocks = parseBlocks(card.bodyText, card.title)

  return (
    <div className="card-item">
      <div className="card-item-content">
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
        <span className="card-item-meta">
          {card.source === 'pen' ? 'Pen' : 'Keyboard'} &middot; {new Date(card.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  )
}
