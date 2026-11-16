import { useEffect, useState } from 'react'
import { Utensils, Droplets, Dumbbell, Swords, ListChecks, Scale as ScaleIcon, NotebookPen, Lock, ExternalLink } from 'lucide-react'
import type { DaySummary } from '../lib/day'
import { MUAY_STATUS_LABEL, WORKOUT_STATUS_LABEL } from '../lib/day'
import { useApp } from '../lib/store'
import { updateDayMeta } from '../lib/db'
import { fmtLong } from '../lib/dates'
import { fmtNum } from '../lib/util'
import { dayAlerts } from '../lib/alerts'
import { Badge, Bar } from './ui'
import { AlertList } from './Alerts'
import { ChecklistList } from './Checklist'
import { useFeedback } from './feedback'
import { go, type Route } from '../lib/route'

/** fechamento diário: resumo baseado exclusivamente nos registros */
export function DayClosing({ day }: { day: DaySummary }) {
  const { store, today, now, setDate } = useApp()
  const { toast } = useFeedback()
  const g = store.settings.goals
  const [notes, setNotes] = useState(day.meta?.notes ?? '')
  useEffect(() => setNotes(day.meta?.notes ?? ''), [day.date, day.meta?.notes])
  const future = day.date > today
  const alerts = dayAlerts(store, day, today, now)
  const open = (r: Route) => {
    setDate(day.date)
    go(r)
  }
  const pendingChecks = day.checklist.filter((c) => c.applicable && !c.def.optional && !c.checked)
  const doneChecks = day.checklist.filter((c) => c.applicable && c.checked)

  return (
    <div className="closing">
      <div className="closing-head">
        <div>
          <p className="eyebrow">{day.plan.inProject ? `Dia ${day.plan.dayIndex} de ${day.plan.totalDays}` : 'Fora do período do projeto'}</p>
          <h2>{fmtLong(day.date)}</h2>
        </div>
        {day.meta?.closedAt ? <Badge tone="ok"><Lock size={11} /> Dia fechado</Badge> : future ? <Badge tone="muted">Dia futuro</Badge> : day.date === today ? <Badge tone="info">Em andamento</Badge> : null}
      </div>
      {future && <p className="muted small">Este dia ainda não aconteceu. Você vê abaixo apenas o que está programado.</p>}

      <section>
        <h4><Utensils size={15} /> Alimentação <button className="link-btn small" onClick={() => open('alimentacao')}><ExternalLink size={12} /> abrir</button></h4>
        <Bar label="Calorias" value={day.totals.kcal} goal={g.kcal} unit="kcal" compact />
        <Bar label="Proteínas" value={day.totals.protein} goal={g.proteinG} unit="g" color="var(--c-protein)" compact />
        <Bar label="Carboidratos" value={day.totals.carbs} goal={g.carbsG} unit="g" color="var(--c-carbs)" compact />
        <Bar label="Gorduras" value={day.totals.fat} goal={g.fatG} unit="g" color="var(--c-fat)" compact />
        <ul className="plain-list small">
          {day.plan.activeSlots.map((m) => (
            <li key={m.id}>
              <span>{m.time} · {m.name}</span>
              <span className={day.slotState[m.id] === 'registrada' ? '' : 'muted'}>
                {day.slotState[m.id] === 'registrada' ? `${fmtNum(day.bySlot[m.id].kcal)} kcal · ${day.entries.filter((e) => e.slotId === m.id).map((e) => e.name).join(', ')}` : day.slotState[m.id]}
              </span>
            </li>
          ))}
          {day.extraTotals.count > 0 && <li><span>Fora do planejamento</span><span>{fmtNum(day.extraTotals.kcal)} kcal ({day.extraTotals.count} itens)</span></li>}
        </ul>
      </section>

      <section>
        <h4><Droplets size={15} /> Água <button className="link-btn small" onClick={() => open('hidratacao')}><ExternalLink size={12} /> abrir</button></h4>
        <Bar value={day.waterMl} goal={g.waterMl} label="Consumo" unit="ml" color="var(--c-water)" compact />
      </section>

      <section className="closing-two">
        <div>
          <h4><Dumbbell size={15} /> Musculação <button className="link-btn small" onClick={() => open('treinos')}><ExternalLink size={12} /> abrir</button></h4>
          <p className="small">{day.plan.workout?.name ?? 'Descanso'} · <b>{WORKOUT_STATUS_LABEL[day.workoutStatus]}</b></p>
          {day.sessions.map((s) => (
            <p key={s.id} className="muted small">{s.templateName}: {s.exercises.filter((e) => e.done).length}/{s.exercises.length} exercícios{s.durationMin ? ` · ${s.durationMin} min` : ''}{s.notes ? ` · ${s.notes}` : ''}</p>
          ))}
        </div>
        <div>
          <h4><Swords size={15} /> Muay Thai</h4>
          <p className="small"><b>{MUAY_STATUS_LABEL[day.muayStatus]}</b></p>
          {day.muaySessions.map((m) => (
            <p key={m.id} className="muted small">{m.durationMin ? `${m.durationMin} min` : ''}{m.intensity ? ` · ${m.intensity}` : ''}{m.rpe ? ` · esforço ${m.rpe}/10` : ''}</p>
          ))}
        </div>
        <div>
          <h4><ScaleIcon size={15} /> Peso</h4>
          <p className="small">{day.weightKg != null ? `${fmtNum(day.weightKg, 1)} kg` : 'Não registrado'}</p>
        </div>
      </section>

      <section>
        <h4><ListChecks size={15} /> Checklist · {day.checklistDone}/{day.checklistTotal} ({fmtNum(day.checklistPct)}%)</h4>
        {!future ? <ChecklistList day={day} compact /> : null}
        {!future && (
          <p className="muted small">
            Concluídas: {doneChecks.length ? doneChecks.map((c) => c.def.label).join('; ') : 'nenhuma'}.<br />
            Pendentes: {pendingChecks.length ? pendingChecks.map((c) => c.def.label).join('; ') : 'nenhuma'}.
          </p>
        )}
      </section>

      {!future && alerts.length > 0 && (
        <section>
          <h4>Alertas</h4>
          <AlertList alerts={alerts} />
        </section>
      )}

      <section>
        <h4><NotebookPen size={15} /> Observações do dia</h4>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Como foi o dia? Sono, fome, energia…" />
        <div className="btn-row">
          <button className="btn btn-sm" disabled={notes === (day.meta?.notes ?? '')} onClick={async () => { await updateDayMeta(day.date, (d) => { d.notes = notes }); toast('Observações salvas') }}>Salvar observações</button>
          {!future && (
            day.meta?.closedAt
              ? <button className="btn btn-ghost btn-sm" onClick={async () => { await updateDayMeta(day.date, (d) => { d.closedAt = null }); toast('Dia reaberto', 'info') }}>Reabrir dia</button>
              : <button className="btn btn-primary btn-sm" onClick={async () => { await updateDayMeta(day.date, (d) => { d.notes = notes; d.closedAt = Date.now() }); toast('Dia fechado') }}><Lock size={14} /> Fechar o dia</button>
          )}
        </div>
        <p className="muted tiny">Fechar o dia apenas marca que você revisou os registros. Você pode continuar editando depois.</p>
      </section>
    </div>
  )
}
