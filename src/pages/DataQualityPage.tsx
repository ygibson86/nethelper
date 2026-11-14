import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { inspectData } from '../dataQuality'
import { useNetHelper } from '../store'

export function DataQualityPage() {
  const data = useNetHelper()
  const issues = useMemo(() => inspectData(data), [data])
  const [category, setCategory] = useState('Все')
  const categories = ['Все', ...new Set(issues.map((issue) => issue.category))]
  const visible = category === 'Все' ? issues : issues.filter((issue) => issue.category === category)
  return <>
    <header className="page-header"><div><p className="eyebrow">Целостность инвентаря</p><h1>Проверка данных</h1><p className="page-subtitle">Только диагностика. Ничего не исправляется и не связывается автоматически.</p></div></header>
    <div className="quality-summary"><strong>Предупреждений: {issues.filter((issue) => issue.severity === 'warning').length}</strong><span>Информационных замечаний: {issues.filter((issue) => issue.severity === 'info').length}</span></div>
    <label className="quality-filter">Категория <select value={categories.includes(category) ? category : 'Все'} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className="quality-list">{visible.map((issue) => <article key={issue.id}><div><small className={issue.severity === 'warning' ? 'quality-warning' : ''}>{issue.category} · {issue.severity === 'warning' ? 'Проверьте' : 'Информация'}</small><h2>{issue.title}</h2><p>{issue.detail}</p></div><Link className="button" to={issue.to}>Открыть</Link></article>)}{!visible.length && <p>В этой категории замечаний нет.</p>}</div>
  </>
}
