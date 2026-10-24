import { useState } from 'react'
import { setNodeLight, setNodeMode } from '../services/commandService'
import type { NodeState } from '../services/dashboardService'
import './NodeControls.css'

// El estado que se muestra siempre es el que llega por telemetría (SSE), no el que se envió.
export function NodeControls({ node }: { node: NodeState }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const online = node.status === 'online'
  const manual = node.mode === 'manual'

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try { await action() }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'No se pudo enviar el comando.') }
    finally { setBusy(false) }
  }

  return (
    <section className="panel node-controls" aria-label="Control del nodo">
      <h2 className="panel-title">Control de la luminaria</h2>
      <div className="node-controls-row">
        <div className="node-controls-group" role="group" aria-label="Modo">
          <span>Modo</span>
          <button type="button" className={node.mode === 'auto' ? 'active' : ''} disabled={!online || busy} onClick={() => void run(() => setNodeMode(node.deviceId, 'auto'))}>Automático</button>
          <button type="button" className={manual ? 'active' : ''} disabled={!online || busy} onClick={() => void run(() => setNodeMode(node.deviceId, 'manual'))}>Manual</button>
        </div>
        <div className="node-controls-group" role="group" aria-label="Luminaria">
          <span>Luminaria</span>
          <button type="button" className={node.light === 'on' ? 'active' : ''} disabled={!online || !manual || busy} onClick={() => void run(() => setNodeLight(node.deviceId, 'on'))}>Encender</button>
          <button type="button" className={node.light === 'off' ? 'active' : ''} disabled={!online || !manual || busy} onClick={() => void run(() => setNodeLight(node.deviceId, 'off'))}>Apagar</button>
        </div>
      </div>
      {!online && <p className="node-controls-hint">El nodo está desconectado: no se pueden enviar comandos.</p>}
      {online && !manual && <p className="node-controls-hint">Cambia a modo manual para encender o apagar la luminaria.</p>}
      {message && <p className="node-controls-error" role="alert">{message}</p>}
    </section>
  )
}
