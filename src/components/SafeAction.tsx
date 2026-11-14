import { useState, type ReactNode } from 'react'
import { downloadBackup } from '../backup'
import { recoverable } from '../recovery'
import { useNetHelper } from '../store'
import { Modal } from './Layout'

export function SafeAction({ title, details, children, onConfirm, className = 'button danger-button', confirmWord, backup = false, disabled = false, ariaLabel }: {
  title: string; details: ReactNode; children: ReactNode; onConfirm: () => void; className?: string; confirmWord?: string; backup?: boolean; disabled?: boolean; ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState('')
  const [error, setError] = useState('')
  return <>
    <button type="button" className={className} title={title} aria-label={ariaLabel ?? title} disabled={disabled} onClick={() => { setOpen(true); setWord(''); setError('') }}>{children}</button>
    {open && <Modal title={title} onClose={() => setOpen(false)}><form className="safety-form" onSubmit={(event) => {
      event.preventDefault()
      if (confirmWord && word !== confirmWord) return
      try {
        if (backup) downloadBackup(useNetHelper.getState(), 'nethelper-before-change')
        recoverable(title, onConfirm)
        setOpen(false)
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить страховочную копию. Действие отменено.') }
    }}>
      <div>{details}</div>
      <p className="page-subtitle">До изменения сохраняется копия в истории восстановления этой вкладки. Она переживает обновление страницы, но не закрытие вкладки. Это не серверный бэкап.</p>
      {backup && <p>Перед выполнением также будет скачан JSON-бэкап текущих данных.</p>}
      {confirmWord && <label>Для подтверждения введите <strong>{confirmWord}</strong><input autoFocus value={word} onChange={(event) => setWord(event.target.value)} autoComplete="off" /></label>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="button" type="button" onClick={() => setOpen(false)}>Отмена</button><button className="button danger-button" disabled={Boolean(confirmWord && word !== confirmWord)}>Подтвердить</button></div>
    </form></Modal>}
  </>
}
