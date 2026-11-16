import { useState } from 'react'
import { Droplets, Dumbbell, Swords, Plus, ChevronDown, ChevronUp, Check, Utensils, Moon } from 'lucide-react'
import { useApp } from '../lib/store'
import { summarizeDay, latestWeight, overallChecklist, WORKOUT_STATUS_LABEL, MUAY_STATUS_LABEL } from '../lib/day'
import { dayAlerts } from '../lib/alerts'
import { fmtLong } from '../lib/dates'
import { fmtNum } from '../lib/util'
import { Badge, Bar, Card, Ring, Scale } from '../components/ui'
import { ChecklistList } from '../components/Checklist'
import { AlertList } from '../components/Alerts'
import { addWater } from '../lib/actions'
import { updateDayMeta } from '../lib/db'
import { useFeedback } from '../components/feedback'
import { go } from '../lib/route'
import { EntryModal } from '../components/FoodForms'
import { PlanModal, planText } from './Food'
import type { MealSlot } from '../lib/types'

const tone = (s: string) =>
  s === 'concluido' || s === 'realizado' ? 'ok' : s === 'adaptado' || s === 'em_andamento' ? 'info' : s === 'cancelado' || s === 'nao_realizado' ? 'warn' : 'muted'

export default function Dashboard() {
  const { store, today, now, setDate, foods } = useApp()
  const { toast } = useFeedback()
  const g = store.settings.goals
  const day = summarizeDay(store, today)
  const plan = day.plan
  const [showChecklist, setShowChecklist] = useState(false)
  const [showAllAlerts, setShowAllAlerts] = useState(false)
  const [planSlot, setPlanSlot] = useState<MealSlot | null>(null)
  const [entrySlot, setEntrySlot] = useState<string | null | undefined>(undefined)

  // só os avisos mais importantes aparecem de cara
  const alerts = dayAlerts(store, day, today, now).sort((a, b) => ['danger', 'warn', 'info', 'ok'].indexOf(a.level) - ['danger', 'warn', 'info', 'ok'].indexOf(b.level))
  const shownAlerts = showAllAlerts ? alerts : alerts.filter((a) => a.level !== 'info').slice(0, 1)
  const hiddenAlerts = alerts.length - shownAlerts.length

  const next = day.pendingSlots.find((m) => (m.timeEnd ?? m.time) >= now) ?? day.pendingSlots[0]

  const water = async (ml: number) => {
    try {
      await addWater(today, ml)
      toast(`+${ml} ml`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    }
  }
  const open = (r: Parameters<typeof go>[0]) => {
    setDate(today)
    go(r)
  }

  return (
    <div className="page today">
      <header className="today-head">
        <p className="eyebrow">{fmtLong(today).replace(/ de \d{4}$/, '')}</p>
        <h1>
          {plan.inProject ? <>Dia <span className="accent">{plan.dayIndex}</span> <span className="muted">de {plan.totalDays}</span></> : plan.dayIndex < 1 ? 'Antes do início' : 'Projeto encerrado'}
        </h1>
        <p className="muted small">
          Peso {fmtNum(store.settings.profile.startWeightKg, 1)} kg{(() => { const l = latestWeight(store); return l ? ` → ${fmtNum(l.weightKg, 1)} kg` : '' })()}
          {' · '}Checklist geral {fmtNum(overallChecklist(store, today).pct)}%
        </p>
        {plan.inProject && <div className="mini-progress"><span style={{ width: `${(plan.dayIndex / plan.totalDays) * 100}%` }} /></div>}
      </header>

      {shownAlerts.length > 0 && <AlertList alerts={shownAlerts} />}
      {hiddenAlerts > 0 && !showAllAlerts && <button className="link-btn small" onClick={() => setShowAllAlerts(true)}>Ver mais {hiddenAlerts} aviso(s)</button>}

      <div className="today-grid">
        <div className="today-col">
          <Card className="kcal-card">
            <div className="kcal-row">
              <Ring value={day.totals.kcal} goal={g.kcal} label="Calorias" unit="kcal" size={128} />
              <div className="kcal-macros">
                <Bar label="Proteína" value={day.totals.protein} goal={g.proteinG} unit="g" color="var(--c-protein)" compact />
                <Bar label="Carbo" value={day.totals.carbs} goal={g.carbsG} unit="g" color="var(--c-carbs)" compact />
                <Bar label="Gordura" value={day.totals.fat} goal={g.fatG} unit="g" color="var(--c-fat)" compact />
              </div>
            </div>
          </Card>

          <Card title={next ? 'Próxima refeição' : 'Refeições'} icon={<Utensils size={18} />} action={<button className="link-btn small" onClick={() => open('alimentacao')}>Ver todas</button>}>
            {next ? (
              <div className="next-meal-box">
                <div>
                  <strong>{next.time} · {next.name}</strong>
                  <p className="muted small">{planText(next.plan, foods) || 'Sem itens planejados'}</p>
                </div>
                <div className="btn-row">
                  {next.plan.length > 0 && <button className="btn btn-primary" onClick={() => setPlanSlot(next)}><Check size={16} /> Comi o planejado</button>}
                  <button className="btn" onClick={() => setEntrySlot(next.id)}><Plus size={16} /> Outro alimento</button>
                </div>
              </div>
            ) : (
              <p className="ok-text small"><Check size={14} /> Todas as refeições de hoje foram registradas.</p>
            )}
            <div className="meal-dots">
              {plan.activeSlots.map((m) => (
                <span key={m.id} className={`meal-dot ${day.slotState[m.id]}`} title={`${m.name}: ${day.slotState[m.id]}`}>{m.time}</span>
              ))}
              <button className="link-btn small" onClick={() => setEntrySlot(null)}>+ item extra</button>
            </div>
          </Card>
        </div>

        <div className="today-col">
          <Card title="Água" icon={<Droplets size={18} />} action={<button className="link-btn small" onClick={() => open('hidratacao')}>Detalhes</button>}>
            <Bar value={day.waterMl / 1000} goal={g.waterMl / 1000} label="Hoje" unit="L" digits={2} color="var(--c-water)" />
            <div className="quick-row">
              {[250, 500].map((ml) => <button key={ml} className="btn btn-water" onClick={() => water(ml)}>+{ml} ml</button>)}
            </div>
          </Card>

          <Card title="Treino" icon={<Dumbbell size={18} />}>
            <button className="activity-row" onClick={() => open('treinos')}>
              {plan.workout ? <Dumbbell size={16} /> : <Moon size={16} />}
              <span>{plan.workout ? plan.workout.name : 'Sem musculação'}</span>
              {plan.workout && <Badge tone={tone(day.workoutStatus)}>{WORKOUT_STATUS_LABEL[day.workoutStatus]}</Badge>}
            </button>
            <button className="activity-row" onClick={() => open('treinos')}>
              {plan.muay ? <Swords size={16} /> : <Moon size={16} />}
              <span>{plan.muay ? 'Muay Thai à noite' : 'Sem Muay Thai'}</span>
              {plan.muay && <Badge tone={tone(day.muayStatus)}>{MUAY_STATUS_LABEL[day.muayStatus]}</Badge>}
            </button>
          </Card>

          <Card>
            <button className="collapse-head" onClick={() => setShowChecklist(!showChecklist)} aria-expanded={showChecklist}>
              <span><b>Checklist</b> <span className="muted">{day.checklistDone} de {day.checklistTotal}</span></span>
              {showChecklist ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <Bar value={day.checklistDone} goal={day.checklistTotal || 1} compact />
            {showChecklist && (
              <>
                <ChecklistList day={day} compact />
                <div className="fatigue">
                  <span className="small muted">Cansaço hoje (1 = descansado, 5 = exausto)</span>
                  <Scale value={day.meta?.fatigue ?? null} max={5} onChange={(v) => updateDayMeta(today, (d) => { d.fatigue = v })} />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {planSlot && <PlanModal date={today} slot={planSlot} onClose={() => setPlanSlot(null)} />}
      {entrySlot !== undefined && <EntryModal date={today} slotId={entrySlot} onClose={() => setEntrySlot(undefined)} plannedItems={store.settings.meals.find((m) => m.id === entrySlot)?.plan} />}
    </div>
  )
}
