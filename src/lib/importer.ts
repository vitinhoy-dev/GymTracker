import * as XLSX from '@e965/xlsx'
import type {
  ChecklistItemDef, DayRoutine, WaterWindow, Food, ISODate, MealCondition, MealSlot, PlannedItem, Settings, Unit, WorkoutTemplate, ExerciseTemplate,
} from './types'
import { db, emptyDayMeta } from './db'
import { isValidISO, toISO } from './dates'
import { norm, parseNum, round, uid } from './util'
import { isFoodComplete } from './nutrition'

export const EXPECTED_SHEETS = [
  'LEIA_PRIMEIRO', 'ROTINA_SEMANAL', 'EXERCICIOS', 'DIETA_BASE', 'HOJE_16NOV', 'HIDRATACAO', 'CHECKLIST_DIARIO', 'REFERENCIA_ALIMENTOS',
] as const
export type SheetKey = (typeof EXPECTED_SHEETS)[number]

type Cell = string | number | boolean | Date | null
type Grid = Cell[][]

export interface SettingChange {
  field: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'waterMl' | 'startWeightKg' | 'heightCm' | 'age' | 'targetWeightKg' | 'startDate' | 'endDate'
  label: string
  current: number | string | null
  proposed: number | string
  origin: string
}

export interface FoodRow {
  name: string
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  basis: 'g' | 'ml'
  unitName?: string
  unitGrams?: number | null
  status: 'novo' | 'existente_igual' | 'existente_diferente' | 'completa_existente'
  existingId?: string
  complete: boolean
  row: number
}

export interface WaterRow {
  date: ISODate
  ml: number
  conflict: boolean
}

export interface ChecklistMark {
  date: ISODate
  key: string
  label: string
  value: boolean
  conflict: boolean
}

export interface ImportPreview {
  fileName: string
  sheetNames: string[]
  found: Partial<Record<SheetKey, string>>
  missing: SheetKey[]
  text: Record<string, string[][]>
  readme: string[]
  settingChanges: SettingChange[]
  foods: FoodRow[]
  /** tabela de referência sem calorias/macros completos: só exibida, nunca importada como valor nutricional */
  foodReference: { name: string; portion: string; info: string }[]
  meals: MealSlot[]
  workouts: { template: WorkoutTemplate; matchedExisting: boolean }[]
  routine: Record<number, DayRoutine> | null
  routineRows: { day: string; morning: string; night: string }[]
  checklistItems: { label: string; matchedKey: string | null }[]
  checklistMarks: ChecklistMark[]
  water: WaterRow[]
  waterPlan: WaterWindow[]
  todayPlan: { date: ISODate | null; lines: string[] }
  warnings: string[]
  errors: string[]
}

export interface ImportOptions {
  settings: boolean
  foods: boolean
  overwriteFoods: boolean
  meals: boolean
  workouts: boolean
  routine: boolean
  checklistItems: boolean
  checklistMarks: boolean
  water: boolean
  waterPlan: boolean
  todayNote: boolean
}

export const DEFAULT_OPTIONS: ImportOptions = {
  settings: true, foods: true, overwriteFoods: false, meals: true, workouts: true, routine: true,
  checklistItems: true, checklistMarks: true, water: true, waterPlan: true, todayNote: true,
}

// ---------------------------------------------------------------- helpers

function cellText(c: Cell): string {
  if (c == null) return ''
  if (c instanceof Date) return toISO(c)
  return String(c).trim()
}

function isBlankRow(r: Cell[]) {
  return r.every((c) => cellText(c) === '')
}

function sheetKeyOf(name: string): SheetKey | null {
  const n = norm(name).replace(/\s/g, '')
  for (const k of EXPECTED_SHEETS) {
    const kk = norm(k).replace(/\s/g, '')
    if (n === kk) return k
  }
  // tolerância: prefixos e variações
  if (/^leia/.test(n) || /^readme/.test(n)) return 'LEIA_PRIMEIRO'
  if (/rotina/.test(n)) return 'ROTINA_SEMANAL'
  if (/exerc/.test(n)) return 'EXERCICIOS'
  if (/dieta/.test(n)) return 'DIETA_BASE'
  if (/^hoje/.test(n)) return 'HOJE_16NOV'
  if (/hidrat|agua/.test(n)) return 'HIDRATACAO'
  if (/checklist/.test(n)) return 'CHECKLIST_DIARIO'
  if (/refer|alimentos|tabela/.test(n)) return 'REFERENCIA_ALIMENTOS'
  return null
}

/** acha a linha de cabeçalho: a primeira (até a 20ª) com pelo menos `min` colunas reconhecidas */
function findHeader(grid: Grid, patterns: Record<string, RegExp>, min = 2): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const cols: Record<string, number> = {}
    grid[r].forEach((c, i) => {
      const t = norm(cellText(c))
      if (!t) return
      for (const [key, re] of Object.entries(patterns)) {
        if (cols[key] === undefined && re.test(t)) {
          cols[key] = i
          break
        }
      }
    })
    if (Object.keys(cols).length >= min) return { row: r, cols }
  }
  return null
}

export function parseTime(c: Cell): string | null {
  if (typeof c === 'number' && c >= 0 && c < 1) {
    const mins = Math.round(c * 24 * 60)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  if (c instanceof Date) return `${String(c.getHours()).padStart(2, '0')}:${String(c.getMinutes()).padStart(2, '0')}`
  const m = cellText(c).match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i)
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2] ?? 0)
  if (h > 23 || mi > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
}

function parseTimeRange(c: Cell): { time: string | null; timeEnd?: string } {
  const t = cellText(c)
  const parts = t.split(/\s*(?:–|—|-|a|às|ate|até)\s*(?=\d)/i)
  const time = parseTime(parts.length > 1 ? parts[0] : c)
  const timeEnd = parts.length > 1 ? parseTime(parts[1]) ?? undefined : undefined
  return { time, timeEnd }
}

export function parseDateCell(c: Cell, year: number): ISODate | null {
  if (c instanceof Date) return toISO(c)
  if (typeof c === 'number' && c > 30000 && c < 80000) {
    const d = XLSX.SSF.parse_date_code(c)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const t = cellText(c)
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m && isValidISO(`${m[1]}-${m[2]}-${m[3]}`)) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year
    const iso = `${y}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
    return isValidISO(iso) ? iso : null
  }
  const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  m = norm(t).replace(/\s/g, '').match(/(\d{1,2})(?:de)?([a-z]{3})/)
  if (m) {
    const mi = months.indexOf(m[2])
    if (mi >= 0) {
      const iso = `${year}-${String(mi + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
      return isValidISO(iso) ? iso : null
    }
  }
  return null
}

const TRUE_RE = /^(sim|s|x|ok|feito|feita|concluido|concluida|true|verdadeiro|1|✓|✔|☑|✅|yes|y)$/i

function isTrueMark(c: Cell): boolean {
  if (c === true) return true
  if (typeof c === 'number') return c === 1
  const t = cellText(c)
  if (/^[✓✔☑✅]$/.test(t)) return true
  return TRUE_RE.test(norm(t))
}

function weekdayOf(text: string): number | null {
  const t = norm(text)
  const map: [RegExp, number][] = [[/^dom/, 0], [/^seg/, 1], [/^ter/, 2], [/^qua/, 3], [/^qui/, 4], [/^sex/, 5], [/^sab/, 6]]
  for (const [re, d] of map) if (re.test(t)) return d
  return null
}

function singular(tok: string) {
  if (tok.length > 3 && tok.endsWith('s')) return tok.slice(0, -1)
  return tok
}

/** encontra alimento da base pelo nome (tolerante a plural e acentos) */
export function matchFood(name: string, foods: Pick<Food, 'id' | 'nameKey' | 'favorite'>[]): string | undefined {
  const toks = norm(name).split(' ').filter((t) => t && !['de', 'da', 'do', 'com', 'g', 'ml'].includes(t)).map(singular)
  if (!toks.length) return undefined
  const exact = foods.find((f) => f.nameKey === norm(name))
  if (exact) return exact.id
  const candidates = foods.filter((f) => {
    const fk = f.nameKey.split(' ').map(singular)
    return toks.every((t) => fk.some((w) => w.startsWith(t)))
  })
  candidates.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.nameKey.length - b.nameKey.length)
  return candidates[0]?.id
}

/** "2 fatias de pão + banana" -> itens planejados */
export function parsePlanText(text: string, foods: Pick<Food, 'id' | 'nameKey' | 'favorite'>[]): PlannedItem[] {
  const parts = text.split(/\s*(?:\+|,|;|\n|\se\s)\s*/i).map((p) => p.trim()).filter(Boolean)
  return parts.map((p) => {
    const m = p.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:–|—|-|a)\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|ml|l|fatias?|unidades?|un|scoops?|colheres?)?\.?\s*(?:de\s+)?(.+)$/i)
    if (!m) {
      return { name: p, amount: 0, unit: 'g' as Unit, foodId: matchFood(p, foods) }
    }
    let amount = parseNum(m[1]) ?? 0
    let amountMax = m[2] ? parseNum(m[2]) ?? undefined : undefined
    const u = (m[3] ?? '').toLowerCase()
    let unit: Unit = 'un'
    if (u === 'g') unit = 'g'
    else if (u === 'kg') {
      unit = 'g'
      amount *= 1000
      if (amountMax) amountMax *= 1000
    } else if (u === 'ml') unit = 'ml'
    else if (u === 'l') {
      unit = 'ml'
      amount *= 1000
      if (amountMax) amountMax *= 1000
    }
    const name = m[4].trim()
    return { name, amount, amountMax, unit, foodId: matchFood(name, foods) }
  })
}

function conditionFromName(name: string): MealCondition {
  const n = norm(name)
  if (/muay/.test(n)) return 'muay'
  if (/pre ?treino/.test(n)) return 'morningWorkout'
  return 'always'
}

function parseSetsReps(text: string): { sets: number; repsMin: number; repsMax: number; unit: 'reps' | 's' } | null {
  const t = text.replace(/\s/g, '')
  const m = t.match(/(\d+)[x×X\*](\d+)(?:[–—-](\d+))?(s|seg|segundos)?/i)
  if (!m) return null
  const repsMin = Number(m[2])
  return { sets: Number(m[1]), repsMin, repsMax: m[3] ? Number(m[3]) : repsMin, unit: m[4] ? 's' : 'reps' }
}

function parseReps(text: string): { repsMin: number; repsMax: number; unit: 'reps' | 's' } | null {
  const t = text.replace(/\s/g, '')
  const m = t.match(/(\d+)(?:[–—-](\d+))?(s|seg|segundos)?/i)
  if (!m) return null
  return { repsMin: Number(m[1]), repsMax: m[2] ? Number(m[2]) : Number(m[1]), unit: m[3] || /seg/i.test(text) ? 's' : 'reps' }
}

function templateIdFor(name: string, existing: WorkoutTemplate[]): { id: string; matched: boolean } {
  const n = norm(name)
  const byName = existing.find((w) => norm(w.name) === n)
  if (byName) return { id: byName.id, matched: true }
  const keywords: [RegExp, string][] = [[/superior/, 'w_superior'], [/inferior|perna/, 'w_inferior'], [/full|corpo inteiro/, 'w_fullbody']]
  for (const [re, id] of keywords) {
    if (re.test(n) && existing.some((w) => w.id === id)) return { id, matched: true }
  }
  return { id: uid('w'), matched: false }
}

// ---------------------------------------------------------------- leitura

export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', cellDates: true })
}

function gridOf(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false })
}

function textGridOf(ws: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
  return rows.map((r) => r.map((c) => String(c ?? '')))
}

interface Ctx {
  settings: Settings
  foods: Food[]
  year: number
}

export interface ExistingData {
  settings: Settings
  foods: Food[]
  waterDates: Set<ISODate>
  manualMarks: Record<ISODate, Record<string, boolean>>
}

export function buildPreview(wb: XLSX.WorkBook, fileName: string, existing: ExistingData): ImportPreview {
  const ctx: Ctx = { settings: existing.settings, foods: existing.foods, year: Number(existing.settings.startDate.slice(0, 4)) || new Date().getFullYear() }
  const p: ImportPreview = {
    fileName, sheetNames: wb.SheetNames, found: {}, missing: [], text: {}, readme: [], settingChanges: [], foods: [], foodReference: [], meals: [],
    workouts: [], routine: null, routineRows: [], checklistItems: [], checklistMarks: [], water: [], waterPlan: [], todayPlan: { date: null, lines: [] },
    warnings: [], errors: [],
  }
  const grids: Partial<Record<SheetKey, Grid>> = {}
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    p.text[name] = textGridOf(ws)
    const key = sheetKeyOf(name)
    if (key && !p.found[key]) {
      p.found[key] = name
      grids[key] = gridOf(ws)
    } else if (!key) {
      p.warnings.push(`Aba "${name}" não é reconhecida e será apenas exibida na prévia.`)
    }
  }
  p.missing = EXPECTED_SHEETS.filter((k) => !p.found[k])
  if (p.missing.length) p.warnings.push(`Abas não encontradas: ${p.missing.join(', ')}.`)

  if (grids.LEIA_PRIMEIRO) p.readme = (p.text[p.found.LEIA_PRIMEIRO!] ?? []).map((r) => r.filter(Boolean).join(' · ')).filter(Boolean)

  // metas e parâmetros: varre pares rótulo/valor nas abas
  scanSettings(grids, ctx, p)

  if (grids.REFERENCIA_ALIMENTOS) parseFoods(grids.REFERENCIA_ALIMENTOS, ctx, p)
  // alimentos da planilha também ficam disponíveis para casar com a dieta
  const foodsForMatch = [
    ...ctx.foods,
    ...p.foods.filter((f) => f.status === 'novo').map((f, i) => ({ id: `__new_${i}`, nameKey: norm(f.name), favorite: false })),
  ]
  if (grids.DIETA_BASE) parseDiet(grids.DIETA_BASE, ctx, p, foodsForMatch)
  if (grids.EXERCICIOS) parseExercises(grids.EXERCICIOS, ctx, p)
  if (grids.ROTINA_SEMANAL) parseRoutine(grids.ROTINA_SEMANAL, ctx, p)
  if (grids.HIDRATACAO) parseWater(grids.HIDRATACAO, ctx, p, existing.waterDates)
  if (grids.CHECKLIST_DIARIO) parseChecklist(grids.CHECKLIST_DIARIO, ctx, p, existing.manualMarks)
  if (p.found.HOJE_16NOV) {
    const name = p.found.HOJE_16NOV
    p.todayPlan = {
      date: parseDateCell(name.replace(/^hoje_?/i, ''), ctx.year),
      lines: (p.text[name] ?? []).map((r) => r.filter(Boolean).join(' · ')).filter(Boolean),
    }
  }
  return p
}

const SETTING_RULES: { field: SettingChange['field']; label: string; re: RegExp; min: number; max: number; scale?: (n: number, raw: string) => number }[] = [
  { field: 'kcal', label: 'Meta calórica (kcal)', re: /(calor|kcal|energ)/, min: 1000, max: 6000 },
  { field: 'proteinG', label: 'Meta de proteína (g)', re: /prote/, min: 40, max: 400 },
  { field: 'carbsG', label: 'Meta de carboidratos (g)', re: /carbo/, min: 0, max: 900 },
  { field: 'fatG', label: 'Meta de gorduras (g)', re: /gordura|lipid/, min: 10, max: 300 },
  { field: 'waterMl', label: 'Meta de água (ml)', re: /agua|hidrat/, min: 500, max: 8000, scale: (n, raw) => (n <= 10 || /\bl\b|litro/i.test(raw) && n <= 10 ? n * 1000 : n) },
  { field: 'targetWeightKg', label: 'Meta de peso (kg)', re: /(peso (meta|alvo|objetivo)|meta de peso)/, min: 30, max: 250 },
  { field: 'startWeightKg', label: 'Peso inicial (kg)', re: /^peso( inicial| atual)?\b/, min: 30, max: 250 },
  { field: 'heightCm', label: 'Altura (cm)', re: /altura/, min: 100, max: 230, scale: (n) => (n < 3 ? round(n * 100, 1) : n) },
  { field: 'age', label: 'Idade', re: /^idade/, min: 10, max: 100 },
]

function currentSetting(s: Settings, f: SettingChange['field']): number | string | null {
  switch (f) {
    case 'kcal': return s.goals.kcal
    case 'proteinG': return s.goals.proteinG
    case 'carbsG': return s.goals.carbsG
    case 'fatG': return s.goals.fatG
    case 'waterMl': return s.goals.waterMl
    case 'startWeightKg': return s.profile.startWeightKg
    case 'targetWeightKg': return s.profile.targetWeightKg
    case 'heightCm': return s.profile.heightCm
    case 'age': return s.profile.age
    case 'startDate': return s.startDate
    case 'endDate': return s.endDate
  }
}

function scanSettings(grids: Partial<Record<SheetKey, Grid>>, ctx: Ctx, p: ImportPreview) {
  const seen = new Set<string>()
  const order: SheetKey[] = ['LEIA_PRIMEIRO', 'DIETA_BASE', 'HIDRATACAO', 'ROTINA_SEMANAL']
  for (const key of order) {
    const grid = grids[key]
    if (!grid) continue
    for (const row of grid) {
      for (let i = 0; i < row.length; i++) {
        const raw = cellText(row[i])
        if (!raw || !/[a-zA-Zà-ú]/.test(raw)) continue
        let label = raw
        let valueCell: Cell = null
        const colon = raw.match(/^([^:]{2,60}):\s*(.+)$/)
        if (colon && parseNum(colon[2]) != null) {
          label = colon[1]
          valueCell = colon[2]
        } else {
          for (let j = i + 1; j < row.length; j++) {
            const t = cellText(row[j])
            if (!t) continue
            if (row[j] instanceof Date || parseNum(row[j]) != null) valueCell = row[j]
            break
          }
        }
        if (valueCell == null) continue
        const nl = norm(label)
        if (/total|refeic|horario|almoco|jantar|lanche|cafe/.test(nl) && !/meta/.test(nl)) continue
        const isGoalish = /meta|alvo|objetivo|diari|inicial|planejad/.test(nl) || key === 'LEIA_PRIMEIRO'
        // datas
        if (/inicio|comeco/.test(nl) || /fim|termino|encerr|final|data alvo/.test(nl)) {
          const d = parseDateCell(valueCell, ctx.year)
          const field = /inicio|comeco/.test(nl) ? 'startDate' : 'endDate'
          if (d && !seen.has(field)) {
            seen.add(field)
            pushChange(p, ctx, field, field === 'startDate' ? 'Data de início' : 'Data de encerramento', d, key)
          }
          continue
        }
        for (const rule of SETTING_RULES) {
          if (seen.has(rule.field) || !rule.re.test(nl)) continue
          if (['kcal', 'proteinG', 'carbsG', 'fatG', 'waterMl'].includes(rule.field) && !isGoalish) continue
          let n = parseNum(valueCell)
          if (n == null) continue
          if (rule.scale) n = rule.scale(n, cellText(valueCell))
          if (n < rule.min || n > rule.max) {
            p.warnings.push(`${rule.label}: valor "${cellText(valueCell)}" em ${key} fora do intervalo esperado; ignorado.`)
            seen.add(rule.field)
            break
          }
          seen.add(rule.field)
          pushChange(p, ctx, rule.field, rule.label, round(n, 1), key)
          break
        }
      }
    }
  }
}

function pushChange(p: ImportPreview, ctx: Ctx, field: SettingChange['field'], label: string, proposed: number | string, origin: string) {
  const current = currentSetting(ctx.settings, field)
  if (current === proposed) return
  p.settingChanges.push({ field, label, current, proposed, origin })
}

function parseFoods(grid: Grid, ctx: Ctx, p: ImportPreview) {
  const h = findHeader(grid, {
    name: /alimento|^nome|^item|produto|descri/,
    kcal: /kcal|calor|energia/,
    protein: /prot/,
    carbs: /carb|glicid|cho\b/,
    fat: /gord|lipid|fat\b/,
    portion: /porc|base|quantidade|qtd|medida|ref|gramas|peso/,
    unit: /unidade de medida|unidade|und/,
  }, 3)
  if (!h || h.cols.name === undefined) {
    p.errors.push('REFERENCIA_ALIMENTOS: não foi possível identificar o cabeçalho (esperado: alimento, kcal, proteína, carboidratos, gorduras).')
    return
  }
  if (h.cols.kcal === undefined) {
    // planilha só com referências aproximadas (ex.: proteína por porção): não vira valor nutricional
    for (let r = h.row + 1; r < grid.length; r++) {
      const row = grid[r]
      const name = cellText(row[h.cols.name])
      if (!name) continue
      const info = row.map(cellText).filter((t, i) => t && i !== h.cols.name && i !== h.cols.portion).join(' · ')
      p.foodReference.push({ name, portion: h.cols.portion !== undefined ? cellText(row[h.cols.portion]) : '', info })
    }
    p.warnings.push('REFERENCIA_ALIMENTOS não traz calorias, carboidratos e gorduras. As informações aparecem como referência, mas não são importadas como valores nutricionais (preencha os rótulos na base de alimentos).')
    return
  }
  const headerText = grid[h.row].map((c) => norm(cellText(c))).join(' ')
  const headerSays100 = /100/.test(headerText)
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r]
    if (isBlankRow(row)) continue
    const name = cellText(row[h.cols.name])
    if (!name || /^total/i.test(name)) continue
    const get = (k: string) => (h.cols[k] !== undefined ? parseNum(row[h.cols[k]]) : null)
    let kcal = get('kcal'), protein = get('protein'), carbs = get('carbs'), fat = get('fat')
    let basis: 'g' | 'ml' = 'g'
    let unitName: string | undefined
    let unitGrams: number | null | undefined
    if (h.cols.portion !== undefined) {
      const ptext = cellText(row[h.cols.portion])
      const pnum = parseNum(row[h.cols.portion])
      if (/ml/i.test(ptext)) basis = 'ml'
      const isUnit = /unid|fatia|scoop|colher|un\b/i.test(ptext)
      if (pnum && pnum > 0 && !isUnit && pnum !== 100) {
        // converte porção em g/ml para 100
        const k = 100 / pnum
        kcal = kcal != null ? round(kcal * k, 1) : null
        protein = protein != null ? round(protein * k, 2) : null
        carbs = carbs != null ? round(carbs * k, 2) : null
        fat = fat != null ? round(fat * k, 2) : null
      } else if (isUnit && pnum) {
        // valores por unidade sem peso conhecido: não dá para converter com segurança
        p.warnings.push(`"${name}": valores informados por unidade ("${ptext}"). Informe o peso da unidade na base de alimentos para converter; importado sem valores.`)
        unitName = ptext.replace(/[\d.,\s]+/g, ' ').trim() || 'unidade'
        unitGrams = null
        kcal = protein = carbs = fat = null
      }
    } else if (!headerSays100) {
      p.warnings.push('REFERENCIA_ALIMENTOS: a planilha não indica a porção; os valores foram considerados por 100 g. Confira na prévia.')
    }
    const nameKey = norm(name)
    const existing = ctx.foods.find((f) => f.nameKey === nameKey)
    const complete = isFoodComplete({ kcal, protein, carbs, fat })
    let status: FoodRow['status'] = 'novo'
    if (existing) {
      const same = existing.kcal === kcal && existing.protein === protein && existing.carbs === carbs && existing.fat === fat
      status = same ? 'existente_igual' : !isFoodComplete(existing) && complete ? 'completa_existente' : 'existente_diferente'
    }
    if (p.foods.some((f) => norm(f.name) === nameKey)) {
      p.warnings.push(`REFERENCIA_ALIMENTOS: "${name}" aparece mais de uma vez; mantida a primeira ocorrência.`)
      continue
    }
    p.foods.push({ name, kcal, protein, carbs, fat, basis, unitName, unitGrams, status, existingId: existing?.id, complete, row: r + 1 })
  }
  // dedup de avisos repetidos
  p.warnings = [...new Set(p.warnings)]
}

function parsePortion(text: string): { amount: number; amountMax?: number; unit: Unit } {
  const m = text.trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:–|—|-|a)\s*(\d+(?:[.,]\d+)?))?\s*(kg|g|ml|l)?\b/i)
  if (!m) return { amount: 0, unit: 'g' } // "à vontade" e similares
  let amount = parseNum(m[1]) ?? 0
  let amountMax = m[2] ? parseNum(m[2]) ?? undefined : undefined
  const u = (m[3] ?? '').toLowerCase()
  if (u === 'kg' || u === 'l') {
    amount *= 1000
    if (amountMax) amountMax *= 1000
  }
  return { amount, amountMax, unit: u === 'g' || u === 'kg' ? 'g' : u === 'ml' || u === 'l' ? 'ml' : 'un' }
}

function parseDiet(grid: Grid, ctx: Ctx, p: ImportPreview, foods: Pick<Food, 'id' | 'nameKey' | 'favorite'>[]) {
  const h = findHeader(grid, {
    days: /^dias?$|quando|frequenc/,
    time: /horario|hora/,
    meal: /refeic/,
    items: /aliment|itens|composic|cardapio|descri|o que comer/,
    portion: /porc|quantidade|qtd/,
  }, 2)
  if (!h || h.cols.meal === undefined) {
    p.errors.push('DIETA_BASE: não foi possível identificar as colunas de horário/refeição/alimentos.')
    return
  }
  // uma linha por alimento (com coluna de porção) ou uma linha por refeição (texto "2 fatias de pão + banana")
  const perItem = h.cols.portion !== undefined
  const groups = new Map<string, { name: string; time: string | null; timeEnd?: string; days: string; plan: PlannedItem[] }>()
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r]
    if (isBlankRow(row)) continue
    const name = cellText(row[h.cols.meal])
    if (!name || /^total/i.test(norm(name))) continue
    const { time, timeEnd } = h.cols.time !== undefined ? parseTimeRange(row[h.cols.time]) : { time: null, timeEnd: undefined }
    const key = `${norm(name)}|${time ?? ''}`
    if (!groups.has(key)) groups.set(key, { name, time, timeEnd, days: h.cols.days !== undefined ? cellText(row[h.cols.days]) : '', plan: [] })
    const g = groups.get(key)!
    const itemText = h.cols.items !== undefined ? cellText(row[h.cols.items]) : ''
    if (!itemText) continue
    if (perItem) {
      g.plan.push({ name: itemText, ...parsePortion(cellText(row[h.cols.portion!])), foodId: matchFood(itemText, foods) })
    } else {
      g.plan.push(...parsePlanText(itemText, foods))
    }
  }
  const used = new Set<string>()
  for (const g of groups.values()) {
    const existing = ctx.settings.meals.find((m) => !used.has(m.id) && (norm(m.name) === norm(g.name) || (!!g.time && m.time === g.time)))
    if (!g.time) p.warnings.push(`DIETA_BASE: refeição "${g.name}" sem horário válido; mantido ${existing?.time ?? '12:00'}.`)
    const nd = norm(g.days)
    const condFromDays: MealCondition | null = /muay|segunda.*quarta|seg.*qua.*sex/.test(nd) && !/todos/.test(nd) ? 'muay' : null
    const id = existing?.id ?? uid('m')
    used.add(id)
    p.meals.push({
      id,
      name: g.name,
      time: g.time ?? existing?.time ?? '12:00',
      timeEnd: g.timeEnd ?? (g.time ? undefined : existing?.timeEnd),
      condition: existing?.condition ?? condFromDays ?? conditionFromName(g.name),
      plan: (g.plan.length ? g.plan : existing?.plan ?? []).map((it) => (it.foodId?.startsWith('__new_') ? { ...it, foodId: undefined } : it)),
    })
  }
  if (!p.meals.length) p.warnings.push('DIETA_BASE: nenhuma refeição encontrada.')
}

function parseExercises(grid: Grid, ctx: Ctx, p: ImportPreview) {
  const h = findHeader(grid, {
    day: /^dia$|^dia da semana/,
    group: /treino|grupo|divisao|sessao/,
    name: /exercicio|movimento|^nome/,
    sets: /serie/,
    reps: /rep|tempo|duracao/,
    scheme: /esquema|prescri|series ?x|volume/,
    notes: /observ|nota|dica/,
  }, 2)
  if (!h || h.cols.name === undefined) {
    p.errors.push('EXERCICIOS: não foi possível identificar a coluna de exercícios.')
    return
  }
  const groups = new Map<string, ExerciseTemplate[]>()
  let currentGroup = ''
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r]
    if (isBlankRow(row)) continue
    const nonEmpty = row.map(cellText).filter(Boolean)
    // linha de título de seção ("Terça — Superior")
    if (nonEmpty.length === 1 && h.cols.group === undefined && h.cols.day === undefined) {
      currentGroup = nonEmpty[0]
      continue
    }
    const groupCol = h.cols.group ?? h.cols.day
    const groupText = groupCol !== undefined ? cellText(row[groupCol]) : ''
    if (groupText) currentGroup = groupText
    const name = cellText(row[h.cols.name])
    if (!name) continue
    let parsed: ReturnType<typeof parseSetsReps> = null
    for (const k of ['scheme', 'reps', 'sets'] as const) {
      if (h.cols[k] !== undefined) parsed = parsed ?? parseSetsReps(cellText(row[h.cols[k]]))
    }
    if (!parsed) parsed = parseSetsReps(name)
    if (!parsed && h.cols.sets !== undefined) {
      const sets = parseNum(row[h.cols.sets])
      const reps = h.cols.reps !== undefined ? parseReps(cellText(row[h.cols.reps])) : null
      if (sets && reps) parsed = { sets, ...reps }
    }
    if (!parsed) {
      p.warnings.push(`EXERCICIOS: "${name}" sem séries/repetições reconhecíveis; importado como 3×10 para você ajustar.`)
      parsed = { sets: 3, repsMin: 10, repsMax: 10, unit: 'reps' }
    }
    const cleanName = name.replace(/[:\-–]\s*\d+\s*[x×].*$/, '').trim()
    const g = currentGroup || 'Treino importado'
    if (!groups.has(g)) groups.set(g, [])
    const exNotes = h.cols.notes !== undefined ? cellText(row[h.cols.notes]) : ''
    groups.get(g)!.push({ id: 'e_' + norm(cleanName).replace(/\s/g, '_'), name: cleanName, ...parsed, ...(exNotes ? { notes: exNotes } : {}) })
  }
  for (const [groupName, exercises] of groups) {
    const { id, matched } = templateIdFor(groupName, ctx.settings.workouts)
    const existing = ctx.settings.workouts.find((w) => w.id === id)
    const displayName = existing?.name ?? groupName.replace(/^(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\s*[—–-]\s*/i, '')
    // mantém os ids dos exercícios já cadastrados (histórico de cargas continua ligado)
    const known = ctx.settings.workouts.flatMap((w) => w.exercises)
    const linked = exercises.map((e) => ({ ...e, id: known.find((k) => norm(k.name) === norm(e.name))?.id ?? e.id }))
    p.workouts.push({ template: { id, name: displayName, notes: existing?.notes, exercises: linked }, matchedExisting: matched })
  }
}

function parseRoutine(grid: Grid, ctx: Ctx, p: ImportPreview) {
  const h = findHeader(grid, {
    day: /^dia$|^dia da semana|^semana/, morning: /manha/, night: /noite/, period: /periodo|turno/, activity: /atividade|o que/, type: /^tipo/,
  }, 2)
  const wide = h && h.cols.day !== undefined && (h.cols.morning !== undefined || h.cols.night !== undefined)
  const long = h && h.cols.day !== undefined && h.cols.period !== undefined && h.cols.activity !== undefined
  if (!h || (!wide && !long)) {
    p.errors.push('ROTINA_SEMANAL: esperado cabeçalho com Dia / Manhã / Noite ou Dia / Período / Atividade.')
    return
  }
  const allTemplates = [...ctx.settings.workouts, ...p.workouts.map((w) => w.template)]
  const days = new Map<number, { label: string; morning: string[]; night: string[] }>()
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r]
    const dayText = cellText(row[h.cols.day])
    const wd = weekdayOf(dayText)
    if (wd == null) continue
    if (!days.has(wd)) days.set(wd, { label: dayText, morning: [], night: [] })
    const d = days.get(wd)!
    if (wide) {
      if (h.cols.morning !== undefined) d.morning.push(cellText(row[h.cols.morning]))
      if (h.cols.night !== undefined) d.night.push(cellText(row[h.cols.night]))
    } else {
      const period = norm(cellText(row[h.cols.period!]))
      const text = [cellText(row[h.cols.activity!]), h.cols.type !== undefined ? cellText(row[h.cols.type]) : ''].filter(Boolean).join(' — ')
      if (/manha/.test(period)) d.morning.push(text)
      else if (/noite|tarde/.test(period)) d.night.push(text)
      else { d.morning.push(text); d.night.push(text) }
    }
  }
  const routine: Record<number, DayRoutine> = structuredClone(ctx.settings.routine)
  for (const [wd, d] of days) {
    const morning = d.morning.filter(Boolean).join(' / ')
    const night = d.night.filter(Boolean).join(' / ')
    let morningId: string | null = null
    const nm = norm(morning)
    if (nm && !/^(descanso|folga|livre|off|-)/.test(nm) && !/^sem muscula/.test(nm)) {
      const t = templateIdFor(morning, allTemplates)
      if (t.matched) morningId = t.id
      else p.warnings.push(`ROTINA_SEMANAL: treino "${morning}" de ${d.label} não corresponde a nenhum treino cadastrado; mantido como descanso.`)
    }
    routine[wd] = { morning: morningId, muay: /muay|thai|luta/.test(norm(night)) }
    p.routineRows.push({ day: d.label, morning, night })
  }
  if (days.size) p.routine = routine
  else p.warnings.push('ROTINA_SEMANAL: nenhum dia da semana reconhecido.')
}

function parseWater(grid: Grid, ctx: Ctx, p: ImportPreview, waterDates: Set<ISODate>) {
  // plano por janela de horário (Janela / Quantidade / Unidade): vira referência, nunca consumo
  const wp = findHeader(grid, { window: /janela|horario|periodo|momento/, qty: /quantidade|volume|^ml$|meta/, unit: /^unidade/, note: /observ/ }, 2)
  if (wp && wp.cols.window !== undefined && wp.cols.qty !== undefined) {
    for (let r = wp.row + 1; r < grid.length; r++) {
      const row = grid[r]
      const label = cellText(row[wp.cols.window])
      let ml = parseNum(row[wp.cols.qty])
      if (!label || ml == null || ml <= 0) continue
      const unitText = wp.cols.unit !== undefined ? norm(cellText(row[wp.cols.unit])) : ''
      if (/^l$|litro/.test(unitText) || ml <= 10) ml *= 1000
      const times = [...label.matchAll(/(\d{1,2})\s*[:h]\s*(\d{2})?/g)].map((m) => `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`)
      p.waterPlan.push({ label, until: times.length ? times[times.length - 1] : null, ml: Math.round(ml), note: wp.cols.note !== undefined ? cellText(row[wp.cols.note]) || undefined : undefined })
    }
    const total = p.waterPlan.reduce((a, w) => a + w.ml, 0)
    if (total && Math.abs(total - ctx.settings.goals.waterMl) > 50) p.warnings.push(`HIDRATACAO: as janelas somam ${total} ml, diferente da meta atual de ${ctx.settings.goals.waterMl} ml.`)
  }
  const h = findHeader(grid, { date: /^data|^dia/, consumed: /consum|ingerid|bebid|realizad|registrad|total do dia/ }, 2)
  if (!h || h.cols.consumed === undefined || h.cols.date === undefined) return // sem registros datados de consumo
  for (let r = h.row + 1; r < grid.length; r++) {
    const row = grid[r]
    const date = parseDateCell(row[h.cols.date], ctx.year)
    const raw = row[h.cols.consumed]
    let ml = parseNum(raw)
    if (!date || ml == null || ml <= 0) continue
    if (ml <= 10) ml = ml * 1000 // valores em litros
    p.water.push({ date, ml: Math.round(ml), conflict: waterDates.has(date) })
  }
}

function parseChecklist(grid: Grid, ctx: Ctx, p: ImportPreview, manualMarks: Record<ISODate, Record<string, boolean>>) {
  const defs = ctx.settings.checklist
  const matchKey = (label: string): string | null => {
    const n = norm(label)
    const direct = defs.find((d) => norm(d.label) === n)
    if (direct) return direct.key
    const rules: [RegExp, string][] = [
      [/todas.*refeic|registr.*refeic/, 'allMealsLogged'], [/aliment.*planej|plano alimentar|dieta|^cafe|almoco|lanche|jantar|ceia/, 'dietPlanned'],
      [/prote/, 'proteinMet'], [/agua|hidrat/, 'waterMet'], [/muay|treino noite/, 'muayDone'], [/treino|muscula/, 'workoutDone'],
      [/peso/, 'weightLogged'], [/descanso|sono|recupera/, 'restRespected'],
    ]
    for (const [re, key] of rules) if (re.test(n) && defs.some((d) => d.key === key)) return key
    return null
  }
  // orientação D: uma linha por data + item, com coluna de concluído
  const hl = findHeader(grid, { date: /^data$/, item: /^item|tarefa|habito/, done: /conclu|feito|status|check|ok\b/ }, 3)
  if (hl) {
    const agg = new Map<string, { date: ISODate; key: string; label: string; all: boolean }>()
    for (let r = hl.row + 1; r < grid.length; r++) {
      const date = parseDateCell(grid[r][hl.cols.date], ctx.year)
      const label = cellText(grid[r][hl.cols.item])
      if (!date || !label) continue
      if (!p.checklistItems.some((c) => norm(c.label) === norm(label))) p.checklistItems.push({ label, matchedKey: matchKey(label) })
      const key = matchKey(label) ?? 'custom_' + norm(label).replace(/\s/g, '_')
      const k = `${date}|${key}`
      const done = isTrueMark(grid[r][hl.cols.done])
      const cur = agg.get(k)
      agg.set(k, { date, key, label, all: (cur ? cur.all : true) && done })
    }
    for (const a of agg.values()) {
      if (a.all) p.checklistMarks.push({ date: a.date, key: a.key, label: a.label, value: true, conflict: manualMarks[a.date]?.[a.key] !== undefined })
    }
    return
  }
  // orientação A: colunas de data no cabeçalho, linhas = itens
  let headerRow = -1
  let dateCols: { col: number; date: ISODate }[] = []
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const dc = grid[r].map((c, i) => ({ col: i, date: parseDateCell(c, ctx.year) })).filter((x): x is { col: number; date: ISODate } => !!x.date)
    if (dc.length >= 2) {
      headerRow = r
      dateCols = dc
      break
    }
  }
  const pushItem = (label: string) => {
    if (!label || p.checklistItems.some((c) => norm(c.label) === norm(label))) return
    p.checklistItems.push({ label, matchedKey: matchKey(label) })
  }
  const pushMark = (date: ISODate, label: string, value: boolean) => {
    const key = matchKey(label) ?? 'custom_' + norm(label).replace(/\s/g, '_')
    p.checklistMarks.push({ date, key, label, value, conflict: manualMarks[date]?.[key] !== undefined })
  }
  if (headerRow >= 0) {
    const labelCol = grid[headerRow].findIndex((_, i) => !dateCols.some((d) => d.col === i))
    for (let r = headerRow + 1; r < grid.length; r++) {
      const label = cellText(grid[r][labelCol])
      if (!label) continue
      pushItem(label)
      for (const dc of dateCols) if (isTrueMark(grid[r][dc.col])) pushMark(dc.date, label, true)
    }
    return
  }
  // orientação B: coluna "data" + colunas de itens
  const h = findHeader(grid, { date: /^data|^dia$/, item: /item|tarefa|habito|checklist|descri|atividade/ }, 1)
  if (h && h.cols.date !== undefined && h.cols.item === undefined) {
    const labels = grid[h.row].map((c, i) => ({ i, label: cellText(c) })).filter((x) => x.i !== h.cols.date && x.label)
    labels.forEach((l) => pushItem(l.label))
    for (let r = h.row + 1; r < grid.length; r++) {
      const date = parseDateCell(grid[r][h.cols.date], ctx.year)
      if (!date) continue
      for (const l of labels) if (isTrueMark(grid[r][l.i])) pushMark(date, l.label, true)
    }
    return
  }
  // orientação C: lista simples de itens
  const col = h?.cols.item ?? 0
  const start = h ? h.row + 1 : 0
  for (let r = start; r < grid.length; r++) {
    const t = cellText(grid[r][col])
    if (t && !/^(item|tarefa|checklist)/i.test(t) && t.length < 120) pushItem(t.replace(/^[☐□\-•\s]+/, ''))
  }
}

// ---------------------------------------------------------------- aplicação

export async function applyImport(p: ImportPreview, o: ImportOptions): Promise<string[]> {
  const summary: string[] = []
  await db.transaction('rw', [db.settings, db.foods, db.water, db.days, db.imports], async () => {
    const s = (await db.settings.get('main'))!
    const now = Date.now()

    // alimentos primeiro (para casar ids nas refeições)
    const newFoodIds = new Map<string, string>()
    if (o.foods && p.foods.length) {
      let added = 0, filled = 0, updated = 0
      for (const f of p.foods) {
        const key = norm(f.name)
        if (f.status === 'novo') {
          const id = uid('f')
          newFoodIds.set(key, id)
          await db.foods.put({
            id, name: f.name, nameKey: key, source: 'Planilha importada', kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat,
            basis: f.basis, unitName: f.unitName, unitGrams: f.unitGrams ?? null, favorite: false, createdAt: now, updatedAt: now,
          })
          added++
        } else if (f.existingId && (f.status === 'completa_existente' || (f.status === 'existente_diferente' && o.overwriteFoods))) {
          const cur = await db.foods.get(f.existingId)
          if (!cur) continue
          if (f.status === 'completa_existente') {
            await db.foods.put({
              ...cur,
              kcal: cur.kcal ?? f.kcal, protein: cur.protein ?? f.protein, carbs: cur.carbs ?? f.carbs, fat: cur.fat ?? f.fat,
              source: cur.source.startsWith('Rótulo') ? 'Planilha importada' : cur.source, updatedAt: now,
            })
            filled++
          } else if (f.complete) {
            await db.foods.put({ ...cur, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, source: 'Planilha importada', updatedAt: now })
            updated++
          }
        }
      }
      summary.push(`Alimentos: ${added} novo(s), ${filled} completado(s), ${updated} atualizado(s).`)
    }
    const allFoods = await db.foods.toArray()

    if (o.settings && p.settingChanges.length) {
      for (const c of p.settingChanges) {
        const v = c.proposed
        switch (c.field) {
          case 'kcal': s.goals.kcal = v as number; break
          case 'proteinG': s.goals.proteinG = v as number; break
          case 'carbsG': s.goals.carbsG = v as number; break
          case 'fatG': s.goals.fatG = v as number; break
          case 'waterMl': s.goals.waterMl = v as number; break
          case 'startWeightKg': s.profile.startWeightKg = v as number; break
          case 'targetWeightKg': s.profile.targetWeightKg = v as number; break
          case 'heightCm': s.profile.heightCm = v as number; break
          case 'age': s.profile.age = v as number; break
          case 'startDate': s.startDate = v as string; break
          case 'endDate': s.endDate = v as string; break
        }
      }
      summary.push(`Configurações: ${p.settingChanges.length} valor(es) atualizado(s).`)
    }

    if (o.workouts && p.workouts.length) {
      for (const w of p.workouts) {
        const i = s.workouts.findIndex((x) => x.id === w.template.id)
        if (i >= 0) s.workouts[i] = { ...s.workouts[i], exercises: w.template.exercises }
        else s.workouts.push(w.template)
      }
      summary.push(`Treinos: ${p.workouts.length} treino(s) importado(s).`)
    }

    if (o.routine && p.routine) {
      s.routine = p.routine
      summary.push('Rotina semanal atualizada.')
    }

    if (o.meals && p.meals.length) {
      const relinked = p.meals.map((m) => ({
        ...m,
        plan: m.plan.map((it) => ({ ...it, foodId: it.foodId ?? newFoodIds.get(norm(it.name)) ?? matchFood(it.name, allFoods) })),
      }))
      // mantém refeições existentes que não estão na planilha (os registros antigos continuam ligados a elas)
      const ids = new Set(relinked.map((m) => m.id))
      s.meals = [...relinked, ...s.meals.filter((m) => !ids.has(m.id))].sort((a, b) => a.time.localeCompare(b.time))
      summary.push(`Plano alimentar: ${relinked.length} refeição(ões) importada(s).`)
    }

    if (o.waterPlan && p.waterPlan.length) {
      s.waterPlan = p.waterPlan
      summary.push(`Plano de hidratação: ${p.waterPlan.length} janela(s) de horário (referência; não conta como consumo).`)
    }

    if (o.checklistItems && p.checklistItems.length) {
      let added = 0
      for (const it of p.checklistItems) {
        if (it.matchedKey) continue
        const key = 'custom_' + norm(it.label).replace(/\s/g, '_')
        if (s.checklist.some((c) => c.key === key)) continue
        const def: ChecklistItemDef = { key, label: it.label, enabled: true }
        s.checklist.push(def)
        added++
      }
      summary.push(`Checklist: ${added} item(ns) novo(s).`)
    }
    s.updatedAt = now
    await db.settings.put(s)

    if (o.checklistMarks && p.checklistMarks.length) {
      let n = 0
      for (const m of p.checklistMarks) {
        if (m.conflict) continue
        if (!s.checklist.some((c) => c.key === m.key)) continue
        const cur = (await db.days.get(m.date)) ?? emptyDayMeta(m.date)
        if (cur.checklist[m.key] !== undefined) continue
        cur.checklist[m.key] = m.value
        await db.days.put(cur)
        n++
      }
      summary.push(`Checklist: ${n} marcação(ões) importada(s) (marcações existentes preservadas).`)
    }

    if (o.water && p.water.length) {
      let n = 0
      for (const w of p.water) {
        const id = `imp_water_${w.date}`
        if (w.conflict || (await db.water.get(id))) continue
        const has = await db.water.where('date').equals(w.date).count()
        if (has) continue
        await db.water.put({ id, date: w.date, ml: w.ml, at: new Date(`${w.date}T23:59:00`).getTime() })
        n++
      }
      summary.push(`Hidratação: ${n} dia(s) importado(s); dias que já tinham registro foram preservados.`)
    }

    if (o.todayNote && p.todayPlan.date && p.todayPlan.lines.length) {
      const cur = (await db.days.get(p.todayPlan.date)) ?? emptyDayMeta(p.todayPlan.date)
      const block = `[Plano importado da planilha]\n${p.todayPlan.lines.join('\n')}`
      if (!cur.notes.includes('[Plano importado da planilha]')) {
        cur.notes = cur.notes ? `${cur.notes}\n\n${block}` : block
        await db.days.put(cur)
        summary.push(`Plano do dia ${p.todayPlan.date} salvo nas anotações do dia.`)
      }
    }

    await db.imports.put({ id: uid('imp'), fileName: p.fileName, importedAt: now, summary, sheets: p.text })
  })
  return summary
}
