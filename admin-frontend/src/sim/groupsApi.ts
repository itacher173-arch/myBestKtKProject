import { apiDelete, apiGet, apiPost } from '../api/client'

export interface GroupUser {
  id: string
  login?: string
  fullName: string
  role: string
  roles: string[]
  createdAt?: number | null
  addedAt?: number | null
}

export interface TrainingGroup {
  id: string
  name: string
  instructorId: string
  instructorName?: string | null
  memberCount: number
  createdAt?: number | null
}

export function listTrainees(): Promise<GroupUser[]> {
  return apiGet<GroupUser[]>('/users?role=trainee')
}

export function createGroup(input: {
  name: string
  instructorId: string
}): Promise<TrainingGroup> {
  return apiPost<TrainingGroup>('/groups', input)
}

export function listGroupMembers(groupId: string): Promise<GroupUser[]> {
  return apiGet<GroupUser[]>(`/groups/${encodeURIComponent(groupId)}/members`)
}

export function addGroupMember(
  groupId: string,
  userId: string,
): Promise<{ ok: boolean; fullName?: string }> {
  return apiPost(`/groups/${encodeURIComponent(groupId)}/members`, { userId })
}

export function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiDelete(
    `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
  )
}
