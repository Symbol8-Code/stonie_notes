import type { PenStroke } from '@/types/models'

/**
 * Draw a single stroke onto a canvas context.
 * Pressure-sensitive width: pressure 0..1 maps to 0.3x..1.5x base width.
 * Supports solid, dashed, and dotted line styles.
 */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: PenStroke) {
  const { points, color, width, lineStyle = 'solid' } = stroke
  if (points.length < 2) return

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color

  if (lineStyle === 'solid') {
    // Fast path: draw each segment individually with pressure-based width
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
    return
  }

  // Dashed / dotted: arc-length-based pattern rendering
  const [dashOn, dashOff] = lineStyle === 'dashed' ? [8, 6] : [2, 4]
  let drawing = true
  let remaining = dashOn * width

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const dx = curr.x - prev.x
    const dy = curr.y - prev.y
    const segLen = Math.hypot(dx, dy)
    if (segLen === 0) continue

    const p = Math.max(curr.pressure, 0.1)
    ctx.lineWidth = width * (0.3 + p * 1.2)

    let consumed = 0
    while (consumed < segLen) {
      const step = Math.min(remaining, segLen - consumed)
      const t0 = consumed / segLen
      const t1 = (consumed + step) / segLen
      const x0 = prev.x + dx * t0
      const y0 = prev.y + dy * t0
      const x1 = prev.x + dx * t1
      const y1 = prev.y + dy * t1

      if (drawing) {
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()
      }

      consumed += step
      remaining -= step
      if (remaining <= 0) {
        drawing = !drawing
        remaining = (drawing ? dashOn : dashOff) * width
      }
    }
  }
}
