import { useState } from 'react'
import { Download, Upload, FileJson, FileSpreadsheet, FileText, HardDrive, ShieldCheck, Trash2 } from 'lucide-react'
import { useApp } from '../lib/store'
import { exportBackup, restoreBackup, validateBackup, type BackupFile } from '../lib/backup'
import { buildReportWorkbook, dailyCsv, workbookToBlob } from '../lib/reports'
import { ALL_TABLES, db, ensureSeed } from '../lib/db'
import { downloadBlob } from '../lib/util'
import { todayISO } from '../lib/dates'
import { Card } from '../components/ui'
import { useFeedback } from '../components/feedback'

const TABLE_LABEL: Record<string, string> = {
  settings: 'Configurações', foods: 'Alimentos', meals: 'Refeições', customMeals: 'Refeições salvas', water: 'Água', workouts: 'Treinos',
  muay: 'Muay Thai', body: 'Peso e medidas', photos: 'Fotos', days: 'Checklist/observações', imports: 'Importações',
}

export default function BackupPanel() {
  const { store, foods, persisted } = useApp()
  const { toast, confirm } = useFeedback()
  const [busy, setBusy] = useState<string | null>(null)
  const [restore, setRestore] = useState<{ file: BackupFile; counts: Record<string, number>; exportedAt?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const exportJson = () => run('json', async () => {
    const b = await exportBackup()
    downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), `cutting-tracker-backup-${todayISO()}.json`)
    toast('Backup exportado')
  })

  const exportXlsx = () => run('xlsx', async () => {
    downloadBlob(workbookToBlob(buildReportWorkbook(store, foods)), `cutting-tracker-relatorio-${todayISO()}.xlsx`)
    toast('Relatório Excel exportado')
  })

  const exportCsv = () => run('csv', async () => {
    downloadBlob(new Blob(['﻿' + dailyCsv(store)], { type: 'text/csv;charset=utf-8' }), `cutting-tracker-resumo-diario-${todayISO()}.csv`)
    toast('CSV exportado')
  })

  const pickRestore = (file?: File) => run('pick', async () => {
    if (!file) return
    let raw: unknown
    try {
      raw = JSON.parse(await file.text())
    } catch {
      throw new Error('O arquivo não é um JSON válido.')
    }
    const check = validateBackup(raw)
    if (!check.ok) throw new Error(check.error)
    setRestore({ file: raw as BackupFile, counts: check.counts as Record<string, number>, exportedAt: check.exportedAt })
  })

  const doRestore = (mode: 'merge' | 'replace') => run('restore', async () => {
    if (!restore) return
    const ok = mode === 'merge'
      ? await confirm({ title: 'Mesclar backup?', text: 'Serão adicionados apenas os registros que ainda não existem. Nada atual será alterado ou apagado.', confirmLabel: 'Mesclar' })
      : await confirm({ title: 'Substituir TODOS os dados?', text: 'Todos os dados atuais deste navegador serão apagados e trocados pelo conteúdo do backup. Recomendado exportar um backup antes.', danger: true, confirmLabel: 'Substituir tudo', typeToConfirm: 'SUBSTITUIR' })
    if (!ok) return
    const r = await restoreBackup(restore.file, mode)
    await ensureSeed()
    setRestore(null)
    toast(mode === 'merge' ? `Backup mesclado: ${r.added} registro(s) adicionados, ${r.skipped} já existiam.` : `Dados restaurados (${r.added} registros).`)
  })

  const wipe = () => run('wipe', async () => {
    const ok = await confirm({ title: 'Apagar todos os dados?', text: 'Todos os registros, fotos e configurações deste navegador serão apagados. Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Apagar tudo', typeToConfirm: 'APAGAR' })
    if (!ok) return
    await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
      for (const t of ALL_TABLES) await db.table(t).clear()
    })
    await ensureSeed()
    toast('Dados apagados. Configurações iniciais restauradas.', 'info')
  })

  return (
    <div className="grid two">
      <Card title="Backup completo (JSON)" icon={<FileJson size={18} />} subtitle="Inclui configurações, registros, alimentos e fotos.">
        <div className="btn-row">
          <button className="btn btn-primary" onClick={exportJson} disabled={!!busy}><Download size={16} /> {busy === 'json' ? 'Gerando…' : 'Exportar backup'}</button>
          <label className={`btn ${busy ? 'disabled' : ''}`}>
            <Upload size={16} /> Restaurar backup
            <input type="file" accept=".json,application/json" hidden onChange={(e) => { pickRestore(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {restore && (
          <div className="result-box">
            <strong>Backup válido{restore.exportedAt ? ` · gerado em ${new Date(restore.exportedAt).toLocaleString('pt-BR')}` : ''}</strong>
            <ul className="small">{Object.entries(restore.counts).map(([k, v]) => <li key={k}>{TABLE_LABEL[k] ?? k}: {v}</li>)}</ul>
            <div className="btn-row">
              <button className="btn btn-primary btn-sm" onClick={() => doRestore('merge')}>Mesclar (seguro)</button>
              <button className="btn btn-danger btn-sm" onClick={() => doRestore('replace')}>Substituir tudo</button>
              <button className="btn btn-sm" onClick={() => setRestore(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </Card>
      <Card title="Relatórios" icon={<FileSpreadsheet size={18} />} subtitle="Para abrir no Excel, Google Planilhas ou enviar ao seu nutricionista/treinador.">
        <div className="btn-row">
          <button className="btn" onClick={exportXlsx} disabled={!!busy}><FileSpreadsheet size={16} /> Excel (.xlsx)</button>
          <button className="btn" onClick={exportCsv} disabled={!!busy}><FileText size={16} /> Resumo diário (.csv)</button>
        </div>
        <p className="muted small">O Excel traz abas de resumo diário, refeições, água, treinos (série a série), Muay Thai, evolução e alimentos.</p>
      </Card>
      <Card title="Armazenamento e privacidade" icon={<ShieldCheck size={18} />}>
        <p className="small"><HardDrive size={14} /> Dados salvos no IndexedDB deste navegador, sem login e sem envio a servidores.</p>
        <p className="small">Armazenamento persistente: {persisted === true ? <b className="ok-text">concedido</b> : persisted === false ? <b className="warn-text">não concedido</b> : 'não suportado pelo navegador'}.</p>
        <p className="muted small">Limpar os dados de navegação deste site apaga os registros. Faça backups periódicos, principalmente antes de trocar de navegador ou aparelho.</p>
      </Card>
      <Card title="Zona de risco" icon={<Trash2 size={18} />}>
        <p className="muted small">Apaga todos os dados deste navegador e volta às configurações iniciais.</p>
        <button className="btn btn-danger" onClick={wipe} disabled={!!busy}><Trash2 size={16} /> Apagar todos os dados</button>
      </Card>
    </div>
  )
}
