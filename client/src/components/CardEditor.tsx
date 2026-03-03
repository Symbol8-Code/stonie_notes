import { useState, useRef, useEffect, useCallback } from 'react'
import { PenCanvas } from '@/components/PenCanvas'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useInputModeContext } from '@/contexts/InputModeContext'
import type { PenCanvasHandle } from '@/components/PenCanvas'
import type { Card } from '@/types/models'

type EditorMode = 'keyboard' | 'pen'

export interface CardEditorSaveData {
  title: string
  bodyText: string
  source: 'keyboard' | 'pen'
  /** Body drawing exported as PNG data URL (pen mode) */
  imageDataUrl?: string
  /** Title drawing exported as PNG data URL (pen mode) */
  titleImageDataUrl?: string
}

interface CardEditorProps {
  onSave: (data: CardEditorSaveData) => void
  onCancel: () => void
  /** Called on each change for auto-save (debounced by parent) */
  onAutoSave?: (data: CardEditorSaveData) => void
  /** If provided, editing an existing card */
  card?: Card
}

/**
 * Inline card editor for creating/editing notes.
 * Supports two modes:
 *   - keyboard: text title + rich text Markdown body
 *   - pen: drawing canvas title + drawing canvas body
 *
 * The mode defaults based on the detected inputMode (from context) but can be toggled.
 * Ctrl/Cmd+Enter saves, Escape cancels.
 */
export function CardEditor({ onSave, onCancel, onAutoSave, card }: CardEditorProps) {
  const { mode: inputMode } = useInputModeContext()
  const initialMode: EditorMode = inputMode === 'pen' ? 'pen' : 'keyboard'
  const [mode, setMode] = useState<EditorMode>(initialMode)
  const [title, setTitle] = useState(card?.title ?? '')
  const [bodyText, setBodyText] = useState(card?.bodyText ?? '')
  const titleRef = useRef<HTMLInputElement>(null)
  const titlePenRef = useRef<PenCanvasHandle>(null)
  const bodyPenRef = useRef<PenCanvasHandle>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (mode === 'keyboard') {
      titleRef.current?.focus()
    }
  }, [mode])

  // Debounced auto-save on content change
  useEffect(() => {
    if (!onAutoSave || mode !== 'keyboard') return
    if (!title.trim() && !bodyText.trim()) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = setTimeout(() => {
      onAutoSave({
        title: title.trim() || 'Untitled',
        bodyText: bodyText.trim(),
        source: 'keyboard',
      })
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [title, bodyText, onAutoSave, mode])

  const handleSave = useCallback(() => {
    if (mode === 'pen') {
      const hasTitleDrawing = titlePenRef.current?.hasContent()
      const hasBodyDrawing = bodyPenRef.current?.hasContent()
      if (!hasTitleDrawing && !hasBodyDrawing) return
      onSave({
        title: 'Pen Note',
        bodyText: '',
        source: 'pen',
        titleImageDataUrl: hasTitleDrawing ? titlePenRef.current?.toDataURL() : undefined,
        imageDataUrl: hasBodyDrawing ? bodyPenRef.current?.toDataURL() : undefined,
      })
    } else {
      const trimmedTitle = title.trim()
      if (!trimmedTitle && !bodyText.trim()) return
      onSave({
        title: trimmedTitle || 'Untitled',
        bodyText: bodyText.trim(),
        source: 'keyboard',
      })
    }
  }, [mode, title, bodyText, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSave()
      }
    },
    [onCancel, handleSave],
  )

  const handleClearTitle = useCallback(() => {
    titlePenRef.current?.clear()
  }, [])

  const handleClearBody = useCallback(() => {
    bodyPenRef.current?.clear()
  }, [])

  return (
    <div className="card-editor" onKeyDown={handleKeyDown}>
      <div className="card-editor-mode-toggle">
        <button
          className={`btn-mode ${mode === 'keyboard' ? 'active' : ''}`}
          onClick={() => setMode('keyboard')}
          title="Type with keyboard"
        >
          Keyboard
        </button>
        <button
          className={`btn-mode ${mode === 'pen' ? 'active' : ''}`}
          onClick={() => setMode('pen')}
          title="Draw with pen"
        >
          Pen
        </button>
      </div>

      {mode === 'keyboard' ? (
        <>
          <input
            ref={titleRef}
            className="card-editor-title"
            type="text"
            placeholder="Note title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <RichTextEditor
            value={bodyText}
            onChange={setBodyText}
            placeholder="Write something... (supports Markdown)"
          />
        </>
      ) : (
        <>
          <label className="pen-canvas-label">Title</label>
          <div className="pen-canvas-wrapper">
            <PenCanvas ref={titlePenRef} className="pen-canvas-title" />
            <button
              className="pen-canvas-clear"
              onClick={handleClearTitle}
              title="Clear title"
            >
              Clear
            </button>
          </div>

          <label className="pen-canvas-label">Body</label>
          <div className="pen-canvas-wrapper">
            <PenCanvas ref={bodyPenRef} />
            <button
              className="pen-canvas-clear"
              onClick={handleClearBody}
              title="Clear body"
            >
              Clear
            </button>
          </div>
        </>
      )}

      <div className="card-editor-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          Save <kbd>Ctrl+Enter</kbd>
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
