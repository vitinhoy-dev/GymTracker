import { db, updateDayMeta } from './db'
import type { Food, ISODate, MealEntry, MuaySession, Settings, Unit, WorkoutSession, WorkoutTemplate } from './types'
import { uid } from './util'
import { macrosFor, toGrams } from './nutrition'

export async function addWater(date: ISODate, ml: number) {
  if (!Number.isFinite(ml) || ml <= 0 || ml > 5000) throw new Error('Quantidade de água inválida (1 a 5000 ml).')
  const now = new Date()
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime()
  const id = uid('w')
  await db.water.put({ id, date, ml: Math.round(ml), at })
  return id
}

export async function toggleChecklist(date: ISODate, key: string, value: boolean | undefined) {
  await updateDayMeta(date, (d) => {
    if (value === undefined) delete d.checklist[key]
    else d.checklist[key] = value
  })
}

/** cria um registro de alimento a partir da base (calcula macros) */
export function buildEntry(params: {
  date: ISODate
  slotId: string | null
  food?: Food
  name?: string
  quantity: number
  unit: Unit
  manual?: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }
  offPlan?: boolean
  substituteFor?: string
  note?: string
}): MealEntry {
  const { food } = params
  const grams = food ? toGrams(food, params.quantity, params.unit) : params.unit === 'un' ? null : params.quantity
  const m = food ? macrosFor(food, grams) : null
  const manual = params.manual
  return {
    id: uid('e'),
    date: params.date,
    slotId: params.slotId,
    foodId: food?.id,
    name: food?.name ?? params.name ?? 'Alimento',
    quantity: params.quantity,
    unit: params.unit,
    grams,
    kcal: m?.kcal ?? manual?.kcal ?? null,
    protein: m?.protein ?? manual?.protein ?? null,
    carbs: m?.carbs ?? manual?.carbs ?? null,
    fat: m?.fat ?? manual?.fat ?? null,
    offPlan: params.offPlan ?? params.slotId === null,
    substituteFor: params.substituteFor || undefined,
    note: params.note || undefined,
    createdAt: Date.now(),
  }
}

export function newSession(date: ISODate, t: WorkoutTemplate): WorkoutSession {
  const now = Date.now()
  return {
    id: uid('s'),
    date,
    templateId: t.id,
    templateName: t.name,
    status: 'em_andamento',
    exercises: t.exercises.map((e) => ({
      exerciseId: e.id,
      name: e.name,
      targetSets: e.sets,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      unit: e.unit,
      done: false,
      sets: Array.from({ length: e.sets }, () => ({ reps: null, load: null, done: false })),
      notes: '',
    })),
    notes: '',
    fatigue: null,
    durationMin: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function newMuay(date: ISODate): MuaySession {
  return { id: uid('mt'), date, status: 'realizado', durationMin: null, intensity: 'intensa', rpe: null, notes: '', createdAt: Date.now() }
}

export function slotName(s: Settings, id: string | null) {
  if (!id) return 'Fora do planejamento'
  return s.meals.find((m) => m.id === id)?.name ?? 'Refeição removida'
}
