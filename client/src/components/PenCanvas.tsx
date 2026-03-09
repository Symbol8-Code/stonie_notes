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
}

/** Minimum distance from pointer to stroke segment to count as a hit */
const ERASER_RADIUS = 12

const MIN_SCALE = 0.25
const MAX_SCALE = 5.0
const ZOOM_STEP = 0.15

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
  }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const wrapperRef = useRef<HTMLDivElement>(null)
    const strokesRef = useRef<PenStroke[]>([])
    const currentStrokeRef = useRef<PenStroke | null>(null)
    const drawingRef = useRef(false)
    const erasingRef = useRef(false)

    // Zoom/pan state — refs to avoid re-renders during gestures
    const scaleRef = useRef(1.0)
    const panXRef = useRef(0)
    const panYRef = useRef(0)
    const [zoomDisplay, setZoomDisplay] = useState(100)

    // Pinch-to-zoom tracking
    const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
    const isPinchingRef = useRef(false)
    const lastPinchDistRef = useRef<number | null>(null)
    const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null)

    /** Convert screen coords (relative to canvas element) to logical drawing coords */
    const screenToLogical = useCallback((sx: number, sy: number) => {
      return {
        x: (sx - panXRef.current) / scaleRef.current,
        y: (sy - panYRef.current) / scaleRef.current,
      }
    }, [])

    // Resize canvas to match its CSS size at device pixel ratio
    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
      }
      // Redraw existing strokes after resize
      redraw()
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

      ctx.save()
      ctx.translate(panXRef.current, panYRef.current)
      ctx.scale(scaleRef.current, scaleRef.current)

      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke)
      }
      // Also draw the in-progress stroke
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current)
      }

      ctx.restore()
    }, [])

    /** Apply zoom centered on a screen point */
    const zoomAt = useCallback((screenX: number, screenY: number, newScale: number) => {
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))
      const oldScale = scaleRef.current
      panXRef.current = screenX - (screenX - panXRef.current) * (newScale / oldScale)
      panYRef.current = screenY - (screenY - panYRef.current) * (newScale / oldScale)
      scaleRef.current = newScale
      setZoomDisplay(Math.round(newScale * 100))
      redraw()
    }, [redraw])

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
      redraw()
    }, [redraw])

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
      requestAnimationFrame(() => redraw())
    }, [initialStrokes, redraw])

    const getPoint = useCallback((e: PointerEvent): StrokePoint => {
      const canvas = canvasRef.current!
      const rect = canvas.getBoundingClientRect()
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

    /** Erase any stroke near the given point (point is in logical coords) */
    const eraseAtPoint = useCallback((point: StrokePoint) => {
      const before = strokesRef.current.length
      const eraserRadius = ERASER_RADIUS / scaleRef.current
      strokesRef.current = strokesRef.current.filter((stroke) => {
        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1]
          const p1 = stroke.points[i]
          const dist = distToSegment(point.x, point.y, p0.x, p0.y, p1.x, p1.y)
          if (dist < eraserRadius + stroke.width * 0.75) {
            return false // remove this stroke
          }
        }
        return true // keep
      })
      if (strokesRef.current.length !== before) {
        redraw()
        onStrokeErased?.()
      }
    }, [redraw, onStrokeErased])

    const handlePointerDown = useCallback(
      (e: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
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

        // Single pointer — draw or erase
        const point = getPoint(e)
        if (tool === 'eraser') {
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
      [color, strokeWidth, lineStyle, tool, getPoint, eraseAtPoint, redraw],
    )

    const handlePointerMove = useCallback(
      (e: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const sx = e.clientX - rect.left
        const sy = e.clientY - rect.top

        if (activePointersRef.current.has(e.pointerId)) {
          activePointersRef.current.set(e.pointerId, { x: sx, y: sy })
        }

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

        if (tool === 'eraser' && erasingRef.current) {
          eraseAtPoint(getPoint(e))
          return
        }

        if (!drawingRef.current || !currentStrokeRef.current) return
        const point = getPoint(e)
        currentStrokeRef.current.points.push(point)

        const currentLineStyle = currentStrokeRef.current.lineStyle ?? 'solid'
        if (currentLineStyle !== 'solid') {
          // Full redraw needed for correct dash pattern
          redraw()
        } else {
          // Draw incremental segment for responsiveness (in transformed coords)
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) {
            const pts = currentStrokeRef.current.points
            if (pts.length >= 2) {
              const prev = pts[pts.length - 2]
              const curr = pts[pts.length - 1]
              const p = Math.max(curr.pressure, 0.1)
              ctx.save()
              ctx.translate(panXRef.current, panYRef.current)
              ctx.scale(scaleRef.current, scaleRef.current)
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.strokeStyle = currentStrokeRef.current.color
              ctx.lineWidth = currentStrokeRef.current.width * (0.3 + p * 1.2)
              ctx.beginPath()
              ctx.moveTo(prev.x, prev.y)
              ctx.lineTo(curr.x, curr.y)
              ctx.stroke()
              ctx.restore()
            }
          }
        }
      },
      [getPoint, tool, eraseAtPoint, redraw, zoomAt],
    )

    const handlePointerUp = useCallback((e: PointerEvent) => {
      activePointersRef.current.delete(e.pointerId)

      if (activePointersRef.current.size < 2) {
        isPinchingRef.current = false
        lastPinchDistRef.current = null
        lastPinchCenterRef.current = null
      }

      if (erasingRef.current) {
        erasingRef.current = false
        return
      }
      if (!drawingRef.current) return
      drawingRef.current = false
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
        strokesRef.current.push(currentStrokeRef.current)
      }
      currentStrokeRef.current = null
    }, [])

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
        if (e.key === '+' || e.key === '=') {
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
    }, [zoomCenter, resetZoom])

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
        redraw()
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
    }), [redraw])

    return (
      <div
        ref={wrapperRef}
        className={`pen-canvas-zoom-wrapper ${className ?? ''}`}
        tabIndex={-1}
      >
        <canvas
          ref={canvasRef}
          className={`pen-canvas ${tool === 'eraser' ? 'pen-canvas-eraser' : ''}`}
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
      </div>
    )
  },
)
