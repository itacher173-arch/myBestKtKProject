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

function errorMessage(status: number, payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error
  }
  if (status === 401 || status === 403) {
    return 'Нет доступа. Проверьте логин и пароль.'
  }
  if (status === 429) {
    return 'Слишком много попыток, подождите.'
  }
  if (status === 502 || status === 503 || status === 504) {
    return 'Сервер API временно недоступен. Подождите и обновите страницу.'
  }
  if (status >= 500) {
    return 'Ошибка сервера. Попробуйте позже.'
  }
  if (typeof payload === 'string' && payload.trim() && !payload.includes('<html')) {
    return payload.trim()
  }
  return `Ошибка запроса (${status})`
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${apiBase().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(
      'Нет связи с сервером. Проверьте, что backend запущен.',
      0,
    )
  }
  const payload = await parseBody(response)
  if (!response.ok) {
    throw new ApiError(errorMessage(response.status, payload), response.status, payload)
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

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body ?? {}),
  })
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
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
