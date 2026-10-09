import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import './Dashboard.css'
export function Dashboard() { const { user, logout } = useAuth(); const navigate = useNavigate(); function signOut() { logout(); navigate('/login', { replace: true }) }; return <main className="dashboard-shell"><section className="dashboard-card"><div className="dashboard-brand"><span>☀</span><div><strong>Lumina IoT</strong><small>Iluminación adaptativa</small></div></div><h1>Bienvenido, {user?.username}</h1><p>Tu sesión está protegida. El panel de monitoreo y control se implementará en la siguiente etapa.</p><div className="user-chip">Rol: <strong>{user?.role}</strong></div><button type="button" onClick={signOut}>Cerrar sesión</button></section></main> }
