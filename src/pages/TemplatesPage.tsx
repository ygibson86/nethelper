import { Copy, FileCode2, MoreHorizontal, Pencil, Plus, Search, Star, Trash2, Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SafeAction } from '../components/SafeAction'
import { Modal } from '../components/Layout'
import { ConfigHighlight } from '../components/ConfigHighlight'
import { EditableConfig } from '../components/EditableConfig'
import { useNetHelper } from '../store'
import { useLocalPreference } from '../useLocalPreference'
import { filterTemplates, templateCopyDraft, templateSearchMatch } from '../templateLibrary'
import type { ConfigTemplate } from '../types'

const vendors: { value: 'eltex' | 'cisco'; label: string }[] = [
  { value: 'eltex', label: 'Eltex' },
  { value: 'cisco', label: 'Cisco' },
]

function EditorModal({ template, duplicate = false, onCreated, onClose }: { template: ConfigTemplate | null; duplicate?: boolean; onCreated: (id: string) => void; onClose: () => void }) {
  const store = useNetHelper()
  const initial = template && duplicate ? templateCopyDraft(template) : template
  const [vendor, setVendor] = useState<'eltex' | 'cisco'>(initial?.vendor ?? 'eltex')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [titleError, setTitleError] = useState('')

  const save = () => {
    if (!title.trim()) {
      setTitleError('Укажите заголовок шаблона.')
      return
    }
    const payload = { vendor, title: title.trim(), description: description.trim(), body }
    if (template && !duplicate) store.updateConfigTemplate(template.id, payload)
    else {
      store.addConfigTemplate(payload)
      const created = useNetHelper.getState().configTemplates.at(-1)
      if (created) onCreated(created.id)
    }
    onClose()
  }

  return <Modal title={duplicate ? 'Копия шаблона' : template ? 'Править шаблон' : 'Новый шаблон'} onClose={onClose} className="tpl-editor-modal">
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

function ViewCard({ template, highlight, onEdit, onDuplicate, onToggleFavorite, editing, onEditingChange }: { template: ConfigTemplate; highlight: string; onEdit: () => void; onDuplicate: () => void; onToggleFavorite: () => void; editing: boolean; onEditingChange: (value: boolean) => void }) {
  const store = useNetHelper()
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const [draft, setDraft] = useState(template.body)
  const menuRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      const menu = menuRef.current
      if (!menu?.open || document.querySelector('[role="dialog"]')) return
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        menu.open = false
        menu.querySelector('summary')?.focus()
      } else if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => { document.removeEventListener('pointerdown', closeMenu); document.removeEventListener('keydown', closeMenu) }
  }, [])

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

  return <section className="tpl-view" aria-label="Выбранный шаблон">
    <div className="tpl-view-head">
      <div className="tpl-view-heading">
        <div className="tpl-view-title"><h2>{template.title}</h2><span className={`tpl-vendor-badge vendor-${template.vendor}`}>{template.vendor === 'eltex' ? 'Eltex' : 'Cisco'}</span></div>
        {template.description && <p className="page-subtitle">{template.description}</p>}
      </div>
      <div className="tpl-view-actions">
        <button type="button" className={`icon-button tpl-fav ${template.favorite ? 'on' : ''}`} aria-pressed={Boolean(template.favorite)} aria-label={template.favorite ? 'Открепить шаблон' : 'Закрепить шаблон'} title={template.favorite ? 'Открепить шаблон' : 'Закрепить шаблон'} onClick={onToggleFavorite} disabled={editing}><Star size={17} fill={template.favorite ? 'currentColor' : 'none'} /></button>
        <button className="icon-button" title="Изменить шаблон" aria-label="Изменить шаблон" onClick={onEdit} disabled={editing}><Pencil size={16} /></button>
        <details className="tpl-more" ref={menuRef}>
          <summary className="icon-button" title="Другие действия" aria-label="Другие действия" aria-disabled={editing} tabIndex={editing ? -1 : 0} onClick={(event) => { if (editing) event.preventDefault() }}><MoreHorizontal size={18} /></summary>
          <div className="tpl-more-content">
            <button className="tpl-menu-action" disabled={editing} onClick={() => { if (menuRef.current) menuRef.current.open = false; onDuplicate() }}><Copy size={15} /> Создать копию</button>
            <SafeAction className="tpl-menu-action danger-text" title={`Удалить шаблон «${template.title}»`} details="Будет удалён этот шаблон и его текст. Остальные шаблоны останутся." onConfirm={() => store.deleteConfigTemplate(template.id)} disabled={editing}><Trash2 size={15} /> Удалить шаблон</SafeAction>
          </div>
        </details>
        <button className="button primary tpl-copy" onClick={editing ? saveAndCopy : copy}>{editing ? <Check size={16} /> : copied ? <Check size={16} /> : <Copy size={16} />} {editing ? 'Сохранить' : copied ? 'Скопировано' : 'Копировать'}</button>
        <span className="sr-status" aria-live="polite">{copied ? 'Конфигурация скопирована' : ''}</span>
      </div>
    </div>
    <div className="tpl-output">
      {copyError && <p className="field-error tpl-copy-error" role="alert">{copyError}</p>}
      {editing ? (
        <div className="tpl-inline-edit" onKeyDown={(event) => { if (event.key === 'Escape') onEditingChange(false) }}><EditableConfig value={draft} onChange={setDraft} highlight={highlight} /></div>
      ) : (
        <div onDoubleClick={enterEdit} onKeyDown={(event) => { if (event.key === 'Enter') enterEdit() }} tabIndex={0} role="button" aria-label="Редактировать конфигурацию" className="tpl-config-wrap" title="Двойной клик для правки"><ConfigHighlight text={template.body} highlight={highlight} /></div>
      )}
    </div>
  </section>
}

export function TemplatesPage() {
  const templates = useNetHelper((state) => state.configTemplates)
  const updateConfigTemplate = useNetHelper((state) => state.updateConfigTemplate)
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState<'all' | 'eltex' | 'cisco'>('all')
  const [favoritesOnly, setFavoritesOnly] = useLocalPreference('nethelper-templates-favorites-only', false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit' | 'duplicate'; template: ConfigTemplate | null } | null>(null)
  const filtered = useMemo(() => filterTemplates(templates, query, vendor, favoritesOnly), [templates, query, vendor, favoritesOnly])
  const active = filtered.find((template) => template.id === activeId) ?? filtered[0] ?? null
  const toggleFavorite = (template: ConfigTemplate) => {
    if (!activeId) setActiveId(active?.id ?? template.id)
    updateConfigTemplate(template.id, { favorite: !template.favorite })
  }
  const resetFilters = () => { setQuery(''); setVendor('all'); setFavoritesOnly(false) }

  return <div className="templates-page">
    <header className="page-header compact"><div><p className="eyebrow">Библиотека конфигураций</p><h1>Шаблоны</h1></div><button className="button primary" disabled={Boolean(inlineEditId)} onClick={() => setEditor({ mode: 'create', template: null })}><Plus size={16} /> Новый шаблон</button></header>
    <div className="templates-layout">
      <aside className="templates-sidebar" aria-label="Библиотека шаблонов">
        <div className="templates-toolbar">
          <div className="search-box"><Search size={16} /><input disabled={Boolean(inlineEditId)} aria-label="Поиск по шаблонам" placeholder="Поиск по шаблонам…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button className="icon-button" disabled={Boolean(inlineEditId)} title="Очистить поиск" aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={15} /></button>}</div>
          <div className="tpl-filter-row"><div className="segmented" role="group" aria-label="Производитель">
            <button disabled={Boolean(inlineEditId)} aria-pressed={vendor === 'all'} className={vendor === 'all' ? 'active' : ''} onClick={() => setVendor('all')}>Все</button>
            {vendors.map((item) => <button key={item.value} disabled={Boolean(inlineEditId)} aria-pressed={vendor === item.value} className={vendor === item.value ? 'active' : ''} onClick={() => setVendor(item.value)}>{item.label}</button>)}
          </div><button className={`icon-button tpl-favorites-filter ${favoritesOnly ? 'active' : ''}`} disabled={Boolean(inlineEditId)} aria-pressed={favoritesOnly} title="Только избранные" aria-label="Только избранные" onClick={() => setFavoritesOnly(!favoritesOnly)}><Star size={17} fill={favoritesOnly ? 'currentColor' : 'none'} /></button></div>
          <span className="tpl-result-count" role="status">Шаблонов: {filtered.length} из {templates.length}</span>
        </div>
        <div className="templates-list">
          {filtered.map((template) => {
            const locked = Boolean(inlineEditId)
            return <div key={template.id} className={`tpl-item ${active?.id === template.id ? 'active' : ''} ${locked && inlineEditId !== template.id ? 'disabled' : ''}`}>
              <button className="tpl-item-open" disabled={locked} aria-pressed={active?.id === template.id} onClick={() => setActiveId(template.id)}>
                <span className="tpl-item-title"><span className={`tpl-vendor-badge small vendor-${template.vendor}`}>{template.vendor === 'eltex' ? 'Eltex' : 'Cisco'}</span><strong>{template.title}</strong></span>
                {templateSearchMatch(template, query) === 'body' && <small className="tpl-search-match">Совпадение в конфигурации</small>}
              </button>
              <button type="button" className={`tpl-fav ${template.favorite ? 'on' : ''}`} aria-pressed={Boolean(template.favorite)} aria-label={template.favorite ? `Открепить шаблон «${template.title}»` : `Закрепить шаблон «${template.title}»`} title={template.favorite ? 'Открепить шаблон' : 'Закрепить шаблон'} disabled={locked} onClick={() => toggleFavorite(template)}><Star size={15} fill={template.favorite ? 'currentColor' : 'none'} /></button>
            </div>
          })}
          {filtered.length === 0 && <p className="tpl-empty">{templates.length ? 'Нет подходящих шаблонов.' : 'В библиотеке пока нет шаблонов.'}</p>}
        </div>
      </aside>
      {active ? <ViewCard key={active.id} template={active} highlight={query.trim()} onEdit={() => setEditor({ mode: 'edit', template: active })} onDuplicate={() => setEditor({ mode: 'duplicate', template: active })} onToggleFavorite={() => toggleFavorite(active)} editing={inlineEditId === active.id} onEditingChange={(value) => setInlineEditId(value ? active.id : null)} /> : <section className="tpl-view tpl-empty-state"><FileCode2 size={36} /><h2>{templates.length ? 'Ничего не найдено' : 'Нет шаблонов'}</h2><p>{templates.length ? 'Измените запрос или сбросьте фильтры.' : 'Создайте первый шаблон кнопкой «Новый шаблон».'}</p>{templates.length > 0 && <button className="button" onClick={resetFilters}>Сбросить фильтры</button>}</section>}
    </div>
    {editor && <EditorModal template={editor.template} duplicate={editor.mode === 'duplicate'} onCreated={(id) => { resetFilters(); setActiveId(id) }} onClose={() => setEditor(null)} />}
  </div>
}
