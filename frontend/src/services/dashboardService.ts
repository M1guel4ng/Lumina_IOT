import { getToken } from './authService'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'
export interface NodeState { _id?: string; deviceId: string; presence: boolean | null; lightLevel: number | null; light: 'on' | 'off' | null; mode: 'auto' | 'manual' | null; status: 'online' | 'offline'; stale: boolean; lastSeenAt: string | null; lastTelemetryAt: string | null }
export interface NodeEvent { _id: string; deviceId: string; type: 'presence' | 'lightLevel' | 'light' | 'mode' | 'connection'; value: boolean | number | string; source: 'node' | 'system' | 'web'; timestamp: string }
export interface RealtimeMessage { event: 'node-updated' | 'node-online' | 'node-offline'; data: NodeState }

function headers(): HeadersInit { const token = getToken(); return token ? { Authorization: `Bearer ${token}` } : {} }
async function getJson<T>(path: string): Promise<T> { const response = await fetch(`${API_URL}${path}`, { headers: headers() }); if (!response.ok) throw new Error(response.status === 401 ? 'Tu sesión expiró.' : 'No se pudieron obtener los datos.'); return response.json() as Promise<T> }
export async function getNodes(): Promise<NodeState[]> { return (await getJson<{ nodes: NodeState[] }>('/api/nodes')).nodes }
export async function getEvents(deviceId: string): Promise<NodeEvent[]> { return (await getJson<{ events: NodeEvent[] }>(`/api/events?deviceId=${encodeURIComponent(deviceId)}&limit=10`)).events }

export async function streamRealtime(onMessage: (message: RealtimeMessage) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch(`${API_URL}/api/realtime`, { headers: { ...headers(), Accept: 'text/event-stream' }, signal })
  if (!response.ok || !response.body) throw new Error('No se pudo abrir el canal en tiempo real.')
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read(); if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2)
      const event = block.split('\n').find((line) => line.startsWith('event: '))?.slice(7)
      const data = block.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
      if (event && data && event !== 'connected') onMessage({ event: event as RealtimeMessage['event'], data: JSON.parse(data) as NodeState })
      boundary = buffer.indexOf('\n\n')
    }
  }
}
