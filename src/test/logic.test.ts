import { describe, expect, it } from 'vitest'
import { macrosFor, sumEntries, toGrams } from '../lib/nutrition'
import { defaultSettings, seedFoods } from '../lib/defaults'
import { dayPlan, summarizeDay, overallChecklist, type Store } from '../lib/day'
import { buildEntry } from '../lib/actions'
import { dayAlerts } from '../lib/alerts'
import { parseNum } from '../lib/util'
import { addDays, rangeDates } from '../lib/dates'

const foods = seedFoods()
const food = (id: string) => foods.find((f) => f.id === id)!

function emptyStore(): Store {
  return { settings: defaultSettings(), meals: [], water: [], workouts: [], muay: [], body: [], days: [] }
}

describe('cálculos nutricionais', () => {
  it('calcula macros proporcionais por 100 g', () => {
    const m = macrosFor(food('f_arroz_cozido'), 200)!
    expect(m).toEqual({ kcal: 256, protein: 5, carbs: 56.2, fat: 0.4 })
  })
  it('converte unidades só quando o peso da unidade é conhecido', () => {
    expect(toGrams(food('f_ovo_cozido'), 3, 'un')).toBeNull()
    expect(toGrams({ unitGrams: 50 }, 3, 'un')).toBe(150)
    expect(toGrams(undefined, 30, 'g')).toBe(30)
  })
  it('não inventa valores para alimentos sem dados (whey)', () => {
    expect(macrosFor(food('f_whey'), 30)).toBeNull()
    const e = buildEntry({ date: '2026-11-16', slotId: 'm_cafe', food: food('f_whey'), quantity: 30, unit: 'g' })
    expect(e.kcal).toBeNull()
    const t = sumEntries([e, buildEntry({ date: '2026-11-16', slotId: 'm_cafe', food: food('f_arroz_cozido'), quantity: 100, unit: 'g' })])
    expect(t.missing).toBe(1)
    expect(t.kcal).toBe(128)
  })
  it('soma apenas valores informados em itens com dados parciais', () => {
    const t = sumEntries([{ kcal: 150, protein: null, carbs: null, fat: 9 }, { kcal: 100, protein: 10, carbs: 5, fat: 1 }])
    expect(t).toMatchObject({ kcal: 250, protein: 10, carbs: 5, fat: 10, missing: 1 })
  })
  it('registra excedente sem esconder', () => {
    const s = emptyStore()
    s.meals.push(buildEntry({ date: '2026-11-16', slotId: null, name: 'Pizza', quantity: 1, unit: 'un', manual: { kcal: 2800, protein: 100, carbs: 300, fat: 120 } }))
    const d = summarizeDay(s, '2026-11-16')
    expect(d.totals.kcal).toBe(2800)
    const alerts = dayAlerts(s, d, '2026-11-16', '23:00')
    expect(alerts.find((a) => a.id === 'kcal-over')?.text).toContain('300 kcal acima')
  })
  it('lê números no formato brasileiro', () => {
    expect(parseNum('2.500 kcal')).toBe(2500)
    expect(parseNum('2,5 L')).toBe(2.5)
    expect(parseNum('1.69')).toBe(1.69)
    expect(parseNum('≈ 295 g')).toBe(295)
    expect(parseNum('abc')).toBeNull()
  })
})

describe('regras do dia', () => {
  it('projeto tem 21 dias e 16/11/2026 é dia 1 (segunda, Muay Thai, sem musculação)', () => {
    const s = defaultSettings()
    expect(rangeDates(s.startDate, s.endDate)).toHaveLength(21)
    const p = dayPlan(s, '2026-11-16')
    expect(p.dayIndex).toBe(1)
    expect(p.workout).toBeNull()
    expect(p.muay).toBe(true)
    // sem pré-treino em dia sem musculação, com pré-Muay
    expect(p.activeSlots.map((m) => m.id)).not.toContain('m_pre_treino')
    expect(p.activeSlots.map((m) => m.id)).toContain('m_pre_muay')
  })
  it('terça tem treino superior e não tem pré-Muay', () => {
    const p = dayPlan(defaultSettings(), '2026-11-17')
    expect(p.workout?.id).toBe('w_superior')
    expect(p.activeSlots.map((m) => m.id)).toContain('m_pre_treino')
    expect(p.activeSlots.map((m) => m.id)).not.toContain('m_pre_muay')
  })
  it('treino programado não é marcado como feito sem registro', () => {
    const s = emptyStore()
    const d = summarizeDay(s, '2026-11-17')
    expect(d.workoutStatus).toBe('pendente')
    const item = d.checklist.find((c) => c.def.key === 'workoutDone')!
    expect(item.applicable).toBe(true)
    expect(item.checked).toBe(false)
  })
  it('refeição sem registro continua pendente; dispensada sai da pendência', () => {
    const s = emptyStore()
    let d = summarizeDay(s, '2026-11-16')
    expect(d.pendingSlots.length).toBe(d.plan.activeSlots.length)
    s.days.push({ date: '2026-11-16', checklist: {}, skippedSlots: ['m_lanche'], fatigue: null, notes: '', closedAt: null })
    d = summarizeDay(s, '2026-11-16')
    expect(d.slotState.m_lanche).toBe('dispensada')
    expect(d.pendingSlots.map((x) => x.id)).not.toContain('m_lanche')
  })
  it('água atinge meta só com consumo real; checklist automático e manual', () => {
    const s = emptyStore()
    s.water.push({ id: 'a', date: '2026-11-16', ml: 2000, at: 1 })
    let d = summarizeDay(s, '2026-11-16')
    expect(d.checklist.find((c) => c.def.key === 'waterMet')!.checked).toBe(false)
    s.water.push({ id: 'b', date: '2026-11-16', ml: 500, at: 2 })
    d = summarizeDay(s, '2026-11-16')
    const w = d.checklist.find((c) => c.def.key === 'waterMet')!
    expect(w.checked).toBe(true)
    expect(w.source).toBe('auto')
    // manual sobrepõe
    s.days.push({ date: '2026-11-16', checklist: { waterMet: false, restRespected: true }, skippedSlots: [], fatigue: null, notes: '', closedAt: null })
    d = summarizeDay(s, '2026-11-16')
    expect(d.checklist.find((c) => c.def.key === 'waterMet')!.checked).toBe(false)
    expect(d.checklist.find((c) => c.def.key === 'restRespected')!.checked).toBe(true)
  })
  it('checklist é individual por dia e o percentual geral só conta até hoje', () => {
    const s = emptyStore()
    s.days.push({ date: '2026-11-16', checklist: { dietPlanned: true }, skippedSlots: [], fatigue: null, notes: '', closedAt: null })
    expect(summarizeDay(s, '2026-11-17').checklist.find((c) => c.def.key === 'dietPlanned')!.checked).toBe(false)
    const o = overallChecklist(s, '2026-11-16')
    expect(o.done).toBe(1)
    // dia 16 (segunda): sem musculação → 6 itens aplicáveis não opcionais (peso é opcional)
    expect(o.total).toBe(6)
  })
  it('alerta de fadiga com esforço alto no Muay Thai', () => {
    const s = emptyStore()
    s.muay.push({ id: 'm', date: '2026-11-20', status: 'realizado', durationMin: 90, intensity: 'intensa', rpe: 9, notes: '', createdAt: 1 })
    const d = summarizeDay(s, addDays('2026-11-20', 0))
    expect(dayAlerts(s, d, '2026-11-20', '22:00').some((a) => a.id === 'fatigue')).toBe(true)
  })
  it('não exibe % de gordura sem medição', () => {
    const s = emptyStore()
    s.body.push({ id: 'b', date: '2026-11-16', weightKg: 82, waistCm: null, measures: {}, bodyFatPct: null, notes: '', createdAt: 1 })
    expect(summarizeDay(s, '2026-11-16').weightKg).toBe(82)
    expect(s.body[0].bodyFatPct).toBeNull()
  })
})
