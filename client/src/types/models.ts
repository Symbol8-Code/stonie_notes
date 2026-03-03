/**
 * Core data models for STonIE Notes.
 * See DESIGN.md Section 2.2 (Everything is a Card) and Section 7.4 (Database Schema).
 */

export type CardSource = 'pen' | 'keyboard' | 'photo' | 'voice' | 'ai_extracted' | 'integration'
export type CardStatus = 'open' | 'in_progress' | 'done' | 'archived'
export type BoardType = 'kanban' | 'list' | 'timeline' | 'custom'
export type StrokeTool = 'pen' | 'highlighter' | 'eraser'
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
  boardType: BoardType
  lanes: Lane[]
  createdBy: string
  createdAt: string
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
