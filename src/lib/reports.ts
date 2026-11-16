import * as XLSX from '@e965/xlsx'
import type { Store } from './day'
import { MUAY_STATUS_LABEL, WORKOUT_STATUS_LABEL, projectDates, summarizeDay } from './day'
import { fmtBR } from './dates'
import type { Food } from './types'
import { round } from './util'

export function dailyRows(store: Store) {
  const g = store.settings.goals
  return projectDates(store.settings).map((date) => {
    const d = summarizeDay(store, date)
    return {
      Data: fmtBR(date),
      'Dia do projeto': d.plan.dayIndex,
      'Calorias (kcal)': d.totals.kcal,
      'Meta kcal': g.kcal,
      'Proteínas (g)': d.totals.protein,
      'Meta proteína (g)': g.proteinG,
      'Carboidratos (g)': d.totals.carbs,
      'Meta carboidratos (g)': g.carbsG,
      'Gorduras (g)': d.totals.fat,
      'Meta gorduras (g)': g.fatG,
      'Itens sem dados nutricionais': d.totals.missing,
      'Água (ml)': d.waterMl,
      'Meta água (ml)': g.waterMl,
      'Treino programado': d.plan.workout?.name ?? 'Descanso',
      'Status do treino': WORKOUT_STATUS_LABEL[d.workoutStatus],
      'Muay Thai': MUAY_STATUS_LABEL[d.muayStatus],
      'Checklist (%)': round(d.checklistPct, 0),
      'Refeições pendentes': d.pendingSlots.map((s) => s.name).join(', '),
      'Peso (kg)': d.weightKg ?? '',
      'Fadiga (1-5)': d.meta?.fatigue ?? '',
      Observações: d.meta?.notes ?? '',
    }
  })
}

export function buildReportWorkbook(store: Store, foods: Food[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const slotName = (id: string | null) => store.settings.meals.find((m) => m.id === id)?.name ?? 'Fora do planejamento'
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows(store)), 'Resumo diário')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      [...store.meals].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((e) => ({
        Data: fmtBR(e.date), Refeição: slotName(e.slotId), Alimento: e.name, Quantidade: e.quantity, Unidade: e.unit, 'g/ml': e.grams ?? '',
        kcal: e.kcal ?? '', 'Proteínas (g)': e.protein ?? '', 'Carboidratos (g)': e.carbs ?? '', 'Gorduras (g)': e.fat ?? '',
        'Fora do plano': e.offPlan ? 'sim' : 'não', 'Substitui': e.substituteFor ?? '', Observação: e.note ?? '',
      })),
    ),
    'Refeições',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...store.water].sort((a, b) => a.at - b.at).map((w) => ({ Data: fmtBR(w.date), Hora: new Date(w.at).toLocaleTimeString('pt-BR'), 'ml': w.ml }))),
    'Hidratação',
  )
  const sets: Record<string, unknown>[] = []
  for (const s of [...store.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const ex of s.exercises) {
      if (!ex.sets.length) sets.push({ Data: fmtBR(s.date), Treino: s.templateName, Status: WORKOUT_STATUS_LABEL[s.status], Exercício: ex.name })
      ex.sets.forEach((st, i) => sets.push({
        Data: fmtBR(s.date), Treino: s.templateName, Status: WORKOUT_STATUS_LABEL[s.status], Exercício: ex.name, Série: i + 1,
        'Carga (kg)': st.load ?? '', [ex.unit === 's' ? 'Segundos' : 'Repetições']: st.reps ?? '', 'Série concluída': st.done ? 'sim' : 'não',
        'Exercício concluído': ex.done ? 'sim' : 'não', Observação: ex.notes,
      }))
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sets), 'Treinos')
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...store.muay].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({
      Data: fmtBR(m.date), Status: MUAY_STATUS_LABEL[m.status], 'Duração (min)': m.durationMin ?? '', Intensidade: m.intensity ?? '', 'Esforço (1-10)': m.rpe ?? '', Observações: m.notes,
    }))),
    'Muay Thai',
  )
  const measureKeys = [...new Set(store.body.flatMap((b) => Object.keys(b.measures)))]
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...store.body].sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({
      Data: fmtBR(b.date), 'Peso (kg)': b.weightKg ?? '', 'Cintura/abdômen (cm)': b.waistCm ?? '',
      ...Object.fromEntries(measureKeys.map((k) => [`${k} (cm)`, b.measures[k] ?? ''])),
      '% gordura (medido)': b.bodyFatPct ?? '', Observações: b.notes,
    }))),
    'Evolução',
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(foods.map((f) => ({
      Alimento: f.name, Fonte: f.source, 'kcal/100': f.kcal ?? '', 'Proteínas/100': f.protein ?? '', 'Carboidratos/100': f.carbs ?? '', 'Gorduras/100': f.fat ?? '',
      Base: f.basis === 'ml' ? '100 ml' : '100 g', Unidade: f.unitName ?? '', 'Peso da unidade': f.unitGrams ?? '',
    }))),
    'Alimentos',
  )
  return wb
}

export function dailyCsv(store: Store): string {
  const ws = XLSX.utils.json_to_sheet(dailyRows(store))
  return XLSX.utils.sheet_to_csv(ws, { FS: ';' })
}

export function workbookToBlob(wb: XLSX.WorkBook): Blob {
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
