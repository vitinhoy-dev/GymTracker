import { beforeEach, describe, expect, it } from 'vitest'
import { CuttingDB, __setDB, db, ensureSeed } from '../lib/db'
import { applyImport, buildPreview, DEFAULT_OPTIONS, readWorkbook } from '../lib/importer'
import { exportBackup, restoreBackup, validateBackup } from '../lib/backup'
import { buildFixtureWorkbook, buildLongLayoutWorkbook } from './fixture'
import { buildReportWorkbook, dailyCsv } from '../lib/reports'
import { addWater } from '../lib/actions'

let n = 0
beforeEach(async () => {
  __setDB(new CuttingDB('test-' + n++))
  await ensureSeed()
})

async function existing() {
  const settings = (await db.settings.get('main'))!
  const foods = await db.foods.toArray()
  const water = await db.water.toArray()
  const days = await db.days.toArray()
  return { settings, foods, waterDates: new Set(water.map((w) => w.date)), manualMarks: Object.fromEntries(days.map((d) => [d.date, d.checklist])) }
}

describe('persistência inicial', () => {
  it('cria configurações e base de alimentos sem registros fictícios', async () => {
    expect((await db.settings.get('main'))!.goals.kcal).toBe(2500)
    expect(await db.foods.count()).toBeGreaterThan(5)
    expect(await db.meals.count()).toBe(0)
    expect(await db.water.count()).toBe(0)
    expect(await db.body.count()).toBe(0)
    await ensureSeed() // idempotente
    expect(await db.settings.count()).toBe(1)
  })
})

describe('importação da planilha', () => {
  it('lê todas as abas e monta a prévia', async () => {
    const p = buildPreview(readWorkbook(buildFixtureWorkbook()), 'x.xlsx', await existing())
    expect(p.missing).toEqual([])
    expect(p.errors).toEqual([])
    const ch = Object.fromEntries(p.settingChanges.map((c) => [c.field, c.proposed]))
    expect(ch.kcal).toBe(2400)
    expect(ch.proteinG).toBe(175)
    expect(ch.carbsG).toBe(280)
    expect(ch.waterMl).toBeUndefined() // 2,5 L = 2500 ml, igual ao atual
    expect(ch.heightCm).toBeUndefined() // 1,69 m = 169 cm
    expect(p.meals).toHaveLength(6)
    const jantar = p.meals.find((m) => m.name === 'Jantar')!
    expect(jantar.time).toBe('20:30')
    expect(jantar.timeEnd).toBe('21:30')
    expect(jantar.plan[0]).toMatchObject({ amount: 150, amountMax: 200, unit: 'g', foodId: 'f_arroz_cozido' })
    expect(jantar.plan[1]).toMatchObject({ amount: 2, amountMax: 3, unit: 'un', foodId: 'f_ovo_cozido' })
    const cafe = p.meals.find((m) => /caf/i.test(m.name))!
    expect(cafe.plan.map((x) => x.foodId)).toEqual(['f_ovo_cozido', 'f_whey', 'f_farinha_aveia'])
    expect(p.meals.find((m) => m.name === 'Pré-Muay Thai')!.condition).toBe('muay')
    expect(p.routine![5]).toEqual({ morning: 'w_fullbody', muay: true })
    expect(p.routine![1]).toEqual({ morning: null, muay: true })
    const inf = p.workouts.find((w) => w.template.id === 'w_inferior')!
    expect(inf.template.exercises.find((e) => e.name === 'Prancha')).toMatchObject({ sets: 3, repsMin: 30, repsMax: 45, unit: 's' })
    const iog = p.foods.find((f) => f.name === 'Iogurte natural')!
    expect(iog.kcal).toBe(60) // 102 kcal / 170 g → 60 kcal/100 g
    expect(p.foods.find((f) => f.name.startsWith('Whey'))!.status).toBe('completa_existente')
    expect(p.water).toEqual([{ date: '2026-11-16', ml: 2100, conflict: false }])
    expect(p.checklistMarks.map((m) => [m.date, m.key])).toEqual([['2026-11-16', 'dietPlanned'], ['2026-11-16', 'custom_dormi_8_horas']])
    expect(p.todayPlan.date).toBe('2026-11-16')
  })

  it('importa sem duplicar e preserva registros existentes', async () => {
    await db.meals.put({ id: 'keep', date: '2026-11-16', slotId: 'm_almoco', name: 'Arroz', quantity: 100, unit: 'g', grams: 100, kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2, offPlan: false, createdAt: 1 })
    await addWater('2026-11-16', 300) // já existe água em 16/11
    await db.days.put({ date: '2026-11-16', checklist: { dietPlanned: false }, skippedSlots: [], fatigue: null, notes: 'minha nota', closedAt: null })

    const wb = readWorkbook(buildFixtureWorkbook())
    const p1 = buildPreview(wb, 'x.xlsx', await existing())
    await applyImport(p1, DEFAULT_OPTIONS)
    const foodsAfter1 = await db.foods.count()

    // segunda importação: não duplica
    const p2 = buildPreview(wb, 'x.xlsx', await existing())
    await applyImport(p2, DEFAULT_OPTIONS)
    expect(await db.foods.count()).toBe(foodsAfter1)

    const s = (await db.settings.get('main'))!
    expect(s.goals.kcal).toBe(2400)
    expect(s.checklist.filter((c) => c.key === 'custom_dormi_8_horas')).toHaveLength(1)
    expect(await db.meals.get('keep')).toBeTruthy()
    // água: dia já tinha registro → preservado, nada importado
    const water = await db.water.where('date').equals('2026-11-16').toArray()
    expect(water).toHaveLength(1)
    expect(water[0].ml).toBe(300)
    // checklist manual preservado; nota mantida e plano anexado só uma vez
    const day = (await db.days.get('2026-11-16'))!
    expect(day.checklist.dietPlanned).toBe(false)
    expect(day.checklist.custom_dormi_8_horas).toBe(true)
    expect(day.notes.startsWith('minha nota')).toBe(true)
    expect(day.notes.match(/Plano importado/g)).toHaveLength(1)
    // whey teve dados completados a partir da planilha (30 g → 100 g)
    const whey = (await db.foods.get('f_whey'))!
    expect(whey.kcal).toBe(400)
    expect(whey.protein).toBe(80)
    expect(await db.imports.count()).toBe(2)
  })
})

describe('importação: layout da planilha real (uma linha por item)', () => {
  it('agrupa refeições, lê rotina por período, checklist em linhas e janelas de água', async () => {
    const p = buildPreview(readWorkbook(buildLongLayoutWorkbook()), 'real.xlsx', await existing())
    expect(p.errors).toEqual([])
    expect(p.settingChanges).toEqual([]) // valores iguais aos atuais
    expect(p.meals.map((m) => [m.id, m.plan.length])).toEqual([['m_pre_treino', 2], ['m_almoco', 2], ['m_pre_muay', 1], ['m_jantar', 1]])
    expect(p.meals[0].plan[0]).toMatchObject({ amount: 2, unit: 'un', foodId: 'f_pao_forma_integral' })
    expect(p.meals[1].plan[1]).toMatchObject({ name: 'Legumes/verduras', amount: 0 })
    expect(p.meals[3].plan[0]).toMatchObject({ amount: 2, amountMax: 3, unit: 'un', foodId: 'f_ovo_cozido' })
    expect(p.routine![1]).toEqual({ morning: null, muay: true })
    expect(p.routine![2]).toEqual({ morning: 'w_superior', muay: false })
    expect(p.routine![5]).toEqual({ morning: 'w_fullbody', muay: true })
    expect(p.routine![6]).toEqual({ morning: null, muay: false })
    const sup = p.workouts.find((w) => w.template.id === 'w_superior')!
    expect(sup.template.exercises[0]).toMatchObject({ id: 'e_supino_reto', notes: '1–3 repetições na reserva' })
    const inf = p.workouts.find((w) => w.template.id === 'w_inferior')!
    expect(inf.template.exercises.map((e) => e.id)).toEqual(['e_elevacao_pernas', 'e_prancha'])
    expect(inf.template.exercises[1]).toMatchObject({ repsMin: 30, repsMax: 45, unit: 's' })
    expect(p.foods).toEqual([])
    expect(p.foodReference).toHaveLength(2)
    expect(p.waterPlan.map((w) => [w.until, w.ml])).toEqual([['14:00', 500], ['17:00', 500], ['19:00', 500], ['22:00', 700], [null, 300]])
    expect(p.water).toEqual([])
    expect(p.checklistItems.every((c) => c.matchedKey)).toBe(true)
    // só marca quando todas as linhas do item no dia estão concluídas
    expect(p.checklistMarks.map((m) => m.key)).toEqual(['muayDone'])
    await applyImport(p, DEFAULT_OPTIONS)
    const s = (await db.settings.get('main'))!
    expect(s.waterPlan).toHaveLength(5)
    expect(s.checklist.filter((c) => c.key.startsWith('custom_'))).toHaveLength(0)
    expect(s.meals.find((m) => m.id === 'm_lanche')).toBeTruthy() // refeições fora da planilha são mantidas
  })
})

describe('backup e restauração', () => {
  it('exporta e restaura (mesclar e substituir)', async () => {
    await addWater('2026-11-16', 250)
    await db.photos.put({ id: 'p1', date: '2026-11-16', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), note: '', createdAt: 1 })
    const b = JSON.parse(JSON.stringify(await exportBackup()))
    expect(validateBackup(b).ok).toBe(true)
    expect(validateBackup({ foo: 1 }).ok).toBe(false)

    // mesclar em base com outro registro: preserva ambos
    __setDB(new CuttingDB('restore-' + n++))
    await ensureSeed()
    await addWater('2026-11-17', 500)
    const r = await restoreBackup(b, 'merge')
    expect(r.added).toBeGreaterThan(0)
    expect(await db.water.count()).toBe(2)
    const photo = (await db.photos.get('p1'))!
    expect(photo.blob.size).toBe(3)

    // substituir: fica igual ao backup
    await restoreBackup(b, 'replace')
    expect(await db.water.count()).toBe(1)
  })
  it('gera relatórios Excel e CSV', async () => {
    await addWater('2026-11-16', 250)
    const settings = (await db.settings.get('main'))!
    const store = { settings, meals: [], water: await db.water.toArray(), workouts: [], muay: [], body: [], days: [] }
    const wb = buildReportWorkbook(store, await db.foods.toArray())
    expect(wb.SheetNames).toContain('Resumo diário')
    const csv = dailyCsv(store)
    expect(csv.split('\n')).toHaveLength(22)
    expect(csv).toContain('250')
  })
})
