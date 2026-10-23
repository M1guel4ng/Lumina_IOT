import type { ReactNode } from 'react'
import type { NodeState, NodeEvent } from '../services/dashboardService'
import { NodeLabelDisplay } from './NodeLabelEditor'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function relativeTime(value: string | null, now: number): string {
  if (!value) return 'Sin datos'
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `Hace ${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Hace ${minutes} min`
  return `Hace ${Math.floor(minutes / 60)} h`
}

export function eventText(event: NodeEvent): string {
  if (event.type === 'presence') return event.value ? 'Presencia detectada' : 'Sin presencia'
  if (event.type === 'lightLevel') return `Nivel de luz ${event.value}%`
  if (event.type === 'light') return `Luminaria ${event.value === 'on' ? 'encendida' : 'apagada'}`
  if (event.type === 'mode') return `Modo ${event.value === 'auto' ? 'automático' : 'manual'} activado`
  return event.value === 'online' ? 'Nodo conectado' : 'Nodo desconectado'
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    presence: <><circle cx="12" cy="7" r="3"/><path d="M5 21a7 7 0 0 1 14 0M19 5c2 2 2 5 0 7M21 3c3 3 3 8 0 11"/></>,
    sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></>,
    bulb:     <><path d="M9 18h6M10 22h4M8.2 14.5A6 6 0 1 1 15.8 14.5C14.7 15.3 14 16.5 14 18h-4c0-1.5-.7-2.7-1.8-3.5Z"/></>,
    mode:     <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
    wifi:     <><path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9.5 16.5a4 4 0 0 1 5 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></>,
    clock:    <><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
    chip:     <><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M10 10h4v4h-4z"/></>,
    history:  <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    logout:   <><path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h10"/></>,
    layout:   <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></>,
    list:     <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
    edit:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z"/></>,
    close:    <><path d="M18 6 6 18M6 6l12 12"/></>,
    moon:     <><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></>,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// ─── PanelTitle ───────────────────────────────────────────────────────────────

export function PanelTitle({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <h2 className="panel-title">
      <Icon name={icon} />
      {children}
    </h2>
  )
}

// ─── Metric ───────────────────────────────────────────────────────────────────

export function Metric({
  icon, label, value, tone, stale,
}: { icon: string; label: string; value: string; tone: string; stale: boolean }) {
  return (
    <article className={`metric ${tone} ${stale ? 'stale' : ''}`}>
      <div className="metric-icon"><Icon name={icon} /></div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {stale && <span>Desactualizado</span>}
      </div>
    </article>
  )
}

// ─── SimpleView ───────────────────────────────────────────────────────────────

interface SimpleViewProps {
  selected: NodeState
  now: number
  label: string
  rawLabel: string
  onEditLabel: () => void
}

export function SimpleView({ selected, now, label, rawLabel, onEditLabel }: SimpleViewProps) {
  const isOnline = selected.status === 'online'
  const hasPresence = selected.presence === true
  const lightOn = selected.light === 'on'
  const isAuto = selected.mode === 'auto'

  const rows: { icon: string; label: string; value: string; tone: string }[] = [
    {
      icon: 'chip',
      label: 'Nodo',
      value: selected.deviceId,
      tone: isOnline ? 'green' : 'red',
    },
    {
      icon: 'wifi',
      label: 'Conexión',
      value: isOnline ? 'En línea' : 'Desconectado',
      tone: isOnline ? 'green' : 'red',
    },
    {
      icon: 'presence',
      label: 'Presencia',
      value: selected.presence == null ? 'Sin datos' : hasPresence ? 'Detectada' : 'Sin presencia',
      tone: hasPresence ? 'green' : 'blue',
    },
    {
      icon: 'sun',
      label: 'Luz ambiental',
      value: selected.lightLevel == null ? 'Sin datos' : `${selected.lightLevel}%`,
      tone: 'blue',
    },
    {
      icon: 'bulb',
      label: 'Luminaria',
      value: selected.light == null ? 'Sin datos' : lightOn ? 'Encendida' : 'Apagada',
      tone: 'amber',
    },
    {
      icon: 'mode',
      label: 'Modo',
      value: selected.mode == null ? 'Sin datos' : isAuto ? 'Automático' : 'Manual',
      tone: 'blue',
    },
    {
      icon: 'clock',
      label: 'Última actualización',
      value: relativeTime(selected.lastSeenAt, now),
      tone: 'navy',
    },
  ]

  return (
    <section className="simple-view" aria-label="Vista simple del nodo">
      {selected.stale && (
        <div className="sv-stale-banner">
          <Icon name="clock" />
          <span>Datos desactualizados — el nodo no responde</span>
        </div>
      )}

      <div className="sv-status-hero">
        <div className={`sv-status-orb ${selected.status}`}>
          <Icon name="chip" />
        </div>
        <div className="sv-status-info">
          <NodeLabelDisplay
            deviceId={selected.deviceId}
            label={label}
            rawLabel={rawLabel}
            onEdit={onEditLabel}
            className="sv-name-display"
          />
          <span className={`status-pill ${selected.status}`}>
            <i />
            {isOnline ? 'En línea' : 'Desconectado'}
          </span>
        </div>
      </div>

      <ul className="sv-rows">
        {rows.map((row) => (
          <li key={row.label} className={`sv-row ${row.tone}`}>
            <span className="sv-row-icon">
              <Icon name={row.icon} />
            </span>
            <span className="sv-row-label">{row.label}</span>
            <strong className="sv-row-value">{row.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}
