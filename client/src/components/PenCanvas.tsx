import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from 'react'
import type { StrokePoint, PenStroke, StrokeTool, LineStyle } from '@/types/models'
import { drawStroke } from '@/utils/strokeRenderer'

export interface PenCanvasHandle {
  /** Get all recorded strokes */
  getStrokes: () => PenStroke[]
  /** True if the canvas has any strokes */
  hasContent: () => boolean
  /** Clear everything */
  clear: () => void
  /** Export canvas as base64 data URL (PNG) */
  toDataURL: () => string
  /** Undo the last draw or erase action */
  undo: () => void
  /** Whether there is an action to undo */
  canUndo: () => boolean
  /** Copy lasso-selected strokes to clipboard */
  copySelection: () => void
  /** Cut lasso-selected strokes (copy + delete) */
  cutSelection: () => void
  /** Paste strokes from clipboard, auto-selecting them */
  pasteStrokes: () => void
  /** Delete lasso-selected strokes */
  deleteSelection: () => void
  /** Whether the clipboard has content to paste */
  canPaste: () => boolean
  /** Whether there are selected strokes */
  hasSelection: () => boolean
}

interface PenCanvasProps {
  /** Pen color */
  color?: string
  /** Base stroke width (modulated by pressure) */
  strokeWidth?: number
  /** Line style for strokes */
  lineStyle?: LineStyle
  /** Active tool */
  tool?: StrokeTool
  /** CSS class for the wrapper */
  className?: string
  /** Previously saved strokes to load for re-editing */
  initialStrokes?: PenStroke[]
  /** Called when strokes are erased */
  onStrokeErased?: () => void
  /** Called when the undo stack changes (can be used to update UI) */
  onUndoStateChange?: (canUndo: boolean) => void
  /** Called after any stroke change (draw, erase, undo, move, clear) with current strokes */
  onStrokeComplete?: (strokes: PenStroke[]) => void
}

/** An undoable action on the canvas */
type UndoAction =
  | { type: 'draw' }
  | { type: 'erase'; strokes: { stroke: PenStroke; index: number }[] }
  | { type: 'move'; indices: number[]; dx: number; dy: number }
  | { type: 'paste'; count: number }

/** Module-level clipboard for copy/paste across canvas instances */
let strokeClipboard: { strokes: PenStroke[]; centerX: number; centerY: number } | null = null

/** Minimum distance from pointer to stroke segment to count as a hit */
const ERASER_RADIUS = 12

const MIN_SCALE = 0.25
const MAX_SCALE = 5.0
const ZOOM_STEP = 0.15

/** Pressure threshold to trigger context menu (0–1 scale) */
const FIRM_PRESS_THRESHOLD = 0.45
/** How long (ms) the pen must stay above threshold before the menu opens */
const FIRM_PRESS_DELAY = 300
/** Max distance (px) the pointer may drift during the firm hold */
const FIRM_PRESS_MAX_DRIFT = 8

/** Point-to-line-segment distance */
function distToSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Compute axis-aligned bounding box for a set of strokes */
function strokesBounds(strokes: PenStroke[], indices: number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const idx of indices) {
    for (const p of strokes[idx].points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Drawing canvas with full Pointer Events support.
 * Captures pressure and tilt from stylus input. Also works with
 * mouse and touch so the user can always draw regardless of device.
 *
 * Supports zoom via pinch gesture, mouse wheel, keyboard +/-, and buttons.
 * Strokes are stored in logical (unzoomed) coordinates.
 */
export const PenCanvas = forwardRef<PenCanvasHandle, PenCanvasProps>(
  function PenCanvas({
    color = '#1a1a2e',
    strokeWidth = 2,
    lineStyle = 'solid',
    tool = 'pen',
    className,
    initialStrokes,
    onStrokeErased,
    onUndoStateChange,
    onStrokeComplete,
  }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const strokesRef = useRef<PenStroke[]>([])
    const currentStrokeRef = useRef<PenStroke | null>(null)
    const drawingRef = useRef(false)
    const erasingRef = useRef(false)
    const undoStackRef = useRef<UndoAction[]>([])
    /** Strokes erased during the current drag gesture (batched into one undo action) */
    const pendingErasedRef = useRef<{ stroke: PenStroke; index: number }[]>([])

    // Offscreen buffer for completed strokes — avoids re-rendering all strokes every frame
    const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const bufferDirtyRef = useRef(true)

    // Cached bounding rect — updated only on resize, not every pointer event
    const cachedRectRef = useRef<DOMRect | null>(null)

    // Zoom/pan state — refs to avoid re-renders during gestures
    const scaleRef = useRef(1.0)
    const panXRef = useRef(0)
    const panYRef = useRef(0)
    const [zoomDisplay, setZoomDisplay] = useState(100)

    // Lasso selection state
    const lassoPointsRef = useRef<{ x: number; y: number }[]>([])
    const lassoDrawingRef = useRef(false)
    const selectedIndicesRef = useRef<number[]>([])
    const selectionBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null)
    const isDraggingSelectionRef = useRef(false)
    const dragStartRef = useRef<{ x: number; y: number } | null>(null)
    const dragTotalRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

    // Pinch-to-zoom tracking
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
    const isPinchingRef = useRef(false)
    const lastPinchDistRef = useRef<number | null>(null)
    const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null)

    // Firm-press context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
    const firmPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const firmPressOriginRef = useRef<{ x: number; y: number } | null>(null)
    const firmPressTriggeredRef = useRef(false)

    /** Convert screen coords (relative to canvas element) to logical drawing coords */
    const screenToLogical = useCallback((sx: number, sy: number) => {
      return {
        x: (sx - panXRef.current) / scaleRef.current,
        y: (sy - panYRef.current) / scaleRef.current,
      }
    }, [])

    /** Cancel any pending firm-press timer */
    const cancelFirmPress = useCallback(() => {
      if (firmPressTimerRef.current) {
        clearTimeout(firmPressTimerRef.current)
        firmPressTimerRef.current = null
      }
      firmPressOriginRef.current = null
    }, [])

    /** Dismiss the context menu */
    const dismissContextMenu = useCallback(() => {
      setContextMenu(null)
    }, [])

    /** Mark the offscreen stroke buffer as needing a re-render */
    const invalidateBuffer = useCallback(() => {
      bufferDirtyRef.current = true
    }, [])

    // Resize canvas to match its CSS size at device pixel ratio
    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      cachedRectRef.current = rect
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
      }
      // Resize the offscreen buffer to match
      if (!bufferCanvasRef.current) {
        bufferCanvasRef.current = document.createElement('canvas')
      }
      bufferCanvasRef.current.width = canvas.width
      bufferCanvasRef.current.height = canvas.height
      invalidateBuffer()
      // Redraw existing strokes after resize
      redraw()
    }, [])

    /** Render all completed strokes into the offscreen buffer (only when dirty) */
    const updateBuffer = useCallback(() => {
      const buffer = bufferCanvasRef.current
      if (!buffer || !bufferDirtyRef.current) return
      bufferDirtyRef.current = false
      const dpr = window.devicePixelRatio || 1
      const w = buffer.width / dpr
      const h = buffer.height / dpr
      const ctx = buffer.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.save()
      ctx.translate(panXRef.current, panYRef.current)
      ctx.scale(scaleRef.current, scaleRef.current)
      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke)
      }
      ctx.restore()
    }, [])

    const redraw = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)

      // Blit the pre-rendered completed strokes
      updateBuffer()
      if (bufferCanvasRef.current) {
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.drawImage(bufferCanvasRef.current, 0, 0)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.restore()
      }

      // Only the in-progress stroke needs per-frame rendering
      if (currentStrokeRef.current) {
        ctx.save()
        ctx.translate(panXRef.current, panYRef.current)
        ctx.scale(scaleRef.current, scaleRef.current)
        drawStroke(ctx, currentStrokeRef.current)
        ctx.restore()
      }

      // Draw lasso overlay (lasso path + selection bounding box)
      drawLassoOverlay()
    }, [])

    /** Apply zoom centered on a screen point */
    const zoomAt = useCallback((screenX: number, screenY: number, newScale: number) => {
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))
      const oldScale = scaleRef.current
      panXRef.current = screenX - (screenX - panXRef.current) * (newScale / oldScale)
      panYRef.current = screenY - (screenY - panYRef.current) * (newScale / oldScale)
      scaleRef.current = newScale
      setZoomDisplay(Math.round(newScale * 100))
      invalidateBuffer()
      redraw()
    }, [redraw, invalidateBuffer])

    /** Zoom centered on the canvas center */
    const zoomCenter = useCallback((newScale: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      zoomAt(rect.width / 2, rect.height / 2, newScale)
    }, [zoomAt])

    const resetZoom = useCallback(() => {
      scaleRef.current = 1.0
      panXRef.current = 0
      panYRef.current = 0
      setZoomDisplay(100)
      invalidateBuffer()
      redraw()
    }, [redraw, invalidateBuffer])

    useEffect(() => {
      resizeCanvas()
      const observer = new ResizeObserver(resizeCanvas)
      if (canvasRef.current) observer.observe(canvasRef.current)
      return () => observer.disconnect()
    }, [resizeCanvas])

    // Load previously saved strokes for re-editing
    useEffect(() => {
      if (!initialStrokes || initialStrokes.length === 0) return
      strokesRef.current = [...initialStrokes]
      invalidateBuffer()
      requestAnimationFrame(() => redraw())
    }, [initialStrokes, redraw, invalidateBuffer])

    const getPoint = useCallback((e: PointerEvent): StrokePoint => {
      const rect = cachedRectRef.current ?? canvasRef.current!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const logical = screenToLogical(sx, sy)
      return {
        x: logical.x,
        y: logical.y,
        pressure: e.pressure,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        timestamp: e.timeStamp,
      }
    }, [screenToLogical])

    const notifyUndoState = useCallback(() => {
      onUndoStateChange?.(undoStackRef.current.length > 0)
    }, [onUndoStateChange])

    const notifyStrokeComplete = useCallback(() => {
      onStrokeComplete?.([...strokesRef.current])
    }, [onStrokeComplete])

    /** Clear lasso selection state */
    const clearSelection = useCallback(() => {
      selectedIndicesRef.current = []
      selectionBoundsRef.current = null
      lassoPointsRef.current = []
      lassoDrawingRef.current = false
      isDraggingSelectionRef.current = false
      dragStartRef.current = null
      dragTotalRef.current = { dx: 0, dy: 0 }
    }, [])

    /** Undo the last draw or erase action */
    const undo = useCallback(() => {
      const action = undoStackRef.current.pop()
      if (!action) return
      if (action.type === 'draw') {
        strokesRef.current.pop()
      } else if (action.type === 'erase') {
        // Re-insert erased strokes at their original indices (ascending order)
        for (const { stroke, index } of action.strokes) {
          strokesRef.current.splice(Math.min(index, strokesRef.current.length), 0, stroke)
        }
      } else if (action.type === 'move') {
        // Reverse the move by translating back
        for (const idx of action.indices) {
          if (idx < strokesRef.current.length) {
            for (const p of strokesRef.current[idx].points) {
              p.x -= action.dx
              p.y -= action.dy
            }
          }
        }
      } else if (action.type === 'paste') {
        // Remove the pasted strokes from the end
        strokesRef.current.splice(strokesRef.current.length - action.count, action.count)
        clearSelection()
      }
      invalidateBuffer()
      redraw()
      notifyUndoState()
      notifyStrokeComplete()
    }, [redraw, invalidateBuffer, notifyUndoState, notifyStrokeComplete, clearSelection])

    /** Erase any stroke near the given point (point is in logical coords) */
    const eraseAtPoint = useCallback((point: StrokePoint) => {
      const before = strokesRef.current.length
      const eraserRadius = ERASER_RADIUS / scaleRef.current
      const remaining: PenStroke[] = []
      strokesRef.current.forEach((stroke, idx) => {
        let hit = false
        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1]
          const p1 = stroke.points[i]
          const dist = distToSegment(point.x, point.y, p0.x, p0.y, p1.x, p1.y)
          if (dist < eraserRadius + stroke.width * 0.75) {
            hit = true
            break
          }
        }
        if (hit) {
          pendingErasedRef.current.push({ stroke, index: idx })
        } else {
          remaining.push(stroke)
        }
      })
      if (remaining.length !== before) {
        strokesRef.current = remaining
        invalidateBuffer()
        redraw()
        onStrokeErased?.()
      }
    }, [redraw, invalidateBuffer, onStrokeErased])

    /** Finalize the lasso: determine which strokes are selected */
    const finalizeLasso = useCallback(() => {
      const polygon = lassoPointsRef.current
      if (polygon.length < 3) {
        clearSelection()
        invalidateBuffer()
        redraw()
        return
      }
      // A stroke is selected if any of its points fall inside the lasso polygon
      const selected: number[] = []
      strokesRef.current.forEach((stroke, idx) => {
        for (const p of stroke.points) {
          if (pointInPolygon(p.x, p.y, polygon)) {
            selected.push(idx)
            break
          }
        }
      })
      lassoDrawingRef.current = false
      lassoPointsRef.current = []
      if (selected.length === 0) {
        clearSelection()
        invalidateBuffer()
        redraw()
        return
      }
      selectedIndicesRef.current = selected
      selectionBoundsRef.current = strokesBounds(strokesRef.current, selected)
      invalidateBuffer()
      redraw()
    }, [clearSelection, invalidateBuffer, redraw])

    /** Check if a logical point is inside the current selection bounding box */
    const isInsideSelection = useCallback((lx: number, ly: number): boolean => {
      const b = selectionBoundsRef.current
      if (!b) return false
      const pad = 8 / scaleRef.current
      return lx >= b.minX - pad && lx <= b.maxX + pad && ly >= b.minY - pad && ly <= b.maxY + pad
    }, [])

    /** Deep-clone a stroke */
    const cloneStroke = (s: PenStroke): PenStroke => ({
      ...s,
      points: s.points.map((p) => ({ ...p })),
    })

    /** Copy selected strokes to the module-level clipboard */
    const copySelection = useCallback(() => {
      if (selectedIndicesRef.current.length === 0) return
      const bounds = selectionBoundsRef.current
      if (!bounds) return
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2
      strokeClipboard = {
        strokes: selectedIndicesRef.current.map((idx) => cloneStroke(strokesRef.current[idx])),
        centerX,
        centerY,
      }
    }, [])

    /** Delete selected strokes (undoable) */
    const deleteSelection = useCallback(() => {
      if (selectedIndicesRef.current.length === 0) return
      // Collect strokes to remove (in ascending index order for correct undo reinsertion)
      const sorted = [...selectedIndicesRef.current].sort((a, b) => a - b)
      const removed: { stroke: PenStroke; index: number }[] = sorted.map((idx) => ({
        stroke: cloneStroke(strokesRef.current[idx]),
        index: idx,
      }))
      // Remove from end to start to keep indices valid
      for (let i = sorted.length - 1; i >= 0; i--) {
        strokesRef.current.splice(sorted[i], 1)
      }
      undoStackRef.current.push({ type: 'erase', strokes: removed })
      clearSelection()
      invalidateBuffer()
      redraw()
      notifyUndoState()
      notifyStrokeComplete()
    }, [clearSelection, invalidateBuffer, redraw, notifyUndoState, notifyStrokeComplete])

    /** Cut = copy + delete */
    const cutSelection = useCallback(() => {
      copySelection()
      deleteSelection()
    }, [copySelection, deleteSelection])

    /** Paste from clipboard, centering on the visible viewport, and auto-select the pasted strokes */
    const pasteStrokes = useCallback(() => {
      if (!strokeClipboard) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      // Center of the current viewport in logical coords
      const viewCenterLogical = {
        x: (rect.width / 2 - panXRef.current) / scaleRef.current,
        y: (rect.height / 2 - panYRef.current) / scaleRef.current,
      }
      const offsetX = viewCenterLogical.x - strokeClipboard.centerX
      const offsetY = viewCenterLogical.y - strokeClipboard.centerY
      const startIdx = strokesRef.current.length
      const count = strokeClipboard.strokes.length
      // Clone and offset strokes
      for (const s of strokeClipboard.strokes) {
        const cloned = cloneStroke(s)
        for (const p of cloned.points) {
          p.x += offsetX
          p.y += offsetY
        }
        strokesRef.current.push(cloned)
      }
      undoStackRef.current.push({ type: 'paste', count })
      // Auto-select pasted strokes so user can immediately move them
      const pastedIndices = Array.from({ length: count }, (_, i) => startIdx + i)
      selectedIndicesRef.current = pastedIndices
      selectionBoundsRef.current = strokesBounds(strokesRef.current, pastedIndices)
      lassoPointsRef.current = []
      lassoDrawingRef.current = false
      isDraggingSelectionRef.current = false
      dragStartRef.current = null
      dragTotalRef.current = { dx: 0, dy: 0 }
      invalidateBuffer()
      redraw()
      notifyUndoState()
      notifyStrokeComplete()
    }, [invalidateBuffer, redraw, notifyUndoState, notifyStrokeComplete])

    /** Draw the lasso path and selection visuals onto the main canvas */
    const drawLassoOverlay = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.save()
      ctx.translate(panXRef.current, panYRef.current)
      ctx.scale(scaleRef.current, scaleRef.current)

      // Draw the in-progress lasso path
      if (lassoDrawingRef.current && lassoPointsRef.current.length > 1) {
        ctx.setLineDash([4 / scaleRef.current, 4 / scaleRef.current])
        ctx.strokeStyle = '#4a6cf7'
        ctx.lineWidth = 1.5 / scaleRef.current
        ctx.fillStyle = 'rgba(74, 108, 247, 0.08)'
        ctx.beginPath()
        ctx.moveTo(lassoPointsRef.current[0].x, lassoPointsRef.current[0].y)
        for (let i = 1; i < lassoPointsRef.current.length; i++) {
          ctx.lineTo(lassoPointsRef.current[i].x, lassoPointsRef.current[i].y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Draw selection bounding box
      const b = selectionBoundsRef.current
      if (b && selectedIndicesRef.current.length > 0) {
        const pad = 6 / scaleRef.current
        ctx.setLineDash([5 / scaleRef.current, 3 / scaleRef.current])
        ctx.strokeStyle = '#4a6cf7'
        ctx.lineWidth = 1.5 / scaleRef.current
        ctx.fillStyle = 'rgba(74, 108, 247, 0.05)'
        ctx.beginPath()
        ctx.rect(b.minX - pad, b.minY - pad, b.maxX - b.minX + pad * 2, b.maxY - b.minY + pad * 2)
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
      }

      ctx.restore()
    }, [])

    const handlePointerDown = useCallback(
      (e: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rect = cachedRectRef.current ?? canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top

        canvas.setPointerCapture(e.pointerId)
        activePointersRef.current.set(e.pointerId, { x: sx, y: sy })

        const pointerCount = activePointersRef.current.size
        if (pointerCount === 2) {
          // Start pinch — cancel any in-progress drawing
          isPinchingRef.current = true
          drawingRef.current = false
          currentStrokeRef.current = null

          const pts = Array.from(activePointersRef.current.values())
          lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
          lastPinchCenterRef.current = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
          redraw()
          return
        }

        if (pointerCount > 2) return

        // Dismiss context menu on any tap
        if (contextMenu) {
          setContextMenu(null)
          return
        }

        // Start firm-press detection for stylus (pointerType === 'pen')
        firmPressTriggeredRef.current = false
        if (e.pointerType === 'pen' && e.pressure >= FIRM_PRESS_THRESHOLD) {
          firmPressOriginRef.current = { x: sx, y: sy }
          firmPressTimerRef.current = setTimeout(() => {
            if (!firmPressTriggeredRef.current) {
              firmPressTriggeredRef.current = true
              // Cancel any in-progress drawing/lasso/erase
              drawingRef.current = false
              currentStrokeRef.current = null
              lassoDrawingRef.current = false
              erasingRef.current = false
              setContextMenu({ x: sx, y: sy })
              redraw()
            }
          }, FIRM_PRESS_DELAY)
        }

        // Single pointer — draw, erase, or lasso
        const point = getPoint(e)
        if (tool === 'lasso') {
          const logical = screenToLogical(sx, sy)
          // If we have a selection and click inside it, start dragging
          if (selectedIndicesRef.current.length > 0 && isInsideSelection(logical.x, logical.y)) {
            isDraggingSelectionRef.current = true
            dragStartRef.current = { x: logical.x, y: logical.y }
            dragTotalRef.current = { dx: 0, dy: 0 }
          } else {
            // Start a new lasso drawing (clears any previous selection)
            clearSelection()
            lassoDrawingRef.current = true
            lassoPointsRef.current = [{ x: logical.x, y: logical.y }]
            invalidateBuffer()
            redraw()
          }
        } else if (tool === 'eraser') {
          erasingRef.current = true
          eraseAtPoint(point)
        } else {
          drawingRef.current = true
          currentStrokeRef.current = {
            points: [point],
            color,
            width: strokeWidth,
            lineStyle: lineStyle === 'solid' ? undefined : lineStyle,
          }
        }
      },
      [color, strokeWidth, lineStyle, tool, getPoint, eraseAtPoint, redraw, screenToLogical, isInsideSelection, clearSelection, invalidateBuffer, contextMenu],
    )

    const handlePointerMove = useCallback(
      (e: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = cachedRectRef.current ?? canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top

        if (activePointersRef.current.has(e.pointerId)) {
          activePointersRef.current.set(e.pointerId, { x: sx, y: sy })
        }

        // Firm-press monitoring: cancel if pointer drifts too far or pressure drops
        if (firmPressTimerRef.current && e.pointerType === 'pen') {
          const origin = firmPressOriginRef.current
          if (origin) {
            const drift = Math.hypot(sx - origin.x, sy - origin.y)
            if (drift > FIRM_PRESS_MAX_DRIFT || e.pressure < FIRM_PRESS_THRESHOLD) {
              cancelFirmPress()
            }
          }
        }
        // Start firm-press timer if pressure just ramped up (wasn't high at pointerdown)
        if (!firmPressTimerRef.current && !firmPressTriggeredRef.current && e.pointerType === 'pen' && e.pressure >= FIRM_PRESS_THRESHOLD) {
          firmPressOriginRef.current = { x: sx, y: sy }
          firmPressTimerRef.current = setTimeout(() => {
            if (!firmPressTriggeredRef.current) {
              firmPressTriggeredRef.current = true
              drawingRef.current = false
              currentStrokeRef.current = null
              lassoDrawingRef.current = false
              erasingRef.current = false
              setContextMenu({ x: sx, y: sy })
              redraw()
            }
          }, FIRM_PRESS_DELAY)
        }

        // If context menu was triggered, swallow further move events
        if (firmPressTriggeredRef.current) return

        // Handle pinch zoom
        if (isPinchingRef.current && activePointersRef.current.size === 2) {
          const pts = Array.from(activePointersRef.current.values())
          const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
          const center = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }

          if (lastPinchDistRef.current !== null && lastPinchCenterRef.current !== null) {
            const zoomFactor = dist / lastPinchDistRef.current
            // Pan so the pinch center follows the fingers
            panXRef.current += center.x - lastPinchCenterRef.current.x
            panYRef.current += center.y - lastPinchCenterRef.current.y
            zoomAt(center.x, center.y, scaleRef.current * zoomFactor)
          }

          lastPinchDistRef.current = dist
          lastPinchCenterRef.current = center
          return
        }

        // Handle lasso tool
        if (tool === 'lasso') {
          const logical = screenToLogical(sx, sy)
          if (lassoDrawingRef.current) {
            lassoPointsRef.current.push({ x: logical.x, y: logical.y })
            redraw()
          } else if (isDraggingSelectionRef.current && dragStartRef.current) {
            const dx = logical.x - dragStartRef.current.x
            const dy = logical.y - dragStartRef.current.y
            const ddx = dx - dragTotalRef.current.dx
            const ddy = dy - dragTotalRef.current.dy
            // Translate selected strokes incrementally
            for (const idx of selectedIndicesRef.current) {
              for (const p of strokesRef.current[idx].points) {
                p.x += ddx
                p.y += ddy
              }
            }
            dragTotalRef.current = { dx, dy }
            // Update selection bounds
            if (selectionBoundsRef.current) {
              selectionBoundsRef.current.minX += ddx
              selectionBoundsRef.current.minY += ddy
              selectionBoundsRef.current.maxX += ddx
              selectionBoundsRef.current.maxY += ddy
            }
            invalidateBuffer()
            redraw()
          }
          return
        }

        if (tool === 'eraser' && erasingRef.current) {
          eraseAtPoint(getPoint(e))
          return
        }

        if (!drawingRef.current || !currentStrokeRef.current) return

        // Use coalesced events for high-resolution pen input (recovers points
        // the browser batches together between frames)
        const coalescedEvents = e.getCoalescedEvents?.() ?? [e]
        for (const ce of coalescedEvents) {
          const point = getPoint(ce)
          currentStrokeRef.current.points.push(point)
        }

        const currentLineStyle = currentStrokeRef.current.lineStyle ?? 'solid'
        if (currentLineStyle !== 'solid') {
          // Full redraw needed for correct dash pattern — but buffer is still valid
          redraw()
        } else {
          // Draw incremental segments for responsiveness (in transformed coords)
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) {
            const pts = currentStrokeRef.current.points
            const segCount = coalescedEvents.length
            if (pts.length >= 2) {
              ctx.save()
              ctx.translate(panXRef.current, panYRef.current)
              ctx.scale(scaleRef.current, scaleRef.current)
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.strokeStyle = currentStrokeRef.current.color
              // Draw all new segments from coalesced events in one batch
              const startIdx = Math.max(1, pts.length - segCount)
              for (let i = startIdx; i < pts.length; i++) {
                const prev = pts[i - 1]
                const curr = pts[i]
                const p = Math.max(curr.pressure, 0.1)
                ctx.lineWidth = currentStrokeRef.current.width * (0.3 + p * 1.2)
                ctx.beginPath()
                ctx.moveTo(prev.x, prev.y)
                ctx.lineTo(curr.x, curr.y)
                ctx.stroke()
              }
              ctx.restore()
            }
          }
        }
      },
      [getPoint, tool, eraseAtPoint, redraw, zoomAt, screenToLogical, invalidateBuffer, cancelFirmPress],
    )

    const handlePointerUp = useCallback((e: PointerEvent) => {
      cancelFirmPress()
      activePointersRef.current.delete(e.pointerId)

      // If firm-press triggered context menu, swallow the pointer up
      if (firmPressTriggeredRef.current) {
        firmPressTriggeredRef.current = false
        return
      }

      if (activePointersRef.current.size < 2) {
        isPinchingRef.current = false
        lastPinchDistRef.current = null
        lastPinchCenterRef.current = null
      }

      // Handle lasso tool pointer up
      if (tool === 'lasso') {
        if (lassoDrawingRef.current) {
          finalizeLasso()
        } else if (isDraggingSelectionRef.current) {
          // Commit the move as an undoable action
          const { dx, dy } = dragTotalRef.current
          if (dx !== 0 || dy !== 0) {
            undoStackRef.current.push({
              type: 'move',
              indices: [...selectedIndicesRef.current],
              dx,
              dy,
            })
            notifyUndoState()
            notifyStrokeComplete()
          }
          isDraggingSelectionRef.current = false
          dragStartRef.current = null
          dragTotalRef.current = { dx: 0, dy: 0 }
          // Recompute bounds after move
          if (selectedIndicesRef.current.length > 0) {
            selectionBoundsRef.current = strokesBounds(strokesRef.current, selectedIndicesRef.current)
          }
          invalidateBuffer()
          redraw()
        }
        return
      }

      if (erasingRef.current) {
        erasingRef.current = false
        // Batch all strokes erased during this drag into one undo action
        if (pendingErasedRef.current.length > 0) {
          undoStackRef.current.push({ type: 'erase', strokes: pendingErasedRef.current })
          pendingErasedRef.current = []
          notifyUndoState()
          notifyStrokeComplete()
        }
        return
      }
      if (!drawingRef.current) return
      drawingRef.current = false
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
        strokesRef.current.push(currentStrokeRef.current)
        undoStackRef.current.push({ type: 'draw' })
        invalidateBuffer()
        notifyUndoState()
        notifyStrokeComplete()
      }
      currentStrokeRef.current = null
      redraw()
    }, [notifyUndoState, notifyStrokeComplete, invalidateBuffer, redraw, tool, finalizeLasso, cancelFirmPress])

    // Attach pointer events natively (React synthetic events coalesce pointer moves)
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.addEventListener('pointerdown', handlePointerDown)
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerup', handlePointerUp)
      canvas.addEventListener('pointercancel', handlePointerUp)

      return () => {
        canvas.removeEventListener('pointerdown', handlePointerDown)
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerup', handlePointerUp)
        canvas.removeEventListener('pointercancel', handlePointerUp)
      }
    }, [handlePointerDown, handlePointerMove, handlePointerUp])

    // Mouse wheel zoom
    useEffect(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top
        const delta = -e.deltaY * 0.002
        zoomAt(sx, sy, scaleRef.current * (1 + delta))
      }
      canvas.addEventListener('wheel', onWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', onWheel)
    }, [zoomAt])

    // Keyboard zoom: +/- when canvas wrapper is focused
    useEffect(() => {
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          undo()
          e.preventDefault()
        } else if (e.key === '+' || e.key === '=') {
          zoomCenter(scaleRef.current + ZOOM_STEP)
          e.preventDefault()
        } else if (e.key === '-' || e.key === '_') {
          zoomCenter(scaleRef.current - ZOOM_STEP)
          e.preventDefault()
        } else if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
          resetZoom()
          e.preventDefault()
        }
      }
      wrapper.addEventListener('keydown', onKeyDown)
      return () => wrapper.removeEventListener('keydown', onKeyDown)
    }, [undo, zoomCenter, resetZoom])

    // Clear lasso selection when switching to a different tool
    useEffect(() => {
      if (tool !== 'lasso') {
        clearSelection()
        invalidateBuffer()
        redraw()
      }
    }, [tool, clearSelection, invalidateBuffer, redraw])

    // Dismiss context menu on Escape, and clean up timer on unmount
    useEffect(() => {
      return () => {
        if (firmPressTimerRef.current) clearTimeout(firmPressTimerRef.current)
      }
    }, [])

    useEffect(() => {
      if (!contextMenu) return
      const dismiss = () => setContextMenu(null)
      // Dismiss on any click/tap outside the menu (captured on next tick)
      const timer = setTimeout(() => {
        window.addEventListener('pointerdown', dismiss, { once: true })
      }, 0)
      return () => {
        clearTimeout(timer)
        window.removeEventListener('pointerdown', dismiss)
      }
    }, [contextMenu])

    // Lasso keyboard shortcuts: Escape, Delete, Copy, Cut, Paste
    useEffect(() => {
      if (tool !== 'lasso') return
      const wrapper = wrapperRef.current
      if (!wrapper) return
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && selectedIndicesRef.current.length > 0) {
          clearSelection()
          invalidateBuffer()
          redraw()
          e.preventDefault()
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndicesRef.current.length > 0) {
          deleteSelection()
          e.preventDefault()
        } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedIndicesRef.current.length > 0) {
          copySelection()
          e.preventDefault()
        } else if (e.key === 'x' && (e.ctrlKey || e.metaKey) && selectedIndicesRef.current.length > 0) {
          cutSelection()
          e.preventDefault()
        } else if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
          pasteStrokes()
          e.preventDefault()
        }
      }
      wrapper.addEventListener('keydown', onKeyDown)
      return () => wrapper.removeEventListener('keydown', onKeyDown)
    }, [tool, clearSelection, invalidateBuffer, redraw, deleteSelection, copySelection, cutSelection, pasteStrokes])

    useImperativeHandle(ref, () => ({
      getStrokes() {
        return [...strokesRef.current]
      },
      hasContent() {
        return strokesRef.current.length > 0
      },
      clear() {
        strokesRef.current = []
        currentStrokeRef.current = null
        undoStackRef.current = []
        invalidateBuffer()
        redraw()
        notifyUndoState()
        notifyStrokeComplete()
      },
      undo,
      canUndo() {
        return undoStackRef.current.length > 0
      },
      copySelection,
      cutSelection,
      pasteStrokes,
      deleteSelection,
      canPaste() {
        return strokeClipboard !== null && strokeClipboard.strokes.length > 0
      },
      hasSelection() {
        return selectedIndicesRef.current.length > 0
      },
      toDataURL() {
        const canvas = canvasRef.current
        if (!canvas) return ''
        // Render strokes onto a clean canvas at 1:1 scale for the LLM
        const strokes = strokesRef.current
        if (strokes.length === 0) return ''
        // Compute bounding box
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
        for (const stroke of strokes) {
          drawStroke(ctx, stroke)
        }
        return offscreen.toDataURL('image/png')
      },
    }), [redraw, undo, invalidateBuffer, notifyUndoState, notifyStrokeComplete, copySelection, cutSelection, pasteStrokes, deleteSelection])

    return (
      <div
        ref={wrapperRef}
        className={`pen-canvas-zoom-wrapper ${className ?? ''}`}
        tabIndex={-1}
      >
        <canvas
          ref={canvasRef}
          className={`pen-canvas ${tool === 'eraser' ? 'pen-canvas-eraser' : tool === 'lasso' ? 'pen-canvas-lasso' : ''}`}
          style={{ touchAction: 'none' }}
        />
        <div className="pen-canvas-zoom-controls">
          <button
            className="pen-canvas-zoom-btn"
            onClick={() => zoomCenter(scaleRef.current + ZOOM_STEP)}
            title="Zoom in (+)"
            type="button"
          >
            +
          </button>
          <span className="pen-canvas-zoom-level">{zoomDisplay}%</span>
          <button
            className="pen-canvas-zoom-btn"
            onClick={() => zoomCenter(scaleRef.current - ZOOM_STEP)}
            title="Zoom out (-)"
            type="button"
          >
            -
          </button>
          <button
            className="pen-canvas-zoom-btn pen-canvas-zoom-reset"
            onClick={resetZoom}
            title="Reset zoom (0)"
            type="button"
          >
            Reset
          </button>
        </div>
        {contextMenu && (
          <div
            className="pen-canvas-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="pen-canvas-context-item"
              disabled={selectedIndicesRef.current.length === 0}
              onClick={() => { copySelection(); dismissContextMenu() }}
              type="button"
            >
              Copy
            </button>
            <button
              className="pen-canvas-context-item"
              disabled={selectedIndicesRef.current.length === 0}
              onClick={() => { cutSelection(); dismissContextMenu() }}
              type="button"
            >
              Cut
            </button>
            <button
              className="pen-canvas-context-item"
              disabled={!strokeClipboard || strokeClipboard.strokes.length === 0}
              onClick={() => { pasteStrokes(); dismissContextMenu() }}
              type="button"
            >
              Paste
            </button>
          </div>
        )}
      </div>
    )
  },
)
