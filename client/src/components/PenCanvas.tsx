import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { StrokePoint } from '@/types/models'

interface PenStroke {
  points: StrokePoint[]
  color: string
  width: number
}

export interface PenCanvasHandle {
  /** Export the canvas content as a PNG data URL */
  toDataURL: () => string
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
  /** CSS class for the wrapper */
  className?: string
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
  function PenCanvas({ color = '#1a1a2e', strokeWidth = 2, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const strokesRef = useRef<PenStroke[]>([])
    const currentStrokeRef = useRef<PenStroke | null>(null)
    const drawingRef = useRef(false)

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

    function drawStroke(ctx: CanvasRenderingContext2D, stroke: PenStroke) {
      const { points, color: strokeColor, width } = stroke
      if (points.length < 2) return

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = strokeColor

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        // Pressure-sensitive width: pressure 0..1 maps to 0.3x..1.5x base width
        const p = Math.max(curr.pressure, 0.1)
        ctx.lineWidth = width * (0.3 + p * 1.2)

        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(curr.x, curr.y)
        ctx.stroke()
      }
    }

    useEffect(() => {
      resizeCanvas()
      const observer = new ResizeObserver(resizeCanvas)
      if (canvasRef.current) observer.observe(canvasRef.current)
      return () => observer.disconnect()
    }, [resizeCanvas])

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

    const handlePointerDown = useCallback(
      (e: PointerEvent) => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.setPointerCapture(e.pointerId)
        drawingRef.current = true
        const point = getPoint(e)
        currentStrokeRef.current = {
          points: [point],
          color,
          width: strokeWidth,
        }
      },
      [color, strokeWidth, getPoint],
    )

    const handlePointerMove = useCallback(
      (e: PointerEvent) => {
        if (!drawingRef.current || !currentStrokeRef.current) return
        const point = getPoint(e)
        currentStrokeRef.current.points.push(point)

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
      },
      [getPoint],
    )

    const handlePointerUp = useCallback(() => {
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
      toDataURL() {
        return canvasRef.current?.toDataURL('image/png') ?? ''
      },
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
        className={`pen-canvas ${className ?? ''}`}
        // Prevent browser gestures (scroll, pinch-zoom) on the drawing surface
        style={{ touchAction: 'none' }}
      />
    )
  },
)
