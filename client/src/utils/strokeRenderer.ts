import type { PenStroke } from '@/types/models'

/**
 * Draw a single stroke onto a canvas context.
 * Pressure-sensitive width: pressure 0..1 maps to 0.3x..1.5x base width.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: PenStroke) {
  const { points, color, width } = stroke
  if (points.length < 2) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const p = Math.max(curr.pressure, 0.1)
    ctx.lineWidth = width * (0.3 + p * 1.2)

    ctx.beginPath()
    ctx.moveTo(prev.x, prev.y)
    ctx.lineTo(curr.x, curr.y)
    ctx.stroke()
  }
}
