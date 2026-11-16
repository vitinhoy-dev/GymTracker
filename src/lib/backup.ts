import { ALL_TABLES, db, type TableName } from './db'
import type { Photo } from './types'

export const BACKUP_APP = 'cutting-tracker'
export const BACKUP_VERSION = 1

interface SerializedPhoto extends Omit<Photo, 'blob'> {
  dataUrl: string
}

export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

async function blobToDataUrl(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer())
  let bin = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
  return `data:${b.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

async function dataUrlToBlob(u: string): Promise<Blob> {
  const [head, data] = u.split(',')
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream'
  const bin = atob(data)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function exportBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {}
  for (const t of ALL_TABLES) {
    const rows = await db.table(t).toArray()
    if (t === 'photos') {
      tables[t] = await Promise.all((rows as Photo[]).map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) })))
    } else tables[t] = rows
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables }
}

export interface RestoreCheck {
  ok: boolean
  error?: string
  counts: Partial<Record<TableName, number>>
  exportedAt?: string
}

export function validateBackup(raw: unknown): RestoreCheck {
  const counts: RestoreCheck['counts'] = {}
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Arquivo inválido (não é JSON de objeto).', counts }
  const b = raw as Partial<BackupFile>
  if (b.app !== BACKUP_APP) return { ok: false, error: 'Este arquivo não é um backup do Cutting Tracker.', counts }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return { ok: false, error: 'Versão de backup não suportada.', counts }
  if (!b.tables || typeof b.tables !== 'object') return { ok: false, error: 'Backup sem tabelas.', counts }
  for (const t of ALL_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) return { ok: false, error: `Tabela "${t}" inválida.`, counts }
    counts[t] = rows.length
  }
  const settings = (b.tables as Record<string, unknown[]>).settings
  if (settings && settings.length && !(settings[0] as { goals?: unknown }).goals) return { ok: false, error: 'Configurações inválidas no backup.', counts }
  return { ok: true, counts, exportedAt: b.exportedAt }
}

/**
 * merge: adiciona apenas registros que ainda não existem (nada é sobrescrito).
 * replace: apaga TODOS os dados atuais e restaura o backup (exige confirmação explícita na interface).
 */
export async function restoreBackup(b: BackupFile, mode: 'merge' | 'replace'): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  const prepared: Partial<Record<TableName, unknown[]>> = {}
  for (const t of ALL_TABLES) {
    const rows = (b.tables[t] ?? []) as Record<string, unknown>[]
    if (t === 'photos') {
      prepared[t] = await Promise.all(
        (rows as unknown as SerializedPhoto[]).map(async ({ dataUrl, ...rest }) => ({ ...rest, blob: await dataUrlToBlob(dataUrl) })),
      )
    } else prepared[t] = rows
  }
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      const table = db.table(t)
      const rows = prepared[t] ?? []
      if (mode === 'replace') {
        await table.clear()
        await table.bulkPut(rows)
        added += rows.length
      } else {
        const pk = table.schema.primKey.keyPath as string
        for (const r of rows as Record<string, unknown>[]) {
          const exists = await table.get(r[pk] as string)
          if (exists) skipped++
          else {
            await table.put(r)
            added++
          }
        }
      }
    }
  })
  return { added, skipped }
}
