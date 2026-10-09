import { useEffect, useState, type ReactNode } from 'react'
import { clearSession, getCurrentUser, getToken, loginRequest, saveToken, type AuthUser } from '../services/authService'
import { AuthContext } from './auth-context'
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null); const [loading, setLoading] = useState(() => Boolean(getToken()))
  useEffect(() => { if (!getToken()) return; getCurrentUser().then(setUser).catch(clearSession).finally(() => setLoading(false)) }, [])
  async function login(username: string, password: string, remember: boolean) { const result = await loginRequest(username, password); saveToken(result.token, remember); setUser(result.user) }
  function logout() { clearSession(); setUser(null) }
  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}
