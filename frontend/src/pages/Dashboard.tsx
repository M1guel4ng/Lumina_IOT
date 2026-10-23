import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getEvents, getNodes, streamRealtime, type NodeEvent, type NodeState } from '../services/dashboardService'
import {
  Icon,
  Metric,
  PanelTitle,
  SimpleView,
  eventText,
  relativeTime,
} from '../components/DashboardComponents'
import { NodeLabelEditor, NodeLabelDisplay } from '../components/NodeLabelEditor'
import { useNodeLabels } from '../hooks/useNodeLabels'
import './Dashboard.css'

export function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [nodes, setNodes] = useState<NodeState[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [events, setEvents] = useState<NodeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const [simpleView, setSimpleView] = useState(false)
  /** deviceId being edited, or null when dialog is closed */
  const [editingId, setEditingId] = useState<string | null>(null)

  const { getLabel, getRawLabel, setLabel } = useNodeLabels()

  const selected = useMemo(
    () => nodes.find((node) => node.deviceId === selectedId) ?? null,
    [nodes, selectedId],
  )

  const loadEvents = useCallback(async (deviceId: string) => {
    try {
      setEvents(await getEvents(deviceId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los eventos.')
    }
  }, [])

  useEffect(() => {
    getNodes()
      .then((items) => {
        setNodes(items)
        if (items[0]) {
          setSelectedId(items[0].deviceId)
          void loadEvents(items[0].deviceId)
        }
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los nodos.'),
      )
      .finally(() => setLoading(false))
  }, [loadEvents])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const selectedIdRef = useRef(selectedId)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    const controller = new AbortController()
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const connect = () =>
      void streamRealtime((message) => {
        setNodes((current) => {
          const exists = current.some((node) => node.deviceId === message.data.deviceId)
          return exists
            ? current.map((node) =>
                node.deviceId === message.data.deviceId ? message.data : node,
              )
            : [...current, message.data].sort((a, b) => a.deviceId.localeCompare(b.deviceId))
        })
        if (message.data.deviceId === selectedIdRef.current)
          void loadEvents(selectedIdRef.current)
      }, controller.signal).catch(() => {
        if (!controller.signal.aborted) reconnectTimer = setTimeout(connect, 2000)
      })

    connect()
    return () => {
      controller.abort()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [loadEvents])

  function selectNode(deviceId: string) {
    setSelectedId(deviceId)
    void loadEvents(deviceId)
  }

  function signOut() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <main className="monitor-layout">
      {/* ── Label editor dialog ── */}
      {editingId !== null && (
        <NodeLabelEditor
          deviceId={editingId}
          currentLabel={getRawLabel(editingId)}
          onSave={(label) => setLabel(editingId, label)}
          onClose={() => setEditingId(null)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className="monitor-sidebar">
        <div className="monitor-logo">
          <span>♧</span>
          <div>
            <strong>Lumina<span>IoT</span></strong>
            <small>Sistema IoT de<br/>Iluminación Adaptativa</small>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          <a className="active" href="#dashboard"><b>⌂</b>Dashboard</a>
          <a href="#summary"><b>◉</b>Sensores</a>
          <a href="#events"><b>◷</b>Historial</a>
        </nav>
        <div className="sidebar-footer">
          Iluminación inteligente<br/>para entornos más eficientes<i/>
        </div>
      </aside>

      {/* ── Main content ── */}
      <section className="monitor-content" id="dashboard">
        <header className="monitor-header">
          <div>
            <h1>Dashboard de monitoreo</h1>
            <p>Estado actual del ambiente en tiempo real</p>
          </div>
          <div className="header-actions">
            {/* Node selector — shows alias in options */}
            <select
              aria-label="Nodo seleccionado"
              value={selectedId}
              onChange={(e) => selectNode(e.target.value)}
            >
              {nodes.map((node) => (
                <option key={node.deviceId} value={node.deviceId}>
                  {getLabel(node.deviceId)}
                </option>
              ))}
            </select>

            {/* Vista simple toggle */}
            <button
              id="btn-simple-view"
              type="button"
              className={`btn-simple-view ${simpleView ? 'active' : ''}`}
              onClick={() => setSimpleView((v) => !v)}
              aria-pressed={simpleView}
              title={simpleView ? 'Cambiar a vista completa' : 'Cambiar a vista simple'}
            >
              <Icon name={simpleView ? 'layout' : 'list'} />
              <span>{simpleView ? 'Vista completa' : 'Vista simple'}</span>
            </button>

            <span className={`status-pill ${selected?.status ?? 'offline'}`}>
              <i/>
              {selected?.status === 'online' ? 'En línea' : 'Desconectado'}
            </span>
            <button
              type="button"
              className="avatar"
              onClick={signOut}
              aria-label={`Cerrar sesión de ${user?.username}`}
              title="Cerrar sesión"
            >
              <Icon name="logout"/>
            </button>
          </div>
        </header>

        {error && <div className="dashboard-error" role="alert">{error}</div>}
        {selected?.stale && (
          <div className="stale-alert">
            <strong>⚠ Los datos mostrados pueden no estar actualizados.</strong>{' '}
            El nodo está desconectado y la información corresponde al último estado recibido.
          </div>
        )}

        {loading ? (
          <div className="dashboard-empty">Cargando estado de los nodos…</div>
        ) : !selected ? (
          <div className="dashboard-empty">
            <Icon name="chip"/>
            <h2>No hay nodos registrados</h2>
            <p>Inicia el simulador o conecta un ESP32 para comenzar a recibir telemetría.</p>
          </div>
        ) : simpleView ? (
          /* ══════════════ VISTA SIMPLE ══════════════ */
          <SimpleView
            selected={selected}
            now={now}
            label={getLabel(selected.deviceId)}
            rawLabel={getRawLabel(selected.deviceId)}
            onEditLabel={() => setEditingId(selected.deviceId)}
          />
        ) : (
          /* ══════════════ VISTA COMPLETA ══════════════ */
          <>
            <section className="top-metrics" aria-label="Resumen del estado">
              <Metric icon="presence" label="Presencia"
                value={selected.presence == null ? 'Sin datos' : selected.presence ? 'Detectada' : 'Sin presencia'}
                tone={selected.presence ? 'green' : 'blue'} stale={selected.stale}/>
              <Metric icon="sun" label="Luz ambiental"
                value={selected.lightLevel == null ? 'Sin datos' : `${selected.lightLevel}%`}
                tone="blue" stale={selected.stale}/>
              <Metric icon="bulb" label="Luminaria"
                value={selected.light == null ? 'Sin datos' : selected.light === 'on' ? 'Encendida' : 'Apagada'}
                tone="amber" stale={selected.stale}/>
              <Metric icon="mode" label="Modo"
                value={selected.mode == null ? 'Sin datos' : selected.mode === 'auto' ? 'Automático' : 'Manual'}
                tone="blue" stale={selected.stale}/>
              <Metric icon="wifi" label="Conexión"
                value={selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'}
                tone={selected.status === 'online' ? 'green' : 'red'} stale={selected.stale}/>
              <Metric icon="clock" label="Última actualización"
                value={relativeTime(selected.lastSeenAt, now)}
                tone="navy" stale={selected.stale}/>
            </section>

            <div className="dashboard-grid">
              <div className="left-column">
                {/* Node status panel */}
                <section className="panel node-panel">
                  <PanelTitle icon="chip">Estado del nodo seleccionado</PanelTitle>
                  <div className="node-detail">
                    <div className="device-visual"><Icon name="chip"/></div>
                    <div className="device-copy">
                      {/* Node name with edit button */}
                      <NodeLabelDisplay
                        deviceId={selected.deviceId}
                        label={getLabel(selected.deviceId)}
                        rawLabel={getRawLabel(selected.deviceId)}
                        onEdit={() => setEditingId(selected.deviceId)}
                        className="node-name-display"
                      />
                      <span className={`status-pill ${selected.status}`}>
                        <i/>{selected.status === 'online' ? 'En línea' : 'Desconectado'}
                      </span>
                      <p>
                        {selected.stale
                          ? 'El nodo no está respondiendo. Se muestra el último estado recibido.'
                          : 'Los datos del nodo se encuentran sincronizados en tiempo real.'}
                      </p>
                    </div>
                    <dl>
                      <div><dt>ID del dispositivo</dt><dd>{selected.deviceId}</dd></div>
                      <div><dt>Conexión</dt><dd>{selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'}</dd></div>
                      <div><dt>Última actualización</dt><dd>{relativeTime(selected.lastSeenAt, now)}</dd></div>
                      <div><dt>Estado de datos</dt><dd>{selected.stale ? 'Desactualizados' : 'Sincronizados'}</dd></div>
                    </dl>
                  </div>
                </section>

                {/* Summary panel */}
                <section className="panel summary-panel" id="summary">
                  <PanelTitle icon="mode">Resumen actual</PanelTitle>
                  <div className="summary-grid">
                    <Metric icon="presence" label="Presencia"
                      value={selected.presence == null ? 'Sin datos' : selected.presence ? 'Detectada' : 'Sin presencia'}
                      tone="green" stale={selected.stale}/>
                    <Metric icon="sun" label="Luz ambiental"
                      value={selected.lightLevel == null ? 'Sin datos' : `${selected.lightLevel}%`}
                      tone="blue" stale={selected.stale}/>
                    <Metric icon="bulb" label="Luminaria"
                      value={selected.light == null ? 'Sin datos' : selected.light === 'on' ? 'Encendida' : 'Apagada'}
                      tone="amber" stale={selected.stale}/>
                    <Metric icon="mode" label="Modo"
                      value={selected.mode == null ? 'Sin datos' : selected.mode === 'auto' ? 'Automático' : 'Manual'}
                      tone="blue" stale={selected.stale}/>
                    <Metric icon="wifi" label="Conexión"
                      value={selected.status === 'online' ? 'MQTT conectado' : 'MQTT desconectado'}
                      tone={selected.status === 'online' ? 'green' : 'red'} stale={selected.stale}/>
                    <Metric icon="clock" label="Última actualización"
                      value={relativeTime(selected.lastSeenAt, now)}
                      tone="navy" stale={selected.stale}/>
                  </div>
                </section>
              </div>

              <div className="right-column">
                {/* Node selector panel — shows all nodes with aliases */}
                <section className="panel selector-panel">
                  <PanelTitle icon="chip">Seleccionar nodo</PanelTitle>
                  <ul className="node-list">
                    {nodes.map((node) => (
                      <li
                        key={node.deviceId}
                        className={`node-list-item ${node.deviceId === selectedId ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className="node-list-select"
                          onClick={() => selectNode(node.deviceId)}
                        >
                          <span className={`node-list-dot ${node.status}`} />
                          <span className="node-list-name">{getLabel(node.deviceId)}</span>
                          {getRawLabel(node.deviceId) && (
                            <span className="node-list-id">{node.deviceId}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="node-list-edit"
                          onClick={() => setEditingId(node.deviceId)}
                          title={`Editar nombre de ${node.deviceId}`}
                          aria-label={`Editar nombre de ${node.deviceId}`}
                        >
                          <Icon name="edit" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="selector-hint">Puedes monitorear el estado de múltiples nodos del sistema.</p>
                </section>

                {/* Events panel */}
                <section className="panel events-panel" id="events">
                  <PanelTitle icon="history">Últimos 10 eventos</PanelTitle>
                  {events.length ? (
                    <ol>
                      {events.map((event) => (
                        <li key={event._id}>
                          <span className={`event-icon ${event.type}`}>
                            <Icon name={
                              event.type === 'lightLevel' ? 'sun' :
                              event.type === 'light' ? 'bulb' :
                              event.type === 'connection' ? 'wifi' :
                              event.type === 'mode' ? 'mode' : 'presence'
                            }/>
                          </span>
                          <strong>{eventText(event)}</strong>
                          <time>
                            {new Date(event.timestamp).toLocaleTimeString('es-BO', {
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                          </time>
                          <em>{event.type}</em>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="no-events">Aún no hay eventos para este nodo.</p>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
