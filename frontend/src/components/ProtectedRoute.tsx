import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
export function ProtectedRoute() { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <main className="session-loading" aria-live="polite"><span className="spinner" />Verificando sesión…</main>; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />; return <Outlet /> }
