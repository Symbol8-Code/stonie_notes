/**
 * API client for STonIE Notes backend.
 * See DESIGN.md Section 7.5 (API Design).
 *
 * All calls go through the Vite dev proxy (/api -> localhost:3000).
 */

import type { Card, Canvas } from '@/types/models'

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

export function listCards(): Promise<Card[]> {
  return request('/v1/cards')
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
  description: string
  category: 'mindmap' | 'list' | 'diagram' | 'flowchart' | 'notes' | 'sketch' | 'table' | 'other'
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

export function interpretCanvas(canvasData: string, cardId?: string): Promise<CanvasInterpretation> {
  return request('/v1/canvases/interpret', {
    method: 'POST',
    body: JSON.stringify({ canvasData, cardId }),
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

export function getExtractions(sourceId: string): Promise<AiExtraction[]> {
  return request(`/v1/extractions?sourceId=${encodeURIComponent(sourceId)}`)
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
