import type { Food, MealEntry, Unit } from './types'
import { round } from './util'

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function isFoodComplete(f: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'>): boolean {
  return [f.kcal, f.protein, f.carbs, f.fat].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)
}

/** converte quantidade + unidade em gramas/ml usando o peso por unidade do alimento */
export function toGrams(food: Pick<Food, 'unitGrams'> | undefined, quantity: number, unit: Unit): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null
  if (unit === 'g' || unit === 'ml') return quantity
  if (food?.unitGrams && food.unitGrams > 0) return quantity * food.unitGrams
  return null
}

/** macros para uma quantidade (g/ml) de um alimento; null quando faltam dados */
export function macrosFor(food: Pick<Food, 'kcal' | 'protein' | 'carbs' | 'fat'>, grams: number | null): Macros | null {
  if (grams == null || !isFoodComplete(food)) return null
  const k = grams / 100
  return {
    kcal: round((food.kcal as number) * k, 1),
    protein: round((food.protein as number) * k, 1),
    carbs: round((food.carbs as number) * k, 1),
    fat: round((food.fat as number) * k, 1),
  }
}

export function entryHasData(e: Pick<MealEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>): boolean {
  return [e.kcal, e.protein, e.carbs, e.fat].every((v) => typeof v === 'number' && Number.isFinite(v))
}

export interface Totals extends Macros {
  count: number
  missing: number // itens sem dados nutricionais
}

/** soma o que foi informado; itens com algum valor ausente são contados em `missing` (nada é estimado) */
export function sumEntries(entries: Pick<MealEntry, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, count: entries.length, missing: 0 }
  const ok = (v: number | null) => typeof v === 'number' && Number.isFinite(v)
  for (const e of entries) {
    if (!entryHasData(e)) t.missing++
    if (ok(e.kcal)) t.kcal += e.kcal as number
    if (ok(e.protein)) t.protein += e.protein as number
    if (ok(e.carbs)) t.carbs += e.carbs as number
    if (ok(e.fat)) t.fat += e.fat as number
  }
  t.kcal = round(t.kcal, 1)
  t.protein = round(t.protein, 1)
  t.carbs = round(t.carbs, 1)
  t.fat = round(t.fat, 1)
  return t
}

/** kcal derivadas dos macros (4/4/9) — usado para conferir metas */
export function kcalFromMacros(p: number, c: number, f: number): number {
  return p * 4 + c * 4 + f * 9
}

/** converte valores de rótulo (por porção) para 100 g */
export function per100FromServing(value: number, servingGrams: number): number {
  if (!servingGrams) return 0
  return round((value / servingGrams) * 100, 2)
}
