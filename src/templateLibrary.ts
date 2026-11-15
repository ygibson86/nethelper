import type { ConfigTemplate } from './types'

export function templateSearchMatch(template: ConfigTemplate, query: string): 'title' | 'description' | 'body' | null {
  const text = query.trim().toLowerCase()
  if (!text) return null
  if (template.title.toLowerCase().includes(text)) return 'title'
  if (template.description.toLowerCase().includes(text)) return 'description'
  return template.body.toLowerCase().includes(text) ? 'body' : null
}

export function filterTemplates(templates: ConfigTemplate[], query: string, vendor: 'all' | 'eltex' | 'cisco', favoritesOnly: boolean): ConfigTemplate[] {
  return templates.filter((template) => (vendor === 'all' || template.vendor === vendor) && (!favoritesOnly || template.favorite) && (!query.trim() || templateSearchMatch(template, query)))
    .sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.title.localeCompare(b.title, 'ru'))
}

export function templateCopyDraft(template: ConfigTemplate): Pick<ConfigTemplate, 'vendor' | 'title' | 'description' | 'body'> {
  return { vendor: template.vendor, title: `${template.title} — копия`, description: template.description, body: template.body }
}
