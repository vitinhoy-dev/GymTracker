import { AlertTriangle, Info, Flame, CheckCircle2 } from 'lucide-react'
import type { Alert } from '../lib/alerts'

export function AlertList({ alerts, empty }: { alerts: Alert[]; empty?: string }) {
  if (!alerts.length) {
    return empty ? <p className="muted small alert-empty"><CheckCircle2 size={14} /> {empty}</p> : null
  }
  return (
    <ul className="alerts">
      {alerts.map((a) => (
        <li key={a.id} className={`alert alert-${a.level}`}>
          {a.level === 'danger' ? <Flame size={18} /> : a.level === 'warn' ? <AlertTriangle size={18} /> : <Info size={18} />}
          <div>
            <strong>{a.title}</strong>
            <p>{a.text}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
