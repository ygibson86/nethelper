import { Download, History, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { downloadBackup } from '../backup'
import { restoreEntry, useRecovery } from '../recovery'
import { Modal } from './Layout'

export function RecoveryHistory() {
  const { entries, notice, setNotice } = useRecovery()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const restore = (id: string) => {
    try { restoreEntry(id); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось восстановить данные.'); setOpen(true) }
  }
  return <>
    <button className="theme-toggle" onClick={() => { setOpen(true); setError('') }}><History size={18} /> Восстановление {entries.length > 0 && `(${entries.length})`}</button>
    {notice && entries[0] && <div className="recovery-notice" role="status"><span>{notice}</span><button className="button" onClick={() => restore(entries[0].id)}>Отменить</button><button className="icon-button" aria-label="Скрыть уведомление" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {open && <Modal title="История восстановления" onClose={() => setOpen(false)}><div className="recovery-list"><p>Последние 5 защищённых операций в этой вкладке. Восстановление не перезаписывает последующие независимые изменения. При пересечении полей оно останавливается.</p><p className="page-subtitle">Копии хранятся только до закрытия вкладки. Для долгого хранения скачайте JSON. Ошибки серверного сохранения проверяйте по индикатору в меню.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!entries.length && <p>Пока нет операций для восстановления.</p>}
      {entries.map((entry) => <article key={entry.id}><strong>{entry.title}</strong><small>{new Date(entry.time).toLocaleString('ru')}</small><div className="toolbar"><button className="button" onClick={() => restore(entry.id)}><RotateCcw size={15} /> Восстановить</button><button className="button" onClick={() => downloadBackup(entry.before, 'nethelper-recovery')}><Download size={15} /> Копия до изменения</button></div></article>)}
    </div></Modal>}
  </>
}
