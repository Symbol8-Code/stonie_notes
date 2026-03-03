import { useRef, useEffect, useCallback } from 'react'
import type { PenStroke } from '@/types/models'
import { drawStroke } from '@/utils/strokeRenderer'

interface StrokePreviewProps {
  strokes: PenStroke[]
  className?: string
}

/**
 * Read-only canvas that renders PenStroke[] data.
 * Computes a bounding box of all stroke points and scales/translates
 * the drawing to fit the canvas width.
 */
export function StrokePreview({ strokes, className }: StrokePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || strokes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Compute bounding box of all stroke points
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const stroke of strokes) {
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
    }

    const maxStrokeWidth = Math.max(...strokes.map((s) => s.width)) * 1.5
    const padding = maxStrokeWidth + 2
    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2

    // Scale to fit the container width
    const rect = canvas.getBoundingClientRect()
    const displayW = rect.width || contentW
    const scale = displayW / contentW
    const displayH = contentH * scale

    const dpr = window.devicePixelRatio || 1
    canvas.width = displayW * dpr
    canvas.height = displayH * dpr
    canvas.style.height = `${displayH}px`
    ctx.scale(dpr * scale, dpr * scale)

    // Translate so strokes are positioned from the bounding box origin
    ctx.translate(-minX + padding, -minY + padding)

    for (const stroke of strokes) {
      drawStroke(ctx, stroke)
    }
  }, [strokes])

  useEffect(() => {
    draw()
    const observer = new ResizeObserver(draw)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [draw])

  if (strokes.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      className={`stroke-preview ${className ?? ''}`}
      style={{ width: '100%', display: 'block' }}
    />
  )
}
