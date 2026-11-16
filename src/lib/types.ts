export type ISODate = string // YYYY-MM-DD (data local)

export type Sex = 'masculino' | 'feminino'

export interface Profile {
  sex: Sex
  age: number
  heightCm: number
  startWeightKg: number
  targetWeightKg: number | null
  level: string
  objective: string
}

export interface Goals {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  waterMl: number
}

/** Em quais dias a refeição é exigida. */
export type MealCondition = 'always' | 'morningWorkout' | 'muay'

export type Unit = 'g' | 'ml' | 'un'

export interface PlannedItem {
  foodId?: string
  name: string
  amount: number
  amountMax?: number
  unit: Unit
}

export interface MealSlot {
  id: string
  name: string
  time: string // HH:MM
  timeEnd?: string
  condition: MealCondition
  plan: PlannedItem[]
}

export interface ExerciseTemplate {
  id: string
  name: string
  sets: number
  repsMin: number
  repsMax: number
  unit: 'reps' | 's'
  notes?: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  notes?: string
  exercises: ExerciseTemplate[]
}

export interface WaterWindow {
  label: string
  /** horário final da janela (HH:MM); null = até o fim do dia */
  until: string | null
  ml: number
  note?: string
}

export interface DayRoutine {
  /** id do treino de musculação da manhã ou null para descanso */
  morning: string | null
  /** true quando há Muay Thai à noite */
  muay: boolean
}

export type AutoRule =
  | 'allMealsLogged'
  | 'proteinMet'
  | 'waterMet'
  | 'workoutDone'
  | 'muayDone'
  | 'weightLogged'

export interface ChecklistItemDef {
  key: string
  label: string
  auto?: AutoRule
  /** só se aplica em dias com musculação / Muay Thai */
  appliesTo?: 'workoutDay' | 'muayDay'
  optional?: boolean
  enabled: boolean
}

export interface Settings {
  id: 'main'
  profile: Profile
  goals: Goals
  startDate: ISODate
  endDate: ISODate
  meals: MealSlot[]
  /** 0 = domingo ... 6 = sábado */
  routine: Record<number, DayRoutine>
  workouts: WorkoutTemplate[]
  checklist: ChecklistItemDef[]
  /** plano de hidratação por horário (referência; o consumo continua sendo o registrado) */
  waterPlan?: WaterWindow[]
  updatedAt: number
}

export interface Food {
  id: string
  name: string
  nameKey: string
  /** fonte dos valores: "TACO 4ª ed.", "Rótulo", "Planilha" ... */
  source: string
  /** valores por 100 g (ou 100 ml); null = não informado */
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  basis: 'g' | 'ml'
  /** nome da unidade (fatia, unidade, scoop) e peso de 1 unidade em g/ml */
  unitName?: string
  unitGrams?: number | null
  favorite: boolean
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface MealEntry {
  id: string
  date: ISODate
  /** id da refeição do plano; null = registro extra / fora do planejamento */
  slotId: string | null
  foodId?: string
  name: string
  quantity: number
  unit: Unit
  /** quantidade convertida em g/ml (null se não for possível converter) */
  grams: number | null
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  offPlan: boolean
  substituteFor?: string
  note?: string
  createdAt: number
}

export interface CustomMeal {
  id: string
  name: string
  favorite: boolean
  items: { foodId?: string; name: string; quantity: number; unit: Unit }[]
  createdAt: number
}

export interface WaterEntry {
  id: string
  date: ISODate
  ml: number
  at: number
}

export type WorkoutStatus = 'em_andamento' | 'concluido' | 'adaptado' | 'cancelado' | 'nao_realizado'

export interface SetLog {
  reps: number | null
  load: number | null
  done: boolean
}

export interface SessionExercise {
  exerciseId: string
  name: string
  targetSets: number
  repsMin: number
  repsMax: number
  unit: 'reps' | 's'
  done: boolean
  sets: SetLog[]
  notes: string
}

export interface WorkoutSession {
  id: string
  date: ISODate
  templateId: string
  templateName: string
  status: WorkoutStatus
  exercises: SessionExercise[]
  notes: string
  fatigue: number | null // 1–5
  durationMin: number | null
  createdAt: number
  updatedAt: number
}

export type MuayStatus = 'realizado' | 'adaptado' | 'nao_realizado'

export interface MuaySession {
  id: string
  date: ISODate
  status: MuayStatus
  durationMin: number | null
  intensity: 'leve' | 'moderada' | 'intensa' | null
  rpe: number | null // 1–10
  notes: string
  createdAt: number
}

export interface BodyLog {
  id: string
  date: ISODate
  weightKg: number | null
  waistCm: number | null
  measures: Record<string, number>
  /** só preenchido se o usuário informar uma medição real */
  bodyFatPct: number | null
  notes: string
  createdAt: number
}

export interface Photo {
  id: string
  date: ISODate
  blob: Blob
  note: string
  createdAt: number
}

export interface DayMeta {
  date: ISODate
  /** marcações manuais do checklist (sobrepõem o automático) */
  checklist: Record<string, boolean>
  /** refeições marcadas como "não se aplica hoje" */
  skippedSlots: string[]
  fatigue: number | null // 1–5
  notes: string
  closedAt: number | null
}

export interface ImportLog {
  id: string
  fileName: string
  importedAt: number
  summary: string[]
  sheets: Record<string, string[][]>
}
