import type { ReactNode } from 'react'

function tokenizeLine(line: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < line.length) {
    const rest = line.slice(index)

    const placeholder = /^(\{\{[a-zA-Z][a-zA-Z0-9_]*\}\})/.exec(rest)
    if (placeholder) {
      nodes.push(<span key={key++} className="cfg-ph">{placeholder[1]}</span>)
      index += placeholder[1].length
      continue
    }

    const command = /^(conf\s+t|configure\s+terminal|interface|description|switchport|spanning-tree|shut|shutdown|end|wr\s+mem|write\s+memory|show|access|trunk|mode|portfast|exit|username|enable|banner|hostname|logging|snmp-server|ip\s+access-list|ip\s+route|mac\s+address-table|allowed|status)(?=\s|$)/i.exec(rest)
    if (command) {
      nodes.push(<span key={key++} className="cfg-command">{command[1]}</span>)
      index += command[1].length
      continue
    }

    const iface = /^(gigabitethernet|fastethernet|ethernet|te|ge|gi|eth)\s*([0-9]+\/[0-9]+\/[0-9]+|[0-9]+\/[0-9]+|[0-9]+)/i.exec(rest)
    if (iface) {
      nodes.push(<span key={key++} className="cfg-command">{iface[1]}</span>)
      nodes.push(' ')
      nodes.push(<span key={key++} className="cfg-iface">{iface[2]}</span>)
      index += iface[0].length
      continue
    }

    const macAddr = /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}|(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}/i.exec(rest)
    if (macAddr) {
      nodes.push(<span key={key++} className="cfg-mac">{macAddr[0]}</span>)
      index += macAddr[0].length
      continue
    }

    if (/^\s/.test(rest[0])) {
      const match = /^\s+/.exec(rest)!
      nodes.push(match[0])
      index += match[0].length
      continue
    }

    nodes.push(rest[0])
    index += 1
  }

  return nodes
}

export function ConfigHighlight({ text, highlight }: { text: string; highlight?: string }) {
  const lowerHl = highlight?.toLowerCase()

  return (
    <pre className="config-block">
      {text.split('\n').map((line, i) => {
        if (lowerHl) {
          const pos = line.toLowerCase().indexOf(lowerHl)
          if (pos >= 0) {
            return (
              <div key={i} className="config-line">
                <span className="config-lineno">{i + 1}</span>
                <span>
                  {line.slice(0, pos)}
                  <mark className="cfg-hl">{line.slice(pos, pos + highlight!.length)}</mark>
                  {line.slice(pos + highlight!.length)}
                </span>
              </div>
            )
          }
        }
        return (
          <div key={i} className="config-line">
            <span className="config-lineno">{i + 1}</span>
            <span>{tokenizeLine(line)}</span>
          </div>
        )
      })}
    </pre>
  )
}
