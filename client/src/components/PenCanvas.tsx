import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { StrokePoint, PenStroke, StrokeTool, LineStyle } from '@/types/models'
import { drawStroke } from '@/utils/strokeRenderer'

export interface PenCanvasHandle {
  /** Get all recorded strokes */
  getStrokes: () => PenStroke[]
  /** True if the canvas has any strokes */
  hasContent: () => boolean
  /** Clear everything */
  clear: () => void
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
 * Uses `touch-action: none` to prevent the browser from intercepting
 * pen/touch gestures (scroll, zoom) on the canvas.
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
    const strokesRef = useRef<PenStroke[]>([])
    const currentStrokeRef = useRef<PenStroke | null>(null)
    const drawingRef = useRef(false)
    const erasingRef = useRef(false)

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
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr)

      for (const stroke of strokesRef.current) {
        drawStroke(ctx, stroke)
      }
      // Also draw the in-progress stroke
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current)
      }
    }, [])

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
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure,
        tiltX: e.tiltX,
        tiltY: e.tiltY,
        timestamp: e.timeStamp,
      }
    }, [])

    /** Erase any stroke near the given point */
    const eraseAtPoint = useCallback((point: StrokePoint) => {
      const before = strokesRef.current.length
      strokesRef.current = strokesRef.current.filter((stroke) => {
        for (let i = 1; i < stroke.points.length; i++) {
          const p0 = stroke.points[i - 1]
          const p1 = stroke.points[i]
          const dist = distToSegment(point.x, point.y, p0.x, p0.y, p1.x, p1.y)
          if (dist < ERASER_RADIUS + stroke.width * 0.75) {
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
        canvas.setPointerCapture(e.pointerId)
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
      [color, strokeWidth, lineStyle, tool, getPoint, eraseAtPoint],
    )

    const handlePointerMove = useCallback(
      (e: PointerEvent) => {
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
          // Draw incremental segment for responsiveness
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) {
            const pts = currentStrokeRef.current.points
            if (pts.length >= 2) {
              const prev = pts[pts.length - 2]
              const curr = pts[pts.length - 1]
              const p = Math.max(curr.pressure, 0.1)
              ctx.lineCap = 'round'
              ctx.lineJoin = 'round'
              ctx.strokeStyle = currentStrokeRef.current.color
              ctx.lineWidth = currentStrokeRef.current.width * (0.3 + p * 1.2)
              ctx.beginPath()
              ctx.moveTo(prev.x, prev.y)
              ctx.lineTo(curr.x, curr.y)
              ctx.stroke()
            }
          }
        }
      },
      [getPoint, tool, eraseAtPoint, redraw],
    )

    const handlePointerUp = useCallback(() => {
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
    }), [redraw])

    return (
      <canvas
        ref={canvasRef}
        className={`pen-canvas ${tool === 'eraser' ? 'pen-canvas-eraser' : ''} ${className ?? ''}`}
        // Prevent browser gestures (scroll, pinch-zoom) on the drawing surface
        style={{ touchAction: 'none' }}
      />
    )
  },
)
