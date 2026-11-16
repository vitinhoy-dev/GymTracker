import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { Modal } from './ui'

type ToastKind = 'ok' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; text: string }

interface ConfirmOpts {
  title: string
  text: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** exige digitar esta palavra para confirmar */
  typeToConfirm?: string
}

interface FeedbackCtx {
  toast: (text: string, kind?: ToastKind) => void
  confirm: (o: ConfirmOpts) => Promise<boolean>
}

const Ctx = createContext<FeedbackCtx | null>(null)

export function useFeedback() {
  const c = useContext(Ctx)
  if (!c) throw new Error('FeedbackProvider ausente')
  return c
}

let nextId = 1

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = useState('')

  const toast = useCallback((text: string, kind: ToastKind = 'ok') => {
    const id = nextId++
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setTyped('')
    setPending({ ...o, resolve })
  }), [])

  const close = (v: boolean) => {
    pending?.resolve(v)
    setPending(null)
  }

  const canConfirm = !pending?.typeToConfirm || typed.trim().toUpperCase() === pending.typeToConfirm.toUpperCase()

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'ok' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{t.text}</span>
            <button className="icon-btn" aria-label="Fechar" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
      {pending && (
        <Modal title={pending.title} onClose={() => close(false)} small>
          <div className="confirm-text">{pending.text}</div>
          {pending.typeToConfirm && (
            <label className="field">
              <span>Digite <b>{pending.typeToConfirm}</b> para confirmar</span>
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
          <div className="modal-actions">
            <button className="btn" onClick={() => close(false)}>Cancelar</button>
            <button className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`} disabled={!canConfirm} onClick={() => close(true)}>
              {pending.confirmLabel ?? 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}
