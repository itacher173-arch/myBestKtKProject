import { apiDelete, apiGet, apiPatch, apiPost } from '../api/client'

export interface GroupUser {
  id: string
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

export function listGroups(instructorId: string): Promise<TrainingGroup[]> {
  return apiGet<TrainingGroup[]>(
    `/groups?instructorId=${encodeURIComponent(instructorId)}`,
  )
}

export function listInstructors(): Promise<GroupUser[]> {
  return apiGet<GroupUser[]>('/users?role=instructor')
}

export function createGroup(input: {
  name: string
  instructorId: string
}): Promise<TrainingGroup> {
  return apiPost<TrainingGroup>('/groups', input)
}

export function renameGroup(
  groupId: string,
  name: string,
): Promise<TrainingGroup> {
  return apiPatch<TrainingGroup>(`/groups/${encodeURIComponent(groupId)}`, {
    name: name.trim(),
  })
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

export function loadGroupReports<T>(groupId: string): Promise<T[]> {
  return apiGet<T[]>(`/groups/${encodeURIComponent(groupId)}/reports`)
}
