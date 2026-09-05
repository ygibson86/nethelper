import { useEffect, useRef } from 'react'
import { ConfigHighlight } from './ConfigHighlight'

export function EditableConfig({ value, onChange, highlight }: { value: string; onChange: (next: string) => void; highlight?: string }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <div className="tpl-editor-overlay">
      <div className="tpl-editor-backdrop" aria-hidden="true">
        <ConfigHighlight text={value} highlight={highlight} />
      </div>
      <textarea
        ref={textareaRef}
        className="tpl-editor-textarea"
        spellCheck={false}
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}