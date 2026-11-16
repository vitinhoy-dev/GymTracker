export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return prefix ? `${prefix}_${r}` : r
}

/** normaliza texto para comparação: minúsculas, sem acentos, espaços simples */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits })
}

/** converte "1,5" / "1.5" / 1.5 em número; retorna null se inválido */
export function parseNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const m = v.replace(/\s/g, '').match(/-?\d[\d.,]*/)
  if (!m) return null
  let t = m[0].replace(/[.,]+$/, '')
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) t = t.replace(/,/g, '')
  else t = t.replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function pct(value: number, goal: number): number {
  if (!goal || goal <= 0) return 0
  return (value / goal) * 100
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
