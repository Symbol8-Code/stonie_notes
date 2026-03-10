/**
 * API client for STonIE Notes backend.
 * See DESIGN.md Section 7.5 (API Design).
 *
 * All calls go through the Vite dev proxy (/api -> localhost:3000).
 */

import type { Card, Canvas, Board } from '@/types/models'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ── Cards ──────────────────────────────────────────

export function listCards(opts?: { status?: string }): Promise<Card[]> {
  const params = new URLSearchParams()
  if (opts?.status) params.set('status', opts.status)
  const qs = params.toString()
  return request(`/v1/cards${qs ? `?${qs}` : ''}`)
}

export function getCard(id: string): Promise<Card> {
  return request(`/v1/cards/${encodeURIComponent(id)}`)
}

export function createCard(data: Pick<Card, 'title' | 'bodyText' | 'source'>): Promise<Card> {
  return request('/v1/cards', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateCard(id: string, data: Partial<Card>): Promise<Card> {
  return request(`/v1/cards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function archiveCard(id: string): Promise<void> {
  return request(`/v1/cards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Boards ────────────────────────────────────────

export function listBoards(): Promise<Board[]> {
  return request('/v1/boards')
}

export function getBoard(id: string): Promise<Board> {
  return request(`/v1/boards/${encodeURIComponent(id)}`)
}

export function createBoard(data: { name: string; description: string }): Promise<Board> {
  return request('/v1/boards', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateBoard(id: string, data: Partial<Pick<Board, 'name' | 'description'>>): Promise<Board> {
  return request(`/v1/boards/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteBoard(id: string): Promise<void> {
  return request(`/v1/boards/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getBoardsForCard(cardId: string): Promise<Board[]> {
  return request(`/v1/boards/cards/${encodeURIComponent(cardId)}/boards`)
}

export function setBoardsForCard(cardId: string, boardIds: string[]): Promise<Board[]> {
  return request(`/v1/boards/cards/${encodeURIComponent(cardId)}/boards`, {
    method: 'PUT',
    body: JSON.stringify({ boardIds }),
  })
}

// ── Canvases ───────────────────────────────────────

export function listCanvases(): Promise<Canvas[]> {
  return request('/v1/canvases')
}

export function getCanvas(id: string): Promise<Canvas> {
  return request(`/v1/canvases/${encodeURIComponent(id)}`)
}

export function createCanvas(name: string): Promise<Canvas> {
  return request('/v1/canvases', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

// ── Canvas Interpretation ─────────────────────────

export interface CanvasInterpretation {
  /** For readText mode, contains the extracted handwritten text */
  text?: string
  description: string
  category: 'mindmap' | 'list' | 'diagram' | 'flowchart' | 'notes' | 'sketch' | 'table' | 'text' | 'other'
  items: Array<{
    item_id: string
    item: string
    x_position: number
    y_position: number
    width: number
    height: number
  }>
  relationships: Array<{
    relationship_id: string
    item_id: string
    related_item_id: string
    relationship_direction: 'from' | 'to'
    label?: string
    x_position: number
    y_position: number
    width: number
    height: number
  }>
  /** ID of the saved ai_extractions row, if persisted */
  extractionId?: string
}

export function interpretCanvas(canvasData: string, cardId?: string, mode?: 'interpret' | 'readText', blockId?: string): Promise<CanvasInterpretation> {
  return request('/v1/canvases/interpret', {
    method: 'POST',
    body: JSON.stringify({ canvasData, cardId, mode, blockId }),
  })
}

export interface AiExtraction {
  id: string
  sourceType: string
  sourceId: string
  extractionType: string
  result: CanvasInterpretation
  confidence: number | null
  createdAt: string
}

export function getExtractions(sourceId: string, prefix?: boolean): Promise<AiExtraction[]> {
  const params = new URLSearchParams({ sourceId })
  if (prefix) params.set('prefix', '1')
  return request(`/v1/extractions?${params}`)
}

// ── Legacy (existing prototype) ────────────────────

interface LegacyCanvasResult {
  message: string
  canvasId: string
}

export function saveLegacyCanvas(canvasData: string, canvasTitle: string): Promise<LegacyCanvasResult> {
  return request('/save-canvas', {
    method: 'POST',
    body: JSON.stringify({ canvasData, canvasTitle }),
  })
}

export function listLegacyCanvases(): Promise<Record<string, unknown>> {
  return request('/list-canvas')
}
