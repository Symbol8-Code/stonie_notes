interface MarkdownPreviewProps {
  content: string
  className?: string
  /** Truncate to this many lines (for card list previews) */
  maxLines?: number
}

/**
 * Lightweight Markdown renderer for card content.
 * Handles: bold, italic, headings, bullet/numbered lists, checkboxes, code blocks, inline code.
 * No external dependencies — intentionally minimal.
 */
export function MarkdownPreview({ content, className, maxLines }: MarkdownPreviewProps) {
  const html = renderMarkdown(content)
  return (
    <div
      className={`md-preview ${className ?? ''} ${maxLines ? 'md-preview-truncated' : ''}`}
      style={maxLines ? { WebkitLineClamp: maxLines } : undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderInline(text: string): string {
  let result = escapeHtml(text)
  // Inline code (before bold/italic so backticks aren't processed)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')
  return result
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n')
  const output: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Code block
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]))
        i++
      }
      i++ // skip closing ```
      output.push(`<pre><code>${codeLines.join('\n')}</code></pre>`)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      output.push(`<h${level + 1}>${renderInline(headingMatch[2])}</h${level + 1}>`)
      i++
      continue
    }

    // Checkbox list item
    if (line.match(/^[-*]\s+\[[ xX]\]\s/)) {
      const listItems: string[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+\[[ xX]\]\s/)) {
        const m = lines[i].match(/^[-*]\s+\[([ xX])\]\s(.*)/)!
        const checked = m[1] !== ' '
        listItems.push(
          `<li class="md-checkbox"><input type="checkbox" disabled ${checked ? 'checked' : ''}/> ${renderInline(m[2])}</li>`,
        )
        i++
      }
      output.push(`<ul class="md-checklist">${listItems.join('')}</ul>`)
      continue
    }

    // Unordered list
    if (line.match(/^[-*]\s+/)) {
      const listItems: string[] = []
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        listItems.push(`<li>${renderInline(lines[i].replace(/^[-*]\s+/, ''))}</li>`)
        i++
      }
      output.push(`<ul>${listItems.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const listItems: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        listItems.push(`<li>${renderInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`)
        i++
      }
      output.push(`<ol>${listItems.join('')}</ol>`)
      continue
    }

    // Regular paragraph
    output.push(`<p>${renderInline(line)}</p>`)
    i++
  }

  return output.join('')
}
