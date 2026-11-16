import type {
  BodyLog, ChecklistItemDef, DayMeta, DayRoutine, ISODate, MealEntry, MealSlot, MuaySession, Settings, WaterEntry,
  WorkoutSession, WorkoutStatus, WorkoutTemplate,
} from './types'
import { diffDays, rangeDates, weekday } from './dates'
import { sumEntries, type Totals } from './nutrition'

export interface Store {
  settings: Settings
  meals: MealEntry[]
  water: WaterEntry[]
  workouts: WorkoutSession[]
  muay: MuaySession[]
  body: BodyLog[]
  days: DayMeta[]
}

export interface DayPlan {
  date: ISODate
  routine: DayRoutine
  workout: WorkoutTemplate | null
  muay: boolean
  inProject: boolean
  dayIndex: number // 1-based
  totalDays: number
  activeSlots: MealSlot[]
}

export function projectLength(s: Settings): number {
  return Math.max(0, diffDays(s.startDate, s.endDate) + 1)
}

export function dayPlan(s: Settings, date: ISODate): DayPlan {
  const routine = s.routine[weekday(date)] ?? { morning: null, muay: false }
  const workout = routine.morning ? s.workouts.find((w) => w.id === routine.morning) ?? null : null
  const muay = !!routine.muay
  const totalDays = projectLength(s)
  const dayIndex = diffDays(s.startDate, date) + 1
  const activeSlots = [...s.meals]
    .filter((m) => m.condition === 'always' || (m.condition === 'morningWorkout' && !!workout) || (m.condition === 'muay' && muay))
    .sort((a, b) => a.time.localeCompare(b.time))
  return { date, routine, workout, muay, inProject: dayIndex >= 1 && dayIndex <= totalDays, dayIndex, totalDays, activeSlots }
}

export type SlotState = 'registrada' | 'pendente' | 'dispensada'

export interface ChecklistState {
  def: ChecklistItemDef
  applicable: boolean
  auto: boolean | null
  manual: boolean | undefined
  checked: boolean
  source: 'auto' | 'manual' | null
}

export type WorkoutDayStatus = WorkoutStatus | 'descanso' | 'pendente'
export type MuayDayStatus = MuaySession['status'] | 'descanso' | 'pendente'

export interface DaySummary {
  date: ISODate
  plan: DayPlan
  entries: MealEntry[]
  totals: Totals
  bySlot: Record<string, Totals>
  extraTotals: Totals
  slotState: Record<string, SlotState>
  pendingSlots: MealSlot[]
  waterMl: number
  waterEntries: WaterEntry[]
  sessions: WorkoutSession[]
  workoutStatus: WorkoutDayStatus
  muaySessions: MuaySession[]
  muayStatus: MuayDayStatus
  bodyLogs: BodyLog[]
  weightKg: number | null
  meta: DayMeta | undefined
  checklist: ChecklistState[]
  checklistDone: number
  checklistTotal: number
  checklistPct: number
  hasAnyRecord: boolean
}

const STATUS_PRIORITY: WorkoutStatus[] = ['concluido', 'adaptado', 'em_andamento', 'cancelado', 'nao_realizado']

export function summarizeDay(store: Store, date: ISODate): DaySummary {
  const s = store.settings
  const plan = dayPlan(s, date)
  const entries = store.meals.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt)
  const meta = store.days.find((d) => d.date === date)
  const totals = sumEntries(entries)
  const bySlot: Record<string, Totals> = {}
  const slotState: Record<string, SlotState> = {}
  for (const slot of s.meals) {
    const se = entries.filter((e) => e.slotId === slot.id)
    bySlot[slot.id] = sumEntries(se)
    slotState[slot.id] = se.length > 0 ? 'registrada' : meta?.skippedSlots.includes(slot.id) ? 'dispensada' : 'pendente'
  }
  const knownSlots = new Set(s.meals.map((m) => m.id))
  const extraTotals = sumEntries(entries.filter((e) => !e.slotId || !knownSlots.has(e.slotId)))
  const pendingSlots = plan.activeSlots.filter((m) => slotState[m.id] === 'pendente')

  const waterEntries = store.water.filter((w) => w.date === date).sort((a, b) => a.at - b.at)
  const waterMl = waterEntries.reduce((a, w) => a + w.ml, 0)

  const sessions = store.workouts.filter((w) => w.date === date)
  let workoutStatus: WorkoutDayStatus = plan.workout ? 'pendente' : 'descanso'
  const relevant = plan.workout ? sessions.filter((x) => x.templateId === plan.workout!.id) : sessions
  for (const st of STATUS_PRIORITY) {
    if (relevant.some((x) => x.status === st)) {
      workoutStatus = st
      break
    }
  }

  const muaySessions = store.muay.filter((m) => m.date === date)
  let muayStatus: MuayDayStatus = plan.muay ? 'pendente' : 'descanso'
  if (muaySessions.some((m) => m.status === 'realizado')) muayStatus = 'realizado'
  else if (muaySessions.some((m) => m.status === 'adaptado')) muayStatus = 'adaptado'
  else if (muaySessions.some((m) => m.status === 'nao_realizado')) muayStatus = 'nao_realizado'

  const bodyLogs = store.body.filter((b) => b.date === date).sort((a, b) => a.createdAt - b.createdAt)
  const withWeight = bodyLogs.filter((b) => b.weightKg != null)
  const weightKg = withWeight.length ? withWeight[withWeight.length - 1].weightKg : null

  const autoValue = (def: ChecklistItemDef): boolean | null => {
    switch (def.auto) {
      case 'allMealsLogged':
        return plan.activeSlots.length > 0 && pendingSlots.length === 0 && entries.length > 0
      case 'proteinMet':
        return entries.length > 0 && totals.protein >= s.goals.proteinG
      case 'waterMet':
        return waterMl >= s.goals.waterMl
      case 'workoutDone':
        return workoutStatus === 'concluido' || workoutStatus === 'adaptado'
      case 'muayDone':
        return muayStatus === 'realizado' || muayStatus === 'adaptado'
      case 'weightLogged':
        return weightKg != null
      default:
        return null
    }
  }

  const checklist: ChecklistState[] = s.checklist
    .filter((d) => d.enabled)
    .map((def) => {
      const applicable =
        def.appliesTo === 'workoutDay' ? !!plan.workout : def.appliesTo === 'muayDay' ? plan.muay : true
      const auto = autoValue(def)
      const manual = meta?.checklist[def.key]
      const checked = manual !== undefined ? manual : auto === true
      const source = manual !== undefined ? 'manual' : auto ? 'auto' : null
      return { def, applicable, auto, manual, checked, source }
    })
  const counted = checklist.filter((c) => c.applicable && !c.def.optional)
  const checklistDone = counted.filter((c) => c.checked).length
  const checklistTotal = counted.length

  const hasAnyRecord =
    entries.length > 0 || waterEntries.length > 0 || sessions.length > 0 || muaySessions.length > 0 || bodyLogs.length > 0 ||
    Object.keys(meta?.checklist ?? {}).length > 0 || !!meta?.notes

  return {
    date, plan, entries, totals, bySlot, extraTotals, slotState, pendingSlots, waterMl, waterEntries, sessions, workoutStatus,
    muaySessions, muayStatus, bodyLogs, weightKg, meta, checklist, checklistDone, checklistTotal,
    checklistPct: checklistTotal ? (checklistDone / checklistTotal) * 100 : 0,
    hasAnyRecord,
  }
}

export function projectDates(s: Settings): ISODate[] {
  return rangeDates(s.startDate, s.endDate)
}

/** progresso geral do checklist: dias do projeto até hoje (inclusive) */
export function overallChecklist(store: Store, today: ISODate) {
  let done = 0
  let total = 0
  for (const d of projectDates(store.settings)) {
    if (d > today) break
    const sum = summarizeDay(store, d)
    done += sum.checklistDone
    total += sum.checklistTotal
  }
  return { done, total, pct: total ? (done / total) * 100 : 0 }
}

/** último peso registrado (qualquer data) */
export function latestWeight(store: Store): { date: ISODate; weightKg: number } | null {
  const logs = store.body.filter((b) => b.weightKg != null).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const last = logs[logs.length - 1]
  return last ? { date: last.date, weightKg: last.weightKg as number } : null
}

export const WORKOUT_STATUS_LABEL: Record<WorkoutDayStatus, string> = {
  descanso: 'Descanso',
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  adaptado: 'Adaptado',
  cancelado: 'Cancelado',
  nao_realizado: 'Não realizado',
}

export const MUAY_STATUS_LABEL: Record<MuayDayStatus, string> = {
  descanso: 'Sem Muay Thai',
  pendente: 'Pendente',
  realizado: 'Realizado',
  adaptado: 'Adaptado',
  nao_realizado: 'Não realizado',
}
