export function isWebUrl(value: string): boolean {
  if (!value) return true
  if (value.length > 2048 || /\s/u.test(value) || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || !/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password && url.href.length <= 2048
  } catch { return false }
}
