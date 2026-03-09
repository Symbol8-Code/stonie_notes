import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { PenCanvas } from '@/components/PenCanvas'
import { StrokePreview } from '@/components/StrokePreview'
import { RichTextEditor } from '@/components/RichTextEditor'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { DrawingPalette } from '@/components/DrawingPalette'
import { useInputModeContext } from '@/contexts/InputModeContext'
import { parseBlocks, serializeBlocks, defaultBlocks, nextBlockId } from '@/utils/cardBlocks'
import { hasDrawing } from '@/types/models'
import type { PenCanvasHandle } from '@/components/PenCanvas'
import { interpretCanvas } from '@/services/api'
import type { CanvasInterpretation } from '@/services/api'
import type { Card, ContentBlock, SectionType, StrokeTool, LineStyle } from '@/types/models'

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

  const penCanvasRefs = useRef<Map<string, PenCanvasHandle>>(new Map())
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    onSave(data)
  }, [buildSaveData, onSave])

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
          onToolChange={(tool) => setDrawingTool((prev) => ({ ...prev, tool }))}
          onColorChange={(color) => setDrawingTool((prev) => ({ ...prev, color }))}
          onStrokeWidthChange={(strokeWidth) => setDrawingTool((prev) => ({ ...prev, strokeWidth }))}
          onLineStyleChange={(lineStyle) => setDrawingTool((prev) => ({ ...prev, lineStyle }))}
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
}: SectionBlockProps) {
  const isHeading = block.type === 'heading'
  const showTextArea = isActive && mode === 'keyboard'
  const showCanvas = isActive && mode === 'pen'

  const [interpreting, setInterpreting] = useState(false)
  const [interpretation, setInterpretation] = useState<CanvasInterpretation | null>(null)
  const [interpretError, setInterpretError] = useState<string | null>(null)

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
      const result = await interpretCanvas(dataUrl)
      setInterpretation(result)
    } catch (err) {
      setInterpretError(err instanceof Error ? err.message : 'Interpretation failed')
    } finally {
      setInterpreting(false)
    }
  }, [block.id, block.drawingContent, penCanvasRefs])

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
          <div className="pen-canvas-wrapper">
            <PenCanvas
              ref={(handle) => registerPenRef(block.id, handle)}
              color={drawingTool.color}
              strokeWidth={drawingTool.strokeWidth}
              lineStyle={drawingTool.lineStyle}
              tool={drawingTool.tool}
              className={isHeading ? 'pen-canvas-title' : ''}
              initialStrokes={block.drawingContent}
            />
            <button
              className="pen-canvas-clear"
              onClick={(e) => {
                e.stopPropagation()
                onClearDrawing()
              }}
              title="Clear drawing"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Finalized drawing preview */}
      {hasDrawing(block.drawingContent) && !showCanvas && (
        <div className="section-drawing-area">
          <StrokePreview
            strokes={block.drawingContent}
            className={isHeading ? 'block-title-image' : 'block-drawing-image'}
          />
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
      {isActive && !isHeading && hasDrawingContent && (
        <div className="section-interpret-area">
          <button
            className="btn btn-interpret"
            onClick={(e) => {
              e.stopPropagation()
              handleInterpret()
            }}
            disabled={interpreting}
            title="Send drawing to AI for interpretation"
          >
            {interpreting ? 'Interpreting...' : 'Interpret Drawing'}
          </button>
        </div>
      )}

      {/* Interpretation result */}
      {interpretation && (
        <InterpretationResult
          interpretation={interpretation}
          onDismiss={() => setInterpretation(null)}
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
}

function InterpretationResult({ interpretation, onDismiss }: InterpretationResultProps) {
  const [viewMode, setViewMode] = useState<'summary' | 'json'>('summary')

  const itemMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of interpretation.items) {
      map.set(item.item_id, item.item)
    }
    return map
  }, [interpretation.items])

  return (
    <div className="interpret-result">
      <div className="interpret-result-header">
        <span className="interpret-result-category">{interpretation.category}</span>
        <div className="interpret-result-actions">
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
          <button className="interpret-result-dismiss" onClick={onDismiss} title="Dismiss">
            &times;
          </button>
        </div>
      </div>

      {viewMode === 'summary' ? (
        <div className="interpret-summary">
          <p className="interpret-description">{interpretation.description}</p>

          {interpretation.items.length > 0 && (
            <div className="interpret-items">
              <h4>Items ({interpretation.items.length})</h4>
              <ul>
                {interpretation.items.map((item) => (
                  <li key={item.item_id}>{item.item}</li>
                ))}
              </ul>
            </div>
          )}

          {interpretation.relationships.length > 0 && (
            <div className="interpret-relationships">
              <h4>Relationships ({interpretation.relationships.length})</h4>
              <ul>
                {interpretation.relationships.map((rel) => {
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
