import { Background, BaseEdge, ConnectionMode, Controls, EdgeLabelRenderer, Handle, MiniMap, NodeResizer, Position, ReactFlow, SelectionMode, getSmoothStepPath, useEdgesState, useNodesState, type Connection, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import { BatteryCharging, Box, Cable, Camera, Cloud, Copy, Database, Edit3, Eye, Group, Monitor, Network, PanelsTopLeft, Phone, Plus, Printer, Radio, Router, Save, Search, Server, Shield, Trash2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useNetHelper } from '../store'
import type { CableType, DeviceType, HandleLayout, HandleSide, TopologyLink, TopologyNode } from '../types'
import { Modal } from '../components/Layout'

interface DeviceNodeData extends Record<string, unknown> { label: string; name?: string; ip?: string; type: DeviceType; color: string; manufacturerId?: string; handles: HandleLayout; switchId?: string; highlighted?: boolean; width?: number; height?: number; groupLabelPosition?: 'top' | 'center'; resizeGroup?: (width: number, height: number) => void }
type DeviceFlowNode = Node<DeviceNodeData, 'device' | 'group'>
interface LinkEdgeData extends Record<string, unknown> { sourcePort: string; targetPort: string; cableType: CableType }
type LinkFlowEdge = Edge<LinkEdgeData, 'networkLink'>

type LinkForm = Omit<TopologyLink, 'id'> & { id?: string }
const defaultHandles: HandleLayout = { top: 1, bottom: 1, left: 1, right: 1 }
const emptyLink: LinkForm = { source: '', target: '', sourcePort: '', targetPort: '', cableType: 'copper', label: '' }
const cableLabels: Record<CableType, string> = { copper: 'Медь', fiber: 'Оптоволокно', dac: 'DAC', wireless: 'Беспроводная' }
const cableColors: Record<CableType, string> = { copper: '#facc15', fiber: '#2196f3', dac: '#111111', wireless: '#ef4444' }
const deviceLabels: Record<DeviceType, string> = { switch: 'Коммутатор', router: 'Маршрутизатор', pc: 'Компьютер', server: 'Сервер', firewall: 'Межсетевой экран', 'access-point': 'Точка доступа', printer: 'Принтер', phone: 'IP-телефон', camera: 'Камера', cloud: 'Облако / Интернет', ups: 'ИБП', nas: 'Сетевое хранилище', 'patch-panel': 'Патч-панель', group: 'Группа / шкаф' }
const deviceIcons: Record<DeviceType, LucideIcon> = { switch: Network, router: Router, pc: Monitor, server: Server, firewall: Shield, 'access-point': Radio, printer: Printer, phone: Phone, camera: Camera, cloud: Cloud, ups: BatteryCharging, nas: Database, 'patch-panel': PanelsTopLeft, group: Group }
const sidePositions: Record<HandleSide, Position> = { top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right }

function NodeHandles({ layout }: { layout: HandleLayout }) {
  return <>{(Object.entries(layout) as [HandleSide, number][]).flatMap(([side, count]) => Array.from({ length: count }, (_, index) => {
    const offset = `${((index + 1) / (count + 1)) * 100}%`
    const style = side === 'top' || side === 'bottom' ? { left: offset } : { top: offset }
    return <Handle key={`${side}-${index}`} id={`${side}-${index + 1}`} type="source" position={sidePositions[side]} style={style} />
  }))}</>
}

function portLabelPosition(x: number, y: number, position: Position, distance: number) {
  if (position === Position.Left) return { x: x - distance, y }
  if (position === Position.Right) return { x: x + distance, y }
  if (position === Position.Top) return { x, y: y - distance }
  return { x, y: y + distance }
}

function NetworkLinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data, selected }: EdgeProps) {
  const linkData = data as LinkEdgeData | undefined
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12, offset: 24 })
  const sourceLabel = portLabelPosition(sourceX, sourceY, sourcePosition, 30)
  const targetLabel = portLabelPosition(targetX, targetY, targetPosition, 30)
  return <>
    <BaseEdge id={`${id}-bridge`} path={path} style={{ stroke: 'var(--flow-bg)', strokeWidth: 8, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, strokeWidth: selected ? 4 : style?.strokeWidth, strokeDasharray: linkData?.cableType === 'wireless' ? '8 7' : undefined, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
    <EdgeLabelRenderer>
      <span className={`edge-port-label ${selected ? 'selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${sourceLabel.x}px,${sourceLabel.y}px)` }}>{linkData?.sourcePort || '?'}</span>
      <span className={`edge-port-label ${selected ? 'selected' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${targetLabel.x}px,${targetLabel.y}px)` }}>{linkData?.targetPort || '?'}</span>
    </EdgeLabelRenderer>
  </>
}

function NodeTypeIcon({ type, size = 20 }: { type: DeviceType; size?: number }) {
  const Icon = deviceIcons[type]
  return <Icon size={size} />
}

function DeviceNode({ data, selected }: NodeProps<DeviceFlowNode>) {
  return <div className={`flow-device ${selected ? 'selected' : ''} ${data.highlighted ? 'highlighted' : ''}`} style={{ '--node-color': data.color } as React.CSSProperties}>
    {selected && <span className="selection-mark">✓</span>}
    <NodeHandles layout={data.handles} />
    <span className="flow-icon"><NodeTypeIcon type={data.type} /></span><div className="flow-device-text"><strong>{data.name || data.label}</strong>{data.ip && <small>{data.ip}</small>}</div>
  </div>
}
function GroupNode({ data, selected }: NodeProps<DeviceFlowNode>) {
  return <div className={`flow-group label-${data.groupLabelPosition ?? 'top'} ${selected ? 'selected' : ''}`} style={{ '--node-color': data.color } as React.CSSProperties}><NodeResizer isVisible={selected} minWidth={240} minHeight={160} maxWidth={1200} maxHeight={900} lineClassName="group-resize-line" handleClassName="group-resize-handle" onResizeEnd={(_, params) => data.resizeGroup?.(Math.round(params.width), Math.round(params.height))} />{selected && <span className="selection-mark">✓</span>}<div className="flow-group-title"><Group size={17} /><strong>{data.label}</strong></div></div>
}
const nodeTypes = { device: DeviceNode, group: GroupNode }
const edgeTypes = { networkLink: NetworkLinkEdge }

export function TopologyPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { topologies, manufacturers, settings, addTopology, updateTopology, deleteTopology } = useNetHelper()
  const active = topologies.find((item) => item.id === id) ?? topologies[0]
  const highlightedDevice = searchParams.get('device')
  const highlightedPort = searchParams.get('port')
  const [editMode, setEditMode] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [viewingNodeId, setViewingNodeId] = useState<string | null>(null)
  const [linkForm, setLinkForm] = useState<LinkForm | null>(null)
  const [copiedNodes, setCopiedNodes] = useState<TopologyNode[]>([])
  const [topologyQuery, setTopologyQuery] = useState('')
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<DeviceFlowNode, LinkFlowEdge> | null>(null)
  const centeredDeviceRef = useRef<string | null>(null)
  const fittedTopologyRef = useRef<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceFlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<LinkFlowEdge>([])

  useEffect(() => { if (active && id !== active.id) navigate(`/topology/${active.id}`, { replace: true }) }, [active, id, navigate])
  useEffect(() => {
    setNodes((current) => (active?.nodes ?? []).map((node) => {
      const previous = current.find((item) => item.id === node.id)
      const vendorColor = manufacturers.find((item) => item.id === node.manufacturerId)?.color
      return {
        id: node.id,
        type: node.type === 'group' ? 'group' : 'device',
        position: { x: node.x, y: node.y },
        selected: previous?.selected,
        zIndex: previous?.zIndex ?? (node.type === 'group' ? -1 : 1),
        style: node.type === 'group' ? { width: node.width ?? 420, height: node.height ?? 260 } : undefined,
        data: {
          label: node.label,
          name: node.name,
          ip: node.ip,
          type: node.type,
          color: vendorColor ?? node.color,
          manufacturerId: node.manufacturerId,
          handles: node.handles ?? defaultHandles,
          width: node.width,
          height: node.height,
          groupLabelPosition: node.groupLabelPosition,
          switchId: node.switchId,
          highlighted: node.switchId === highlightedDevice || node.ip === highlightedDevice || node.label === highlightedDevice,
          resizeGroup: node.type === 'group' && active ? (width: number, height: number) => updateTopology(active.id, { nodes: active.nodes.map((item) => item.id === node.id ? { ...item, width, height } : item) }) : undefined,
        },
      } as DeviceFlowNode
    }))
  }, [active, highlightedDevice, manufacturers, setNodes, updateTopology])
  useEffect(() => {
    setEdges((current) => (active?.links ?? []).map((link) => {
      const previous = current.find((edge) => edge.id === link.id)
      return { id: link.id, source: link.source, target: link.target, sourceHandle: link.sourceHandle, targetHandle: link.targetHandle, type: 'networkLink', selected: previous?.selected, zIndex: previous?.zIndex ?? 0, data: { sourcePort: link.sourcePort, targetPort: link.targetPort, cableType: link.cableType }, style: { strokeWidth: highlightedPort && (link.sourcePort === highlightedPort || link.targetPort === highlightedPort) ? 4 : 2, stroke: cableColors[link.cableType] } }
    }))
  }, [active?.links, highlightedPort, setEdges])

  useEffect(() => {
    if (!highlightedDevice) centeredDeviceRef.current = null
  }, [highlightedDevice])

  const filteredTopologies = useMemo(() => {
    const query = topologyQuery.trim().toLowerCase()
    if (!query) return topologies
    return topologies.filter((topology) => [topology.name, topology.description, ...topology.nodes.map((node) => node.label), ...topology.nodes.map((node) => node.ip)].some((value) => value?.toLowerCase().includes(query)))
  }, [topologies, topologyQuery])

  useEffect(() => {
    if (!flowInstance || !highlightedDevice || centeredDeviceRef.current === `${active?.id}:${highlightedDevice}`) return
    const target = nodes.find((node) => node.data.switchId === highlightedDevice || node.data.ip === highlightedDevice || node.data.label === highlightedDevice)
    if (!target) return
    centeredDeviceRef.current = `${active?.id}:${highlightedDevice}`
    fittedTopologyRef.current = active?.id ?? null
    const timer = window.setTimeout(() => {
      const currentTarget = flowInstance.getNode(target.id)
      if (!currentTarget) return
      const width = currentTarget.measured?.width ?? 166
      const height = currentTarget.measured?.height ?? 61
      void flowInstance.setCenter(currentTarget.position.x + width / 2, currentTarget.position.y + height / 2, { zoom: 1.35, duration: 800 })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [active?.id, flowInstance, highlightedDevice, nodes])

  const activeNodeSignature = useMemo(() => (active?.nodes ?? []).map((node) => node.id).sort().join('|'), [active?.nodes])
  const canvasNodeSignature = useMemo(() => nodes.map((node) => node.id).sort().join('|'), [nodes])

  useEffect(() => {
    if (!flowInstance || !active || highlightedDevice || fittedTopologyRef.current === active.id) return
    if (activeNodeSignature !== canvasNodeSignature) return
    fittedTopologyRef.current = active.id
    const timer = window.setTimeout(() => {
      if (!active.nodes.length) {
        void flowInstance.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 })
        return
      }
      void flowInstance.fitView({ padding: .18, duration: 500, minZoom: .1, maxZoom: 1.5 })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [active, activeNodeSignature, canvasNodeSignature, flowInstance, highlightedDevice])

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, draggedNode: DeviceFlowNode) => {
    if (!active || !editMode) return
    const flowNodes = flowInstance?.getNodes() ?? nodes
    const positions = new Map(flowNodes.map((node) => [node.id, node.id === draggedNode.id ? draggedNode.position : node.position]))
    updateTopology(active.id, { nodes: active.nodes.map((item) => {
      const position = positions.get(item.id)
      return position ? { ...item, x: position.x, y: position.y } : item
    }) })
  }, [active, editMode, flowInstance, nodes, updateTopology])
  const onNodesDelete = useCallback((deleted: DeviceFlowNode[]) => {
    if (!active || !editMode) return
    const ids = new Set(deleted.map((node) => node.id))
    updateTopology(active.id, { nodes: active.nodes.filter((node) => !ids.has(node.id)), links: active.links.filter((link) => !ids.has(link.source) && !ids.has(link.target)) })
  }, [active, editMode, updateTopology])
  const onEdgesDelete = useCallback((deleted: LinkFlowEdge[]) => {
    if (!active || !editMode) return
    const ids = new Set(deleted.map((edge) => edge.id))
    updateTopology(active.id, { links: active.links.filter((link) => !ids.has(link.id)) })
  }, [active, editMode, updateTopology])
  const onConnect = useCallback((connection: Connection) => {
    if (active && editMode && connection.source && connection.target) setLinkForm({ ...emptyLink, source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle ?? undefined, targetHandle: connection.targetHandle ?? undefined })
  }, [active, editMode])

  const addNode = () => {
    if (!active) return
    const node: TopologyNode = { id: `node-${Date.now()}`, x: 180 + active.nodes.length * 35, y: 180 + active.nodes.length * 25, label: 'new-device', name: 'Новое устройство', type: 'switch', color: manufacturers[0]?.color ?? '#22c55e', manufacturerId: manufacturers[0]?.id, handles: { ...defaultHandles } }
    updateTopology(active.id, { nodes: [...active.nodes, node] }); setEditingNodeId(node.id)
  }
  const addGroup = () => {
    if (!active) return
    const group: TopologyNode = { id: `group-${Date.now()}`, x: 140, y: 160, label: 'Шкаф / группа', type: 'group', color: '#64748b', width: 480, height: 280, groupLabelPosition: 'top', handles: { top: 0, bottom: 0, left: 0, right: 0 } }
    updateTopology(active.id, { nodes: [group, ...active.nodes] }); setEditingNodeId(group.id)
  }
  const copySelected = useCallback(() => {
    if (!active) return
    const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
    setCopiedNodes(active.nodes.filter((node) => selectedIds.has(node.id)).map((node) => ({ ...node })))
  }, [active, nodes])
  const pasteNodes = useCallback(() => {
    if (!active || !copiedNodes.length || !editMode) return
    const timestamp = Date.now()
    const copies = copiedNodes.map((source, index) => ({ ...source, id: `node-${timestamp}-${index}`, x: source.x + 40, y: source.y + 40, label: `${source.label} — копия`, switchId: undefined }))
    updateTopology(active.id, { nodes: [...active.nodes, ...copies] })
    setCopiedNodes(copies)
  }, [active, copiedNodes, editMode, updateTopology])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!editMode || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC') { event.preventDefault(); copySelected() }
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyV') { event.preventDefault(); pasteNodes() }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const nodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
        const edgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id))
        if (active && (nodeIds.size || edgeIds.size)) {
          event.preventDefault()
          updateTopology(active.id, { nodes: active.nodes.filter((node) => !nodeIds.has(node.id)), links: active.links.filter((link) => !nodeIds.has(link.source) && !nodeIds.has(link.target) && !edgeIds.has(link.id)) })
        }
      }
    }
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler)
  })
  const saveLink = (event: FormEvent) => {
    event.preventDefault()
    if (!active || !linkForm || !linkForm.source || !linkForm.target || linkForm.source === linkForm.target) return
    const link: TopologyLink = { ...linkForm, id: linkForm.id ?? `link-${Date.now()}`, label: linkForm.label || undefined }
    updateTopology(active.id, { links: linkForm.id ? active.links.map((item) => item.id === link.id ? link : item) : [...active.links, link] }); setLinkForm(null)
  }
  const currentNode = active?.nodes.find((node) => node.id === editingNodeId)
  const viewingNode = active?.nodes.find((node) => node.id === viewingNodeId)
  const createTopology = () => { const name = prompt('Название новой схемы'); if (name?.trim()) navigate(`/topology/${addTopology(name.trim())}`) }
  const clearTrace = () => {
    if (!highlightedDevice && !highlightedPort) return
    const next = new URLSearchParams(searchParams)
    next.delete('device')
    next.delete('port')
    setSearchParams(next, { replace: true })
  }
  const selectViewNode = (nodeId: string, additive: boolean) => {
    const selectedNode = nodes.find((node) => node.id === nodeId)
    const isTracedNode = selectedNode && (selectedNode.data.switchId === highlightedDevice || selectedNode.data.ip === highlightedDevice)
    if (highlightedDevice && !isTracedNode) clearTrace()
    const selectedIds = new Set(additive ? nodes.filter((node) => node.selected).map((node) => node.id) : [])
    if (additive && selectedIds.has(nodeId)) selectedIds.delete(nodeId)
    else selectedIds.add(nodeId)
    setNodes((current) => current.map((node) => ({ ...node, selected: selectedIds.has(node.id), zIndex: selectedIds.has(node.id) ? 1000 : node.data.type === 'group' ? -1 : 1 })))
    setEdges((current) => current.map((edge) => { const related = selectedIds.has(edge.source) || selectedIds.has(edge.target); return { ...edge, selected: related, zIndex: related ? 999 : 0 } }))
    setViewingNodeId(selectedIds.has(nodeId) ? nodeId : null)
  }
  const clearViewSelection = () => {
    clearTrace()
    setViewingNodeId(null)
    setNodes((current) => current.map((node) => ({ ...node, selected: false, zIndex: node.data.type === 'group' ? -1 : 1 })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false, zIndex: 0 })))
  }

  return <div className="topology-page">
    <header className="page-header compact"><div><p className="eyebrow">Редактор сети</p><h1>Схемы</h1>{highlightedPort && <p className="trace-hint"><Cable size={14} /> Трассировка от порта {highlightedPort}</p>}</div><div className="toolbar"><div className="mode-switch"><button className={!editMode ? 'active' : ''} onClick={() => setEditMode(false)}><Eye size={16} /> Просмотр</button><button className={editMode ? 'active' : ''} onClick={() => setEditMode(true)}><Edit3 size={16} /> Редактирование</button></div>{editMode && <><button className="button" onClick={copySelected} disabled={!nodes.some((node) => node.selected)}><Copy size={16} /> Копировать</button><button className="button" onClick={pasteNodes} disabled={!copiedNodes.length}><Box size={16} /> Вставить</button><button className="button" onClick={() => setLinkForm({ ...emptyLink })}><Cable size={16} /> Связь</button><button className="button" onClick={addGroup}><Group size={16} /> Группа</button><button className="button primary" onClick={addNode}><Plus size={17} /> Узел</button></>}</div></header>
    <div className="topology-workspace"><aside className="topology-list"><div className="section-title"><span>Все схемы</span><button className="icon-button" onClick={createTopology}><Plus size={17} /></button></div><div className="topology-search"><Search size={14} /><input value={topologyQuery} onChange={(event) => setTopologyQuery(event.target.value)} placeholder="Поиск схем..." /></div>{filteredTopologies.map((item) => <button key={item.id} className={`topology-item ${item.id === active?.id ? 'active' : ''}`} onClick={() => navigate(`/topology/${item.id}`)}><Network size={17} /><span><strong>{item.name}</strong><small>{item.nodes.length} узлов · {item.links.length} связей</small></span></button>)}{active && <div className="topology-manage"><button onClick={() => { const name = prompt('Новое название', active.name); if (name?.trim()) updateTopology(active.id, { name: name.trim() }) }}><Edit3 size={15} /> Переименовать</button><button className="danger-text" onClick={() => { if (confirm(`Удалить схему «${active.name}»?`)) { deleteTopology(active.id); navigate('/topology') } }}><Trash2 size={15} /> Удалить</button></div>}</aside>
      <section className="canvas-panel">{active ? <><div className="canvas-title"><div><strong>{active.name}</strong><span>{active.description || 'Дважды нажмите узел или связь для настройки'}</span></div><span className="autosave"><Save size={14} /> Автосохранение</span></div><div className="flow-wrap"><ReactFlow<DeviceFlowNode, LinkFlowEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={setFlowInstance} connectionMode={ConnectionMode.Loose} snapToGrid snapGrid={[20, 20]} multiSelectionKeyCode={['Control', 'Meta']} selectionKeyCode={null} selectionOnDrag={editMode} selectionMode={SelectionMode.Partial} panOnDrag={editMode ? [1, 2] : true} nodesDraggable={editMode} nodesConnectable={editMode} elementsSelectable onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeDragStop={onNodeDragStop} onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete} deleteKeyCode={null} onConnect={onConnect} onNodeDoubleClick={(_, node) => { if (!editMode) { clearTrace(); setEditMode(true); setViewingNodeId(null) } setEditingNodeId(node.id) }} onEdgeDoubleClick={(_, edge) => { if (editMode) { const link = active.links.find((item) => item.id === edge.id); if (link) setLinkForm({ ...link }) } }} onNodeClick={(event, node) => { if (!editMode) selectViewNode(node.id, event.ctrlKey || event.metaKey) }} onPaneClick={() => { if (!editMode) clearViewSelection() }} zoomOnDoubleClick={false} colorMode={settings.theme}><Background gap={20} size={1} /><Controls /><MiniMap pannable zoomable nodeColor={(node) => String(node.data?.color ?? '#64748b')} /></ReactFlow></div></> : <div className="empty-state"><Network size={42} /><h2>Нет схем</h2><button className="button primary" onClick={createTopology}>Создать схему</button></div>}</section>
    </div>
    {currentNode && active && <Modal title="Настройка узла" onClose={() => setEditingNodeId(null)}><form className="form-grid" onSubmit={(event) => event.preventDefault()}>{currentNode.type === 'group' ? <label className="full">Наименование<input value={currentNode.label} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, label: event.target.value } : node) })} /></label> : <><label className="full">Наименование<input value={currentNode.name ?? ''} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, name: event.target.value } : node) })} /></label><label className="full">Имя хоста<input value={currentNode.label} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, label: event.target.value } : node) })} /></label></>}{currentNode.type !== 'group' && <label>Тип<select value={currentNode.type} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, type: event.target.value as DeviceType } : node) })}>{Object.entries(deviceLabels).filter(([value]) => value !== 'group').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<label>Цвет<input type="color" value={currentNode.color} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, color: event.target.value } : node) })} /></label>{currentNode.type !== 'group' && <label>Производитель<select value={currentNode.manufacturerId ?? ''} onChange={(event) => { const vendor = manufacturers.find((item) => item.id === event.target.value); updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, manufacturerId: vendor?.id, color: vendor?.color ?? node.color } : node) }) }}><option value="">Не выбран</option>{manufacturers.filter((item) => item.deviceTypes.includes(currentNode.type)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{currentNode.type !== 'group' && <label className="full">IP-адрес<input value={currentNode.ip ?? ''} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, ip: event.target.value } : node) })} /></label>}{currentNode.type === 'group' && <><label>Положение названия<select value={currentNode.groupLabelPosition ?? 'top'} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, groupLabelPosition: event.target.value as 'top' | 'center' } : node) })}><option value="top">Сверху по центру</option><option value="center">По центру</option></select></label><p className="group-resize-help full">Размер группы изменяется маркерами по краям прямо на холсте.</p></>}{currentNode.type !== 'group' && <div className="handle-settings full"><strong>Точки подключения</strong><span>Укажите количество точек на каждой стороне узла</span><div>{(['top', 'bottom', 'left', 'right'] as HandleSide[]).map((side) => <label key={side}>{side === 'top' ? 'Сверху' : side === 'bottom' ? 'Снизу' : side === 'left' ? 'Слева' : 'Справа'}<input type="number" min="0" max="8" value={(currentNode.handles ?? defaultHandles)[side]} onChange={(event) => updateTopology(active.id, { nodes: active.nodes.map((node) => node.id === currentNode.id ? { ...node, handles: { ...(node.handles ?? defaultHandles), [side]: Math.max(0, Math.min(8, Number(event.target.value))) } } : node) })} /></label>)}</div></div>}<div className="modal-actions full"><button type="button" className="button danger-button" onClick={() => { updateTopology(active.id, { nodes: active.nodes.filter((node) => node.id !== currentNode.id), links: active.links.filter((link) => link.source !== currentNode.id && link.target !== currentNode.id) }); setEditingNodeId(null) }}><Trash2 size={16} /> Удалить</button><button className="button primary" type="button" onClick={() => setEditingNodeId(null)}>Готово</button></div></form></Modal>}
    {viewingNode && <aside className="node-inspector"><button className="icon-button node-inspector-close" onClick={clearViewSelection}><X size={16} /></button><div className="node-view-summary"><span className="flow-icon" style={{ '--node-color': viewingNode.color } as React.CSSProperties}><NodeTypeIcon type={viewingNode.type} size={22} /></span><div><strong>{viewingNode.name || viewingNode.label}</strong>{viewingNode.name && <span>{viewingNode.label}</span>}<span>{viewingNode.ip || 'IP-адрес не указан'}</span></div></div><small>{deviceLabels[viewingNode.type]}</small><button className="button" disabled>Подключиться по SSH — в разработке</button><button className="button" disabled>Открыть веб-интерфейс — в разработке</button></aside>}
    {linkForm && active && <Modal title={linkForm.id ? 'Редактировать связь' : 'Новая связь'} onClose={() => setLinkForm(null)}><form className="form-grid" onSubmit={saveLink}><label>От устройства<select required value={linkForm.source} onChange={(event) => setLinkForm({ ...linkForm, source: event.target.value })}><option value="">Выберите</option>{active.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>Порт источника<input required value={linkForm.sourcePort} onChange={(event) => setLinkForm({ ...linkForm, sourcePort: event.target.value })} placeholder="1/0/1" /></label><label>К устройству<select required value={linkForm.target} onChange={(event) => setLinkForm({ ...linkForm, target: event.target.value })}><option value="">Выберите</option>{active.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label><label>Порт назначения<input required value={linkForm.targetPort} onChange={(event) => setLinkForm({ ...linkForm, targetPort: event.target.value })} placeholder="1/0/48" /></label><label>Тип кабеля<select value={linkForm.cableType} onChange={(event) => setLinkForm({ ...linkForm, cableType: event.target.value as CableType })}>{Object.entries(cableLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="full">Комментарий<input value={linkForm.label ?? ''} onChange={(event) => setLinkForm({ ...linkForm, label: event.target.value })} placeholder="Магистраль, патч-панель..." /></label><div className="modal-actions full">{linkForm.id && <button type="button" className="button danger-button" onClick={() => { updateTopology(active.id, { links: active.links.filter((item) => item.id !== linkForm.id) }); setLinkForm(null) }}><Trash2 size={16} /> Удалить</button>}<button type="button" className="button" onClick={() => setLinkForm(null)}>Отмена</button><button className="button primary">Сохранить</button></div></form></Modal>}
  </div>
}
