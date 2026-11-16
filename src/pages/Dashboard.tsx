import { Droplets, Dumbbell, Flame, ListChecks, Scale as ScaleIcon, Swords, Utensils, Bell, Plus, Activity, Target } from 'lucide-react'
import { useApp } from '../lib/store'
import { overallChecklist, latestWeight, summarizeDay, WORKOUT_STATUS_LABEL, MUAY_STATUS_LABEL } from '../lib/day'
import { dayAlerts } from '../lib/alerts'
import { fmtBR, fmtLong, fmtDayMonth, diffDays } from '../lib/dates'
import { fmtNum, round } from '../lib/util'
import { Badge, Bar, Card, Ring, Scale, Stat } from '../components/ui'
import { ChecklistList } from '../components/Checklist'
import { AlertList } from '../components/Alerts'
import { addWater } from '../lib/actions'
import { updateDayMeta } from '../lib/db'
import { useFeedback } from '../components/feedback'
import { go } from '../lib/route'

const statusTone = (s: string) =>
  s === 'concluido' || s === 'realizado' ? 'ok' : s === 'adaptado' || s === 'em_andamento' ? 'info' : s === 'cancelado' || s === 'nao_realizado' ? 'warn' : 'muted'

export default function Dashboard() {
  const { store, today, now, setDate } = useApp()
  const { toast } = useFeedback()
  const s = store.settings
  const g = s.goals
  const day = summarizeDay(store, today)
  const plan = day.plan
  const overall = overallChecklist(store, today)
  const last = latestWeight(store)
  const alerts = dayAlerts(store, day, today, now)
  const elapsed = Math.min(plan.totalDays, Math.max(0, diffDays(s.startDate, today) + 1))

  const quickWater = async (ml: number) => {
    try {
      await addWater(today, ml)
      toast(`+${ml} ml registrados`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    }
  }

  const openFor = (r: Parameters<typeof go>[0]) => {
    setDate(today)
    go(r)
  }

  const nextMeal = day.pendingSlots.find((m) => (m.timeEnd ?? m.time) >= now) ?? day.pendingSlots[0]

  return (
    <div className="page">
      <div className="hero">
        <div>
          <p className="eyebrow">{fmtLong(today)}</p>
          <h1>
            {plan.inProject ? <>Dia <span className="accent">{plan.dayIndex}</span> de {plan.totalDays}</> : plan.dayIndex < 1 ? `Começa em ${fmtBR(s.startDate)}` : 'Projeto encerrado'}
          </h1>
          <p className="muted">{fmtDayMonth(s.startDate)} → {fmtDayMonth(s.endDate)} · {s.profile.objective}</p>
        </div>
        <div className="hero-progress">
          <Bar value={elapsed} goal={plan.totalDays} label="Progresso do projeto" unit="dias" />
          <Bar value={round(overall.pct)} goal={100} label="Checklist geral" unit="%" color="var(--accent-2)" />
        </div>
      </div>

      <div className="grid stats-grid">
        <Stat icon={<ScaleIcon size={15} />} label="Peso inicial" value={`${fmtNum(s.profile.startWeightKg, 1)} kg`} hint={s.profile.targetWeightKg ? `Meta: ${fmtNum(s.profile.targetWeightKg, 1)} kg` : 'Sem meta de peso definida'} />
        <Stat
          icon={<Activity size={15} />}
          label="Último peso"
          value={last ? `${fmtNum(last.weightKg, 1)} kg` : '—'}
          hint={last ? `${fmtBR(last.date)} · ${last.weightKg - s.profile.startWeightKg >= 0 ? '+' : ''}${fmtNum(last.weightKg - s.profile.startWeightKg, 1)} kg` : 'Nenhum peso registrado'}
        />
        <Stat icon={<Target size={15} />} label="Meta calórica" value={`${fmtNum(g.kcal)} kcal`} hint={`P ${g.proteinG} g · C ${g.carbsG} g · G ${g.fatG} g`} />
        <Stat icon={<Flame size={15} />} label="Consumido hoje" value={`${fmtNum(day.totals.kcal)} kcal`} hint={day.totals.kcal > g.kcal ? `${fmtNum(day.totals.kcal - g.kcal)} kcal acima da meta` : `Restam ${fmtNum(g.kcal - day.totals.kcal)} kcal`} />
      </div>

      <div className="grid dash-grid">
        <Card title="Nutrição de hoje" icon={<Utensils size={18} />} className="span-2"
          action={<button className="btn btn-primary btn-sm" onClick={() => openFor('alimentacao')}><Plus size={16} /> Registrar refeição</button>}>
          <div className="nutri">
            <Ring value={day.totals.kcal} goal={g.kcal} label="Calorias" unit="kcal" size={150} />
            <div className="nutri-bars">
              <Bar label="Proteínas" value={day.totals.protein} goal={g.proteinG} unit="g" color="var(--c-protein)" />
              <Bar label="Carboidratos" value={day.totals.carbs} goal={g.carbsG} unit="g" color="var(--c-carbs)" />
              <Bar label="Gorduras" value={day.totals.fat} goal={g.fatG} unit="g" color="var(--c-fat)" />
              <p className="muted small">
                {day.entries.length ? `${day.entries.length} item(ns) registrado(s)` : 'Nenhum alimento registrado hoje.'}
                {day.totals.missing > 0 && <> · <span className="warn-text">{day.totals.missing} com dados incompletos</span></>}
              </p>
            </div>
          </div>
          <div className="meal-strip">
            {plan.activeSlots.map((m) => (
              <button key={m.id} className={`meal-chip ${day.slotState[m.id]}`} onClick={() => openFor('alimentacao')}>
                <span className="small muted">{m.time}</span>
                <span>{m.name}</span>
                <span className="small">{day.slotState[m.id] === 'registrada' ? `${fmtNum(day.bySlot[m.id].kcal)} kcal` : day.slotState[m.id] === 'dispensada' ? 'dispensada' : 'pendente'}</span>
              </button>
            ))}
          </div>
          {nextMeal && <p className="small muted next-meal">Próxima pendente: <b>{nextMeal.name}</b> às {nextMeal.time}</p>}
        </Card>

        <Card title="Hidratação" icon={<Droplets size={18} />} action={<button className="link-btn small" onClick={() => openFor('hidratacao')}>Detalhes</button>}>
          <div className="water-dash">
            <Ring value={day.waterMl / 1000} goal={g.waterMl / 1000} label="Água" unit="L" digits={2} color="var(--c-water)" />
          </div>
          <div className="quick-row">
            {[100, 250, 500].map((ml) => (
              <button key={ml} className="btn btn-water" onClick={() => quickWater(ml)}>+{ml} ml</button>
            ))}
          </div>
        </Card>

        <Card title="Treino de hoje" icon={<Dumbbell size={18} />} action={<button className="link-btn small" onClick={() => openFor('treinos')}>Abrir</button>}>
          <div className="train-today">
            <div className="train-row">
              <div>
                <span className="muted small">Manhã · musculação</span>
                <strong>{plan.workout?.name ?? 'Descanso de musculação'}</strong>
                {plan.workout && <span className="muted small">{plan.workout.exercises.length} exercícios</span>}
              </div>
              <Badge tone={statusTone(day.workoutStatus)}>{WORKOUT_STATUS_LABEL[day.workoutStatus]}</Badge>
            </div>
            <div className="train-row">
              <div>
                <span className="muted small"><Swords size={12} /> Noite · Muay Thai</span>
                <strong>{plan.muay ? 'Muay Thai intenso' : 'Descanso'}</strong>
                {day.muaySessions[0]?.rpe != null && <span className="muted small">Esforço {day.muaySessions[0].rpe}/10 · {day.muaySessions[0].durationMin ?? '—'} min</span>}
              </div>
              <Badge tone={statusTone(day.muayStatus)}>{MUAY_STATUS_LABEL[day.muayStatus]}</Badge>
            </div>
            {(plan.workout || plan.muay) && (
              <button className="btn btn-sm" onClick={() => openFor('treinos')}>
                {day.workoutStatus === 'pendente' && plan.workout ? 'Iniciar treino' : 'Registrar atividade'}
              </button>
            )}
          </div>
          <div className="fatigue">
            <span className="small muted">Fadiga hoje (1 = descansado, 5 = muito cansado)</span>
            <Scale value={day.meta?.fatigue ?? null} max={5} onChange={(v) => updateDayMeta(today, (d) => { d.fatigue = v })} />
          </div>
        </Card>

        <Card title="Checklist do dia" icon={<ListChecks size={18} />} subtitle={`${day.checklistDone} de ${day.checklistTotal} · ${fmtNum(day.checklistPct)}%`}>
          <ChecklistList day={day} compact />
        </Card>

        <Card title="Alertas e sugestões" icon={<Bell size={18} />}>
          <AlertList alerts={alerts} empty="Nenhum alerta no momento." />
          <p className="muted tiny">Os alertas são sugestões baseadas nos seus registros e não alteram dieta ou treino.</p>
        </Card>
      </div>
    </div>
  )
}
