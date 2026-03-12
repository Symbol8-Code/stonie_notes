/**
 * Shared parsing, serialization, and migration logic for card content blocks.
 *
 * Content blocks use semantic types ('heading' | 'body') where each block
 * can hold both text and drawing content simultaneously.
 */

import type { ContentBlock, PenStroke, SubBlock, SubBlockVariation } from '@/types/models'
import { hasDrawing } from '@/types/models'

let blockIdCounter = 0

export function nextBlockId(): string {
  return `blk_${Date.now()}_${++blockIdCounter}`
}

let subBlockIdCounter = 0

export function nextSubBlockId(): string {
  return `sb_${Date.now()}_${++subBlockIdCounter}`
}

let variationIdCounter = 0

export function nextVariationId(): string {
  return `var_${Date.now()}_${++variationIdCounter}`
}

/**
 * Compute axis-aligned bounding box for an array of strokes.
 * Returns position and dimensions with padding.
 */
export function computeStrokeBounds(strokes: PenStroke[], padding = 10): { x: number; y: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 40),
    height: Math.max(maxY - minY + padding * 2, 40),
  }
}

/**
 * Create a SubBlock from extracted lasso strokes.
 * The strokes become the first (index 0) variation.
 */
export function createSubBlockFromStrokes(strokes: PenStroke[]): SubBlock {
  const bounds = computeStrokeBounds(strokes)
  const variation: SubBlockVariation = {
    id: nextVariationId(),
    type: 'strokes',
    strokes: strokes.map(s => ({
      ...s,
      points: s.points.map(p => ({ ...p })),
    })),
    createdAt: new Date().toISOString(),
  }
  return {
    id: nextSubBlockId(),
    ...bounds,
    variations: [variation],
    activeVariationIndex: 0,
  }
}

/**
 * Create the default block set for a new card.
 */
export function defaultBlocks(): ContentBlock[] {
  return [
    { id: nextBlockId(), type: 'heading', textContent: '', drawingContent: [] },
    { id: nextBlockId(), type: 'body', textContent: '', drawingContent: [] },
  ]
}

/**
 * Parse bodyText (and optionally the title field) into ContentBlock[].
 *
 * Detection strategy:
 *   1. JSON array with 'textContent' property → current format, return as-is
 *   2. Plain text string → keyboard card, single body block with textContent
 *   3. Empty → empty array
 *
 * The `title` parameter constructs a heading block when bodyText is plain text.
 */
export function parseBlocks(
  bodyText: string,
  title?: string,
): ContentBlock[] {
  if (!bodyText) {
    const heading = headingFromTitle(title)
    return heading ? [heading] : []
  }

  // Attempt JSON parse
  if (bodyText.startsWith('[')) {
    try {
      const parsed = JSON.parse(bodyText)
      if (Array.isArray(parsed) && parsed.length > 0 && 'textContent' in parsed[0]) {
        return parsed as ContentBlock[]
      }
    } catch {
      // Fall through to plain text
    }
  }

  // Plain Markdown text
  if (bodyText.trim()) {
    const blocks: ContentBlock[] = []
    const heading = headingFromTitle(title)
    if (heading) blocks.push(heading)
    blocks.push({
      id: nextBlockId(),
      type: 'body',
      textContent: bodyText,
      drawingContent: [],
    })
    return blocks
  }

  return []
}

function headingFromTitle(title: string | undefined): ContentBlock | null {
  if (!title?.trim()) return null
  return { id: nextBlockId(), type: 'heading', textContent: title, drawingContent: [] }
}

export interface SerializedCard {
  title: string
  bodyText: string
  source: 'keyboard' | 'pen'
}

/**
 * Serialize ContentBlock[] for storage.
 * Derives `title` from the first heading block's textContent.
 * Always outputs JSON in bodyText.
 */
export function serializeBlocks(blocks: ContentBlock[]): SerializedCard {
  const nonEmpty = blocks.filter(
    (b) => b.textContent.trim() !== '' || hasDrawing(b.drawingContent),
  )

  // Derive title from first heading block's text
  const firstHeading = nonEmpty.find((b) => b.type === 'heading')
  let title = 'Untitled'
  if (firstHeading?.textContent.trim()) {
    title = firstHeading.textContent.trim()
  }

  // Determine dominant source
  const hasDrawingContent = nonEmpty.some((b) => hasDrawing(b.drawingContent))
  const hasText = nonEmpty.some((b) => b.textContent.trim() !== '')
  const source: 'keyboard' | 'pen' = hasDrawingContent && !hasText ? 'pen' : 'keyboard'

  const bodyText = nonEmpty.length === 0 ? '' : JSON.stringify(nonEmpty)

  return { title, bodyText, source }
}
