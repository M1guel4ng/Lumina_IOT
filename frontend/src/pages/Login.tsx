import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import './Login.css'

function Icon({ children, className = '' }: { children: ReactNode; className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg> }
const UserIcon = () => <Icon><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></Icon>
const LockIcon = () => <Icon><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></Icon>
const EyeIcon = ({ hidden }: { hidden: boolean }) => <Icon>{hidden ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 6 9 6a18 18 0 0 1-2.1 2.8M6.6 6.6C4.4 8.1 3 10 3 10s3.5 6 9 6c.7 0 1.4-.1 2-.3"/></> : <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></>}</Icon>
const BulbIcon = () => <Icon className="bulb-icon"><path d="M9 18h6M10 22h4M8.2 14.5A6 6 0 1 1 15.8 14.5C14.7 15.3 14 16.5 14 18h-4c0-1.5-.7-2.7-1.8-3.5Z"/></Icon>
const FeatureIcon = ({ type }: { type: string }) => {
  if (type === 'pir') return <Icon><circle cx="12" cy="6" r="2"/><path d="m10 21 1-6-3-2 2-4 4 1 2 3M14 15l3 5M18 5c2 1 3 3 3 5M17 8c.7.5 1 1.2 1 2"/></Icon>
  if (type === 'ldr') return <Icon><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></Icon>
  if (type === 'esp32') return <Icon><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 1v3M13 1v3M17 1v3M9 20v3M13 20v3M17 20v3M1 9h3M1 13h3M1 17h3M20 9h3M20 13h3M20 17h3M10 10h4v4h-4z"/></Icon>
  return <Icon><path d="M6 18h12a4 4 0 0 0 .5-8A7 7 0 0 0 5 9a4.5 4.5 0 0 0 1 9Z"/></Icon>
}

const featureItems = [
  { icon: 'pir', title: 'Sensor PIR', text: 'Detección\nde presencia' },
  { icon: 'ldr', title: 'Sensor LDR', text: 'Medición\nde luz ambiental' },
  { icon: 'esp32', title: 'ESP32', text: 'Procesamiento\ny conexión Wi-Fi' },
  { icon: 'mqtt', title: 'MQTT', text: 'Comunicación\nen tiempo real' },
]

export function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate(); const location = useLocation()
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false); const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return
    if (!username.trim() || !password) { setError('Complete todos los campos.'); return }
    setSubmitting(true); setError('')
    try { await login(username, password, remember); const target = (location.state as { from?: string } | null)?.from || '/dashboard'; navigate(target, { replace: true }) }
    catch (reason) { setError(reason instanceof TypeError ? 'No se pudo conectar con el servidor.' : reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.') }
    finally { setSubmitting(false) }
  }

  return (
    <main className="login-page">
      <div className="ambient-lines" aria-hidden="true" />
      <section className="login-card" aria-label="Acceso al sistema IoT">
        <aside className="project-panel">
          <div className="project-overlay" />
          <div className="project-content">
            <header className="project-heading"><div className="brand-bulb"><BulbIcon /></div><div><h1>Sistema IoT de <strong>Iluminación Adaptativa</strong></h1></div></header>
            <p className="project-subtitle">Monitoreo y control remoto de ambientes interiores</p>
            <div className="feature-flow">
              {featureItems.map((item) => <div className="feature-wrap" key={item.title}><div className="feature"><div className="feature-icon"><FeatureIcon type={item.icon}/></div><strong>{item.title}</strong><span>{item.text.split('\n').map((line) => <span key={line}>{line}</span>)}</span></div></div>)}
            </div>
          </div>
        </aside>

        <section className="form-panel">
          <div className="form-inner">
            <div className="lock-badge"><LockIcon /></div>
            <h2>Acceso al sistema</h2>
            <p className="form-subtitle">Acceso seguro para monitoreo y control<br className="desktop-break"/> de luminarias</p>
            <form onSubmit={submit} noValidate>
              <label htmlFor="username">Usuario</label>
              <div className="input-shell"><span><UserIcon /></span><input id="username" name="username" autoComplete="username" placeholder="Usuario" value={username} onChange={(event) => setUsername(event.target.value)} disabled={submitting} /></div>
              <label htmlFor="password">Contraseña</label>
              <div className="input-shell"><span><LockIcon /></span><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} /><button className="visibility" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}><EyeIcon hidden={showPassword} /></button></div>
              <label className="remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={submitting}/><span className="checkmark">✓</span>Recordarme</label>
              <div className="error-message" role="alert" aria-live="polite">{error}</div>
              <button className="submit-button" type="submit" disabled={submitting}>{submitting ? <><span className="button-spinner"/>Iniciando sesión…</> : <>Iniciar sesión <span aria-hidden="true">→</span></>}</button>
            </form>
          </div>
        </section>
      </section>
    </main>
  )
}
