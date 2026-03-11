import type { StrokeTool, LineStyle } from '@/types/models'

const PRESET_COLORS = [
  '#1a1a2e', // black (default)
  '#6b6b80', // dark gray
  '#4a6cf7', // blue
  '#dc2626', // red
  '#16a34a', // green
  '#ea580c', // orange
  '#7c3aed', // purple
  '#92400e', // brown
]

const PRESET_WIDTHS = [
  { value: 1, label: 'Thin', dotSize: 4 },
  { value: 3, label: 'Medium', dotSize: 8 },
  { value: 6, label: 'Thick', dotSize: 14 },
]

const PRESET_LINE_STYLES: { value: LineStyle; label: string; icon: string }[] = [
  { value: 'solid', label: 'Solid', icon: '───' },
  { value: 'dashed', label: 'Dashed', icon: '- - -' },
  { value: 'dotted', label: 'Dotted', icon: '···' },
]

interface DrawingPaletteProps {
  tool: StrokeTool
  color: string
  strokeWidth: number
  lineStyle: LineStyle
  canUndo?: boolean
  onToolChange: (tool: StrokeTool) => void
  onColorChange: (color: string) => void
  onStrokeWidthChange: (width: number) => void
  onLineStyleChange: (style: LineStyle) => void
  onUndo?: () => void
  onClear?: () => void
}

export function DrawingPalette({
  tool,
  color,
  strokeWidth,
  lineStyle,
  canUndo,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onLineStyleChange,
  onUndo,
  onClear,
}: DrawingPaletteProps) {
  const isEraser = tool === 'eraser'

  return (
    <div className="drawing-palette">
      {/* Tool selector */}
      <div className="drawing-palette-group">
        <button
          className={`drawing-palette-tool ${tool === 'pen' ? 'active' : ''}`}
          onClick={() => onToolChange('pen')}
          title="Pen tool"
          type="button"
        >
          Pen
        </button>
        <button
          className={`drawing-palette-tool ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => onToolChange('eraser')}
          title="Eraser tool"
          type="button"
        >
          Eraser
        </button>
        {onUndo && (
          <button
            className="drawing-palette-tool"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            type="button"
          >
            Undo
          </button>
        )}
      </div>

      <div className="drawing-palette-divider" />

      {/* Color swatches */}
      <div className={`drawing-palette-group ${isEraser ? 'drawing-palette-disabled' : ''}`}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={`drawing-palette-swatch ${color === c ? 'active' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => onColorChange(c)}
            title={c}
            type="button"
          />
        ))}
      </div>

      <div className="drawing-palette-divider" />

      {/* Width presets */}
      <div className={`drawing-palette-group ${isEraser ? 'drawing-palette-disabled' : ''}`}>
        {PRESET_WIDTHS.map((w) => (
          <button
            key={w.value}
            className={`drawing-palette-width ${strokeWidth === w.value ? 'active' : ''}`}
            onClick={() => onStrokeWidthChange(w.value)}
            title={w.label}
            type="button"
          >
            <span
              className="drawing-palette-width-dot"
              style={{ width: w.dotSize, height: w.dotSize }}
            />
          </button>
        ))}
      </div>

      <div className="drawing-palette-divider" />

      {/* Line style */}
      <div className={`drawing-palette-group ${isEraser ? 'drawing-palette-disabled' : ''}`}>
        {PRESET_LINE_STYLES.map((ls) => (
          <button
            key={ls.value}
            className={`drawing-palette-style ${lineStyle === ls.value ? 'active' : ''}`}
            onClick={() => onLineStyleChange(ls.value)}
            title={ls.label}
            type="button"
          >
            {ls.icon}
          </button>
        ))}
      </div>

      {onClear && (
        <>
          <div className="drawing-palette-divider" />
          <div className="drawing-palette-group">
            <button
              className="drawing-palette-tool drawing-palette-clear"
              onClick={() => {
                if (window.confirm('Clear all strokes on this canvas?')) {
                  onClear()
                }
              }}
              title="Clear canvas"
              type="button"
            >
              Clear
            </button>
          </div>
        </>
      )}
    </div>
  )
}
