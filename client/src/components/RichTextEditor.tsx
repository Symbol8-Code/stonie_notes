import { useRef, useCallback, useEffect } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}

type FormatType =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'bullet-list'
  | 'numbered-list'
  | 'checkbox'
  | 'code'
  | 'code-block'

/**
 * Wraps or prefixes the selected text in the textarea with markdown syntax.
 * Returns the new text value and cursor position.
 */
function applyFormat(
  text: string,
  selStart: number,
  selEnd: number,
  format: FormatType,
): { text: string; selStart: number; selEnd: number } {
  const before = text.slice(0, selStart)
  const selected = text.slice(selStart, selEnd)
  const after = text.slice(selEnd)

  switch (format) {
    case 'bold': {
      const wrapped = `**${selected}**`
      return {
        text: before + wrapped + after,
        selStart: selStart + 2,
        selEnd: selEnd + 2,
      }
    }
    case 'italic': {
      const wrapped = `*${selected}*`
      return {
        text: before + wrapped + after,
        selStart: selStart + 1,
        selEnd: selEnd + 1,
      }
    }
    case 'code': {
      const wrapped = `\`${selected}\``
      return {
        text: before + wrapped + after,
        selStart: selStart + 1,
        selEnd: selEnd + 1,
      }
    }
    case 'code-block': {
      const wrapped = `\n\`\`\`\n${selected}\n\`\`\`\n`
      return {
        text: before + wrapped + after,
        selStart: selStart + 5,
        selEnd: selEnd + 5,
      }
    }
    case 'heading': {
      // Find start of current line
      const lineStart = before.lastIndexOf('\n') + 1
      const linePrefix = text.slice(lineStart, selStart)
      // If already a heading, add another #
      if (linePrefix.startsWith('### ')) {
        // Max 3 levels, remove heading
        return {
          text: text.slice(0, lineStart) + linePrefix.slice(4) + selected + after,
          selStart: selStart - 4,
          selEnd: selEnd - 4,
        }
      }
      if (linePrefix.startsWith('## ')) {
        return {
          text: text.slice(0, lineStart) + '### ' + linePrefix.slice(3) + selected + after,
          selStart: selStart + 1,
          selEnd: selEnd + 1,
        }
      }
      if (linePrefix.startsWith('# ')) {
        return {
          text: text.slice(0, lineStart) + '## ' + linePrefix.slice(2) + selected + after,
          selStart: selStart + 1,
          selEnd: selEnd + 1,
        }
      }
      // Add heading
      return {
        text: text.slice(0, lineStart) + '# ' + linePrefix + selected + after,
        selStart: selStart + 2,
        selEnd: selEnd + 2,
      }
    }
    case 'bullet-list': {
      return prefixLines(text, selStart, selEnd, '- ')
    }
    case 'numbered-list': {
      return prefixLinesNumbered(text, selStart, selEnd)
    }
    case 'checkbox': {
      return prefixLines(text, selStart, selEnd, '- [ ] ')
    }
    default:
      return { text, selStart, selEnd }
  }
}

/** Prefix each line in the selection with a marker */
function prefixLines(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): { text: string; selStart: number; selEnd: number } {
  const before = text.slice(0, selStart)
  const after = text.slice(selEnd)

  // Find start of first selected line
  const lineStart = before.lastIndexOf('\n') + 1
  const textBeforeLines = text.slice(0, lineStart)
  const selectedWithPrefix = text.slice(lineStart, selEnd)

  const lines = selectedWithPrefix.split('\n')
  const prefixed = lines
    .map((line) => {
      if (line.startsWith(prefix)) {
        return line.slice(prefix.length)
      }
      return prefix + line
    })
    .join('\n')

  const newText = textBeforeLines + prefixed + after
  const lengthDiff = prefixed.length - selectedWithPrefix.length
  return {
    text: newText,
    selStart: selStart + (lines[0].startsWith(prefix) ? -prefix.length : prefix.length),
    selEnd: selEnd + lengthDiff,
  }
}

/** Prefix each line with incrementing numbers */
function prefixLinesNumbered(
  text: string,
  selStart: number,
  selEnd: number,
): { text: string; selStart: number; selEnd: number } {
  const lineStart = text.slice(0, selStart).lastIndexOf('\n') + 1
  const textBeforeLines = text.slice(0, lineStart)
  const selectedWithPrefix = text.slice(lineStart, selEnd)
  const after = text.slice(selEnd)

  const lines = selectedWithPrefix.split('\n')
  // Check if already numbered
  const isNumbered = /^\d+\.\s/.test(lines[0])

  const prefixed = lines
    .map((line, i) => {
      if (isNumbered) {
        return line.replace(/^\d+\.\s/, '')
      }
      return `${i + 1}. ${line}`
    })
    .join('\n')

  const newText = textBeforeLines + prefixed + after
  const lengthDiff = prefixed.length - selectedWithPrefix.length
  return {
    text: newText,
    selStart: selStart + (isNumbered ? -(lines[0].match(/^\d+\.\s/)?.[0].length ?? 0) : 3),
    selEnd: selEnd + lengthDiff,
  }
}

const TOOLBAR_ITEMS: { format: FormatType; label: string; icon: string; shortcut?: string }[] = [
  { format: 'bold', label: 'Bold', icon: 'B', shortcut: 'Ctrl+B' },
  { format: 'italic', label: 'Italic', icon: 'I', shortcut: 'Ctrl+I' },
  { format: 'heading', label: 'Heading', icon: 'H' },
  { format: 'bullet-list', label: 'Bullet List', icon: '•' },
  { format: 'numbered-list', label: 'Numbered List', icon: '1.' },
  { format: 'checkbox', label: 'Checkbox', icon: '☐' },
  { format: 'code', label: 'Inline Code', icon: '</>' },
  { format: 'code-block', label: 'Code Block', icon: '{ }' },
]

/**
 * Markdown-aware rich text editor.
 * Provides a toolbar and keyboard shortcuts for common formatting.
 * Stores content as plain Markdown text.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  autoFocus = false,
  className,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus()
    }
  }, [autoFocus])

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(80, el.scrollHeight) + 'px'
  }, [value])

  const doFormat = useCallback(
    (format: FormatType) => {
      const el = textareaRef.current
      if (!el) return
      const result = applyFormat(value, el.selectionStart, el.selectionEnd, format)
      onChange(result.text)
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(result.selStart, result.selEnd)
      })
    },
    [value, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ctrl = e.ctrlKey || e.metaKey

      if (ctrl && e.key === 'b') {
        e.preventDefault()
        doFormat('bold')
      } else if (ctrl && e.key === 'i') {
        e.preventDefault()
        doFormat('italic')
      } else if (ctrl && e.key === 'e') {
        e.preventDefault()
        doFormat('code')
      } else if (ctrl && e.shiftKey && e.key === 'X') {
        e.preventDefault()
        doFormat('checkbox')
      } else if (e.key === 'Tab') {
        // Insert two spaces instead of changing focus
        e.preventDefault()
        const el = textareaRef.current
        if (!el) return
        const start = el.selectionStart
        const end = el.selectionEnd
        const newValue = value.slice(0, start) + '  ' + value.slice(end)
        onChange(newValue)
        requestAnimationFrame(() => {
          el.focus()
          el.setSelectionRange(start + 2, start + 2)
        })
      }
    },
    [value, onChange, doFormat],
  )

  return (
    <div className={`rich-text-editor ${className ?? ''}`}>
      <div className="rte-toolbar">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.format}
            className="rte-toolbar-btn"
            onClick={() => doFormat(item.format)}
            title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
            type="button"
            tabIndex={-1}
          >
            <span className={`rte-toolbar-icon ${item.format === 'bold' ? 'rte-bold' : ''} ${item.format === 'italic' ? 'rte-italic' : ''}`}>
              {item.icon}
            </span>
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="rte-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
      />
    </div>
  )
}
