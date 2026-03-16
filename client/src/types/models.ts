/**
 * Core data models for STonIE Notes.
 * See DESIGN.md Section 2.2 (Everything is a Card) and Section 7.4 (Database Schema).
 */

export type CardSource = 'pen' | 'keyboard' | 'photo' | 'voice' | 'ai_extracted' | 'integration'
export type CardStatus = 'open' | 'in_progress' | 'done' | 'archived'
export type BoardType = 'kanban' | 'list' | 'timeline' | 'custom'
export type StrokeTool = 'pen' | 'highlighter' | 'eraser' | 'lasso'
export type LineStyle = 'solid' | 'dashed' | 'dotted'
export type InputMode = 'pen' | 'touch' | 'mouse' | 'keyboard'

export interface Card {
  id: string
  workspaceId: string
  title: string
  bodyText: string
  source: CardSource
  status: CardStatus
  tags: Tag[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Board {
  id: string
  workspaceId: string
  name: string
  description: string
  boardType: BoardType
  lanes: Lane[]
  cards: Card[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Lane {
  id: string
  boardId: string
  name: string
  position: number
  color: string
  cards: Card[]
}

export interface Canvas {
  id: string
  workspaceId: string
  name: string
  createdBy: string
  createdAt: string
}

export interface StrokePoint {
  x: number
  y: number
  pressure: number
  tiltX: number
  tiltY: number
  timestamp: number
}

/** A single pen stroke captured by PenCanvas. Lightweight version for card storage. */
export interface PenStroke {
  points: StrokePoint[]
  color: string
  width: number
  lineStyle?: LineStyle
}

export interface Stroke {
  id: string
  canvasId: string
  userId: string
  points: StrokePoint[]
  color: string
  width: number
  tool: StrokeTool
  createdAt: string
}

export interface Tag {
  id: string
  workspaceId: string
  name: string
  path: string
  color: string
}

/** Semantic section type. Extensible — add more types here as needed. */
export type SectionType = 'heading' | 'body'

/** The kind of content a sub-block variation holds */
export type VariationType = 'strokes' | 'readText' | 'interpret' | 'meetingNotes'

/**
 * One rendered form of a sub-block: the original pen strokes, or an
 * AI-produced interpretation.  Only the field matching `type` is populated.
 */
export interface SubBlockVariation {
  id: string
  type: VariationType
  /** Original pen strokes (type === 'strokes') */
  strokes?: PenStroke[]
  /** Extracted handwritten text as Markdown (type === 'readText') */
  markdown?: string
  /** Visual interpretation — items & relationships (type === 'interpret') */
  interpretation?: unknown
  /** Structured meeting notes (type === 'meetingNotes') */
  meetingNotes?: unknown
  createdAt: string
}

/**
 * A grouped set of strokes extracted from the canvas via lasso selection.
 * Lives inside a ContentBlock at a specific canvas position and supports
 * multiple variations (original pen, interpreted text, visual, etc.).
 */
export interface SubBlock {
  id: string
  /** Position in logical (un-zoomed) canvas coordinates */
  x: number
  y: number
  width: number
  height: number
  /** Index 0 is always the original strokes variation */
  variations: SubBlockVariation[]
  activeVariationIndex: number
}

/**
 * A content section within a card.
 * Each section has a semantic type and can hold BOTH text and drawing content.
 */
export interface ContentBlock {
  id: string
  type: SectionType
  /** Keyboard-entered text: plain text for headings, Markdown for body sections */
  textContent: string
  /** Stroke data from pen input. Empty array if no drawing. */
  drawingContent: PenStroke[]
  /** Sub-blocks extracted from this canvas section */
  subBlocks?: SubBlock[]
}

/** Returns true if the block has any drawing content */
export function hasDrawing(dc: PenStroke[]): boolean {
  return dc.length > 0
}

export interface Workspace {
  id: string
  name: string
  ownerId: string
  createdAt: string
}
