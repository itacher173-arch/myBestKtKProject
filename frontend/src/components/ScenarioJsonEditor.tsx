import { useState } from 'react'
import { apiPost } from '../api/client'
import { validateScenarioDoc } from '../scenarios/validateScenario'
import './ScenarioJsonEditor.css'

const TEMPLATE = `{
  "id": "custom-startup",
  "name": "Свой сценарий пуска",
  "version": "1.0.0",
  "mode": "train",
  "description": "Импорт JSON-сценария",
  "initial": { "pumpN1": "stopped", "valveL1": 0 },
  "checklist": ["Открыть Л-1", "Пуск Н-1"],
  "goldenSequence": ["open-L1", "start-N1"],
  "constraints": { "maxResponseSec": 120, "forbidActions": [], "requirePaz": true }
}`

export function ScenarioJsonEditor({ onClose }: { onClose?: () => void }) {
  const [text, setText] = useState(TEMPLATE)
  const [localErrors, setLocalErrors] = useState<string[]>([])
  const [serverMsg, setServerMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const onValidateLocal = () => {
    setServerMsg('')
    try {
      const parsed = JSON.parse(text) as unknown
      const result = validateScenarioDoc(parsed)
      setLocalErrors(result.errors)
      if (result.ok) setServerMsg('Локальная схема: OK')
    } catch (e) {
      setLocalErrors([e instanceof Error ? e.message : 'Невалидный JSON'])
    }
  }

  const onValidateServer = async () => {
    setBusy(true)
    setServerMsg('')
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const local = validateScenarioDoc(parsed)
      setLocalErrors(local.errors)
      if (!local.ok) {
        setBusy(false)
        return
      }
      const res = await apiPost<{ ok: boolean; errors: string[] }>(
        '/scenarios/validate',
        { scenario: parsed },
      )
      if (res.ok) setServerMsg('Серверная валидация (Pydantic): OK')
      else {
        setLocalErrors(res.errors ?? ['Ошибка сервера'])
        setServerMsg('Сервер отклонил документ')
      }
    } catch (e) {
      setServerMsg(e instanceof Error ? e.message : 'Ошибка запроса')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="scenario-json-editor">
      <header>
        <h2>Конструктор сценария (JSON)</h2>
        {onClose && (
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        )}
      </header>
      <p className="lead">
        Импорт/правка сценария по схеме: id, version, initial, checklist,
        goldenSequence.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={18}
      />
      <div className="actions">
        <button type="button" onClick={onValidateLocal}>
          Проверить локально
        </button>
        <button type="button" disabled={busy} onClick={() => void onValidateServer()}>
          Проверить на сервере
        </button>
      </div>
      {serverMsg && <p className="ok">{serverMsg}</p>}
      {localErrors.length > 0 && (
        <ul className="errors">
          {localErrors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
