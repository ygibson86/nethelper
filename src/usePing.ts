import { useEffect, useMemo, useRef, useState } from 'react'
import { pingHosts } from './api'
import type { TopologyNode } from './types'

export type PingStatus = 'pending' | 'up' | 'down' | 'stale'
export interface NodePingState {
  status: PingStatus
  rtt?: number
  checkedAt: number
  host?: string
  lastStatus?: 'up' | 'down'
}
export const POLL_INTERVAL_MS = 30_000
export const STALE_AFTER_MS = 75_000
const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const ipv6Pattern = /^[0-9a-f:]+$/i
export function isIpAddress(value: string) {
  const text = value.trim()
  if (ipv4Pattern.test(text)) return true
  return text.includes(':') && ipv6Pattern.test(text) && text.split(':').length >= 3
}
export function nodePingEnabled(node: TopologyNode, globalEnabled: boolean) { return globalEnabled && node.ping !== false }
export function pingIpFor(node: TopologyNode): string | null {
  const candidate = (node.ip ?? '').trim()
  return isIpAddress(candidate) ? candidate : null
}
export function pingTitle(ping: NodePingState) {
  const time = ping.checkedAt ? ` · ${new Date(ping.checkedAt).toLocaleTimeString('ru')}` : ''
  if (ping.status === 'stale') return `ICMP с сервера: данные устарели / проверка недоступна${time}`
  if (ping.status === 'pending') return 'ICMP с сервера: проверка…'
  if (ping.status === 'down') return `ICMP с сервера: нет ответа${time}`
  return `ICMP с сервера: отвечает${ping.rtt !== undefined ? `, ${ping.rtt} мс` : ''}${time}`
}
export function useNodePing(nodes: TopologyNode[], enabled: boolean) {
  const targets = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of nodes) {
      if (node.type === 'group' || node.type === 'text' || !nodePingEnabled(node, enabled)) continue
      const ip = pingIpFor(node)
      if (ip) map.set(node.id, ip)
    }
    return map
  }, [nodes, enabled])
  const signature = [...targets].map(([id, ip]) => `${id}=${ip}`).join('|')
  const [states, setStates] = useState<Record<string, NodePingState>>({})
  const [now, setNow] = useState(Date.now)
  const [refresh, setRefresh] = useState(0)
  const [checking, setChecking] = useState(false)
  const targetRef = useRef(targets)
  useEffect(() => { targetRef.current = targets }, [targets])
  useEffect(() => {
    if (!enabled || !targetRef.current.size) return
    let disposed = false
    let timer: number | undefined
    const current = new Map(targetRef.current)
    const poll = async () => {
      setChecking(true)
      try {
        const { results } = await pingHosts([...new Set(current.values())])
        if (disposed) return
        const byHost = new Map(results.map((result) => [result.host, result]))
        const checkedAt = Date.now()
        setNow(checkedAt)
        setStates((previous) => Object.fromEntries([...current].map(([id, host]) => {
          const result = byHost.get(host)
          const old = previous[id]?.host === host ? previous[id] : undefined
          return [id, result ? { host, status: result.alive ? 'up' : 'down', lastStatus: result.alive ? 'up' : 'down', rtt: result.rtt, checkedAt } : { ...old, host, status: 'stale', checkedAt: old?.checkedAt ?? 0 }]
        })))
      } catch {
        if (!disposed) setStates((previous) => Object.fromEntries([...current].map(([id, host]) => {
          const old = previous[id]?.host === host ? previous[id] : undefined
          return [id, { ...old, host, status: 'stale', checkedAt: old?.checkedAt ?? 0 }]
        })))
      } finally {
        if (!disposed) { setChecking(false); timer = window.setTimeout(() => { void poll() }, POLL_INTERVAL_MS) }
      }
    }
    void poll()
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [enabled, signature, refresh])
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 5000)
    const visible = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); setRefresh((value) => value + 1) } }
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(tick); document.removeEventListener('visibilitychange', visible) }
  }, [])
  const visibleStates = useMemo(() => Object.fromEntries(enabled ? [...targets].map(([id, host]) => {
    const state = states[id]?.host === host ? states[id] : undefined
    if (!state) return [id, { status: 'pending', host, checkedAt: 0 } as NodePingState]
    return [id, state.checkedAt && now - state.checkedAt > STALE_AFTER_MS ? { ...state, status: 'stale' as const } : state]
  }) : []), [enabled, targets, states, now])
  return { states: visibleStates, checking: enabled && targets.size > 0 && checking, refresh: () => setRefresh((value) => value + 1) }
}
