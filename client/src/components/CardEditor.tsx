import { useState, useRef, useEffect, useCallback } from 'react'
import { PenCanvas } from '@/components/PenCanvas'
import { RichTextEditor } from '@/components/RichTextEditor'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { useInputModeContext } from '@/contexts/InputModeContext'
import type { PenCanvasHandle } from '@/components/PenCanvas'
import type { Card, ContentBlock } from '@/types/models'

type EditorMode = 'keyboard' | 'pen'

export interface CardEditorSaveData {
  title: string
  bodyText: string
  source: 'keyboard' | 'pen'
  /** Body drawing exported as PNG data URL (pen mode) — legacy compat */
  imageDataUrl?: string
  /** Title drawing exported as PNG data URL (pen mode) — legacy compat */
  titleImageDataUrl?: string
}

interface CardEditorProps {
  onSave: (data: CardEditorSaveData) => void
  onCancel: () => void
  /** Called on each change for auto-save (debounced by parent) */
  onAutoSave?: (data: CardEditorSaveData) => void
  /** If provided, editing an existing card */
  card?: Card
}

let blockIdCounter = 0
function nextBlockId(): string {
  return `blk_${Date.now()}_${++blockIdCounter}`
}

/**
 * Parse bodyText back into ContentBlock[].
 * Supports:
 *   - New format: JSON array of ContentBlock objects
 *   - Legacy pen: data URL string → single drawing block
 *   - Legacy keyboard: plain text → single text block
 */
function parseBlocks(bodyText: string, source?: string): ContentBlock[] {
  if (!bodyText) return []

  // New block-based format
  if (bodyText.startsWith('[')) {
    try {
      const parsed = JSON.parse(bodyText) as ContentBlock[]
      if (Array.isArray(parsed) && parsed.every((b) => b.type && b.content !== undefined)) {
        return parsed
      }
    } catch {
      // Fall through to legacy parsing
    }
  }

  // Legacy pen: entire bodyText is a data URL
  if (source === 'pen' && bodyText.startsWith('data:image/')) {
    return [{ id: nextBlockId(), type: 'drawing', content: bodyText }]
  }

  // Legacy keyboard: plain Markdown text
  if (bodyText.trim()) {
    return [{ id: nextBlockId(), type: 'text', content: bodyText }]
  }

  return []
}

/** Serialize blocks to JSON string for storage in bodyText */
function serializeBlocks(blocks: ContentBlock[]): string {
  // Filter out empty blocks
  const nonEmpty = blocks.filter((b) =>
    b.type === 'text' ? b.content.trim() !== '' : b.content !== '',
  )
  if (nonEmpty.length === 0) return ''
  // If there's a single text block, store as plain text for backward compat
  if (nonEmpty.length === 1 && nonEmpty[0].type === 'text') {
    return nonEmpty[0].content
  }
  return JSON.stringify(nonEmpty)
}

/** Determine the dominant source from blocks */
function dominantSource(blocks: ContentBlock[]): 'keyboard' | 'pen' {
  const hasDrawing = blocks.some((b) => b.type === 'drawing' && b.content)
  const hasText = blocks.some((b) => b.type === 'text' && b.content.trim())
  if (hasDrawing && !hasText) return 'pen'
  return 'keyboard'
}

/**
 * Block-based card editor.
 * Content is organized as interleaved blocks (like Notion):
 *   - Text blocks: editable Markdown via RichTextEditor
 *   - Drawing blocks: pen canvas that snapshots to an image
 *
 * Switching input mode finalizes the current block and starts a new one.
 * Ctrl/Cmd+Enter saves, Escape cancels.
 */
export function CardEditor({ onSave, onCancel, onAutoSave, card }: CardEditorProps) {
  const { mode: inputMode } = useInputModeContext()
  const initialMode: EditorMode = inputMode === 'pen' ? 'pen' : 'keyboard'

  const [title, setTitle] = useState(card?.title?.startsWith('data:image/') ? '' : card?.title ?? '')
  const [titleImage] = useState(card?.title?.startsWith('data:image/') ? card.title : '')
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => {
    const parsed = parseBlocks(card?.bodyText ?? '', card?.source)
    if (parsed.length > 0) return parsed
    // Start with one block matching current mode
    return [{ id: nextBlockId(), type: initialMode === 'pen' ? 'drawing' : 'text', content: '' }]
  })
  const [activeBlockId, setActiveBlockId] = useState<string>(() => {
    // Activate the last block
    const lastBlock = blocks[blocks.length - 1]
    return lastBlock?.id ?? ''
  })
  const [mode, setMode] = useState<EditorMode>(initialMode)

  const titleRef = useRef<HTMLInputElement>(null)
  const penCanvasRefs = useRef<Map<string, PenCanvasHandle>>(new Map())
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (mode === 'keyboard') {
      titleRef.current?.focus()
    }
  }, []) // Only on mount

  // Build save data from current state
  const buildSaveData = useCallback((): CardEditorSaveData => {
    // Finalize any active drawing block
    const finalBlocks = blocks.map((block) => {
      if (block.type === 'drawing' && block.content === '') {
        const handle = penCanvasRefs.current.get(block.id)
        if (handle?.hasContent()) {
          return { ...block, content: handle.toDataURL() }
        }
      }
      return block
    })

    const bodyText = serializeBlocks(finalBlocks)
    const source = dominantSource(finalBlocks)

    return {
      title: title.trim() || titleImage || 'Untitled',
      bodyText,
      source,
    }
  }, [blocks, title, titleImage])

  // Debounced auto-save
  useEffect(() => {
    if (!onAutoSave) return
    if (!title.trim() && blocks.every((b) => !b.content.trim())) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      onAutoSave(buildSaveData())
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [title, blocks, onAutoSave, buildSaveData])

  const handleSave = useCallback(() => {
    const data = buildSaveData()
    if (data.title === 'Untitled' && !data.bodyText) return
    onSave(data)
  }, [buildSaveData, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSave()
      }
    },
    [onCancel, handleSave],
  )

  /** Finalize current active block and switch mode, creating a new block */
  const handleModeSwitch = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return

      // Finalize current active drawing block if switching away from pen
      if (mode === 'pen') {
        setBlocks((prev) =>
          prev.map((block) => {
            if (block.id === activeBlockId && block.type === 'drawing' && block.content === '') {
              const handle = penCanvasRefs.current.get(block.id)
              if (handle?.hasContent()) {
                return { ...block, content: handle.toDataURL() }
              }
            }
            return block
          }),
        )
      }

      // Create new block of the new type
      const newBlock: ContentBlock = {
        id: nextBlockId(),
        type: newMode === 'pen' ? 'drawing' : 'text',
        content: '',
      }

      setBlocks((prev) => [...prev, newBlock])
      setActiveBlockId(newBlock.id)
      setMode(newMode)
    },
    [mode, activeBlockId],
  )

  const handleBlockTextChange = useCallback((blockId: string, newContent: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, content: newContent } : b)),
    )
  }, [])

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const filtered = prev.filter((b) => b.id !== blockId)
        // Ensure at least one block remains
        if (filtered.length === 0) {
          return [{ id: nextBlockId(), type: mode === 'pen' ? 'drawing' : 'text' as const, content: '' }]
        }
        return filtered
      })
      // If we deleted the active block, activate the last remaining
      if (blockId === activeBlockId) {
        setBlocks((prev) => {
          setActiveBlockId(prev[prev.length - 1]?.id ?? '')
          return prev
        })
      }
    },
    [activeBlockId, mode],
  )

  /** Register a PenCanvas ref for a drawing block */
  const registerPenRef = useCallback((blockId: string, handle: PenCanvasHandle | null) => {
    if (handle) {
      penCanvasRefs.current.set(blockId, handle)
    } else {
      penCanvasRefs.current.delete(blockId)
    }
  }, [])

  return (
    <div className="card-editor" onKeyDown={handleKeyDown}>
      {/* Mode toggle */}
      <div className="card-editor-mode-toggle">
        <button
          className={`btn-mode ${mode === 'keyboard' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('keyboard')}
          title="Type with keyboard"
        >
          Keyboard
        </button>
        <button
          className={`btn-mode ${mode === 'pen' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('pen')}
          title="Draw with pen"
        >
          Pen
        </button>
      </div>

      {/* Title (always text) */}
      {titleImage && (
        <img className="block-drawing-image block-title-image" src={titleImage} alt="Pen title" />
      )}
      <input
        ref={titleRef}
        className="card-editor-title"
        type="text"
        placeholder="Note title..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Content blocks */}
      <div className="block-list">
        {blocks.map((block) => (
          <div
            key={block.id}
            className={`content-block content-block-${block.type} ${block.id === activeBlockId ? 'content-block-active' : ''}`}
            onClick={() => setActiveBlockId(block.id)}
          >
            {block.type === 'text' ? (
              // Text block
              block.id === activeBlockId ? (
                <RichTextEditor
                  value={block.content}
                  onChange={(val) => handleBlockTextChange(block.id, val)}
                  placeholder="Type here..."
                  autoFocus
                />
              ) : (
                <div className="block-text-preview">
                  {block.content.trim() ? (
                    <MarkdownPreview content={block.content} />
                  ) : (
                    <span className="block-placeholder">Empty text block — click to edit</span>
                  )}
                </div>
              )
            ) : (
              // Drawing block
              block.content ? (
                // Finalized drawing — show as image
                <div className="block-drawing">
                  <img className="block-drawing-image" src={block.content} alt="Drawing" />
                </div>
              ) : (
                // Active drawing canvas
                <div className="block-drawing">
                  <div className="pen-canvas-wrapper">
                    <PenCanvas
                      ref={(handle) => registerPenRef(block.id, handle)}
                      className=""
                    />
                    <button
                      className="pen-canvas-clear"
                      onClick={(e) => {
                        e.stopPropagation()
                        penCanvasRefs.current.get(block.id)?.clear()
                      }}
                      title="Clear drawing"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )
            )}

            {/* Delete block button (only if more than one block) */}
            {blocks.length > 1 && (
              <button
                className="block-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteBlock(block.id)
                }}
                title="Remove block"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="card-editor-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          Save <kbd>Ctrl+Enter</kbd>
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
