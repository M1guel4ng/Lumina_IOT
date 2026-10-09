const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const TOKEN_KEY = 'lumina_token'
export interface AuthUser { id: string; username: string; role: 'admin' | 'operator' }
interface LoginResponse { success: true; token: string; user: AuthUser }
export function getToken(): string | null { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) }
export function saveToken(token: string, remember: boolean): void { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY); (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token) }
export function clearSession(): void { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY) }
async function parseResponse<T>(response: Response): Promise<T> { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || 'No se pudo completar la solicitud.'); return body as T }
export async function loginRequest(username: string, password: string): Promise<LoginResponse> { return parseResponse<LoginResponse>(await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })) }
export async function getCurrentUser(): Promise<AuthUser> { const token = getToken(); if (!token) throw new Error('No hay una sesión activa.'); return parseResponse<AuthUser>(await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })) }
