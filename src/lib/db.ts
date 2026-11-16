import Dexie, { type Table } from 'dexie'
import type {
  BodyLog, CustomMeal, DayMeta, Food, ImportLog, MealEntry, MuaySession, Photo, Settings, WaterEntry, WorkoutSession, ISODate,
} from './types'
import { defaultSettings, seedFoods } from './defaults'

export class CuttingDB extends Dexie {
  settings!: Table<Settings, string>
  foods!: Table<Food, string>
  meals!: Table<MealEntry, string>
  customMeals!: Table<CustomMeal, string>
  water!: Table<WaterEntry, string>
  workouts!: Table<WorkoutSession, string>
  muay!: Table<MuaySession, string>
  body!: Table<BodyLog, string>
  photos!: Table<Photo, string>
  days!: Table<DayMeta, string>
  imports!: Table<ImportLog, string>

  constructor(name = 'cutting-tracker') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      foods: 'id, nameKey, favorite',
      meals: 'id, date, slotId, foodId',
      customMeals: 'id, name',
      water: 'id, date',
      workouts: 'id, date, templateId, [date+templateId]',
      muay: 'id, date',
      body: 'id, date',
      photos: 'id, date',
      days: 'date',
      imports: 'id, importedAt',
    })
  }
}

export let db = new CuttingDB()

/** só para testes */
export function __setDB(next: CuttingDB) {
  db = next
}

export const ALL_TABLES = ['settings', 'foods', 'meals', 'customMeals', 'water', 'workouts', 'muay', 'body', 'photos', 'days', 'imports'] as const
export type TableName = (typeof ALL_TABLES)[number]

/** cria configurações e base de alimentos na primeira execução (sem criar registros) */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', db.settings, db.foods, async () => {
    const s = await db.settings.get('main')
    if (!s) {
      await db.settings.put(defaultSettings())
      const count = await db.foods.count()
      if (count === 0) await db.foods.bulkPut(seedFoods())
    }
  })
}

export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true
      return await navigator.storage.persist()
    }
  } catch {
    /* ignorado */
  }
  return null
}

export function emptyDayMeta(date: ISODate): DayMeta {
  return { date, checklist: {}, skippedSlots: [], fatigue: null, notes: '', closedAt: null }
}

export async function updateDayMeta(date: ISODate, fn: (d: DayMeta) => void): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const cur = (await db.days.get(date)) ?? emptyDayMeta(date)
    fn(cur)
    await db.days.put(cur)
  })
}

export async function saveSettings(patch: (s: Settings) => void): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const cur = (await db.settings.get('main')) ?? defaultSettings()
    patch(cur)
    cur.updatedAt = Date.now()
    await db.settings.put(cur)
  })
}
