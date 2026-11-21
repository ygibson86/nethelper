import type { AppData, NetworkSwitch } from './types'

export const AP_DEVICE_TYPE = 'access-point' as const

/** MAC в виде AA:BB:CC:DD:EE:FF или null, если строка не похожа на MAC. */
export function normalizeMac(value: string | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  const hex = raw.replace(/[^0-9a-f]/gi, '').toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g)!.join(':')
}

export function isValidMac(value: string | undefined) {
  return !value?.trim() || normalizeMac(value) !== null
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
export const isValidIpv4 = (value: string) => IPV4.test(value.trim())

export interface ApUplink {
  switchDevice?: NetworkSwitch
  address: string
  port: string
  inInventory: boolean
}

/** Коммутатор и порт, к которым подключена точка. */
export function resolveUplink(device: NetworkSwitch, switches: NetworkSwitch[]): ApUplink | null {
  const port = (device.uplinkPort ?? '').trim()
  const target = device.uplinkSwitchId ? switches.find((item) => item.id === device.uplinkSwitchId) : undefined
  const address = (target?.ip ?? device.uplinkSwitchAddress ?? device.uplinkSwitchId ?? '').trim()
  if (!target && !address && !port) return null
  return { switchDevice: target, address, port, inInventory: Boolean(target) }
}

export function accessPoints(devices: NetworkSwitch[]) {
  return devices.filter((device) => device.deviceType === AP_DEVICE_TYPE)
}

const CSV_DELIMITERS = [';', ',', '\t'] as const

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1 }
      else if (char === '"') quoted = false
      else current += char
      continue
    }
    if (char === '"') { quoted = true; continue }
    if (char === delimiter) { cells.push(current); current = ''; continue }
    current += char
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

export function detectDelimiter(headerLine: string) {
  let best: string = ';'
  let bestCount = -1
  for (const delimiter of CSV_DELIMITERS) {
    const count = splitCsvLine(headerLine, delimiter).length
    if (count > bestCount) { best = delimiter; bestCount = count }
  }
  return best
}

export function parseCsv(text: string): { header: string[]; rows: { line: number; cells: string[] }[]; delimiter: string } {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = clean.split('\n').filter((line) => line.trim().length > 0)
  if (!lines.length) return { header: [], rows: [], delimiter: ';' }
  const delimiter = detectDelimiter(lines[0])
  const header = splitCsvLine(lines[0], delimiter).map((cell) => cell.toLowerCase())
  const rows = lines.slice(1).map((line, index) => ({ line: index + 2, cells: splitCsvLine(line, delimiter) }))
  return { header, rows, delimiter }
}

const COLUMN_ALIASES: Record<string, string[]> = {
  hostname: ['hostname', 'host', 'имя', 'имя точки', 'название'],
  location: ['location', 'place', 'место', 'место установки', 'расположение', 'описание', 'description'],
  ip: ['ip', 'ip-адрес', 'ip адрес', 'адрес'],
  mac: ['mac', 'mac-адрес', 'mac адрес'],
  switchName: ['switch', 'коммутатор', 'sw'],
  switchIp: ['switchip', 'switch ip', 'ip коммутатора', 'коммутатор ip'],
  port: ['port', 'порт'],
  model: ['model', 'модель'],
  note: ['note', 'примечание', 'комментарий', 'comment'],
}

function columnIndex(header: string[], key: keyof typeof COLUMN_ALIASES) {
  const aliases = COLUMN_ALIASES[key]
  return header.findIndex((cell) => aliases.includes(cell))
}

export interface ApImportRow {
  line: number
  hostname: string
  location: string
  ip: string
  mac: string
  switchName: string
  switchIp: string
  port: string
  model: string
  note: string
}

export interface ApImportIssue {
  line: number
  level: 'error' | 'warning'
  message: string
}

export interface ApImportPlan {
  rows: ApImportRow[]
  issues: ApImportIssue[]
  create: Omit<NetworkSwitch, 'id'>[]
  update: { id: string; patch: Partial<NetworkSwitch> }[]
  skipped: number
}

export interface ApImportOptions {
  defaultManufacturerId?: string
  defaultModel?: string
}

/** Разбирает CSV и строит план добавления/обновления, ничего не записывая в стор. */
export function buildApImport(text: string, data: AppData, options: ApImportOptions = {}): ApImportPlan {
  const { header, rows } = parseCsv(text)
  const issues: ApImportIssue[] = []
  const plan: ApImportPlan = { rows: [], issues, create: [], update: [], skipped: 0 }

  const hostnameCell = columnIndex(header, 'hostname')
  const ipCell = columnIndex(header, 'ip')
  if (!header.length || hostnameCell < 0 || ipCell < 0) {
    issues.push({ line: 1, level: 'error', message: 'В первой строке нужны колонки hostname и ip (заголовок обязателен).' })
    return plan
  }

  const locationCell = columnIndex(header, 'location')
  const macCell = columnIndex(header, 'mac')
  const switchNameCell = columnIndex(header, 'switchName')
  const switchIpCell = columnIndex(header, 'switchIp')
  const portCell = columnIndex(header, 'port')
  const modelCell = columnIndex(header, 'model')
  const noteCell = columnIndex(header, 'note')

  const cell = (cells: string[], index: number) => index >= 0 ? (cells[index] ?? '').trim() : ''
  const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const apByHostname = new Map<string, NetworkSwitch>()
  const apByNormalizedName = new Map<string, NetworkSwitch>()
  const apByMac = new Map<string, NetworkSwitch>()
  const apByIp = new Map<string, NetworkSwitch>()
  const deviceByHostname = new Map<string, NetworkSwitch>()
  const deviceByIp = new Map<string, NetworkSwitch>()
  for (const device of data.switches) {
    deviceByHostname.set(device.hostname.trim().toLowerCase(), device)
    if (device.ip.trim()) deviceByIp.set(device.ip.trim(), device)
  }
  for (const device of accessPoints(data.switches)) {
    apByHostname.set(device.hostname.trim().toLowerCase(), device)
    apByNormalizedName.set(normalizeName(device.hostname), device)
    const mac = normalizeMac(device.mac)
    if (mac) apByMac.set(mac, device)
    if (device.ip.trim()) apByIp.set(device.ip.trim(), device)
  }

  const occupiedPorts = new Map<string, string>()
  for (const device of accessPoints(data.switches)) {
    const uplink = resolveUplink(device, data.switches)
    if (uplink?.address && uplink.port) occupiedPorts.set(`${uplink.switchDevice?.id ?? uplink.address}|${uplink.port}`, device.hostname)
  }

  for (const row of rows) {
    const hostname = cell(row.cells, hostnameCell)
    const ip = cell(row.cells, ipCell)
    const rawMac = cell(row.cells, macCell)
    const mac = normalizeMac(rawMac)
    const switchName = cell(row.cells, switchNameCell)
    const switchIp = cell(row.cells, switchIpCell)
    const port = cell(row.cells, portCell)
    const location = cell(row.cells, locationCell)
    const note = cell(row.cells, noteCell)
    const model = cell(row.cells, modelCell) || (options.defaultModel ?? '')

    if (!hostname) { issues.push({ line: row.line, level: 'error', message: 'Пустой hostname — строка пропущена.' }); plan.skipped += 1; continue }
    if (!isValidIpv4(ip)) { issues.push({ line: row.line, level: 'error', message: `Некорректный IP «${ip}» — строка пропущена.` }); plan.skipped += 1; continue }
    if (rawMac && !mac) { issues.push({ line: row.line, level: 'error', message: `Некорректный MAC «${rawMac}» — строка пропущена.` }); plan.skipped += 1; continue }

    const importRow: ApImportRow = { line: row.line, hostname, location, ip, mac: mac ?? '', switchName, switchIp, port, model, note }
    plan.rows.push(importRow)

    const existing = apByHostname.get(hostname.toLowerCase()) ?? apByNormalizedName.get(normalizeName(hostname)) ?? (mac ? apByMac.get(mac) : undefined) ?? apByIp.get(ip)
    const target = switchName ? deviceByHostname.get(switchName.toLowerCase()) ?? (isValidIpv4(switchName) ? deviceByIp.get(switchName) : undefined) : undefined
    const switchDevice = target ?? (switchIp ? deviceByIp.get(switchIp) : undefined)
    if (!switchDevice && (switchIp || switchName)) {
      issues.push({ line: row.line, level: 'warning', message: `Коммутатор «${switchIp || switchName}» не найден в инвентаре — сохранён только адрес.` })
    }
    if (!port) issues.push({ line: row.line, level: 'warning', message: 'Порт не указан.' })
    if (!location) issues.push({ line: row.line, level: 'warning', message: 'Не указано место установки.' })

    if (switchDevice && existing && switchDevice.id === existing.id) {
      issues.push({ line: row.line, level: 'warning', message: 'Точка подключена сама к себе — привязка не сохранена.' })
    }

    const uplinkPort = port || undefined
    const uplinkSwitchId = switchDevice && switchDevice.id !== existing?.id ? switchDevice.id : undefined
    const uplinkAddress = switchDevice?.ip?.trim() || (isValidIpv4(switchName) ? switchName : switchIp) || undefined
    const occupiedKey = `${switchDevice?.id ?? uplinkAddress ?? ''}|${port}`
    if (port) {
      const occupiedBy = occupiedPorts.get(occupiedKey)
      if (occupiedBy && occupiedBy !== existing?.hostname && occupiedBy !== hostname) {
        issues.push({ line: row.line, level: 'warning', message: `Порт уже занят точкой ${occupiedBy} — проверьте данные.` })
      }
      occupiedPorts.set(occupiedKey, hostname)
    }

    const patch: Partial<NetworkSwitch> = {
      hostname,
      ip,
      description: location,
      deviceType: AP_DEVICE_TYPE,
      model,
      mac: mac ?? undefined,
      uplinkSwitchId,
      uplinkSwitchAddress: uplinkSwitchId ? undefined : uplinkAddress,
      uplinkPort,
      note: note || undefined,
    }

    if (existing) {
      if (!existing.manufacturerId && options.defaultManufacturerId) patch.manufacturerId = options.defaultManufacturerId
      plan.update.push({ id: existing.id, patch })
    } else {
      plan.create.push({
        hostname,
        ip,
        manufacturerId: options.defaultManufacturerId ?? '',
        deviceType: AP_DEVICE_TYPE,
        model,
        accessMethods: [],
        description: location,
        mac: mac ?? undefined,
        uplinkSwitchId,
        uplinkSwitchAddress: uplinkSwitchId ? undefined : uplinkAddress,
        uplinkPort,
        note: note || undefined,
      })
    }
  }

  return plan
}

export function accessPointsCsv(data: AppData): string {
  const header = ['hostname', 'location', 'ip', 'mac', 'switch', 'port', 'model', 'note']
  const escape = (value: string) => /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  const lines = [header.join(';')]
  for (const device of accessPoints(data.switches).sort((left, right) => left.hostname.localeCompare(right.hostname, 'ru', { numeric: true }))) {
    const uplink = resolveUplink(device, data.switches)
    lines.push([
      device.hostname,
      device.description,
      device.ip,
      device.mac ?? '',
      uplink?.switchDevice?.hostname ?? uplink?.address ?? '',
      uplink?.port ?? '',
      device.model,
      device.note ?? '',
    ].map((value) => escape(value)).join(';'))
  }
  return `\uFEFF${lines.join('\r\n')}`
}
