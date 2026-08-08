/** HTTP-клиент к gateway (стиль AVT_4.0). */

const DEFAULT_BASE = '/api'

export function apiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined
  return (fromEnv && fromEnv.trim()) || DEFAULT_BASE
}

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${apiBase().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const payload = await parseBody(response)
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `HTTP ${response.status}`
    throw new ApiError(message, response.status, payload)
  }
  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' })
}

/** Быстрая проверка доступности gateway. */
export async function apiHealth(): Promise<boolean> {
  try {
    const data = await apiGet<{ status?: string }>('/health')
    return data.status === 'ok' || data.status === 'degraded'
  } catch {
    return false
  }
}
