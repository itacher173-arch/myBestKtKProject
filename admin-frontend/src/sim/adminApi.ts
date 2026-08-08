import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client'
import type { UserRole } from './authApi'

export interface AdminUser {
  id: string
  login: string
  fullName: string
  role: UserRole
  createdAt?: number | null
}

export interface AdminGroup {
  id: string
  name: string
  instructorId: string
  instructorName?: string | null
  memberCount: number
  createdAt?: number | null
}

export function listAllUsers(): Promise<AdminUser[]> {
  return apiGet<AdminUser[]>('/users')
}

export function createAdminUser(input: {
  login: string
  fullName: string
  password: string
  role: UserRole
}): Promise<AdminUser> {
  return apiPost<{ ok: boolean; user: AdminUser }>('/users', input).then(
    (r) => {
      if (!r?.user?.id) {
        throw new Error('Сервер не вернул созданного пользователя')
      }
      return r.user
    },
  )
}

export function updateAdminUser(
  userId: string,
  input: {
    login?: string
    fullName?: string
    password?: string
    role?: UserRole
  },
): Promise<AdminUser> {
  return apiPatch<{ ok: boolean; user: AdminUser }>(
    `/users/${encodeURIComponent(userId)}`,
    input,
  ).then((r) => {
    if (!r?.user?.id) {
      throw new Error('Сервер не вернул обновлённого пользователя')
    }
    return r.user
  })
}

export function deleteAdminUser(userId: string): Promise<void> {
  return apiDelete(`/users/${encodeURIComponent(userId)}`).then(() => undefined)
}

export function listAllGroups(): Promise<AdminGroup[]> {
  return apiGet<AdminGroup[]>('/groups?all=1')
}

export function assignGroupInstructor(
  groupId: string,
  instructorId: string,
): Promise<AdminGroup> {
  return apiPatch<AdminGroup>(`/groups/${encodeURIComponent(groupId)}`, {
    instructorId,
  })
}

export function renameAdminGroup(
  groupId: string,
  name: string,
): Promise<AdminGroup> {
  return apiPatch<AdminGroup>(`/groups/${encodeURIComponent(groupId)}`, {
    name,
  })
}

export function deleteAdminGroup(groupId: string): Promise<void> {
  return apiDelete(`/groups/${encodeURIComponent(groupId)}`).then(
    () => undefined,
  )
}
