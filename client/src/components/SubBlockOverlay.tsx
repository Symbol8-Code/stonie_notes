import { useState, useRef, useCallback, useEffect } from 'react'
import type { SubBlock, SubBlockVariation, StrokeTool } from '@/types/models'
import { StrokePreview } from '@/components/StrokePreview'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import type { CanvasInterpretation, MeetingNotesResult } from '@/services/api'

interface SubBlockOverlayProps {
  subBlock: SubBlock
  /** Canvas transform for positioning */
  scale: number
  panX: number
  panY: number
  /** Whether the canvas is active (pen mode) */
  isCanvasActive: boolean
  /** Whether this sub-block is selected */
  isSelected: boolean
  online: boolean
  onSelect: () => void
  onDragMove: (id: string, x: number, y: number) => void
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onInterpret: (id: string, mode: 'readText' | 'interpret' | 'meetingNotes') => void
  onVariationSwitch: (id: string, index: number) => void
  /** Current drawing tool — when 'pen', overlay allows drawing through */
  activeTool?: StrokeTool
}

/** Module-level clipboard for sub-block copy/paste */
let subBlockClipboard: SubBlock | null = null
export function getSubBlockClipboard() { return subBlockClipboard }
export function setSubBlockClipboard(sb: SubBlock | null) { subBlockClipboard = sb }

export function SubBlockOverlay({
  subBlock,
  scale,
  panX,
  panY,
  isCanvasActive,
  isSelected,
  online,
  onSelect,
  onDragMove,
  onDelete,
  onEdit,
  onInterpret,
  onVariationSwitch,
  activeTool,
}: SubBlockOverlayProps) {
  const [interpreting, setInterpreting] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [displayedIndex, setDisplayedIndex] = useState(subBlock.activeVariationIndex)
  const [transitionPhase, setTransitionPhase] = useState<'none' | 'exit' | 'enter'>('none')
  const dragStartRef = useRef<{ x: number; y: number; blockX: number; blockY: number } | null>(null)

  // Sync displayed index when activeVariationIndex changes externally
  useEffect(() => {
    if (!transitioning) {
      setDisplayedIndex(subBlock.activeVariationIndex)
    }
  }, [subBlock.activeVariationIndex, transitioning])

  // Screen position from logical coordinates
  const screenX = subBlock.x * scale + panX
  const screenY = subBlock.y * scale + panY
  const screenW = subBlock.width * scale
  const screenH = subBlock.height * scale

  const activeVariation = subBlock.variations[displayedIndex] ?? subBlock.variations[0]

  // ── Dragging ──
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect()
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      blockX: subBlock.x,
      blockY: subBlock.y,
    }
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
  }, [onSelect, subBlock.x, subBlock.y])

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return
    const dx = (e.clientX - dragStartRef.current.x) / scale
    const dy = (e.clientY - dragStartRef.current.y) / scale
    onDragMove(subBlock.id, dragStartRef.current.blockX + dx, dragStartRef.current.blockY + dy)
  }, [scale, subBlock.id, onDragMove])

  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    const el = e.currentTarget as HTMLElement
    el.releasePointerCapture(e.pointerId)
  }, [])

  // ── Variation switching with page-fold transition ──
  const switchVariation = useCallback((targetIndex: number) => {
    if (transitioning || targetIndex === displayedIndex) return
    setTransitioning(true)
    setTransitionPhase('exit')

    setTimeout(() => {
      setDisplayedIndex(targetIndex)
      setTransitionPhase('enter')
      onVariationSwitch(subBlock.id, targetIndex)

      setTimeout(() => {
        setTransitionPhase('none')
        setTransitioning(false)
      }, 250)
    }, 250)
  }, [transitioning, displayedIndex, subBlock.id, onVariationSwitch])

  // ── Interpret actions ──
  const handleInterpret = useCallback(async (mode: 'readText' | 'interpret' | 'meetingNotes') => {
    setInterpreting(true)
    try {
      await onInterpret(subBlock.id, mode)
    } finally {
      setInterpreting(false)
    }
  }, [subBlock.id, onInterpret])

  // ── Render variation content ──
  const renderVariationContent = (variation: SubBlockVariation) => {
    switch (variation.type) {
      case 'strokes':
        return variation.strokes && variation.strokes.length > 0 ? (
          <StrokePreview strokes={variation.strokes} className="subblock-stroke-preview" />
        ) : (
          <div className="subblock-empty">Empty block</div>
        )

      case 'readText':
        return variation.markdown ? (
          <div className="subblock-text-content">
            <MarkdownPreview content={variation.markdown} />
          </div>
        ) : (
          <div className="subblock-empty">No text extracted</div>
        )

      case 'interpret': {
        const interp = variation.interpretation as CanvasInterpretation | undefined
        if (!interp) return <div className="subblock-empty">No interpretation</div>
        return (
          <div className="subblock-interpret-content">
            <div className="subblock-interpret-category">{interp.category}</div>
            <div className="subblock-interpret-description">{interp.description}</div>
            {interp.items?.length > 0 && (
              <ul className="subblock-interpret-items">
                {interp.items.map((item) => (
                  <li key={item.item_id}>{item.item}</li>
                ))}
              </ul>
            )}
          </div>
        )
      }

      case 'meetingNotes': {
        const notes = variation.meetingNotes as MeetingNotesResult | undefined
        if (!notes) return <div className="subblock-empty">No meeting notes</div>
        return (
          <div className="subblock-meeting-content">
            {notes.title && <strong>{notes.title}</strong>}
            {notes.summary && <p>{notes.summary}</p>}
            {notes.next_steps?.length > 0 && (
              <ul>
                {notes.next_steps.map((step, i) => (
                  <li key={i}>{step.action}{step.owner ? ` (${step.owner})` : ''}</li>
                ))}
              </ul>
            )}
          </div>
        )
      }
    }
  }

  const variationLabel = (v: SubBlockVariation) => {
    switch (v.type) {
      case 'strokes': return 'Pen'
      case 'readText': return 'Text'
      case 'interpret': return 'Visual'
      case 'meetingNotes': return 'Notes'
    }
  }

  const transitionClass =
    transitionPhase === 'exit' ? 'subblock-page-exit' :
    transitionPhase === 'enter' ? 'subblock-page-enter' : ''

  // When pen tool is active, let strokes pass through to the canvas underneath
  const penPassthrough = activeTool === 'pen'

  return (
    <div
      className={`subblock-overlay ${isSelected ? 'subblock-selected' : ''}`}
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: screenW,
        minHeight: screenH,
        pointerEvents: penPassthrough ? 'none' : 'auto',
      }}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
    >
      {/* Drag handle */}
      <div
        className="subblock-drag-handle"
        style={{ pointerEvents: 'auto' }}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="subblock-drag-dots">&#x2801;&#x2801;&#x2801;</span>
      </div>

      {/* Variation content with page-fold transition */}
      <div className="subblock-content-wrapper" style={{ perspective: '600px' }}>
        <div className={`subblock-content ${transitionClass}`}>
          {renderVariationContent(activeVariation)}
        </div>
      </div>

      {/* Variation switcher dots */}
      {subBlock.variations.length > 1 && (
        <div className="subblock-variation-switcher">
          {subBlock.variations.map((v, i) => (
            <button
              key={v.id}
              className={`subblock-variation-dot ${i === displayedIndex ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); switchVariation(i) }}
              title={variationLabel(v)}
              type="button"
            >
              {variationLabel(v)}
            </button>
          ))}
        </div>
      )}

      {/* Action toolbar — shown when selected */}
      {isSelected && isCanvasActive && (
        <div className="subblock-toolbar" style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <button
            className="subblock-tool-btn"
            onClick={() => handleInterpret('readText')}
            disabled={interpreting || !online}
            title="Extract text from drawing"
            type="button"
          >
            {interpreting ? '...' : 'Read'}
          </button>
          <button
            className="subblock-tool-btn"
            onClick={() => handleInterpret('interpret')}
            disabled={interpreting || !online}
            title="Interpret drawing (mindmap, diagram, etc.)"
            type="button"
          >
            {interpreting ? '...' : 'Interpret'}
          </button>
          <button
            className="subblock-tool-btn"
            onClick={() => handleInterpret('meetingNotes')}
            disabled={interpreting || !online}
            title="Extract meeting notes"
            type="button"
          >
            {interpreting ? '...' : 'Notes'}
          </button>
          <button
            className="subblock-tool-btn subblock-tool-edit"
            onClick={() => onEdit(subBlock.id)}
            title="Edit pen strokes"
            type="button"
          >
            Edit
          </button>
          <button
            className="subblock-tool-btn subblock-tool-delete"
            onClick={() => onDelete(subBlock.id)}
            title="Delete block (re-insert strokes)"
            type="button"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  )
}
