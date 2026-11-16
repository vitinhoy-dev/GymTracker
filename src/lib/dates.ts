import type { ISODate } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export function isValidISO(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = parseISO(s)
  return toISO(d) === s
}

export function todayISO(): ISODate {
  return toISO(new Date())
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** b - a em dias */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000)
}

export function weekday(s: ISODate): number {
  return parseISO(s).getDay()
}

export function rangeDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = []
  if (!isValidISO(start) || !isValidISO(end) || start > end) return out
  let cur = start
  while (cur <= end && out.length < 400) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function fmtShort(s: ISODate): string {
  const d = parseISO(s)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

export function fmtDayMonth(s: ISODate): string {
  const d = parseISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function fmtLong(s: ISODate): string {
  const d = parseISO(s)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtBR(s: ISODate): string {
  const d = parseISO(s)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function nowHHMM(): string {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
