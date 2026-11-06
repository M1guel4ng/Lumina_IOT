import { useState } from 'react'
import type { NodeState } from '../services/dashboardService'
import { controlNode } from '../services/dashboardService'
import { setNodeMode } from '../services/commandService'
import { Icon } from './DashboardComponents'

interface ControlCardProps {
  node: NodeState
  label: string
  globalMode: 'manual' | 'pir' | 'ldr'
}

function ControlCard({ node, label, globalMode }: ControlCardProps) {
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

      {/* ── Acciones de control según el Modo Global ── */}
      <div className="ctrl-actions" style={{ marginTop: '8px' }}>
        {globalMode === 'manual' ? (
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
        ) : globalMode === 'pir' ? (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <span></span>
            <span>Control por PIR (10s de apagado)</span>
          </div>
        ) : (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            color: '#6b21a8',
            fontSize: '12px',
            fontWeight: 600,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px'
          }}>
            <span></span>
            <span>Control por Sensor LDR (&lt; 40%)</span>
          </div>
        )}
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
  // Filtrar para mostrar únicamente los nodos conectados y válidos (sin duplicados)
  const connectedNodes = nodes.filter(
    (n) => n.deviceId === 'sim-01' || n.deviceId === 'sim-02' || (n.status === 'online' && !n.deviceId.startsWith('esp32-'))
  )

  // Modo global del sistema
  const firstNode = connectedNodes[0]
  const rawMode = firstNode?.mode
  const globalMode: 'manual' | 'pir' | 'ldr' =
    rawMode === 'manual' ? 'manual' : rawMode === 'ldr' ? 'ldr' : 'pir'

  const [modeBusy, setModeBusy] = useState(false)
  const [globalFeedback, setGlobalFeedback] = useState<string | null>(null)

  async function handleGlobalMode(targetMode: 'manual' | 'pir' | 'ldr') {
    if (modeBusy) return
    setModeBusy(true)
    setGlobalFeedback(null)
    try {
      // Envía la orden a ambos nodos para sincronizar el sistema de forma global
      await Promise.all([
        setNodeMode('sim-01', targetMode),
        setNodeMode('sim-02', targetMode)
      ])
      setGlobalFeedback(`✓ Modo ${targetMode.toUpperCase()} activado`)
    } catch {
      setGlobalFeedback('✗ Error al cambiar de modo')
    } finally {
      setModeBusy(false)
      setTimeout(() => setGlobalFeedback(null), 3000)
    }
  }

  return (
    <section className="ctrl-view-root">
      {/* ══════════════════════════════════════════════════ */}
      {/* ── SELECTOR ÚNICO DE MODO GLOBAL DEL SISTEMA ── */}
      {/* ══════════════════════════════════════════════════ */}
      <div style={{
        background: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #d8e6f5',
        padding: '18px 22px',
        marginBottom: '24px',
        boxShadow: '0 4px 20px rgba(10, 33, 77, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0a214d', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Modo Global del Sistema</span>
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
              Selecciona el comportamiento de todo el sistema. Aplica para ambos nodos simultáneamente.
            </p>
          </div>
          {globalFeedback && (
            <span style={{ fontSize: '13px', fontWeight: 700, color: globalFeedback.startsWith('✓') ? '#16a34a' : '#dc2626' }}>
              {globalFeedback}
            </span>
          )}
        </div>

        {/* ── Botones de los 3 Modos Globales ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {/* 1. MODO MANUAL */}
          <button
            type="button"
            disabled={modeBusy}
            onClick={() => void handleGlobalMode('manual')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: globalMode === 'manual' ? '2px solid #f59e0b' : '1px solid #cbd5e1',
              background: globalMode === 'manual' ? '#fffbeb' : '#ffffff',
              color: globalMode === 'manual' ? '#b45309' : '#334155',
              cursor: modeBusy ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              boxShadow: globalMode === 'manual' ? '0 4px 12px rgba(245, 158, 11, 0.15)' : 'none'
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 800 }}>
              {globalMode === 'manual' ? '✓ Modo Manual' : 'Modo Manual'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
              Enciende y apaga cada foco desde la web
            </span>
          </button>

          {/* 2. MODO PIR */}
          <button
            type="button"
            disabled={modeBusy}
            onClick={() => void handleGlobalMode('pir')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: globalMode === 'pir' ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: globalMode === 'pir' ? '#eff6ff' : '#ffffff',
              color: globalMode === 'pir' ? '#1d4ed8' : '#334155',
              cursor: modeBusy ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              boxShadow: globalMode === 'pir' ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none'
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 800 }}>
              {globalMode === 'pir' ? '✓ Modo PIR (Presencia)' : 'Modo PIR (Presencia)'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
              PIR 1 a Nodo 1 | PIR 2 a Nodo 2 (LDR apagado)
            </span>
          </button>

          {/* 3. MODO LDR */}
          <button
            type="button"
            disabled={modeBusy}
            onClick={() => void handleGlobalMode('ldr')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: globalMode === 'ldr' ? '2px solid #9333ea' : '1px solid #cbd5e1',
              background: globalMode === 'ldr' ? '#faf5ff' : '#ffffff',
              color: globalMode === 'ldr' ? '#7e22ce' : '#334155',
              cursor: modeBusy ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              boxShadow: globalMode === 'ldr' ? '0 4px 12px rgba(147, 51, 234, 0.15)' : 'none'
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 800 }}>
              {globalMode === 'ldr' ? '✓ Modo LDR (Luminaria)' : 'Modo LDR (Luminaria)'}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
              Oscuridad (&lt; 40%) enciende ambos focos
            </span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* ── TARJETAS INDIVIDUALES DE CADA NODO ── */}
      {/* ══════════════════════════════════════════════════ */}
      <div className="ctrl-cards-grid">
        {connectedNodes.map((node) => (
          <ControlCard
            key={node.deviceId}
            node={node}
            label={getLabel(node.deviceId)}
            globalMode={globalMode}
          />
        ))}
      </div>
    </section>
  )
}
