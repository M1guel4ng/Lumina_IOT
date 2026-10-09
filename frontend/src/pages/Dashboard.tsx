import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getEvents, getNodes, streamRealtime, type NodeEvent, type NodeState } from '../services/dashboardService'
import './Dashboard.css'

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    presence: <><circle cx="12" cy="7" r="3"/><path d="M5 21a7 7 0 0 1 14 0M19 5c2 2 2 5 0 7M21 3c3 3 3 8 0 11"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></>,
    bulb: <><path d="M9 18h6M10 22h4M8.2 14.5A6 6 0 1 1 15.8 14.5C14.7 15.3 14 16.5 14 18h-4c0-1.5-.7-2.7-1.8-3.5Z"/></>,
    mode: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
    wifi: <><path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.5 16.5a4 4 0 0 1 5 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M10 10h4v4h-4z"/></>,
    history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function relativeTime(value: string | null, now: number): string {
  if (!value) return 'Sin datos'; const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `Hace ${seconds} s`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `Hace ${minutes} min`; return `Hace ${Math.floor(minutes / 60)} h`
}

function eventText(event: NodeEvent): string {
  if (event.type === 'presence') return event.value ? 'Presencia detectada' : 'Sin presencia'
  if (event.type === 'lightLevel') return `Nivel de luz ${event.value}%`
  if (event.type === 'light') return `Luminaria ${event.value === 'on' ? 'encendida' : 'apagada'}`
  if (event.type === 'mode') return `Modo ${event.value === 'auto' ? 'automático' : 'manual'} activado`
  return event.value === 'online' ? 'Nodo conectado' : 'Nodo desconectado'
}

export function Dashboard() {
  const { user, logout } = useAuth(); const navigate = useNavigate()
  const [nodes, setNodes] = useState<NodeState[]>([]); const [selectedId, setSelectedId] = useState(''); const [events, setEvents] = useState<NodeEvent[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [now, setNow] = useState(0)
  const selected = useMemo(() => nodes.find((node) => node.deviceId === selectedId) ?? null, [nodes, selectedId])

  const loadEvents = useCallback(async (deviceId: string) => { try { setEvents(await getEvents(deviceId)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los eventos.') } }, [])
  useEffect(() => { getNodes().then((items) => { setNodes(items); if (items[0]) { setSelectedId(items[0].deviceId); void loadEvents(items[0].deviceId) } }).catch((reason) => setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los nodos.')).finally(() => setLoading(false)) }, [loadEvents])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const controller = new AbortController(); let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    const connect = () => void streamRealtime((message) => {
      setNodes((current) => { const exists = current.some((node) => node.deviceId === message.data.deviceId); return exists ? current.map((node) => node.deviceId === message.data.deviceId ? message.data : node) : [...current, message.data].sort((a, b) => a.deviceId.localeCompare(b.deviceId)) })
      if (message.data.deviceId === selectedId) void loadEvents(selectedId)
    }, controller.signal).catch(() => { if (!controller.signal.aborted) reconnectTimer = setTimeout(connect, 2000) })
    connect(); return () => { controller.abort(); if (reconnectTimer) clearTimeout(reconnectTimer) }
  }, [selectedId, loadEvents])

  function selectNode(deviceId: string) { setSelectedId(deviceId); void loadEvents(deviceId) }
  function signOut() { logout(); navigate('/login', { replace: true }) }
  return (
    <main className="monitor-layout">
      <aside className="monitor-sidebar"><div className="monitor-logo"><span>♧</span><div><strong>Lumina<span>IoT</span></strong><small>Sistema IoT de<br/>Iluminación Adaptativa</small></div></div><nav aria-label="Navegación principal"><a className="active" href="#dashboard"><b>⌂</b>Dashboard</a><a href="#summary"><b>◉</b>Sensores</a><a href="#events"><b>◷</b>Historial</a></nav><div className="sidebar-footer">Iluminación inteligente<br/>para entornos más eficientes<i/></div></aside>
      <section className="monitor-content" id="dashboard">
        <header className="monitor-header"><div><h1>Dashboard de monitoreo</h1><p>Estado actual del ambiente en tiempo real</p></div><div className="header-actions"><select aria-label="Nodo seleccionado" value={selectedId} onChange={(event) => selectNode(event.target.value)}>{nodes.map((node) => <option key={node.deviceId}>{node.deviceId}</option>)}</select><span className={`status-pill ${selected?.status ?? 'offline'}`}><i/>{selected?.status === 'online' ? 'En línea' : 'Desconectado'}</span><button type="button" className="avatar" onClick={signOut} aria-label={`Cerrar sesión de ${user?.username}`} title="Cerrar sesión"><Icon name="logout"/></button></div></header>
        {error && <div className="dashboard-error" role="alert">{error}</div>}
        {selected?.stale && <div className="stale-alert"><strong>⚠ Los datos mostrados pueden no estar actualizados.</strong> El nodo está desconectado y la información corresponde al último estado recibido.</div>}
        {loading ? <div className="dashboard-empty">Cargando estado de los nodos…</div> : !selected ? <div className="dashboard-empty"><Icon name="chip"/><h2>No hay nodos registrados</h2><p>Inicia el simulador o conecta un ESP32 para comenzar a recibir telemetría.</p></div> : <>
          <section className="top-metrics" aria-label="Resumen del estado"><Metric icon="presence" label="Presencia" value={selected.presence == null ? 'Sin datos' : selected.presence ? 'Detectada' : 'Sin presencia'} tone={selected.presence ? 'green' : 'blue'} stale={selected.stale}/><Metric icon="sun" label="Luz ambiental" value={selected.lightLevel == null ? 'Sin datos' : `${selected.lightLevel}%`} tone="blue" stale={selected.stale}/><Metric icon="bulb" label="Luminaria" value={selected.light == null ? 'Sin datos' : selected.light === 'on' ? 'Encendida' : 'Apagada'} tone="amber" stale={selected.stale}/><Metric icon="mode" label="Modo" value={selected.mode == null ? 'Sin datos' : selected.mode === 'auto' ? 'Automático' : 'Manual'} tone="blue" stale={selected.stale}/><Metric icon="wifi" label="Conexión" value={selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'} tone={selected.status === 'online' ? 'green' : 'red'} stale={selected.stale}/><Metric icon="clock" label="Última actualización" value={relativeTime(selected.lastSeenAt, now)} tone="navy" stale={selected.stale}/></section>
          <div className="dashboard-grid"><div className="left-column"><section className="panel node-panel"><PanelTitle icon="chip">Estado del nodo seleccionado</PanelTitle><div className="node-detail"><div className="device-visual"><Icon name="chip"/></div><div className="device-copy"><h2>{selected.deviceId}</h2><span className={`status-pill ${selected.status}`}><i/>{selected.status === 'online' ? 'En línea' : 'Desconectado'}</span><p>{selected.stale ? 'El nodo no está respondiendo. Se muestra el último estado recibido.' : 'Los datos del nodo se encuentran sincronizados en tiempo real.'}</p></div><dl><div><dt>Conexión</dt><dd>{selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'}</dd></div><div><dt>Última actualización</dt><dd>{relativeTime(selected.lastSeenAt, now)}</dd></div><div><dt>Estado de datos</dt><dd>{selected.stale ? 'Desactualizados' : 'Sincronizados'}</dd></div></dl></div></section><section className="panel summary-panel" id="summary"><PanelTitle icon="mode">Resumen actual</PanelTitle><div className="summary-grid"><Metric icon="presence" label="Presencia" value={selected.presence == null ? 'Sin datos' : selected.presence ? 'Detectada' : 'Sin presencia'} tone="green" stale={selected.stale}/><Metric icon="sun" label="Luz ambiental" value={selected.lightLevel == null ? 'Sin datos' : `${selected.lightLevel}%`} tone="blue" stale={selected.stale}/><Metric icon="bulb" label="Luminaria" value={selected.light == null ? 'Sin datos' : selected.light === 'on' ? 'Encendida' : 'Apagada'} tone="amber" stale={selected.stale}/><Metric icon="mode" label="Modo" value={selected.mode == null ? 'Sin datos' : selected.mode === 'auto' ? 'Automático' : 'Manual'} tone="blue" stale={selected.stale}/><Metric icon="wifi" label="Conexión" value={selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'} tone={selected.status === 'online' ? 'green' : 'red'} stale={selected.stale}/><Metric icon="clock" label="Última actualización" value={relativeTime(selected.lastSeenAt, now)} tone="navy" stale={selected.stale}/></div></section></div>
            <div className="right-column"><section className="panel selector-panel"><PanelTitle icon="chip">Seleccionar nodo</PanelTitle><select value={selectedId} onChange={(event) => selectNode(event.target.value)}>{nodes.map((node) => <option key={node.deviceId}>{node.deviceId}</option>)}</select><p>Puedes monitorear el estado de múltiples nodos del sistema.</p></section><section className="panel events-panel" id="events"><PanelTitle icon="history">Últimos 10 eventos</PanelTitle>{events.length ? <ol>{events.map((event) => <li key={event._id}><span className={`event-icon ${event.type}`}><Icon name={event.type === 'lightLevel' ? 'sun' : event.type === 'light' ? 'bulb' : event.type === 'connection' ? 'wifi' : event.type === 'mode' ? 'mode' : 'presence'}/></span><strong>{eventText(event)}</strong><time>{new Date(event.timestamp).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><em>{event.type}</em></li>)}</ol> : <p className="no-events">Aún no hay eventos para este nodo.</p>}</section></div></div>
        </>}
      </section>
    </main>
  )
}

function PanelTitle({ icon, children }: { icon: string; children: ReactNode }) { return <h2 className="panel-title"><Icon name={icon}/>{children}</h2> }
function Metric({ icon, label, value, tone, stale }: { icon: string; label: string; value: string; tone: string; stale: boolean }) { return <article className={`metric ${tone} ${stale ? 'stale' : ''}`}><div className="metric-icon"><Icon name={icon}/></div><div><small>{label}</small><strong>{value}</strong>{stale && <span>Desactualizado</span>}</div></article> }
