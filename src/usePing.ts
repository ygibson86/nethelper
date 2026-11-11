import { useEffect, useMemo, useRef, useState } from 'react'
import { pingHosts } from './api'
import type { NetworkSwitch, TopologyNode } from './types'

export type PingStatus = 'pending' | 'up' | 'down'

export interface NodePingState {
  status: PingStatus
  rtt?: number
  checkedAt: number
}

const POLL_INTERVAL_MS = 30_000
const EMPTY_STATES: Record<string, NodePingState> = {}
const ipv4Pattern = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const ipv6Pattern = /^[0-9a-f:]+$/i

export function isIpAddress(value: string) {
  const text = value.trim()
  if (ipv4Pattern.test(text)) return true
  return text.includes(':') && ipv6Pattern.test(text) && text.split(':').length >= 3
}

/** Global switch is the master; a node can opt out (false) or inherit (undefined). */
export function nodePingEnabled(node: TopologyNode, globalEnabled: boolean) {
  return globalEnabled && node.ping !== false
}

/** Linked devices are authoritative: their edited IP keeps working without touching the node. */
export function pingIpFor(node: TopologyNode, switches: NetworkSwitch[]): string | null {
  const deviceIp = node.switchId ? switches.find((item) => item.id === node.switchId)?.ip : undefined
  const candidate = (deviceIp || node.ip || '').trim()
  return isIpAddress(candidate) ? candidate : null
}

export function useNodePing(nodes: TopologyNode[], switches: NetworkSwitch[], enabled: boolean) {
  const targets = useMemo(() => {
    const map = new Map<string, string>()
    for (const node of nodes) {
      if (node.type === 'group' || node.type === 'text' || !nodePingEnabled(node, enabled)) continue
      const ip = pingIpFor(node, switches)
      if (ip) map.set(node.id, ip)
    }
    return map
  }, [nodes, switches, enabled])
  const signature = useMemo(() => [...targets].map(([id, ip]) => `${id}=${ip}`).join('|'), [targets])
  const targetsRef = useRef(targets)
  useEffect(() => { targetsRef.current = targets }, [targets])
  const [states, setStates] = useState<Record<string, NodePingState>>({})
  const visibleStates = useMemo(() => {
    if (!enabled) return EMPTY_STATES
    const next: Record<string, NodePingState> = {}
    for (const nodeId of targets.keys()) next[nodeId] = states[nodeId] ?? { status: 'pending', checkedAt: 0 }
    return next
  }, [enabled, targets, states])

  useEffect(() => {
    if (!enabled) return
    if (!targetsRef.current.size) return

    let disposed = false
    let running = false
    let timer: number | undefined

    const poll = async () => {
      if (disposed || running) return
      const current = targetsRef.current
      const hosts = [...new Set(current.values())]
      if (!hosts.length) {
        setStates({})
        return
      }
      running = true
      try {
        const { results } = await pingHosts(hosts)
        if (disposed) return
        const byHost = new Map(results.map((result) => [result.host, result]))
        const checkedAt = Date.now()
        setStates((previous) => {
          const next: Record<string, NodePingState> = {}
          for (const [nodeId, host] of current) {
            const result = byHost.get(host)
            next[nodeId] = result
              ? { status: result.alive ? 'up' : 'down', rtt: result.rtt, checkedAt }
              : previous[nodeId] ?? { status: 'pending', checkedAt: 0 }
          }
          return next
        })
      } catch {
        // A transient API error must not paint healthy nodes red: keep the previous status.
      } finally {
        running = false
        if (!disposed) timer = window.setTimeout(() => { void poll() }, POLL_INTERVAL_MS)
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      void poll()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void poll()
    return () => {
      disposed = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // The signature captures node ids and resolved IPs; nodes/switches objects themselves change on every edit.
  }, [enabled, signature])

  return visibleStates
}
