import type { MiniTraining } from './catalog'

export function isMiniActionAllowed(
  training: MiniTraining | null | undefined,
  token: string,
): boolean {
  if (!training) return true
  return training.allowedActions.includes(token)
}

export function pumpActionToken(id: string): string {
  return `pump:${id}`
}

export function valveActionToken(id: string): string {
  return `valve:${id}`
}

export function toggleActionToken(id: string): string {
  return `toggle:${id}`
}

export function utilityActionToken(id: string): string {
  return `utility:${id}`
}

export function drainActionToken(id: string): string {
  return `drain:${id}`
}

export function fuelActionToken(): string {
  return 'fuel:*'
}

export function levelSetpointToken(column: string): string {
  return `level-setpoint:${column}`
}

export function protectLevelToken(column: string): string {
  return `protect-level:${column}`
}
