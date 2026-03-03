/**
 * Shared parsing, serialization, and migration logic for card content blocks.
 * Replaces duplicated parsers in CardEditor.tsx and InboxPage.tsx.
 *
 * Content blocks use semantic types ('heading' | 'body') where each block
 * can hold both text and drawing content simultaneously.
 */

import type { ContentBlock, LegacyContentBlock } from '@/types/models'

let blockIdCounter = 0

export function nextBlockId(): string {
  return `blk_${Date.now()}_${++blockIdCounter}`
}

/**
 * Create the default block set for a new card.
 */
export function defaultBlocks(): ContentBlock[] {
  return [
    { id: nextBlockId(), type: 'heading', textContent: '', drawingContent: '' },
    { id: nextBlockId(), type: 'body', textContent: '', drawingContent: '' },
  ]
}

/**
 * Parse bodyText (and optionally the legacy title field) into ContentBlock[].
 *
 * Detection strategy:
 *   1. JSON array with 'textContent' property → new format, return as-is
 *   2. JSON array with 'content' property → old block format, migrate
 *   3. data URL string → legacy pen card, single body block with drawingContent
 *   4. Plain text string → legacy keyboard card, single body block with textContent
 *   5. Empty → empty array
 *
 * The `title` parameter constructs a heading block during legacy migration.
 */
export function parseBlocks(
  bodyText: string,
  title?: string,
  source?: string,
): ContentBlock[] {
  if (!bodyText) {
    const heading = headingFromTitle(title)
    return heading ? [heading] : []
  }

  // Attempt JSON parse
  if (bodyText.startsWith('[')) {
    try {
      const parsed = JSON.parse(bodyText)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // New format: has 'textContent' field
        if ('textContent' in parsed[0]) {
          return parsed as ContentBlock[]
        }
        // Old format: has 'content' field
        if ('content' in parsed[0] && 'type' in parsed[0]) {
          return migrateLegacyBlocks(parsed as LegacyContentBlock[], title)
        }
      }
    } catch {
      // Fall through to legacy parsing
    }
  }

  // Legacy pen: entire bodyText is a data URL
  if (source === 'pen' && bodyText.startsWith('data:image/')) {
    const blocks: ContentBlock[] = []
    const heading = headingFromTitle(title)
    if (heading) blocks.push(heading)
    blocks.push({
      id: nextBlockId(),
      type: 'body',
      textContent: '',
      drawingContent: bodyText,
    })
    return blocks
  }

  // Legacy keyboard: plain Markdown text
  if (bodyText.trim()) {
    const blocks: ContentBlock[] = []
    const heading = headingFromTitle(title)
    if (heading) blocks.push(heading)
    blocks.push({
      id: nextBlockId(),
      type: 'body',
      textContent: bodyText,
      drawingContent: '',
    })
    return blocks
  }

  return []
}

function headingFromTitle(title: string | undefined): ContentBlock | null {
  if (!title) return null
  if (title.startsWith('data:image/')) {
    return { id: nextBlockId(), type: 'heading', textContent: '', drawingContent: title }
  }
  if (title.trim()) {
    return { id: nextBlockId(), type: 'heading', textContent: title, drawingContent: '' }
  }
  return null
}

/**
 * Migrate old-format blocks (type: 'text'|'drawing', content: string)
 * to new-format blocks (type: 'heading'|'body', textContent, drawingContent).
 */
function migrateLegacyBlocks(
  legacyBlocks: LegacyContentBlock[],
  title?: string,
): ContentBlock[] {
  const result: ContentBlock[] = []

  const heading = headingFromTitle(title)
  if (heading) result.push(heading)

  for (const block of legacyBlocks) {
    if (block.type === 'drawing') {
      result.push({
        id: block.id || nextBlockId(),
        type: 'body',
        textContent: '',
        drawingContent: block.content,
      })
    } else {
      result.push({
        id: block.id || nextBlockId(),
        type: 'body',
        textContent: block.content,
        drawingContent: '',
      })
    }
  }

  return result
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
    (b) => b.textContent.trim() !== '' || b.drawingContent !== '',
  )

  // Derive title from first heading block
  const firstHeading = nonEmpty.find((b) => b.type === 'heading')
  let title = 'Untitled'
  if (firstHeading) {
    if (firstHeading.textContent.trim()) {
      title = firstHeading.textContent.trim()
    } else if (firstHeading.drawingContent) {
      title = firstHeading.drawingContent
    }
  }

  // Determine dominant source
  const hasDrawing = nonEmpty.some((b) => b.drawingContent !== '')
  const hasText = nonEmpty.some((b) => b.textContent.trim() !== '')
  const source: 'keyboard' | 'pen' = hasDrawing && !hasText ? 'pen' : 'keyboard'

  const bodyText = nonEmpty.length === 0 ? '' : JSON.stringify(nonEmpty)

  return { title, bodyText, source }
}
