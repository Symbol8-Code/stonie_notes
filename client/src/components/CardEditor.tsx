import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { PenCanvas } from '@/components/PenCanvas'
import { StrokePreview } from '@/components/StrokePreview'
import { RichTextEditor } from '@/components/RichTextEditor'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { DrawingPalette } from '@/components/DrawingPalette'
import { useInputModeContext } from '@/contexts/InputModeContext'
import { parseBlocks, serializeBlocks, defaultBlocks, nextBlockId, createSubBlockFromStrokes, nextVariationId, computeStrokeBounds } from '@/utils/cardBlocks'
import { hasDrawing } from '@/types/models'
import type { PenCanvasHandle } from '@/components/PenCanvas'
import { interpretCanvas, getExtractions, getMeetingNotes, listBoards, getBoardsForCard, setBoardsForCard, writeMeetingNotes } from '@/services/api'
import { useOnlineContext } from '@/contexts/OnlineContext'
import type { CanvasInterpretation, MeetingNotesResult } from '@/services/api'
import type { Card, Board, ContentBlock, SectionType, StrokeTool, LineStyle, PenStroke, SubBlock, SubBlockVariation } from '@/types/models'
import { SubBlockOverlay } from '@/components/SubBlockOverlay'
import type { CreateSubBlockData } from '@/components/PenCanvas'

type EditorMode = 'keyboard' | 'pen'

interface DrawingToolState {
  tool: StrokeTool
  color: string
  strokeWidth: number
  lineStyle: LineStyle
}

const DEFAULT_DRAWING_TOOL: DrawingToolState = {
  tool: 'pen',
  color: '#1a1a2e',
  strokeWidth: 2,
  lineStyle: 'solid',
}

export interface CardEditorSaveData {
  title: string
  bodyText: string
  source: 'keyboard' | 'pen'
  boardIds?: string[]
}

interface CardEditorProps {
  onSave: (data: CardEditorSaveData) => void
  onCancel: () => void
  /** Called on each change for auto-save (debounced by parent) */
  onAutoSave?: (data: CardEditorSaveData) => void
  /** If provided, editing an existing card */
  card?: Card
}

/**
 * Section-based card editor.
 * Content is organized as semantic sections (heading, body) where each section
 * can hold both keyboard text and pen drawing simultaneously.
 * Ctrl/Cmd+Enter saves, Escape cancels.
 */
export function CardEditor({ onSave, onCancel, onAutoSave, card }: CardEditorProps) {
  const { mode: inputMode } = useInputModeContext()
  const { online } = useOnlineContext()
  const initialMode: EditorMode = inputMode === 'pen' ? 'pen' : 'keyboard'

  const [blocks, setBlocks] = useState<ContentBlock[]>(() => {
    if (card) {
      const parsed = parseBlocks(card.bodyText, card.title)
      if (parsed.length > 0) return parsed
    }
    return defaultBlocks()
  })
  const [activeBlockId, setActiveBlockId] = useState<string>(() => {
    return blocks[0]?.id ?? ''
  })
  const [mode, setMode] = useState<EditorMode>(initialMode)
  const [drawingTool, setDrawingTool] = useState<DrawingToolState>(DEFAULT_DRAWING_TOOL)
  const [editorFullscreen, setEditorFullscreen] = useState(false)
  const [fullscreenBlockId, setFullscreenBlockId] = useState<string | null>(null)
  const [penPaletteOpen, setPenPaletteOpen] = useState(true)
  const [canUndo, setCanUndo] = useState(false)
  const [savedInterpretations, setSavedInterpretations] = useState<Map<string, CanvasInterpretation>>(new Map())
  const [savedExtractionCreatedAt, setSavedExtractionCreatedAt] = useState<string | null>(null)

  // Meeting notes state
  const [meetingNotes, setMeetingNotes] = useState<MeetingNotesResult | null>(null)
  const [meetingNotesLoading, setMeetingNotesLoading] = useState(false)
  const [meetingNotesError, setMeetingNotesError] = useState<string | null>(null)

  // Board selector state
  const [allBoards, setAllBoards] = useState<Board[]>([])
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set())
  const [boardsLoaded, setBoardsLoaded] = useState(false)

  const penCanvasRefs = useRef<Map<string, PenCanvasHandle>>(new Map())
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── localStorage draft save/restore for pen drawings ──
  const draftKey = `stonie-pen-draft-${card?.id ?? 'new'}`

  /** Save current block drawing data to localStorage */
  const saveDraftToLocalStorage = useCallback(() => {
    try {
      // Gather strokes from all active canvases + stored block data
      const drawingData: Record<string, PenStroke[]> = {}
      for (const block of blocks) {
        const handle = penCanvasRefs.current.get(block.id)
        const strokes = handle?.hasContent() ? handle.getStrokes() : block.drawingContent
        if (strokes && strokes.length > 0) {
          drawingData[block.id] = strokes
        }
      }
      if (Object.keys(drawingData).length > 0) {
        localStorage.setItem(draftKey, JSON.stringify(drawingData))
      } else {
        localStorage.removeItem(draftKey)
      }
    } catch {
      // localStorage may be full or unavailable — silently ignore
    }
  }, [blocks, draftKey])

  const clearDraftFromLocalStorage = useCallback(() => {
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
  }, [draftKey])

  // On mount, restore any saved drawing draft into blocks
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (!saved) return
      const drawingData: Record<string, PenStroke[]> = JSON.parse(saved)
      setBlocks((prev) =>
        prev.map((block) => {
          const savedStrokes = drawingData[block.id]
          if (savedStrokes && savedStrokes.length > 0) {
            // Only restore if the block doesn't already have more drawing content
            // (e.g. the server version is newer)
            if (!hasDrawing(block.drawingContent) || block.drawingContent.length <= savedStrokes.length) {
              return { ...block, drawingContent: savedStrokes }
            }
          }
          return block
        }),
      )
    } catch { /* ignore corrupt data */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Called by PenCanvas after each stroke change — triggers localStorage save */
  const handleStrokeComplete = useCallback(() => {
    saveDraftToLocalStorage()
  }, [saveDraftToLocalStorage])

  // Load all boards and current card's board associations
  useEffect(() => {
    let cancelled = false
    listBoards().then((boards) => {
      if (cancelled) return
      setAllBoards(boards)
      setBoardsLoaded(true)
    }).catch(() => {
      setBoardsLoaded(true)
    })

    if (card?.id && !card.id.startsWith('local-')) {
      getBoardsForCard(card.id).then((boards) => {
        if (cancelled) return
        setSelectedBoardIds(new Set(boards.map((b) => b.id)))
      }).catch(() => {})
    }

    return () => { cancelled = true }
  }, [card?.id])

  // Load saved interpretations from DB when editing an existing card
  useEffect(() => {
    if (!card?.id) return
    let cancelled = false

    // Try loading per-block extractions (cardId:blockId format)
    getExtractions(card.id, true).then((extractions) => {
      if (cancelled) return
      if (extractions.length > 0) {
        const map = new Map<string, CanvasInterpretation>()
        let latestCreatedAt: string | null = null
        for (const ext of extractions) {
          // sourceId format: "cardId:blockId" — extract the blockId part
          const colonIdx = ext.sourceId.indexOf(':')
          if (colonIdx >= 0) {
            const blockId = ext.sourceId.slice(colonIdx + 1)
            // Only keep the most recent extraction per block (results are ordered desc)
            if (!map.has(blockId)) {
              map.set(blockId, ext.result)
            }
          }
          if (!latestCreatedAt || ext.createdAt > latestCreatedAt) {
            latestCreatedAt = ext.createdAt
          }
        }
        if (map.size > 0) {
          setSavedInterpretations(map)
          setSavedExtractionCreatedAt(latestCreatedAt)
          return
        }
      }

      // Fallback: load legacy extractions saved with just cardId (no block association)
      return getExtractions(card.id!).then((legacyExtractions) => {
        if (cancelled || legacyExtractions.length === 0) return
        // Associate with the first block that has drawing content
        const blockWithDrawing = blocks.find((b) => hasDrawing(b.drawingContent))
        if (blockWithDrawing) {
          setSavedInterpretations(new Map([[blockWithDrawing.id, legacyExtractions[0].result]]))
          setSavedExtractionCreatedAt(legacyExtractions[0].createdAt)
        }
      })
    }).catch(() => {
      // Silently ignore — interpretation is optional
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id])

  // Load saved meeting notes from DB when editing an existing card
  useEffect(() => {
    if (!card?.id) return
    let cancelled = false
    getMeetingNotes(card.id).then((notes) => {
      if (cancelled || !notes) return
      setMeetingNotes(notes)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [card?.id])

  // Build save data from current state
  const buildSaveData = useCallback((): CardEditorSaveData => {
    // Finalize any active drawing canvases — capture strokes, not PNG
    const finalBlocks = blocks.map((block) => {
      const handle = penCanvasRefs.current.get(block.id)
      if (handle?.hasContent()) {
        return { ...block, drawingContent: handle.getStrokes() }
      }
      return block
    })

    return serializeBlocks(finalBlocks)
  }, [blocks])

  // Debounced auto-save
  useEffect(() => {
    if (!onAutoSave) return
    if (blocks.every((b) => !b.textContent.trim() && !hasDrawing(b.drawingContent))) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      onAutoSave(buildSaveData())
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [blocks, onAutoSave, buildSaveData])

  const handleSave = useCallback(() => {
    const data = buildSaveData()
    if (data.title === 'Untitled' && !data.bodyText) return

    // Save board associations after card save if we have a card ID
    if (card?.id && !card.id.startsWith('local-') && online) {
      setBoardsForCard(card.id, Array.from(selectedBoardIds)).catch(() => {})
    }

    clearDraftFromLocalStorage()
    onSave({ ...data, boardIds: Array.from(selectedBoardIds) } as CardEditorSaveData)
  }, [buildSaveData, onSave, card?.id, online, selectedBoardIds, clearDraftFromLocalStorage])

  const handleMeetingNotes = useCallback(async () => {
    setMeetingNotesLoading(true)
    setMeetingNotesError(null)
    try {
      // Gather all text content from blocks
      const textParts: string[] = []
      for (const block of blocks) {
        if (block.textContent.trim()) {
          textParts.push(block.textContent.trim())
        }
      }
      const textContent = textParts.join('\n\n')

      // Gather drawing content — render first block with drawings to an image
      let canvasDataUrl: string | null = null
      for (const block of blocks) {
        // Check active PenCanvas first
        const handle = penCanvasRefs.current.get(block.id)
        if (handle?.hasContent()) {
          canvasDataUrl = handle.toDataURL()
          break
        }
        // Check stored strokes
        if (hasDrawing(block.drawingContent)) {
          const strokes = block.drawingContent
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const stroke of strokes) {
            for (const p of stroke.points) {
              if (p.x < minX) minX = p.x
              if (p.y < minY) minY = p.y
              if (p.x > maxX) maxX = p.x
              if (p.y > maxY) maxY = p.y
            }
          }
          const pad = 20
          const w = Math.max(maxX - minX + pad * 2, 100)
          const h = Math.max(maxY - minY + pad * 2, 100)
          const offscreen = document.createElement('canvas')
          offscreen.width = w
          offscreen.height = h
          const ctx = offscreen.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.translate(-minX + pad, -minY + pad)
          const { drawStroke } = await import('@/utils/strokeRenderer')
          for (const stroke of strokes) {
            drawStroke(ctx, stroke)
          }
          canvasDataUrl = offscreen.toDataURL('image/png')
          break
        }
      }

      if (!textContent && !canvasDataUrl) return

      const result = await writeMeetingNotes(canvasDataUrl, textContent, card?.id)
      setMeetingNotes(result)
    } catch (err) {
      setMeetingNotesError(err instanceof Error ? err.message : 'Meeting notes extraction failed')
    } finally {
      setMeetingNotesLoading(false)
    }
  }, [blocks, penCanvasRefs, card?.id])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (fullscreenBlockId) {
          setFullscreenBlockId(null)
        } else if (editorFullscreen) {
          setEditorFullscreen(false)
        } else {
          onCancel()
        }
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSave()
      }
    },
    [onCancel, handleSave, editorFullscreen, fullscreenBlockId],
  )

  /** Finalize active drawing and switch mode */
  const handleModeSwitch = useCallback(
    (newMode: EditorMode) => {
      if (newMode === mode) return

      // Finalize active section's drawing when leaving pen mode
      if (mode === 'pen') {
        setBlocks((prev) =>
          prev.map((block) => {
            if (block.id === activeBlockId) {
              const handle = penCanvasRefs.current.get(block.id)
              if (handle?.hasContent()) {
                return { ...block, drawingContent: handle.getStrokes() }
              }
            }
            return block
          }),
        )
      }

      setMode(newMode)
    },
    [mode, activeBlockId],
  )

  const handleBlockTextChange = useCallback((blockId: string, newContent: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, textContent: newContent } : b)),
    )
  }, [])

  const handleAddSection = useCallback((sectionType: SectionType, insertIndex: number) => {
    const newBlock: ContentBlock = {
      id: nextBlockId(),
      type: sectionType,
      textContent: '',
      drawingContent: [],
    }
    setBlocks((prev) => {
      const next = [...prev]
      next.splice(insertIndex, 0, newBlock)
      return next
    })
    setActiveBlockId(newBlock.id)
  }, [])

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) => {
        const filtered = prev.filter((b) => b.id !== blockId)
        if (filtered.length === 0) {
          return defaultBlocks()
        }
        return filtered
      })
      if (blockId === activeBlockId) {
        setBlocks((prev) => {
          setActiveBlockId(prev[prev.length - 1]?.id ?? '')
          return prev
        })
      }
    },
    [activeBlockId],
  )

  const handleClearDrawing = useCallback((blockId: string) => {
    penCanvasRefs.current.get(blockId)?.clear()
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, drawingContent: [] } : b)),
    )
  }, [])

  const handleSubBlocksChange = useCallback((blockId: string, subBlocks: SubBlock[]) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, subBlocks } : b)),
    )
  }, [])

  /** Undo the last stroke on the active canvas */
  const handleUndo = useCallback(() => {
    for (const [, handle] of penCanvasRefs.current) {
      if (handle.canUndo()) {
        handle.undo()
        return
      }
    }
  }, [])

  /** Register a PenCanvas ref for a section */
  const registerPenRef = useCallback((blockId: string, handle: PenCanvasHandle | null) => {
    if (handle) {
      penCanvasRefs.current.set(blockId, handle)
    } else {
      penCanvasRefs.current.delete(blockId)
    }
  }, [])

  /** Activate a section and finalize drawing on the previously active section */
  const handleActivateBlock = useCallback(
    (blockId: string) => {
      if (blockId === activeBlockId) return

      // Finalize drawing on the previously active section
      if (mode === 'pen') {
        setBlocks((prev) =>
          prev.map((block) => {
            if (block.id === activeBlockId) {
              const handle = penCanvasRefs.current.get(block.id)
              if (handle?.hasContent()) {
                return { ...block, drawingContent: handle.getStrokes() }
              }
            }
            return block
          }),
        )
      }

      setActiveBlockId(blockId)
    },
    [activeBlockId, mode],
  )

  const editorContent = (
    <div className="card-editor" onKeyDown={handleKeyDown}>
      {/* Mode toggle + fullscreen toggle */}
      <div className="card-editor-header">
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
        <button
          className="btn-fullscreen"
          onClick={() => {
            // Finalize active drawing before toggling so strokes persist
            const handle = penCanvasRefs.current.get(activeBlockId)
            if (handle?.hasContent()) {
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === activeBlockId ? { ...b, drawingContent: handle.getStrokes() } : b,
                ),
              )
            }
            setEditorFullscreen((f) => !f)
          }}
          title={editorFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {editorFullscreen ? '\u2716' : '\u26F6'}
        </button>
      </div>

      {/* Section list */}
      <div className="section-list">
        {blocks.map((block, index) => (
          <div key={block.id}>
            <SectionBlock
              block={block}
              isActive={block.id === activeBlockId}
              mode={mode}
              drawingTool={drawingTool}
              onActivate={() => handleActivateBlock(block.id)}
              onTextChange={(text) => handleBlockTextChange(block.id, text)}
              onDelete={() => handleDeleteBlock(block.id)}
              onClearDrawing={() => handleClearDrawing(block.id)}
              canDelete={blocks.length > 1}
              registerPenRef={registerPenRef}
              isFullscreen={fullscreenBlockId === block.id}
              penCanvasRefs={penCanvasRefs}
              cardId={card?.id}
              online={online}
              savedInterpretation={savedInterpretations.get(block.id) ?? null}
              cardUpdatedAt={card?.updatedAt}
              extractionCreatedAt={savedExtractionCreatedAt}
              onUndoStateChange={setCanUndo}
              onToolChange={(tool) => setDrawingTool((prev) => ({ ...prev, tool }))}
              onUndo={handleUndo}
              canUndo={canUndo}
              onStrokeComplete={handleStrokeComplete}
              onSubBlocksChange={handleSubBlocksChange}
              onToggleFullscreen={() => {
                // Finalize drawing before toggling so strokes persist across mount/unmount
                const handle = penCanvasRefs.current.get(block.id)
                if (handle?.hasContent()) {
                  setBlocks((prev) =>
                    prev.map((b) =>
                      b.id === block.id ? { ...b, drawingContent: handle.getStrokes() } : b,
                    ),
                  )
                }
                setFullscreenBlockId((prev) => (prev === block.id ? null : block.id))
              }}
            />
            <AddSectionButton
              onAdd={(sectionType) => handleAddSection(sectionType, index + 1)}
            />
          </div>
        ))}
      </div>

      {/* Meeting notes */}
      <div className="card-editor-meeting-notes-area">
        <button
          className="btn btn-meeting-notes"
          onClick={handleMeetingNotes}
          disabled={meetingNotesLoading || !online}
          title={online ? 'Send card content to AI to write up structured meeting notes' : 'Meeting notes unavailable offline'}
        >
          {meetingNotesLoading ? 'Writing up...' : online ? 'Write up Meeting Notes' : 'Meeting Notes (offline)'}
        </button>
      </div>

      {meetingNotes && (
        <MeetingNotesDisplay
          notes={meetingNotes}
          onDismiss={() => setMeetingNotes(null)}
        />
      )}

      {meetingNotesError && (
        <div className="interpret-error">
          {meetingNotesError}
          <button
            className="interpret-error-dismiss"
            onClick={() => setMeetingNotesError(null)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Board selector */}
      {boardsLoaded && allBoards.length > 0 && (
        <BoardSelector
          boards={allBoards}
          selectedIds={selectedBoardIds}
          onChange={setSelectedBoardIds}
        />
      )}

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

  const paletteSlider = mode === 'pen' ? createPortal(
    <div className={`pen-palette-slider ${penPaletteOpen ? 'pen-palette-slider-open' : ''}`}>
      <button
        className="pen-palette-toggle"
        onClick={() => setPenPaletteOpen((o) => !o)}
        title={penPaletteOpen ? 'Close palette' : 'Open palette'}
      >
        {penPaletteOpen ? '\u203A' : '\u2039'}
      </button>
      <div className="pen-palette-slider-body">
        <div className="pen-palette-slider-header">
          <span className="pen-palette-slider-title">Pen Tools</span>
        </div>
        <DrawingPalette
          tool={drawingTool.tool}
          color={drawingTool.color}
          strokeWidth={drawingTool.strokeWidth}
          lineStyle={drawingTool.lineStyle}
          canUndo={canUndo}
          onToolChange={(tool) => setDrawingTool((prev) => ({ ...prev, tool }))}
          onColorChange={(color) => setDrawingTool((prev) => ({ ...prev, color }))}
          onStrokeWidthChange={(strokeWidth) => setDrawingTool((prev) => ({ ...prev, strokeWidth }))}
          onLineStyleChange={(lineStyle) => setDrawingTool((prev) => ({ ...prev, lineStyle }))}
          onUndo={handleUndo}
          onClear={() => handleClearDrawing(activeBlockId)}
        />
      </div>
    </div>,
    document.body,
  ) : null

  if (editorFullscreen) {
    return (
      <>
        {createPortal(
          <div className="fullscreen-overlay">{editorContent}</div>,
          document.body,
        )}
        {paletteSlider}
      </>
    )
  }

  return (
    <>
      {editorContent}
      {paletteSlider}
    </>
  )
}

/* ── SectionBlock ─────────────────────────────── */

interface SectionBlockProps {
  block: ContentBlock
  isActive: boolean
  mode: EditorMode
  drawingTool: DrawingToolState
  onActivate: () => void
  onTextChange: (text: string) => void
  onDelete: () => void
  onClearDrawing: () => void
  canDelete: boolean
  registerPenRef: (blockId: string, handle: PenCanvasHandle | null) => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  penCanvasRefs: React.RefObject<Map<string, PenCanvasHandle>>
  cardId?: string
  online: boolean
  onUndoStateChange: (canUndo: boolean) => void
  onToolChange: (tool: StrokeTool) => void
  onUndo: () => void
  canUndo: boolean
  onStrokeComplete?: () => void
  savedInterpretation?: CanvasInterpretation | null
  cardUpdatedAt?: string
  extractionCreatedAt?: string | null
  onSubBlocksChange?: (blockId: string, subBlocks: SubBlock[]) => void
}

function SectionBlock({
  block,
  isActive,
  mode,
  drawingTool,
  onActivate,
  onTextChange,
  onDelete,
  onClearDrawing,
  canDelete,
  registerPenRef,
  isFullscreen,
  onToggleFullscreen,
  penCanvasRefs,
  cardId,
  online,
  onUndoStateChange,
  onToolChange,
  onUndo,
  canUndo,
  onStrokeComplete,
  savedInterpretation: initialInterpretation,
  cardUpdatedAt,
  extractionCreatedAt,
  onSubBlocksChange,
}: SectionBlockProps) {
  const isHeading = block.type === 'heading'
  const showTextArea = isActive && mode === 'keyboard'
  const showCanvas = isActive && mode === 'pen'

  const [interpreting, setInterpreting] = useState(false)
  const [interpretation, setInterpretation] = useState<CanvasInterpretation | null>(initialInterpretation ?? null)

  // ── Sub-block state ──
  const [subBlocks, setSubBlocks] = useState<SubBlock[]>(block.subBlocks ?? [])
  const [selectedSubBlockId, setSelectedSubBlockId] = useState<string | null>(null)
  const [canvasTransform, setCanvasTransform] = useState({ scale: 1, panX: 0, panY: 0 })

  // Propagate sub-block changes to parent
  const updateSubBlocks = useCallback((newSubBlocks: SubBlock[]) => {
    setSubBlocks(newSubBlocks)
    onSubBlocksChange?.(block.id, newSubBlocks)
  }, [block.id, onSubBlocksChange])

  const handleCreateSubBlock = useCallback((data: CreateSubBlockData) => {
    const sb = createSubBlockFromStrokes(data.strokes)
    updateSubBlocks([...subBlocks, sb])
    setSelectedSubBlockId(sb.id)
    // Switch back to pen so user can draw into the new sub-block immediately
    onToolChange('pen')
  }, [subBlocks, updateSubBlocks, onToolChange])

  const handleSubBlockDragMove = useCallback((id: string, x: number, y: number) => {
    updateSubBlocks(subBlocks.map(sb => {
      if (sb.id !== id) return sb
      const dx = x - sb.x
      const dy = y - sb.y
      // Translate stroke points so they stay aligned with the new position
      const variations = sb.variations.map(v => {
        if (!v.strokes) return v
        return {
          ...v,
          strokes: v.strokes.map(s => ({
            ...s,
            points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })),
          })),
        }
      })
      return { ...sb, x, y, variations }
    }))
  }, [subBlocks, updateSubBlocks])

  const handleSubBlockDelete = useCallback((id: string) => {
    // Re-insert original strokes back into the canvas
    const sb = subBlocks.find(s => s.id === id)
    if (sb) {
      const originalStrokes = sb.variations[0]?.strokes ?? []
      if (originalStrokes.length > 0) {
        const handle = penCanvasRefs.current.get(block.id)
        if (handle) {
          handle.addStrokes(originalStrokes)
        }
      }
    }
    updateSubBlocks(subBlocks.filter(s => s.id !== id))
    if (selectedSubBlockId === id) setSelectedSubBlockId(null)
  }, [subBlocks, updateSubBlocks, selectedSubBlockId, block.id, penCanvasRefs])

  /** Intercept a newly drawn stroke: if it falls within a sub-block, route it there instead of the main canvas. */
  const handleStrokeDrawn = useCallback((stroke: PenStroke): boolean => {
    if (subBlocks.length === 0) return false
    // Compute stroke centroid
    let cx = 0, cy = 0
    for (const p of stroke.points) { cx += p.x; cy += p.y }
    cx /= stroke.points.length
    cy /= stroke.points.length
    // Find the sub-block whose bounds contain the centroid
    const target = subBlocks.find(sb =>
      cx >= sb.x && cx <= sb.x + sb.width &&
      cy >= sb.y && cy <= sb.y + sb.height
    )
    if (!target) return false
    // Add stroke to the sub-block's strokes variation and recalculate bounds
    const updated = subBlocks.map(s => {
      if (s.id !== target.id) return s
      const currentStrokes = s.variations[0]?.strokes ?? []
      const newStrokes = [...currentStrokes, { ...stroke, points: stroke.points.map(p => ({ ...p })) }]
      const bounds = computeStrokeBounds(newStrokes)
      return {
        ...s,
        ...bounds,
        variations: s.variations.map((v, i) =>
          i === 0 ? { ...v, strokes: newStrokes } : v
        ),
      }
    })
    updateSubBlocks(updated)
    return true // consumed — don't add to main canvas
  }, [subBlocks, updateSubBlocks])

  const handleSubBlockInterpret = useCallback(async (id: string, mode: 'readText' | 'interpret' | 'meetingNotes') => {
    const sb = subBlocks.find(s => s.id === id)
    if (!sb) return

    // Get the original strokes to render to an offscreen canvas
    const strokes = sb.variations[0]?.strokes ?? []
    if (strokes.length === 0) return

    // Render strokes to offscreen canvas
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const stroke of strokes) {
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
    }
    const pad = 20
    const w = Math.max(maxX - minX + pad * 2, 100)
    const h = Math.max(maxY - minY + pad * 2, 100)
    const offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    const ctx = offscreen.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.translate(-minX + pad, -minY + pad)
    const { drawStroke } = await import('@/utils/strokeRenderer')
    for (const stroke of strokes) {
      drawStroke(ctx, stroke)
    }
    const dataUrl = offscreen.toDataURL('image/png')

    try {
      let newVariation: SubBlockVariation

      if (mode === 'readText' || mode === 'interpret') {
        const interpretMode = mode === 'readText' ? 'readText' : undefined
        const result = await interpretCanvas(dataUrl, cardId, interpretMode, `${block.id}:${sb.id}`)
        if (mode === 'readText') {
          newVariation = {
            id: nextVariationId(),
            type: 'readText',
            markdown: result.text || result.description || '',
            createdAt: new Date().toISOString(),
          }
        } else {
          newVariation = {
            id: nextVariationId(),
            type: 'interpret',
            interpretation: result,
            createdAt: new Date().toISOString(),
          }
        }
      } else {
        const result = await writeMeetingNotes(dataUrl, '', cardId)
        newVariation = {
          id: nextVariationId(),
          type: 'meetingNotes',
          meetingNotes: result,
          createdAt: new Date().toISOString(),
        }
      }

      // Replace existing variation of same type, or append
      const updated = subBlocks.map(s => {
        if (s.id !== id) return s
        const existingIdx = s.variations.findIndex(v => v.type === newVariation.type)
        const newVariations = [...s.variations]
        if (existingIdx >= 0) {
          newVariations[existingIdx] = newVariation
        } else {
          newVariations.push(newVariation)
        }
        const newActiveIndex = existingIdx >= 0 ? existingIdx : newVariations.length - 1
        return { ...s, variations: newVariations, activeVariationIndex: newActiveIndex }
      })
      updateSubBlocks(updated)
    } catch (err) {
      console.error('Sub-block interpretation failed:', err)
    }
  }, [subBlocks, updateSubBlocks, cardId, block.id])

  const handleSubBlockVariationSwitch = useCallback((id: string, index: number) => {
    updateSubBlocks(subBlocks.map(sb =>
      sb.id === id ? { ...sb, activeVariationIndex: index } : sb
    ))
  }, [subBlocks, updateSubBlocks])

  const handleCanvasTransformChange = useCallback((scale: number, panX: number, panY: number) => {
    setCanvasTransform({ scale, panX, panY })
  }, [])
  const [interpretationFromDb, setInterpretationFromDb] = useState(!!initialInterpretation)
  const [interpretError, setInterpretError] = useState<string | null>(null)
  const [drawingModifiedSinceInterpret, setDrawingModifiedSinceInterpret] = useState(false)

  // Determine if the saved interpretation is outdated based on timestamps
  const interpretationOutdated = useMemo(() => {
    if (drawingModifiedSinceInterpret) return true
    if (!interpretationFromDb || !extractionCreatedAt || !cardUpdatedAt) return false
    return new Date(cardUpdatedAt) > new Date(extractionCreatedAt)
  }, [drawingModifiedSinceInterpret, interpretationFromDb, extractionCreatedAt, cardUpdatedAt])

  // Update interpretation when saved data loads asynchronously
  useEffect(() => {
    if (initialInterpretation) {
      setInterpretation(initialInterpretation)
      setInterpretationFromDb(true)
      setDrawingModifiedSinceInterpret(false)
    }
  }, [initialInterpretation])

  // Track drawing modifications after an interpretation exists
  const drawingStrokeCount = block.drawingContent.length
  const prevStrokeCountRef = useRef(drawingStrokeCount)
  useEffect(() => {
    if (prevStrokeCountRef.current !== drawingStrokeCount && interpretation) {
      setDrawingModifiedSinceInterpret(true)
    }
    prevStrokeCountRef.current = drawingStrokeCount
  }, [drawingStrokeCount, interpretation])

  const handleInterpret = useCallback(async () => {
    // Get the canvas data URL from the active PenCanvas or from stored strokes
    const handle = penCanvasRefs.current.get(block.id)
    let dataUrl = ''
    if (handle?.hasContent()) {
      dataUrl = handle.toDataURL()
    }
    if (!dataUrl && hasDrawing(block.drawingContent)) {
      // Render stored strokes to an offscreen canvas
      const strokes = block.drawingContent
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const stroke of strokes) {
        for (const p of stroke.points) {
          if (p.x < minX) minX = p.x
          if (p.y < minY) minY = p.y
          if (p.x > maxX) maxX = p.x
          if (p.y > maxY) maxY = p.y
        }
      }
      const pad = 20
      const w = Math.max(maxX - minX + pad * 2, 100)
      const h = Math.max(maxY - minY + pad * 2, 100)
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.translate(-minX + pad, -minY + pad)
      const { drawStroke } = await import('@/utils/strokeRenderer')
      for (const stroke of strokes) {
        drawStroke(ctx, stroke)
      }
      dataUrl = offscreen.toDataURL('image/png')
    }

    if (!dataUrl) return

    setInterpreting(true)
    setInterpretError(null)
    try {
      // For headings, use readText mode to extract the actual handwritten words
      const interpretMode = isHeading ? 'readText' : undefined
      const result = await interpretCanvas(dataUrl, cardId, interpretMode, block.id)

      setInterpretation(result)
      setInterpretationFromDb(false)
      setDrawingModifiedSinceInterpret(false)

      // For heading blocks, also set the extracted text as the heading title
      if (isHeading && result) {
        const extractedText = result.text || ''
        if (extractedText.trim()) {
          onTextChange(extractedText.trim())
        }
      }
    } catch (err) {
      setInterpretError(err instanceof Error ? err.message : 'Interpretation failed')
    } finally {
      setInterpreting(false)
    }
  }, [block.id, block.drawingContent, penCanvasRefs, cardId, isHeading, onTextChange])

  const hasDrawingContent = hasDrawing(block.drawingContent) || (isActive && mode === 'pen')

  const sectionContent = (
    <div
      className={`content-section section-${block.type} ${isActive ? 'section-active' : ''}`}
      onClick={onActivate}
    >
      {/* Section type label + action buttons */}
      <div className="section-header">
        <div className="section-label">
          {isHeading ? 'Heading' : 'Body'}
        </div>
        <div className="section-header-actions">
          <button
            className="btn-fullscreen"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFullscreen()
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen section'}
          >
            {isFullscreen ? '\u2716' : '\u26F6'}
          </button>
          {canDelete && !isFullscreen && (
            <button
              className="btn-section-delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Remove section"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Text sub-area */}
      {showTextArea ? (
        <div className="section-text-area">
          {isHeading ? (
            <input
              className="section-heading-input"
              type="text"
              placeholder="Note title..."
              value={block.textContent}
              onChange={(e) => onTextChange(e.target.value)}
              autoFocus
            />
          ) : (
            <RichTextEditor
              value={block.textContent}
              onChange={onTextChange}
              placeholder="Type here..."
              autoFocus
            />
          )}
        </div>
      ) : (
        /* Text preview (shown when inactive or in pen mode with existing text) */
        (block.textContent.trim() || (!isActive && !hasDrawing(block.drawingContent))) && (
          <div className="section-text-preview">
            {isHeading ? (
              block.textContent.trim() ? (
                <h3 className="section-heading-preview">{block.textContent}</h3>
              ) : (
                <span className="block-placeholder">Empty heading — click to edit</span>
              )
            ) : (
              block.textContent.trim() ? (
                <MarkdownPreview content={block.textContent} />
              ) : (
                <span className="block-placeholder">Empty body — click to edit</span>
              )
            )}
          </div>
        )
      )}

      {/* Drawing sub-area */}
      {showCanvas && (
        <div className="section-drawing-area">
          <div className="pen-canvas-wrapper" style={{ position: 'relative' }}>
            <PenCanvas
              ref={(handle) => registerPenRef(block.id, handle)}
              color={drawingTool.color}
              strokeWidth={drawingTool.strokeWidth}
              lineStyle={drawingTool.lineStyle}
              tool={drawingTool.tool}
              className={isHeading ? 'pen-canvas-title' : ''}
              initialStrokes={block.drawingContent}
              onUndoStateChange={onUndoStateChange}
              onStrokeComplete={onStrokeComplete}
              onCreateSubBlock={handleCreateSubBlock}
              onTransformChange={handleCanvasTransformChange}
              onStrokeDrawn={handleStrokeDrawn}
            />
            {/* Sub-block overlays */}
            {subBlocks.length > 0 && (
              <div
                className="subblock-overlay-container"
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
              >
                {subBlocks.map(sb => (
                  <SubBlockOverlay
                    key={sb.id}
                    subBlock={sb}
                    scale={canvasTransform.scale}
                    panX={canvasTransform.panX}
                    panY={canvasTransform.panY}
                    isCanvasActive={showCanvas}
                    isSelected={selectedSubBlockId === sb.id}
                    online={online}
                    onSelect={() => setSelectedSubBlockId(sb.id)}
                    onDragMove={handleSubBlockDragMove}
                    onDelete={handleSubBlockDelete}
                    onInterpret={handleSubBlockInterpret}
                    onVariationSwitch={handleSubBlockVariationSwitch}
                    activeTool={drawingTool.tool}
                  />
                ))}
              </div>
            )}
            <div className="pen-canvas-quick-tools">
              <button
                className={`pen-canvas-quick-btn ${drawingTool.tool === 'pen' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToolChange('pen') }}
                title="Pen tool"
                type="button"
              >
                Pen
              </button>
              <button
                className={`pen-canvas-quick-btn ${drawingTool.tool === 'eraser' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToolChange('eraser') }}
                title="Eraser tool"
                type="button"
              >
                Eraser
              </button>
              <button
                className={`pen-canvas-quick-btn ${drawingTool.tool === 'lasso' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onToolChange('lasso') }}
                title="Lasso select tool"
                type="button"
              >
                Lasso
              </button>
              <button
                className="pen-canvas-quick-btn"
                onClick={(e) => { e.stopPropagation(); onUndo() }}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                type="button"
              >
                Undo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalized drawing preview */}
      {(hasDrawing(block.drawingContent) || subBlocks.length > 0) && !showCanvas && (
        <div className="section-drawing-area">
          {hasDrawing(block.drawingContent) && (
            <StrokePreview
              strokes={block.drawingContent}
              className={isHeading ? 'block-title-image' : 'block-drawing-image'}
            />
          )}
          {/* Show sub-block previews when canvas is inactive */}
          {subBlocks.length > 0 && (
            <div className="subblock-previews">
              {subBlocks.map(sb => {
                const activeVar = sb.variations[sb.activeVariationIndex] ?? sb.variations[0]
                return (
                  <div key={sb.id} className="subblock-preview-card">
                    {activeVar.type === 'strokes' && activeVar.strokes ? (
                      <StrokePreview strokes={activeVar.strokes} className="subblock-preview-strokes" />
                    ) : activeVar.type === 'readText' && activeVar.markdown ? (
                      <div className="subblock-preview-text">{activeVar.markdown}</div>
                    ) : activeVar.type === 'interpret' ? (
                      <div className="subblock-preview-text">{(activeVar.interpretation as CanvasInterpretation)?.description ?? 'Interpreted'}</div>
                    ) : (
                      <div className="subblock-preview-text">Block</div>
                    )}
                    {sb.variations.length > 1 && (
                      <div className="subblock-preview-badge">{sb.variations.length} views</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {isActive && (
            <button
              className="pen-canvas-clear"
              onClick={(e) => {
                e.stopPropagation()
                onClearDrawing()
              }}
              title="Remove drawing"
              style={{ position: 'relative', marginTop: 4 }}
            >
              Remove drawing
            </button>
          )}
        </div>
      )}

      {/* Interpret drawing button */}
      {isActive && hasDrawingContent && (
        <div className="section-interpret-area">
          <button
            className="btn btn-interpret"
            onClick={(e) => {
              e.stopPropagation()
              handleInterpret()
            }}
            disabled={interpreting || !online}
            title={online ? (isHeading ? 'Read handwritten title' : 'Send drawing to AI for interpretation') : 'Interpret is unavailable offline'}
          >
            {interpreting ? 'Interpreting...' : online ? (isHeading ? 'Read Handwriting' : 'Interpret Drawing') : 'Interpret (offline)'}
          </button>
        </div>
      )}

      {/* Interpretation result */}
      {interpretation && (
        <InterpretationResult
          interpretation={interpretation}
          onDismiss={() => setInterpretation(null)}
          defaultCollapsed={interpretationFromDb}
          outdated={interpretationOutdated}
        />
      )}

      {/* Interpretation error */}
      {interpretError && (
        <div className="interpret-error">
          {interpretError}
          <button
            className="interpret-error-dismiss"
            onClick={() => setInterpretError(null)}
          >
            &times;
          </button>
        </div>
      )}

    </div>
  )

  if (isFullscreen) {
    return createPortal(
      <div className="fullscreen-overlay">{sectionContent}</div>,
      document.body,
    )
  }

  return sectionContent
}

/* ── InterpretationResult ─────────────────────── */

interface InterpretationResultProps {
  interpretation: CanvasInterpretation
  onDismiss: () => void
  defaultCollapsed?: boolean
  outdated?: boolean
}

function InterpretationResult({ interpretation, onDismiss, defaultCollapsed = false, outdated = false }: InterpretationResultProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'json'>('summary')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const items = interpretation.items ?? []
  const relationships = interpretation.relationships ?? []

  const itemMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      map.set(item.item_id, item.item)
    }
    return map
  }, [items])

  return (
    <div className={`interpret-result ${collapsed ? 'interpret-result-collapsed' : ''} ${outdated ? 'interpret-result-outdated' : ''} ${interpretation.saveError ? 'interpret-result-unsaved' : ''}`}>
      <div
        className="interpret-result-header"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setCollapsed((c) => !c) }}
      >
        <div className="interpret-result-header-left">
          <span className="interpret-collapse-indicator">{collapsed ? '\u25B6' : '\u25BC'}</span>
          <span className="interpret-result-category">{interpretation.category}</span>
          {outdated && <span className="interpret-outdated-badge">Outdated</span>}
          {interpretation.saveError && <span className="interpret-unsaved-badge" title={interpretation.saveError}>Unsaved</span>}
          {collapsed && (
            <span className="interpret-result-description-preview">
              {interpretation.description}
            </span>
          )}
        </div>
        <div className="interpret-result-actions" onClick={(e) => e.stopPropagation()}>
          {!collapsed && (
            <>
              <button
                className={`interpret-view-toggle ${viewMode === 'summary' ? 'active' : ''}`}
                onClick={() => setViewMode('summary')}
              >
                Summary
              </button>
              <button
                className={`interpret-view-toggle ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
              >
                JSON
              </button>
            </>
          )}
          <button className="interpret-result-dismiss" onClick={onDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      </div>

      {!collapsed && (
        viewMode === 'summary' ? (
          <div className="interpret-summary">
            <p className="interpret-description">{interpretation.description}</p>

            {items.length > 0 && (
              <div className="interpret-items">
                <h4>Items ({items.length})</h4>
                <ul>
                  {items.map((item) => (
                    <li key={item.item_id}>{item.item}</li>
                  ))}
                </ul>
              </div>
            )}

            {relationships.length > 0 && (
              <div className="interpret-relationships">
                <h4>Relationships ({relationships.length})</h4>
                <ul>
                  {relationships.map((rel) => {
                    const from = rel.relationship_direction === 'from'
                      ? itemMap.get(rel.item_id) ?? '?'
                      : itemMap.get(rel.related_item_id) ?? '?'
                    const to = rel.relationship_direction === 'from'
                      ? itemMap.get(rel.related_item_id) ?? '?'
                      : itemMap.get(rel.item_id) ?? '?'
                    return (
                      <li key={rel.relationship_id}>
                        {from} → {to}{rel.label ? ` (${rel.label})` : ''}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <pre className="interpret-json">{JSON.stringify(interpretation, null, 2)}</pre>
        )
      )}
    </div>
  )
}

/* ── MeetingNotesDisplay ──────────────────────── */

interface MeetingNotesDisplayProps {
  notes: MeetingNotesResult
  onDismiss: () => void
}

function MeetingNotesDisplay({ notes, onDismiss }: MeetingNotesDisplayProps) {
  const [viewMode, setViewMode] = useState<'formatted' | 'json'>('formatted')
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`meeting-notes-result ${collapsed ? 'meeting-notes-collapsed' : ''} ${notes.saveError ? 'meeting-notes-unsaved' : ''}`}>
      <div
        className="meeting-notes-header"
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setCollapsed((c) => !c) }}
      >
        <div className="meeting-notes-header-left">
          <span className="interpret-collapse-indicator">{collapsed ? '\u25B6' : '\u25BC'}</span>
          <span className="meeting-notes-title-label">Meeting Notes</span>
          {notes.saveError && <span className="interpret-unsaved-badge" title={notes.saveError}>Unsaved</span>}
          {collapsed && notes.title && (
            <span className="meeting-notes-title-preview">{notes.title}</span>
          )}
        </div>
        <div className="meeting-notes-header-actions" onClick={(e) => e.stopPropagation()}>
          {!collapsed && (
            <>
              <button
                className={`interpret-view-toggle ${viewMode === 'formatted' ? 'active' : ''}`}
                onClick={() => setViewMode('formatted')}
              >
                Formatted
              </button>
              <button
                className={`interpret-view-toggle ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
              >
                JSON
              </button>
            </>
          )}
          <button className="interpret-result-dismiss" onClick={onDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      </div>

      {!collapsed && (
        viewMode === 'formatted' ? (
          <div className="meeting-notes-body">
            {notes.title && <h3 className="meeting-notes-title">{notes.title}</h3>}

            {notes.date && (
              <p className="meeting-notes-date"><strong>Date:</strong> {notes.date}</p>
            )}

            {notes.attendees.length > 0 && (
              <p className="meeting-notes-attendees">
                <strong>Attendees:</strong> {notes.attendees.join(', ')}
              </p>
            )}

            {notes.summary && (
              <div className="meeting-notes-section">
                <h4>Summary</h4>
                <p>{notes.summary}</p>
              </div>
            )}

            {notes.agenda_items.length > 0 && (
              <div className="meeting-notes-section">
                <h4>Agenda</h4>
                <ul>
                  {notes.agenda_items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            )}

            {notes.discussion_points.length > 0 && (
              <div className="meeting-notes-section">
                <h4>Discussion</h4>
                {notes.discussion_points.map((dp, i) => (
                  <div key={i} className="meeting-notes-discussion-point">
                    <strong>{dp.topic}</strong>
                    <p>{dp.details}</p>
                  </div>
                ))}
              </div>
            )}

            {notes.decisions.length > 0 && (
              <div className="meeting-notes-section">
                <h4>Decisions</h4>
                <ul>
                  {notes.decisions.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}

            {notes.next_steps.length > 0 && (
              <div className="meeting-notes-section meeting-notes-next-steps">
                <h4>Next Steps</h4>
                <ul>
                  {notes.next_steps.map((ns, i) => (
                    <li key={i}>
                      {ns.action}
                      {ns.owner && <span className="meeting-notes-owner"> — {ns.owner}</span>}
                      {ns.due_date && <span className="meeting-notes-due"> (due: {ns.due_date})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {notes.notes && (
              <div className="meeting-notes-section">
                <h4>Additional Notes</h4>
                <p>{notes.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <pre className="interpret-json">{JSON.stringify(notes, null, 2)}</pre>
        )
      )}
    </div>
  )
}

/* ── BoardSelector ─────────────────────────────── */

interface BoardSelectorProps {
  boards: Board[]
  selectedIds: Set<string>
  onChange: (ids: Set<string>) => void
}

function BoardSelector({ boards, selectedIds, onChange }: BoardSelectorProps) {
  const [expanded, setExpanded] = useState(false)

  const toggleBoard = useCallback((boardId: string) => {
    onChange(new Set(
      selectedIds.has(boardId)
        ? [...selectedIds].filter((id) => id !== boardId)
        : [...selectedIds, boardId]
    ))
  }, [selectedIds, onChange])

  const selectedBoards = boards.filter((b) => selectedIds.has(b.id))

  return (
    <div className="board-selector">
      <div
        className="board-selector-header"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setExpanded((v) => !v) }}
      >
        <span className="board-selector-label">
          Boards {selectedBoards.length > 0 && `(${selectedBoards.length})`}
        </span>
        <span className="board-selector-toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
      </div>

      {!expanded && selectedBoards.length > 0 && (
        <div className="board-selector-pills">
          {selectedBoards.map((b) => (
            <span key={b.id} className="board-pill">
              {b.name}
              <button
                className="board-pill-remove"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleBoard(b.id)
                }}
                aria-label={`Remove from ${b.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div className="board-selector-list">
          {boards.map((board) => (
            <label key={board.id} className="board-selector-item">
              <input
                type="checkbox"
                checked={selectedIds.has(board.id)}
                onChange={() => toggleBoard(board.id)}
              />
              <span className="board-selector-item-name">{board.name}</span>
            </label>
          ))}
          {boards.length === 0 && (
            <p className="board-selector-empty">No boards created yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── AddSectionButton ─────────────────────────── */

interface AddSectionButtonProps {
  onAdd: (type: SectionType) => void
}

function AddSectionButton({ onAdd }: AddSectionButtonProps) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <div className="add-section-trigger">
        <button
          className="add-section-btn"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(true)
          }}
          title="Add section"
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="add-section-menu">
      <button
        className="add-section-option"
        onClick={(e) => {
          e.stopPropagation()
          onAdd('heading')
          setExpanded(false)
        }}
      >
        + Heading
      </button>
      <button
        className="add-section-option"
        onClick={(e) => {
          e.stopPropagation()
          onAdd('body')
          setExpanded(false)
        }}
      >
        + Body
      </button>
      <button
        className="add-section-cancel"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded(false)
        }}
      >
        Cancel
      </button>
    </div>
  )
}
