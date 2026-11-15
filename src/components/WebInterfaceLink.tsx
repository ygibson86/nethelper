import { Globe } from 'lucide-react'
import { resolveWebUrl } from '../webUrl'

export function WebInterfaceLink({ url, className = 'button', compact = false, label = 'Открыть веб-интерфейс' }: { url?: string; className?: string; compact?: boolean; label?: string }) {
  const href = resolveWebUrl(url)
  if (!href) return null
  return <a className={className} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" title={`${label}: ${href}`} aria-label={compact ? label : undefined} onClick={(event) => event.stopPropagation()}><Globe size={compact ? 14 : 16} />{!compact && 'Веб-интерфейс'}</a>
}
