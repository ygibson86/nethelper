import { Copy, FileCode2, Pencil, Plus, Search, Trash2, Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Modal } from '../components/Layout'
import { ConfigHighlight } from '../components/ConfigHighlight'
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

  const save = () => {
    if (!title.trim()) return
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
    <div className="tpl-editor">
      <div className="tpl-editor-fields">
        <label>Вендор
          <div className="segmented">
            {vendors.map((vendorItem) => <button key={vendorItem.value} className={vendor === vendorItem.value ? 'active' : ''} onClick={() => setVendor(vendorItem.value)}>{vendorItem.label}</button>)}
          </div>
        </label>
        <label>Заголовок<input value={title} placeholder="Например, Access-порт" onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Описание<input value={description} placeholder="Краткое описание шаблона" onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Текст шаблона
          <textarea rows={14} className="tpl-body-input" spellCheck={false} value={body} onChange={(event) => setBody(event.target.value)} placeholder={'conf t\n!\ninterface GigabitEthernet1/0/14\n...'} />
        </label>
      </div>

      <div className="tpl-toolbar">
        <button className="button primary" onClick={save}><Check size={16} /> Сохранить</button>
        <button className="button" onClick={onClose}><X size={16} /> Отмена</button>
      </div>
    </div>
  </Modal>
}

function ViewCard({ template, highlight, onEdit }: { template: ConfigTemplate; highlight: string; onEdit: () => void }) {
  const store = useNetHelper()
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(template.body)

  const enterEdit = () => {
    setDraft(template.body)
    setEditing(true)
  }

  const saveEdit = () => {
    if (draft !== template.body) store.updateConfigTemplate(template.id, { body: draft })
    setEditing(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template.body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
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
        <button className="button" onClick={onEdit}><Pencil size={16} /> Изменить</button>
        <button className="button danger-button" onClick={() => confirm('Удалить шаблон?') && store.deleteConfigTemplate(template.id)}><Trash2 size={16} /> Удалить</button>
      </div>
    </div>

    <div className="tpl-output">
      <div className="tpl-output-head">
        <strong>Конфигурация <span className="tpl-hint">двойной клик — правка</span></strong>
        <button className="button primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Скопировано' : 'Копировать'}</button>
      </div>
      {editing ? (
        <div className="tpl-inline-edit">
          <textarea
            className="tpl-edit-input"
            spellCheck={false}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="tpl-inline-actions">
            <button className="button primary" onClick={saveEdit}><Check size={16} /> Сохранить</button>
            <button className="button" onClick={() => setEditing(false)}><X size={16} /> Отмена</button>
          </div>
        </div>
      ) : (
        <div onDoubleClick={enterEdit} className="tpl-config-wrap" title="Двойной клик для правки">
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
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; template: ConfigTemplate | null } | null>(null)

  const active = templates.find((template) => template.id === activeId) ?? templates[0] ?? null

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
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [templates, query, vendor])

  return <div className="templates-page">
    <header className="page-header"><div><p className="eyebrow">Библиотека</p><h1>Шаблоны</h1><p className="page-subtitle">Готовые конфигурации Cisco и Eltex для копирования</p></div></header>

    <div className="templates-layout">
      <aside className="templates-sidebar">
        <div className="templates-toolbar">
          <div className="search-box"><Search size={16} /><input placeholder="Поиск по шаблонам..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="segmented">
            <button className={vendor === 'all' ? 'active' : ''} onClick={() => setVendor('all')}>Все</button>
            <button className={vendor === 'eltex' ? 'active' : ''} onClick={() => setVendor('eltex')}>Eltex</button>
            <button className={vendor === 'cisco' ? 'active' : ''} onClick={() => setVendor('cisco')}>Cisco</button>
          </div>
          <button className="button primary" onClick={() => setEditor({ mode: 'create', template: null })}><Plus size={16} /> Новый шаблон</button>
        </div>

        <div className="templates-list">
          {filtered.map((template) => (
            <button key={template.id} className={`tpl-item ${active?.id === template.id ? 'active' : ''}`} onClick={() => setActiveId(template.id)}>
              <span className="tpl-item-top"><span className="tpl-vendor-badge small">{template.vendor === 'eltex' ? 'Eltex' : 'Cisco'}</span><span className="tpl-item-date">{new Date(template.updatedAt).toLocaleDateString()}</span></span>
              <strong>{template.title}</strong>
              {template.description && <span className="tpl-item-desc">{template.description}</span>}
            </button>
          ))}
          {filtered.length === 0 && <p className="tpl-empty">Ничего не найдено.</p>}
        </div>
      </aside>

      {active ? (
        <ViewCard template={active} highlight={query.trim()} onEdit={() => setEditor({ mode: 'edit', template: active })} />
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
