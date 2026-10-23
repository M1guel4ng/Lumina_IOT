import { useState } from 'react'
import type { NodeState } from '../services/dashboardService'
import { controlNode } from '../services/dashboardService'
import { Icon } from './DashboardComponents'

interface ControlCardProps {
  node: NodeState
  label: string
}

function ControlCard({ node, label }: ControlCardProps) {
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<'ok' | 'err' | null>(null)

  const isOnline = node.status === 'online'
  const lightOn = node.light === 'on'
  const unknown = node.light == null

  async function handleToggle() {
    if (!isOnline || sending) return
    const action = lightOn ? 'light_off' : 'light_on'
    setSending(true)
    setFeedback(null)
    try {
      await controlNode(node.deviceId, action)
      setFeedback('ok')
    } catch {
      setFeedback('err')
    } finally {
      setSending(false)
      setTimeout(() => setFeedback(null), 2500)
    }
  }

  return (
    <article className={`ctrl-card ${lightOn ? 'light-on' : 'light-off'} ${!isOnline ? 'offline' : ''}`}>
      {/* ── Header ── */}
      <div className="ctrl-card-header">
        <span className={`ctrl-dot ${isOnline ? 'online' : 'offline'}`} />
        <span className="ctrl-card-status">{isOnline ? 'En línea' : 'Desconectado'}</span>
      </div>

      {/* ── Bulb visual ── */}
      <div className={`ctrl-bulb-wrap ${lightOn ? 'on' : 'off'}`}>
        <div className="ctrl-bulb-glow" />
        <div className="ctrl-bulb-icon">
          <Icon name="bulb" />
        </div>
      </div>

      {/* ── Name ── */}
      <h3 className="ctrl-card-name">{label}</h3>
      <p className="ctrl-card-id">{node.deviceId}</p>

      {/* ── Current state badge ── */}
      <div className={`ctrl-state-badge ${unknown ? 'unknown' : lightOn ? 'on' : 'off'}`}>
        {unknown ? 'Sin datos' : lightOn ? 'Encendido' : 'Apagado'}
      </div>

      {/* ── Único botón de apagar y prender ── */}
      <div className="ctrl-actions">
        <button
          type="button"
          id={`ctrl-toggle-${node.deviceId}`}
          className={`ctrl-toggle-btn ${lightOn ? 'is-on' : 'is-off'}`}
          disabled={!isOnline || sending}
          onClick={() => void handleToggle()}
          aria-label={lightOn ? `Apagar luz de ${label}` : `Encender luz de ${label}`}
        >
          <span className="ctrl-btn-icon-wrap">
            <Icon name={lightOn ? 'moon' : 'bulb'} />
          </span>
          <span className="ctrl-btn-text">
            {sending ? 'Enviando...' : lightOn ? 'Apagar luz' : 'Encender luz'}
          </span>
        </button>
      </div>

      {/* ── Feedback toast ── */}
      {feedback && (
        <div className={`ctrl-feedback ${feedback}`} role="status">
          {feedback === 'ok' ? '✓ Comando enviado' : '✗ Error al enviar'}
        </div>
      )}

      {/* ── Offline overlay ── */}
      {!isOnline && (
        <div className="ctrl-offline-overlay">
          <Icon name="wifi" />
          <span>Nodo desconectado</span>
        </div>
      )}
    </article>
  )
}

interface ControlViewProps {
  nodes: NodeState[]
  getLabel: (deviceId: string) => string
}

export function ControlView({ nodes, getLabel }: ControlViewProps) {
  if (nodes.length === 0) {
    return (
      <div className="ctrl-empty">
        <Icon name="bulb" />
        <h2>Sin nodos disponibles</h2>
        <p>Inicia el simulador o conecta un ESP32 para controlar las luminarias.</p>
      </div>
    )
  }

  return (
    <section className="ctrl-view" aria-label="Control de luminarias">
      <div className="ctrl-header">
        <div>
          <h2 className="ctrl-title">Control de luminarias</h2>
          <p className="ctrl-subtitle">
            {nodes.length} nodo{nodes.length !== 1 ? 's' : ''} registrado{nodes.length !== 1 ? 's' : ''}
            {' · '}
            {nodes.filter(n => n.status === 'online').length} en línea
          </p>
        </div>
      </div>

      <div className="ctrl-grid" style={{ '--ctrl-cols': Math.min(2, nodes.length) } as React.CSSProperties}>
        {nodes.map((node) => (
          <ControlCard key={node.deviceId} node={node} label={getLabel(node.deviceId)} />
        ))}
      </div>
    </section>
  )
}
