import { useEffect, useRef, useState } from 'react'
import { apiPost } from '../api/client'
import { usePreferences } from '../settings/PreferencesContext'
import { useTrainer } from '../simulator/TrainerContext'
import { Icon } from '../common/ui/Icon'
import type { AiChatResponse } from './types'
import './AiAssistant.css'

interface Message {
  id: string
  role: 'assistant' | 'user'
  text: string
  response?: AiChatResponse
}

export function AiAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, activeMiniTraining, openKnowledge, assignMiniTraining } = useTrainer()
  const { aiEnabled } = usePreferences()
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'Привет! Я локальный ИИ-ассистент. Общие понятия объясню с помощью встроенных знаний, а режимные и безопасностные вопросы сверю с локальной базой КТК.' },
  ])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  if (!open) return null

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || pending || !aiEnabled) return
    const conversationHistory = messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.text,
      intent: message.response?.intent,
    }))
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', text: question }])
    setInput('')
    setPending(true)
    try {
      const response = await apiPost<AiChatResponse>('/ai/chat', {
        message: question,
        context: {
          exerciseId: state.session.exerciseId,
          trainingId: activeMiniTraining?.id ?? null,
          process: state.process,
          recentActions: state.actionsLog.slice(-20),
          recentEvents: state.systemEvents.slice(-20),
          conversationHistory,
        },
      })
      setMessages((current) => [...current, { id: response.messageId, role: 'assistant', text: response.answer, response }])
    } catch (reason) {
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', text: `Не удалось получить ответ локального сервиса: ${reason instanceof Error ? reason.message : String(reason)}` }])
    } finally {
      setPending(false)
    }
  }

  const prompts = state.session.view === 'exercise'
    ? ['Привет! Как дела?', 'Что сейчас требует внимания?', 'Объясни давление К-1']
    : ['Привет! Как дела?', 'Как устроен процесс ЭЛОУ-АВТ?', 'Какие мини-тренировки доступны?']

  return (
    <div className="ai-assistant-overlay" onMouseDown={onClose}>
      <aside className="ai-assistant" onMouseDown={(event) => event.stopPropagation()} aria-label="ИИ-ассистент КТК">
        <header>
          <span className="ai-assistant-logo"><Icon name="sparkles" /></span>
          <div><span>Локальный помощник</span><h2>ИИ-ассистент КТК</h2></div>
          <span className="ai-online"><i /> в контуре</span>
          <button type="button" onClick={onClose} aria-label="Закрыть"><Icon name="close" /></button>
        </header>

        {!aiEnabled ? (
          <div className="ai-disabled"><Icon name="shield" /><h3>ИИ-модуль отключён</h3><p>Включите его в настройках приложения. Симулятор продолжает работать независимо от ИИ.</p></div>
        ) : (
          <>
            <div className="ai-context-line"><Icon name="activity" /><span>{state.session.view === 'exercise' ? activeMiniTraining?.title || state.session.exerciseId || 'Текущая симуляция' : 'Общий справочный режим'}</span></div>
            <div className="ai-messages">
              {messages.map((message) => (
                <div key={message.id} className={`ai-message ${message.role}`}>
                  {message.role === 'assistant' && <span className="ai-message-avatar"><Icon name="sparkles" /></span>}
                  <div>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
                    {!!message.response?.sources.length && <div className="ai-chat-sources">{message.response.sources.map((source) => <button type="button" key={source.articleId} onClick={() => openKnowledge(source.articleId)}><Icon name="book" /><span>{source.title}<small>{source.category}</small></span></button>)}</div>}
                    {!!message.response?.relatedTrainings.length && <div className="ai-chat-trainings">{message.response.relatedTrainings.map((training) => <button type="button" key={training.trainingId} onClick={() => { assignMiniTraining(training.trainingId); onClose() }}><Icon name="trainer" />{training.trainingTitle}</button>)}</div>}
                  </div>
                </div>
              ))}
              {pending && <div className="ai-message assistant"><span className="ai-message-avatar"><Icon name="sparkles" /></span><div className="ai-thinking"><i /><i /><i /></div></div>}
              <div ref={endRef} />
            </div>
            <div className="ai-prompts">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)}>{prompt}</button>)}</div>
            <form className="ai-composer" onSubmit={(event) => { event.preventDefault(); void send(input) }}>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Напишите сообщение или задайте вопрос по КТК…" rows={2} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input) } }} />
              <button type="submit" disabled={!input.trim() || pending} aria-label="Отправить"><Icon name="send" /></button>
            </form>
            <footer><Icon name="shield" />Инструкции, режимные параметры и безопасность подтверждаются только локальными материалами КТК.</footer>
          </>
        )}
      </aside>
    </div>
  )
}

