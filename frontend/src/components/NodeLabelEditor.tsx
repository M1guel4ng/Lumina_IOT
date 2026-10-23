import { useEffect, useRef, useState } from 'react'
import { Icon } from './DashboardComponents'

interface NodeLabelEditorProps {
  deviceId: string
  currentLabel: string
  onSave: (label: string) => void
  onClose: () => void
}

export function NodeLabelEditor({ deviceId, currentLabel, onSave, onClose }: NodeLabelEditorProps) {
  const [value, setValue] = useState(currentLabel)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSave() {
    onSave(value)
    onClose()
  }

  function handleClear() {
    onSave('')
    onClose()
  }

  return (
    /* Backdrop */
    <div className="nle-backdrop" role="dialog" aria-modal="true" aria-label="Editar nombre del nodo" onClick={onClose}>
      <div className="nle-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="nle-header">
          <span className="nle-icon"><Icon name="chip" /></span>
          <div>
            <h2>Nombre del nodo</h2>
            <p className="nle-device-id">{deviceId}</p>
          </div>
          <button type="button" className="nle-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </header>

        <div className="nle-body">
          <label htmlFor="nle-input" className="nle-label">
            Alias personalizado
            <span className="nle-hint">Si lo dejas vacío se mostrará el ID del dispositivo</span>
          </label>
          <input
            ref={inputRef}
            id="nle-input"
            type="text"
            className="nle-input"
            placeholder={`ej. Cocina, Garaje, Sala…`}
            value={value}
            maxLength={40}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          />
          <span className="nle-char-count">{value.length}/40</span>
        </div>

        <footer className="nle-footer">
          {currentLabel && (
            <button type="button" className="nle-btn nle-btn-ghost" onClick={handleClear}>
              Quitar nombre
            </button>
          )}
          <div className="nle-footer-right">
            <button type="button" className="nle-btn nle-btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="nle-btn nle-btn-primary" onClick={handleSave}>
              Guardar
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ── Inline trigger button ─────────────────────────────────────────────────── */

interface NodeLabelTriggerProps {
  deviceId: string
  label: string
  rawLabel: string
  onEdit: () => void
  /** extra CSS class for the wrapper */
  className?: string
}

export function NodeLabelDisplay({ deviceId, label, rawLabel, onEdit, className = '' }: NodeLabelTriggerProps) {
  const hasAlias = Boolean(rawLabel.trim())
  return (
    <span className={`nld-wrapper ${className}`}>
      <span className="nld-label">{label}</span>
      {hasAlias && <span className="nld-device-id">({deviceId})</span>}
      <button
        type="button"
        className="nld-edit-btn"
        onClick={onEdit}
        title="Editar nombre del nodo"
        aria-label={`Editar nombre del nodo ${deviceId}`}
      >
        <Icon name="edit" />
      </button>
    </span>
  )
}
