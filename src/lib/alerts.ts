import type { ISODate } from './types'
import type { DaySummary, Store } from './day'
import { addDays } from './dates'
import { fmtNum } from './util'

export interface Alert {
  id: string
  level: 'info' | 'warn' | 'danger' | 'ok'
  title: string
  text: string
}

/**
 * Regras de acompanhamento: geram apenas sugestões e avisos.
 * Nunca alteram dieta, treino ou registros.
 */
export function dayAlerts(store: Store, day: DaySummary, today: ISODate, nowHHMM: string): Alert[] {
  const out: Alert[] = []
  const g = store.settings.goals
  const isPast = day.date < today
  const isToday = day.date === today

  // calorias acima da meta: mostrar o excedente real
  if (day.totals.kcal > g.kcal) {
    out.push({
      id: 'kcal-over', level: 'warn', title: 'Meta calórica ultrapassada',
      text: `Consumo registrado: ${fmtNum(day.totals.kcal)} kcal (${fmtNum(day.totals.kcal - g.kcal)} kcal acima da meta de ${fmtNum(g.kcal)}).`,
    })
  }

  if (day.totals.missing > 0) {
    out.push({
      id: 'missing-data', level: 'info', title: 'Itens com dados nutricionais incompletos',
      text: `${day.totals.missing} item(ns) registrado(s) com valores nutricionais ausentes. Somente os valores informados entram nos totais; complete com os dados do rótulo.`,
    })
  }

  // refeições pendentes cujo horário já passou
  if (isToday) {
    const late = day.pendingSlots.filter((s) => (s.timeEnd ?? s.time) < nowHHMM)
    if (late.length) {
      out.push({
        id: 'late-meals', level: 'info', title: 'Refeições pendentes',
        text: `${late.map((s) => `${s.name} (${s.time})`).join(', ')} ainda sem registro.`,
      })
    }
  } else if (isPast && day.pendingSlots.length && day.plan.inProject) {
    out.push({
      id: 'past-pending', level: 'info', title: 'Refeições sem registro',
      text: `${day.pendingSlots.map((s) => s.name).join(', ')} ficaram sem registro neste dia.`,
    })
  }

  if (isPast && day.waterMl < g.waterMl) {
    out.push({
      id: 'water-low', level: 'info', title: 'Meta de água não atingida',
      text: `Consumo real: ${fmtNum(day.waterMl / 1000, 2)} L de ${fmtNum(g.waterMl / 1000, 2)} L.`,
    })
  }
  if (isPast && day.entries.length > 0 && day.totals.protein < g.proteinG) {
    out.push({
      id: 'protein-low', level: 'info', title: 'Proteína abaixo da meta',
      text: `Registrado: ${fmtNum(day.totals.protein)} g de ${fmtNum(g.proteinG)} g.`,
    })
  }

  // fadiga
  const fatigueReasons: string[] = []
  if ((day.meta?.fatigue ?? 0) >= 4) fatigueReasons.push(`fadiga do dia registrada como ${day.meta!.fatigue}/5`)
  const recentMuay = store.muay
    .filter((m) => m.date <= day.date && m.date >= addDays(day.date, -2) && m.rpe != null)
    .sort((a, b) => b.date.localeCompare(a.date))
  const hard = recentMuay.filter((m) => (m.rpe ?? 0) >= 8)
  if (recentMuay[0] && (recentMuay[0].rpe ?? 0) >= 9) fatigueReasons.push(`último Muay Thai com esforço ${recentMuay[0].rpe}/10`)
  else if (hard.length >= 2) fatigueReasons.push(`${hard.length} sessões de Muay Thai com esforço ≥ 8 nos últimos 3 dias`)
  const recentWorkFatigue = store.workouts.filter((w) => w.date <= day.date && w.date >= addDays(day.date, -1) && (w.fatigue ?? 0) >= 4)
  if (recentWorkFatigue.length) fatigueReasons.push('fadiga alta registrada em treino recente')
  if (fatigueReasons.length) {
    const fridayHint = day.plan.workout ? ' Se fizer o treino, você pode registrá-lo como adaptado ou cancelado.' : ''
    out.push({
      id: 'fatigue', level: 'danger', title: 'Fadiga elevada',
      text: `Sinais: ${fatigueReasons.join('; ')}. Considere priorizar recuperação ou reduzir a intensidade.${fridayHint}`,
    })
  }

  if (isPast && day.plan.workout && day.workoutStatus === 'pendente') {
    out.push({
      id: 'workout-unlogged', level: 'info', title: 'Treino sem registro',
      text: `O treino ${day.plan.workout.name} estava programado e não foi registrado. Você pode registrá-lo como realizado, adaptado ou não realizado.`,
    })
  }
  if (isPast && day.plan.muay && day.muayStatus === 'pendente') {
    out.push({
      id: 'muay-unlogged', level: 'info', title: 'Muay Thai sem registro',
      text: 'O Muay Thai estava programado e não foi registrado.',
    })
  }
  return out
}
