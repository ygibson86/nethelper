export function isWebUrl(value: string): boolean {
  if (!value) return true
  if (value.length > 2048 || /\s/u.test(value) || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && url.href.length <= 2048
  } catch { return false }
}

export function normalizeWebUrl(value: string): string {
  const text = value.trim()
  if (!isWebUrl(text)) throw new Error('Укажите полный HTTP/HTTPS-адрес без логина и пароля, например https://10.109.33.48:8443/.')
  return text ? new URL(text).href : ''
}

export function resolveWebUrl(ownUrl?: string, linkedUrl?: string): string | undefined {
  const candidate = ownUrl?.trim() || linkedUrl?.trim()
  if (!candidate || !isWebUrl(candidate)) return undefined
  return new URL(candidate).href
}
