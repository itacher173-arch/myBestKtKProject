const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'ktk-elou-avt-session-token'

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getSessionToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setSessionToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken()
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('X-Correlation-ID', `web-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      message = body.error || message
      if (message.startsWith('{')) {
        const nested = JSON.parse(message) as { error?: string }
        message = nested.error || message
      }
    } catch {
      const text = await response.text().catch(() => '')
      if (text) message = text
    }
    if (response.status === 401 && token) {
      setSessionToken(null)
      window.dispatchEvent(new CustomEvent('ktk-auth-expired'))
    }
    throw new ApiError(message, response.status)
  }
  return response.json() as Promise<T>
}

export function apiGet<T>(path: string) {
  return request<T>(path)
}

export function apiPost<T>(path: string, body: object = {}) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
