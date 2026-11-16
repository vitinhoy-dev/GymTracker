import { Check, Sparkles, Undo2 } from 'lucide-react'
import type { DaySummary } from '../lib/day'
import { toggleChecklist } from '../lib/actions'
import { Badge, Bar } from './ui'
import { useFeedback } from './feedback'

export function ChecklistList({ day, compact }: { day: DaySummary; compact?: boolean }) {
  const { toast } = useFeedback()
  const toggle = async (key: string, checked: boolean, auto: boolean | null) => {
    try {
      // se o novo valor coincide com o automático, remove a marcação manual
      const next = !checked
      await toggleChecklist(day.date, key, auto === next ? undefined : next)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar', 'error')
    }
  }
  return (
    <div className="checklist">
      {!compact && <Bar value={day.checklistDone} goal={day.checklistTotal || 1} label="Concluído hoje" unit="itens" />}
      <ul>
        {day.checklist.map((c) => (
          <li key={c.def.key} className={`${c.checked ? 'checked' : ''} ${!c.applicable ? 'na' : ''}`}>
            <button
              className="check-btn"
              disabled={!c.applicable}
              onClick={() => toggle(c.def.key, c.checked, c.auto)}
              aria-pressed={c.checked}
            >
              <span className="check-box">{c.checked && <Check size={14} strokeWidth={3} />}</span>
              <span className="check-label">{c.def.label}</span>
            </button>
            <span className="check-tags">
              {!c.applicable && <Badge tone="muted">não se aplica hoje</Badge>}
              {c.applicable && c.def.optional && <Badge tone="muted">opcional</Badge>}
              {c.applicable && c.source === 'auto' && <Badge tone="info"><Sparkles size={11} /> pelos registros</Badge>}
              {c.applicable && c.source === 'manual' && (
                <button className="link-btn small" title="Voltar ao valor automático" onClick={() => toggleChecklist(day.date, c.def.key, undefined)}>
                  <Undo2 size={12} /> manual
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
