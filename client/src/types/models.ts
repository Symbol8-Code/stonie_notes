/**
 * Core data models for STonIE Notes.
 * See DESIGN.md Section 2.2 (Everything is a Card) and Section 7.4 (Database Schema).
 */

export type CardSource = 'pen' | 'keyboard' | 'photo' | 'voice' | 'ai_extracted' | 'integration'
export type CardStatus = 'open' | 'in_progress' | 'done' | 'archived'
export type BoardType = 'kanban' | 'list' | 'timeline' | 'custom'
export type StrokeTool = 'pen' | 'highlighter' | 'eraser'
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

/**
 * A content block within a card body.
 * Cards store an array of blocks, allowing interleaved text and drawing areas (Notion-style).
 */
export interface ContentBlock {
  id: string
  type: 'text' | 'drawing'
  /** Markdown for text blocks, PNG data URL for drawing blocks */
  content: string
}

export interface Workspace {
  id: string
  name: string
  ownerId: string
  createdAt: string
}
