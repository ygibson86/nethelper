import { Copy, FileCode2, Pencil, Plus, Search, Trash2, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Layout'
import { ConfigHighlight } from '../components/ConfigHighlight'
import { EditableConfig } from '../components/EditableConfig'
import { useNetHelper } from '../store'
import type { ConfigTemplate } from '../types'

const vendors: { value: 'eltex' | 'cisco'; label: string }[] = [
  { value: 'eltex', label: 'Eltex' },
  { value: 'cisco', label: 'Cisco' },
]

function EditorModal({ template, onClose }: { template: ConfigTemplate | null; onClose: () => void }) {
  const store = useNetHelper()
  const [vendor, setVendor] = useState<'eltex' | 'cisco'>(template?.vendor ?? 'eltex')
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [body, setBody] = useState(template?.body ?? '')
  const [titleError, setTitleError] = useState('')

  const save = () => {
    if (!title.trim()) {
      setTitleError('Укажите заголовок шаблона.')
      return
    }
    const payload = {
      vendor,
      title: title.trim(),
      description: description.trim(),
      body,
    }
    if (template) store.updateConfigTemplate(template.id, payload)
    else store.addConfigTemplate(payload)
    onClose()
  }

  return <Modal title={template ? 'Править шаблон' : 'Новый шаблон'} onClose={onClose} className="tpl-editor-modal">
    <form className="tpl-editor" onSubmit={(event) => { event.preventDefault(); save() }}>
      <div className="tpl-editor-fields">
        <label>Вендор
          <div className="segmented">
            {vendors.map((vendorItem) => <button type="button" aria-pressed={vendor === vendorItem.value} key={vendorItem.value} className={vendor === vendorItem.value ? 'active' : ''} onClick={() => setVendor(vendorItem.value)}>{vendorItem.label}</button>)}
          </div>
        </label>
        <label>Заголовок<input required aria-invalid={Boolean(titleError)} aria-describedby={titleError ? 'template-title-error' : undefined} value={title} placeholder="Например, Access-порт" onChange={(event) => { setTitle(event.target.value); setTitleError('') }} />{titleError && <span id="template-title-error" className="field-error" role="alert">{titleError}</span>}</label>
        <label>Описание<input value={description} placeholder="Краткое описание шаблона" onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Текст шаблона
          <textarea rows={14} className="tpl-body-input" spellCheck={false} value={body} onChange={(event) => setBody(event.target.value)} placeholder={'conf t\n!\ninterface GigabitEthernet1/0/14\n...'} />
        </label>
      </div>

      <div className="tpl-toolbar">
        <button type="submit" className="button primary"><Check size={16} /> Сохранить</button>
        <button type="button" className="button" onClick={onClose}><X size={16} /> Отмена</button>
      </div>
    </form>
  </Modal>
}

function ViewCard({ template, highlight, onEdit, editing, onEditingChange }: { template: ConfigTemplate; highlight: string; onEdit: () => void; editing: boolean; onEditingChange: (value: boolean) => void }) {
  const store = useNetHelper()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [draft, setDraft] = useState(template.body)

  const enterEdit = () => {
    setDraft(template.body)
    onEditingChange(true)
  }

  const saveAndCopy = async () => {
    if (draft !== template.body) store.updateConfigTemplate(template.id, { body: draft })
    try {
      await navigator.clipboard.writeText(draft)
      setCopyError('')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError('Не удалось скопировать конфигурацию. Разрешите доступ к буферу обмена.')
    }
    onEditingChange(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template.body)
      setCopyError('')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyError('Не удалось скопировать конфигурацию. Разрешите доступ к буферу обмена.')
    }
  }

  return <section className="tpl-view">
    <div className="tpl-view-head">
      <div>
        <div className="tpl-vendor-badge">{template.vendor === 'eltex' ? 'Eltex' : 'Cisco'}</div>
        <h2>{template.title}</h2>
        {template.description && <p className="page-subtitle">{template.description}</p>}
      </div>
      <div className="tpl-view-actions">
        <button className="button" onClick={onEdit} disabled={editing}><Pencil size={16} /> Изменить</button>
        <button className="button danger-button" onClick={() => confirm('Удалить шаблон?') && store.deleteConfigTemplate(template.id)} disabled={editing}><Trash2 size={16} /> Удалить</button>
      </div>
    </div>

    <div className="tpl-output">
      <div className="tpl-output-head">
        <strong>Конфигурация <span className="tpl-hint">двойной клик — правка</span></strong>
        <button className="button primary" onClick={editing ? saveAndCopy : copy}>{editing ? <Check size={16} /> : copied ? <Check size={16} /> : <Copy size={16} />} {editing ? 'Сохранить' : copied ? 'Скопировано' : 'Копировать'}</button>
        <span className="sr-status" aria-live="polite">{copied ? 'Конфигурация скопирована' : ''}</span>
      </div>
      {copyError && <p className="field-error" role="alert">{copyError}</p>}
      {editing ? (
        <div className="tpl-inline-edit" onKeyDown={(event) => { if (event.key === 'Escape') onEditingChange(false) }}>
          <EditableConfig value={draft} onChange={setDraft} highlight={highlight} />
        </div>
      ) : (
        <div onDoubleClick={enterEdit} onKeyDown={(event) => { if (event.key === 'Enter') enterEdit() }} tabIndex={0} role="button" aria-label="Редактировать конфигурацию" className="tpl-config-wrap" title="Двойной клик для правки">
          <ConfigHighlight text={template.body} highlight={highlight} />
        </div>
      )}
    </div>
  </section>
}

export function TemplatesPage() {
  const templates = useNetHelper((state) => state.configTemplates)
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState<'all' | 'eltex' | 'cisco'>('all')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; template: ConfigTemplate | null } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates
      .filter((template) => {
        if (vendor !== 'all' && template.vendor !== vendor) return false
        if (!q) return true
        return template.title.toLowerCase().includes(q)
          || template.description.toLowerCase().includes(q)
          || template.body.toLowerCase().includes(q)
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }, [templates, query, vendor])
  const active = filtered.find((template) => template.id === activeId) ?? filtered[0] ?? null

  return <div className="templates-page">
    <header className="page-header"><div><p className="eyebrow">Библиотека</p><h1>Шаблоны</h1><p className="page-subtitle">Готовые конфигурации Cisco и Eltex для копирования</p></div></header>

    <div className="templates-layout">
      <aside className="templates-sidebar">
        <div className="templates-toolbar">
          <div className="search-box"><Search size={16} /><input disabled={Boolean(inlineEditId)} aria-label="Поиск по шаблонам" placeholder="Поиск по шаблонам..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="segmented">
            <button disabled={Boolean(inlineEditId)} aria-pressed={vendor === 'all'} className={vendor === 'all' ? 'active' : ''} onClick={() => setVendor('all')}>Все</button>
            <button disabled={Boolean(inlineEditId)} aria-pressed={vendor === 'eltex'} className={vendor === 'eltex' ? 'active' : ''} onClick={() => setVendor('eltex')}>Eltex</button>
            <button disabled={Boolean(inlineEditId)} aria-pressed={vendor === 'cisco'} className={vendor === 'cisco' ? 'active' : ''} onClick={() => setVendor('cisco')}>Cisco</button>
          </div>
          <button className="button primary" onClick={() => setEditor({ mode: 'create', template: null })}><Plus size={16} /> Новый шаблон</button>
        </div>

        <div className="templates-list">
          {filtered.map((template) => (
            <button key={template.id} className={`tpl-item ${active?.id === template.id ? 'active' : ''} ${inlineEditId && inlineEditId !== template.id ? 'disabled' : ''}`} onClick={() => { if (inlineEditId) return; setActiveId(template.id) }}>
              <span className="tpl-item-top"><span className="tpl-vendor-badge small">{template.vendor === 'eltex' ? 'Eltex' : 'Cisco'}</span></span>
              <strong>{template.title}</strong>
              {template.description && <span className="tpl-item-desc">{template.description}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="tpl-empty">Ничего не найдено.</p>}
        </div>
      </aside>

      {active ? (
        <ViewCard key={active.id} template={active} highlight={query.trim()} onEdit={() => setEditor({ mode: 'edit', template: active })} editing={inlineEditId === active.id} onEditingChange={(value) => setInlineEditId(value ? active.id : null)} />
      ) : (
        <section className="tpl-view tpl-empty-state">
          <FileCode2 size={40} />
          <h2>Нет шаблонов</h2>
          <p>Создайте первый шаблон конфигурации, нажав «Новый шаблон».</p>
        </section>
      )}
    </div>

    {editor && (
      <EditorModal template={editor.mode === 'edit' ? editor.template : null} onClose={() => setEditor(null)} />
    )}
  </div>
}
