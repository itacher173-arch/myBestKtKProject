import { Icon } from '../common/ui/Icon'
import type { AiAnalysis, AiSeverity } from './types'
import './AiReviewPanel.css'
import './AiReviewExtensions.css'
import './AiTrajectory.css'

interface AiReviewPanelProps {
  analysis: AiAnalysis | null
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disabled'
  error?: string
  onRetry?: () => void
  onOpenKnowledge: (articleId?: string) => void
  onOpenTraining: (trainingId: string) => void
  compact?: boolean
}

const severityLabel: Record<AiSeverity, string> = {
  critical: 'Критично',
  warning: 'Внимание',
  info: 'Информация',
}

export function AiReviewPanel({
  analysis,
  status,
  error,
  onRetry,
  onOpenKnowledge,
  onOpenTraining,
  compact = false,
}: AiReviewPanelProps) {
  if (status === 'disabled') {
    return (
      <section className="ai-review ai-review-state">
        <Icon name="sparkles" />
        <h3>ИИ-разбор отключён</h3>
        <p>Его можно включить в настройках приложения. Итоговые показатели и журнал действий остаются доступны без ИИ.</p>
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <section className="ai-review ai-review-state">
        <span className="ai-loader"><i /><i /><i /></span>
        <h3>Анализируем траекторию действий</h3>
        <p>Сопоставляем команды, реакцию на отклонения и финальные параметры с учебной моделью.</p>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="ai-review ai-review-state error">
        <Icon name="alert" />
        <h3>Разбор временно недоступен</h3>
        <p>{error || 'Не удалось связаться с локальным ИИ-сервисом.'}</p>
        {onRetry && <button type="button" onClick={onRetry}>Повторить анализ</button>}
      </section>
    )
  }

  if (!analysis) {
    if (status === 'ready') {
      return (
        <section className="ai-review ai-review-state">
          <Icon name="sparkles" />
          <h3>Разбор ещё не загружен</h3>
          <p>Нажмите «Повторить», чтобы сформировать ИИ-разбор заново.</p>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Повторить анализ
            </button>
          )}
        </section>
      )
    }
    return null
  }

  const scoreTone = analysis.metrics.criticalCount ? 'danger' : analysis.metrics.warningCount ? 'warning' : 'success'

  return (
    <section className={`ai-review ${compact ? 'compact' : ''}`}>
      <header className="ai-review-header">
        <div className={`ai-score-ring ${scoreTone}`} style={{ '--score': analysis.metrics.scorePercent } as React.CSSProperties}>
          <span>{analysis.metrics.scorePercent}<small>%</small></span>
        </div>
        <div>
          <span className="ai-kicker"><Icon name="sparkles" /> Локальный ИИ-разбор</span>
          <h2>{analysis.overallLevel}</h2>
          <p>{analysis.summary}</p>
        </div>
      </header>

      <div className="ai-metric-grid">
        <div><strong>{analysis.metrics.actionsCount}</strong><span>действий</span></div>
        <div><strong>{analysis.metrics.eventsCount}</strong><span>событий</span></div>
        <div className={analysis.metrics.criticalCount ? 'danger' : ''}><strong>{analysis.metrics.criticalCount}</strong><span>критических зон</span></div>
        <div className={analysis.metrics.warningCount ? 'warning' : ''}><strong>{analysis.metrics.warningCount}</strong><span>зон внимания</span></div>
      </div>

      {analysis.orchestration && (
        <div className="ai-pipeline">
          <span>ML <strong>{analysis.orchestration.ml}</strong></span>
          <span>RAG <strong>{analysis.orchestration.rag}</strong></span>
          <span>LLM <strong>{analysis.orchestration.llm}</strong></span>
        </div>
      )}

      {analysis.debrief?.narrative && (
        <div className="ai-review-section ai-debrief">
          <h3><Icon name="sparkles" /> Объяснение результата</h3>
          <p>{analysis.debrief.narrative}</p>
          <small>{analysis.debrief.mode}</small>
        </div>
      )}

      {analysis.nextBestModule && (
        <div className="ai-review-section ai-next-module">
          <h3><Icon name="trainer" /> Следующий рекомендуемый модуль</h3>
          <strong>{analysis.nextBestModule.title}</strong>
          <p>
            {analysis.nextBestModule.reasons.join('. ') ||
              'Выбран по профилю ошибок и навыков.'}
          </p>
          <div>
            <span>
              соответствие{' '}
              {Math.round(analysis.nextBestModule.score * 100)}%
            </span>
            <button
              type="button"
              disabled={!analysis.nextBestModule.eligible}
              onClick={() =>
                onOpenTraining(analysis.nextBestModule!.moduleId)
              }
            >
              {analysis.nextBestModule.eligible
                ? 'Пройти модуль'
                : 'Нужны предварительные модули'}
            </button>
          </div>
        </div>
      )}

      {!!analysis.strengths.length && (
        <div className="ai-review-section strengths">
          <h3><Icon name="check" /> Что выполнено хорошо</h3>
          <ul>{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      {!!analysis.trajectory?.length && (
        <div className="ai-review-section">
          <h3><Icon name="activity" /> Интерпретация траектории</h3>
          <div className="ai-trajectory-summary">
            <span>Длительность <strong>{analysis.metrics.durationSeconds?.toFixed(1) ?? '0.0'} с</strong></span>
            <span>Макс. пауза <strong>{analysis.metrics.maxPauseSeconds?.toFixed(1) ?? '0.0'} с</strong></span>
            <span>Контуры <strong>{analysis.controlAreas?.length ?? 0}</strong></span>
          </div>
          <ol className="ai-trajectory">
            {analysis.trajectory.slice(-8).map((item) => (
              <li key={`${item.sequence}-${item.at}`}>
                <time>{item.at ? new Date(item.at).toLocaleTimeString('ru-RU') : `#${item.sequence}`}</time>
                <i />
                <div><span>{item.category}</span><strong>{item.description}</strong><small>{item.interpretation}</small></div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!!analysis.findings.length && (
        <div className="ai-review-section">
          <h3><Icon name="target" /> Разбор отклонений</h3>
          <div className="ai-findings">
            {analysis.findings.map((finding) => (
              <article key={finding.code} className={`ai-finding ${finding.severity}`}>
                <div><span>{severityLabel[finding.severity]}</span><code>{finding.code}</code></div>
                <h4>{finding.title}</h4>
                <p>{finding.evidence}</p>
                <strong>{finding.recommendation}</strong>
                <div className="ai-finding-actions">
                  {finding.articleId && <button type="button" onClick={() => onOpenKnowledge(finding.articleId!)}><Icon name="book" /> Материал</button>}
                  {finding.trainingId && <button type="button" onClick={() => onOpenTraining(finding.trainingId!)}><Icon name="trainer" /> Практика</button>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {!!analysis.recommendations.length && (
        <div className="ai-review-section">
          <h3><Icon name="sparkles" /> Персональный маршрут</h3>
          <div className="ai-recommendations">
            {analysis.recommendations.map((item, index) => (
              <article key={item.trainingId}>
                <span className="ai-route-index">{String(index + 1).padStart(2, '0')}</span>
                <div><small>{item.segment} · {item.durationMinutes} мин.</small><h4>{item.trainingTitle}</h4><p>{item.reason}</p></div>
                <div>
                  <button type="button" onClick={() => onOpenKnowledge(item.articleId)} title={item.articleTitle}><Icon name="book" /></button>
                  <button type="button" className="primary" onClick={() => onOpenTraining(item.trainingId)}>Назначить</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {!!analysis.sources?.length && (
        <div className="ai-review-section">
          <h3><Icon name="book" /> Источники базы знаний</h3>
          <div className="ai-sources">
            {analysis.sources.slice(0, 6).map((source) => (
              <button
                type="button"
                key={`${source.articleId}-${source.chunkId}`}
                onClick={() => onOpenKnowledge(source.articleId)}
              >
                <strong>{source.title}</strong>
                <span>
                  {source.articleId} · rev. {source.revision}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <footer><Icon name="shield" />{analysis.disclaimer}</footer>
    </section>
  )
}
