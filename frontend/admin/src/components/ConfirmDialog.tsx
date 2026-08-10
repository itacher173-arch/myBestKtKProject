import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import './ConfirmDialog.css'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Опасное действие — красная кнопка подтверждения */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

type Pending = {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

function normalize(options: ConfirmOptions | string): ConfirmOptions {
  if (typeof options === 'string') return { message: options }
  return options
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)

  const close = useCallback((value: boolean) => {
    const cur = pendingRef.current
    pendingRef.current = null
    setPending(null)
    cur?.resolve(value)
  }, [])

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      const prev = pendingRef.current
      if (prev) prev.resolve(false)
      const next: Pending = { options: normalize(options), resolve }
      pendingRef.current = next
      setPending(next)
    })
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-message"
        >
          <div className="confirm-card">
            <h2 id="confirm-dialog-title" className="confirm-title">
              {pending.options.title ?? 'Подтверждение'}
            </h2>
            <p id="confirm-dialog-message" className="confirm-message">
              {pending.options.message}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn confirm-btn-cancel"
                onClick={() => close(false)}
                autoFocus
              >
                {pending.options.cancelLabel ?? 'Отмена'}
              </button>
              <button
                type="button"
                className={
                  pending.options.danger
                    ? 'confirm-btn confirm-btn-danger'
                    : 'confirm-btn confirm-btn-ok'
                }
                onClick={() => close(true)}
              >
                {pending.options.confirmLabel ?? 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext)
  if (!fn) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return fn
}
