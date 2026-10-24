import { getToken } from './authService'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function post(path: string, body: object): Promise<void> {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (response.ok) return
  const data = (await response.json().catch(() => null)) as { message?: string } | null
  throw new Error(response.status === 401 ? 'Tu sesión expiró.' : data?.message ?? 'No se pudo enviar el comando.')
}

export const setNodeMode = (deviceId: string, mode: 'auto' | 'manual') =>
  post(`/api/nodes/${encodeURIComponent(deviceId)}/mode`, { mode })

export const setNodeLight = (deviceId: string, state: 'on' | 'off') =>
  post(`/api/nodes/${encodeURIComponent(deviceId)}/light`, { state })
