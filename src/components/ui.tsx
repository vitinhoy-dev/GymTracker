import { useEffect, type ReactNode, type InputHTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight, X, CalendarDays } from 'lucide-react'
import { addDays, parseISO } from '../lib/dates'

const fmtNav = (d: ISODate) => {
  const t = parseISO(d).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
import { clamp, fmtNum } from '../lib/util'
import type { ISODate } from '../lib/types'

export function Card({ title, icon, action, children, className = '', subtitle }: {
  title?: ReactNode; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; subtitle?: ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div className="card-title">
            {icon && <span className="card-icon">{icon}</span>}
            <div>
              <h3>{title}</h3>
              {subtitle && <p className="muted small">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  )
}

/** anel de progresso: mostra o valor real, inclusive acima de 100% */
export function Ring({ value, goal, label, unit, size = 112, color = 'var(--accent)', digits = 0 }: {
  value: number; goal: number; label: string; unit: string; size?: number; color?: string; digits?: number
}) {
  const pct = goal > 0 ? (value / goal) * 100 : 0
  const over = pct > 100
  const r = size / 2 - 9
  const c = 2 * Math.PI * r
  const shown = clamp(pct, 0, 100)
  return (
    <div className="ring" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${fmtNum(value, digits)} de ${fmtNum(goal, digits)} ${unit}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" strokeWidth={8} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} strokeLinecap="round"
          stroke={over ? 'var(--warn)' : color}
          strokeDasharray={`${(shown / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-value"
        />
      </svg>
      <div className="ring-center">
        <strong>{fmtNum(value, digits)}</strong>
        <span className="muted small">/ {fmtNum(goal, digits)} {unit}</span>
      </div>
      <div className="ring-label">
        {label} <span className={over ? 'warn-text' : 'muted'}>{fmtNum(pct)}%</span>
      </div>
    </div>
  )
}

export function Bar({ value, goal, label, unit, color = 'var(--accent)', digits = 0, compact }: {
  value: number; goal: number; label?: ReactNode; unit?: string; color?: string; digits?: number; compact?: boolean
}) {
  const pct = goal > 0 ? (value / goal) * 100 : 0
  const over = pct > 100
  return (
    <div className={`bar ${compact ? 'bar-compact' : ''}`}>
      {label !== undefined && (
        <div className="bar-row">
          <span>{label}</span>
          <span className="small">
            <b>{fmtNum(value, digits)}</b>
            <span className="muted"> / {fmtNum(goal, digits)} {unit}</span>
            {over && <span className="warn-text"> (+{fmtNum(value - goal, digits)})</span>}
          </span>
        </div>
      )}
      <div className="bar-track" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="bar-fill" style={{ width: `${clamp(pct, 0, 100)}%`, background: over ? 'var(--warn)' : color }} />
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'danger' | 'info' | 'muted' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Modal({ title, onClose, children, small, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; small?: boolean; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${small ? 'modal-small' : ''} ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className={`field ${error ? 'field-error' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <small className="error-text">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  )
}

export function NumInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="number" inputMode="decimal" step="any" {...props} />
}

export function Empty({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {text && <p className="muted small">{text}</p>}
      {children}
    </div>
  )
}

export function DateNav({ date, setDate, today, min, max }: { date: ISODate; setDate: (d: ISODate) => void; today: ISODate; min?: ISODate; max?: ISODate }) {
  const canPrev = !min || date > min
  const canNext = !max || date < max
  return (
    <div className="date-nav">
      <button className="icon-btn" disabled={!canPrev} onClick={() => setDate(addDays(date, -1))} aria-label="Dia anterior"><ChevronLeft size={18} /></button>
      <label className="date-nav-label">
        <CalendarDays size={16} />
        <span>{date === today ? 'Hoje · ' : ''}{fmtNav(date)}</span>
        <input type="date" value={date} min={min} max={max} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Escolher data" />
      </label>
      <button className="icon-btn" disabled={!canNext} onClick={() => setDate(addDays(date, 1))} aria-label="Próximo dia"><ChevronRight size={18} /></button>
      {date !== today && <button className="btn btn-ghost btn-sm" onClick={() => setDate(today)}>Hoje</button>}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange, size }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm'
}) {
  return (
    <div className={`segmented ${size === 'sm' ? 'segmented-sm' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{icon}{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  )
}

export function Scale({ value, onChange, max, labels }: { value: number | null; onChange: (v: number | null) => void; max: number; labels?: string[] }) {
  return (
    <div className="scale">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" className={value === n ? 'active' : ''} onClick={() => onChange(value === n ? null : n)} title={labels?.[n - 1]}>
          {n}
        </button>
      ))}
    </div>
  )
}
