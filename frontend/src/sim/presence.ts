import { useEffect, useState } from 'react'
import type { AuthUser } from './authApi'

export type PresenceActivity =
  | 'offline'
  | 'online'
  | 'training'
  | 'exam'

export interface PresenceUser {
  userId: string
  fullName?: string
  role?: string
  online: boolean
  activity: PresenceActivity | string
  catalogId?: string | null
  catalogTitle?: string | null
  sessionMode?: 'train' | 'exam' | string | null
  updatedAt?: number
}

export interface PresencePayload {
  online?: boolean
  activity: PresenceActivity
  catalogId?: string | null
  catalogTitle?: string | null
  sessionMode?: 'train' | 'exam' | null
}

function wsUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:8106/'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Через nginx (:8080) и vite proxy — один origin /ws
  if (
    window.location.port === '8080' ||
    window.location.port === '5173' ||
    window.location.port === ''
  ) {
    return `${proto}//${window.location.host}/ws`
  }
  // Прямой доступ к backend API
  const host = window.location.hostname || '127.0.0.1'
  return `ws://${host}:8106/`
}

type Listener = (users: Map<string, PresenceUser>) => void

class PresenceBus {
  private socket: WebSocket | null = null
  private users = new Map<string, PresenceUser>()
  private listeners = new Set<Listener>()
  private user: AuthUser | null = null
  private lastPayload: PresencePayload | null = null
  private reconnectTimer: number | null = null
  private pingTimer: number | null = null

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(new Map(this.users))
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snap = new Map(this.users)
    for (const listener of this.listeners) listener(snap)
  }

  connect(user: AuthUser) {
    this.user = user
    this.open()
  }

  disconnect() {
    this.user = null
    this.lastPayload = null
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.pingTimer != null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    this.socket?.close()
    this.socket = null
  }

  publish(payload: PresencePayload) {
    this.lastPayload = payload
    if (!this.user || this.socket?.readyState !== WebSocket.OPEN) {
      this.open()
      return
    }
    this.socket.send(
      JSON.stringify({
        type: 'presence',
        userId: this.user.id,
        fullName: this.user.fullName,
        role: this.user.role,
        online: payload.online ?? true,
        activity: payload.activity,
        catalogId: payload.catalogId ?? null,
        catalogTitle: payload.catalogTitle ?? null,
        sessionMode: payload.sessionMode ?? null,
      }),
    )
  }

  private open() {
    if (!this.user) return
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    const socket = new WebSocket(wsUrl())
    this.socket = socket
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          userId: this.user!.id,
          fullName: this.user!.fullName,
          role: this.user!.role,
          activity: this.lastPayload?.activity ?? 'online',
          catalogId: this.lastPayload?.catalogId ?? null,
          catalogTitle: this.lastPayload?.catalogTitle ?? null,
          sessionMode: this.lastPayload?.sessionMode ?? null,
        }),
      )
      if (this.lastPayload) this.publish(this.lastPayload)
      if (this.pingTimer != null) window.clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 25000)
    }
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          type: string
          users?: PresenceUser[]
          user?: PresenceUser
        }
        if (msg.type === 'presence_snapshot' && Array.isArray(msg.users)) {
          this.users = new Map(msg.users.map((u) => [u.userId, u]))
          this.emit()
        }
        if (msg.type === 'presence_update' && msg.user?.userId) {
          this.users.set(msg.user.userId, msg.user)
          this.emit()
        }
      } catch {
        /* ignore */
      }
    }
    socket.onclose = () => {
      if (this.pingTimer != null) {
        window.clearInterval(this.pingTimer)
        this.pingTimer = null
      }
      if (!this.user) return
      if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = window.setTimeout(() => this.open(), 1500)
    }
  }
}

export const presenceBus = new PresenceBus()

export function usePresenceMap(): Map<string, PresenceUser> {
  const [users, setUsers] = useState(() => new Map<string, PresenceUser>())
  useEffect(() => presenceBus.subscribe(setUsers), [])
  return users
}

export function usePresencePublisher(
  user: AuthUser | null,
  payload: PresencePayload | null,
) {
  useEffect(() => {
    if (!user) {
      presenceBus.disconnect()
      return
    }
    presenceBus.connect(user)
  }, [user?.id])

  const key = payload
    ? [
        payload.activity,
        payload.catalogId ?? '',
        payload.catalogTitle ?? '',
        payload.sessionMode ?? '',
        String(payload.online ?? true),
      ].join('|')
    : ''

  useEffect(() => {
    if (!user || !payload) return
    presenceBus.publish(payload)
  }, [user?.id, key])
}
