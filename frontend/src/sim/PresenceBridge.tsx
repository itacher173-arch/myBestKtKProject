import { useMemo } from 'react'
import { getAuthedUser } from './authApi'
import { usePresencePublisher, type PresencePayload } from './presence'
import { useTrainer } from './TrainerContext'
import { getExercise } from './scenarios'

/** Публикует статус текущего пользователя в WebSocket presence. */
export function PresenceBridge() {
  const { state, activeMiniTraining } = useTrainer()
  const user = getAuthedUser()
  const { session } = state
  const exercise = getExercise(session.exerciseId)

  const payload = useMemo<PresencePayload | null>(() => {
    if (!user) return null
    const inExercise =
      session.view === 'exercise' && session.started && !session.completed
    if (!inExercise) {
      return {
        online: true,
        activity: 'online',
        catalogId: null,
        catalogTitle: null,
        sessionMode: null,
      }
    }
    const catalogId = activeMiniTraining?.id ?? session.exerciseId
    const catalogTitle =
      activeMiniTraining?.title ?? exercise?.name ?? session.exerciseId
    return {
      online: true,
      activity: session.mode === 'exam' ? 'exam' : 'training',
      catalogId,
      catalogTitle,
      sessionMode: session.mode,
    }
  }, [
    user,
    session.view,
    session.started,
    session.completed,
    session.mode,
    session.exerciseId,
    activeMiniTraining?.id,
    activeMiniTraining?.title,
    exercise?.name,
  ])

  usePresencePublisher(user, payload)
  return null
}
