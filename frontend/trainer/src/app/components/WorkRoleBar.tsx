import {
  getAuthedUser,
  hasRole,
  logoutUser,
  redirectToAuthPortal,
  setActiveWorkRole,
} from '../../auth/authApi'
import { appendAudit, isInstructorAuthed } from '../../storage/auditStorage'
import { presenceBus } from '../../presence/presence'
import { useTrainer } from '../../simulator/TrainerContext'
import { Icon } from '../../common/ui/Icon'
import './WorkRoleBar.css'

export function WorkRoleBar() {
  const user = getAuthedUser()
  const { state, resetToStart, openReports, setRole } = useTrainer()
  const view = state.session.view

  if (
    !user ||
    !hasRole(user, 'trainee') ||
    !hasRole(user, 'instructor') ||
    (view !== 'start' && view !== 'reports')
  ) {
    return null
  }

  const onLogout = () => {
    presenceBus.disconnect()
    void (async () => {
      await logoutUser()
      setActiveWorkRole(null)
      setRole(null)
      redirectToAuthPortal()
    })()
  }

  const goTraining = () => {
    setActiveWorkRole('trainee')
    setRole('trainee')
    if (view !== 'start') resetToStart()
  }

  const goReports = () => {
    if (view === 'reports') return
    if (!isInstructorAuthed()) return
    setActiveWorkRole('instructor')
    setRole('instructor')
    void appendAudit({
      actor: user.fullName,
      role: 'instructor',
      action: 'open_reports',
    })
    openReports()
  }

  return (
    <div className="work-role-bar-wrap">
      <div className="dashboard-role-bar">
        <span>Режим работы</span>
        <div className="mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'start'}
            className={view === 'start' ? 'active' : ''}
            onClick={goTraining}
          >
            <Icon name="trainer" />
            Обучение
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'reports'}
            className={view === 'reports' ? 'active' : ''}
            onClick={goReports}
          >
            <Icon name="chart" />
            Отчёты
          </button>
        </div>
        <button type="button" className="dashboard-logout" onClick={onLogout}>
          Выйти
        </button>
      </div>
    </div>
  )
}
