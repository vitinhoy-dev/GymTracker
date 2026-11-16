import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileSpreadsheet, Upload, CheckCircle2, XCircle, AlertTriangle, Loader2, Eye } from 'lucide-react'
import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { applyImport, buildPreview, DEFAULT_OPTIONS, EXPECTED_SHEETS, readWorkbook, type ImportOptions, type ImportPreview } from '../lib/importer'
import { fmtBR, WEEKDAYS } from '../lib/dates'
import { fmtNum } from '../lib/util'
import { Badge, Card, Modal } from '../components/ui'
import { useFeedback } from '../components/feedback'
import { planText } from './Food'

export default function ImportPanel() {
  const { store, foods } = useApp()
  const { toast, confirm } = useFeedback()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [opts, setOpts] = useState<ImportOptions>(DEFAULT_OPTIONS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string[] | null>(null)
  const [rawSheet, setRawSheet] = useState<string | null>(null)
  const logs = useLiveQuery(() => db.imports.orderBy('importedAt').reverse().toArray(), []) ?? []
  const [viewLog, setViewLog] = useState<string | null>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setResult(null)
    setPreview(null)
    if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return setError('Selecione um arquivo Excel (.xlsx).')
    if (file.size > 20 * 1024 * 1024) return setError('Arquivo muito grande (máx. 20 MB).')
    setBusy(true)
    try {
      const wb = readWorkbook(await file.arrayBuffer())
      const manualMarks: Record<string, Record<string, boolean>> = {}
      for (const d of store.days) manualMarks[d.date] = d.checklist
      const p = buildPreview(wb, file.name, {
        settings: store.settings, foods, waterDates: new Set(store.water.map((w) => w.date)), manualMarks,
      })
      setPreview(p)
      setOpts(DEFAULT_OPTIONS)
      setRawSheet(p.sheetNames[0] ?? null)
    } catch (e) {
      setError(`Não foi possível ler a planilha: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!preview) return
    const ok = await confirm({
      title: 'Confirmar importação?',
      text: 'Os dados selecionados serão adicionados. Registros que você já fez (refeições, água, treinos, checklist) não são apagados nem sobrescritos.',
      confirmLabel: 'Importar',
    })
    if (!ok) return
    setBusy(true)
    try {
      const summary = await applyImport(preview, opts)
      setResult(summary)
      setPreview(null)
      toast('Importação concluída')
    } catch (e) {
      setError(`Falha ao importar: ${e instanceof Error ? e.message : String(e)}. Nenhum dado foi alterado.`)
    } finally {
      setBusy(false)
    }
  }

  const Opt = ({ k, label, count, disabled }: { k: keyof ImportOptions; label: string; count?: number; disabled?: boolean }) => (
    <label className={`check-inline ${disabled ? 'muted' : ''}`}>
      <input type="checkbox" disabled={disabled} checked={opts[k] && !disabled} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}{count != null ? ` (${count})` : ''}
    </label>
  )

  const p = preview
  const newFoods = p?.foods.filter((f) => f.status === 'novo').length ?? 0
  const diffFoods = p?.foods.filter((f) => f.status === 'existente_diferente').length ?? 0

  return (
    <>
      <Card title="Importar planilha Excel" icon={<FileSpreadsheet size={18} />}
        subtitle={<>Arquivo esperado: <code>Plano_cutting_MuayThai_16nov_a_06dez2026.xlsx</code>. Abas lidas: {EXPECTED_SHEETS.join(', ')}.</>}>
        <ol className="steps small muted">
          <li>Selecione o arquivo .xlsx</li><li>Confira a prévia e os avisos</li><li>Escolha o que importar</li><li>Confirme. Nada é apagado.</li>
        </ol>
        <label className={`dropzone ${busy ? 'disabled' : ''}`}>
          {busy ? <Loader2 className="spin" /> : <Upload />}
          <span>{busy ? 'Processando…' : 'Selecionar arquivo XLSX'}</span>
          <input type="file" accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {error && <p className="error-text">{error}</p>}
        {result && (
          <div className="result-box">
            <strong><CheckCircle2 size={16} /> Importação concluída</strong>
            <ul>{result.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}
      </Card>

      {p && (
        <>
          <Card title={`Prévia: ${p.fileName}`}>
            <div className="sheet-status">
              {EXPECTED_SHEETS.map((k) => (
                <span key={k} className={`sheet-chip ${p.found[k] ? 'ok' : 'miss'}`}>
                  {p.found[k] ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {k}
                </span>
              ))}
            </div>
            {p.errors.length > 0 && <ul className="alerts">{p.errors.map((e, i) => <li key={i} className="alert alert-danger"><XCircle size={16} /><div><p>{e}</p></div></li>)}</ul>}
            {p.warnings.length > 0 && (
              <details open={p.warnings.length < 6}>
                <summary className="warn-text small"><AlertTriangle size={13} /> {p.warnings.length} aviso(s) de validação</summary>
                <ul className="small muted">{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
            {p.readme.length > 0 && (
              <details>
                <summary className="small">LEIA_PRIMEIRO ({p.readme.length} linhas)</summary>
                <div className="readme small">{p.readme.map((l, i) => <p key={i}>{l}</p>)}</div>
              </details>
            )}
          </Card>

          <div className="grid two">
            <Card title="Metas e parâmetros" subtitle="Somente valores diferentes dos atuais">
              {p.settingChanges.length ? (
                <table className="table compact">
                  <thead><tr><th>Campo</th><th>Atual</th><th>Planilha</th><th>Aba</th></tr></thead>
                  <tbody>{p.settingChanges.map((c) => <tr key={c.field}><td>{c.label}</td><td>{c.current ?? '—'}</td><td><b>{c.proposed}</b></td><td className="muted small">{c.origin}</td></tr>)}</tbody>
                </table>
              ) : <p className="muted small">Nenhuma diferença encontrada.</p>}
            </Card>
            <Card title="Rotina semanal">
              {p.routine ? (
                <table className="table compact">
                  <thead><tr><th>Dia</th><th>Manhã</th><th>Noite</th></tr></thead>
                  <tbody>{[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const r = p.routine![d]
                    const all = [...store.settings.workouts, ...p.workouts.map((w) => w.template)]
                    return <tr key={d}><td>{WEEKDAYS[d]}</td><td>{all.find((w) => w.id === r.morning)?.name ?? 'Descanso'}</td><td>{r.muay ? 'Muay Thai' : 'Descanso'}</td></tr>
                  })}</tbody>
                </table>
              ) : <p className="muted small">Não encontrada.</p>}
            </Card>
            <Card title={`Treinos (${p.workouts.length})`}>
              {p.workouts.length ? p.workouts.map((w) => (
                <div key={w.template.id} className="small">
                  <b>{w.template.name}</b> {w.matchedExisting ? <Badge tone="info">substitui exercícios atuais</Badge> : <Badge tone="ok">novo</Badge>}
                  <p className="muted">{w.template.exercises.map((e) => `${e.name} ${e.sets}×${e.repsMin}${e.repsMax !== e.repsMin ? '–' + e.repsMax : ''}${e.unit === 's' ? 's' : ''}`).join(' · ')}</p>
                </div>
              )) : <p className="muted small">Nenhum treino encontrado.</p>}
            </Card>
            <Card title={`Plano alimentar (${p.meals.length})`}>
              {p.meals.length ? (
                <ul className="plain-list small">
                  {p.meals.map((m) => <li key={m.id}><span><b>{m.time}</b> {m.name}</span><span className="muted">{planText(m.plan, foods)}</span></li>)}
                </ul>
              ) : <p className="muted small">Nenhuma refeição encontrada.</p>}
            </Card>
            <Card title={`Alimentos (${p.foods.length + p.foodReference.length})`} className="span-2" subtitle={`${newFoods} novo(s) · ${diffFoods} com valores diferentes dos já cadastrados`}>
              {p.foods.length ? (
                <div className="table-wrap">
                  <table className="table compact">
                    <thead><tr><th>Alimento</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Situação</th></tr></thead>
                    <tbody>{p.foods.map((f) => (
                      <tr key={f.name}>
                        <td>{f.name}</td><td>{fmtNum(f.kcal, 1)}</td><td>{fmtNum(f.protein, 1)}</td><td>{fmtNum(f.carbs, 1)}</td><td>{fmtNum(f.fat, 1)}</td>
                        <td>{{ novo: <Badge tone="ok">novo</Badge>, existente_igual: <Badge tone="muted">já existe (igual)</Badge>, existente_diferente: <Badge tone="warn">já existe (diferente)</Badge>, completa_existente: <Badge tone="info">completa dados ausentes</Badge> }[f.status]}{!f.complete && <Badge tone="warn">incompleto</Badge>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="muted small">Nenhum alimento encontrado.</p>}
              <p className="muted tiny">Valores considerados por 100 g/ml. Porções diferentes de 100 são convertidas proporcionalmente.</p>
              {p.foodReference.length > 0 && (
                <>
                  <h4 className="small">Referência da planilha (somente consulta)</h4>
                  <ul className="plain-list small">{p.foodReference.map((f) => <li key={f.name}><span>{f.name} · {f.portion}</span><span className="muted">{f.info}</span></li>)}</ul>
                  <p className="muted tiny">Sem calorias, carboidratos e gorduras: não viram valores nutricionais. Use os rótulos na base de alimentos.</p>
                </>
              )}
            </Card>
            <Card title="Hidratação e checklist">
              {p.waterPlan.length > 0 && (
                <>
                  <p className="small">Plano de hidratação por horário (referência):</p>
                  <ul className="plain-list small">{p.waterPlan.map((w) => <li key={w.label}><span>{w.label}</span><span>{fmtNum(w.ml)} ml</span></li>)}</ul>
                </>
              )}
              <p className="small">Registros de água com data: <b>{p.water.length}</b>{p.water.some((w) => w.conflict) && <span className="muted"> ({p.water.filter((w) => w.conflict).length} dia(s) já têm registro e serão preservados)</span>}</p>
              {p.water.slice(0, 8).map((w) => <p key={w.date} className="muted small">{fmtBR(w.date)}: {fmtNum(w.ml)} ml</p>)}
              <p className="small">Itens de checklist: <b>{p.checklistItems.length}</b> ({p.checklistItems.filter((c) => !c.matchedKey).length} novos)</p>
              <p className="small">Marcações com data: <b>{p.checklistMarks.length}</b></p>
            </Card>
            <Card title="Plano do dia (HOJE_16NOV)">
              {p.todayPlan.lines.length ? (
                <>
                  <div className="readme small">{p.todayPlan.lines.slice(0, 12).map((l, i) => <p key={i}>{l}</p>)}</div>
                  <p className="muted tiny">Será salvo como anotação do dia {p.todayPlan.date ? fmtBR(p.todayPlan.date) : '(data não identificada)'}; não conta como consumo.</p>
                </>
              ) : <p className="muted small">Aba não encontrada ou vazia.</p>}
            </Card>
          </div>

          <Card title="Conteúdo bruto das abas" icon={<Eye size={18} />}>
            <div className="tabs-inline wrap">
              {p.sheetNames.map((n) => <button key={n} className={rawSheet === n ? 'active' : ''} onClick={() => setRawSheet(n)}>{n}</button>)}
            </div>
            {rawSheet && <RawGrid rows={p.text[rawSheet] ?? []} />}
          </Card>

          <Card title="O que importar">
            <div className="opts">
              <Opt k="settings" label="Metas e parâmetros" count={p.settingChanges.length} disabled={!p.settingChanges.length} />
              <Opt k="foods" label="Novos alimentos e dados ausentes" count={p.foods.length} disabled={!p.foods.length} />
              <Opt k="overwriteFoods" label="Substituir valores de alimentos já cadastrados" count={diffFoods} disabled={!diffFoods || !opts.foods} />
              <Opt k="meals" label="Plano alimentar (horários e itens)" count={p.meals.length} disabled={!p.meals.length} />
              <Opt k="workouts" label="Treinos e exercícios" count={p.workouts.length} disabled={!p.workouts.length} />
              <Opt k="routine" label="Rotina semanal" disabled={!p.routine} />
              <Opt k="checklistItems" label="Itens de checklist" count={p.checklistItems.length} disabled={!p.checklistItems.length} />
              <Opt k="checklistMarks" label="Marcações de checklist" count={p.checklistMarks.length} disabled={!p.checklistMarks.length} />
              <Opt k="water" label="Registros de água" count={p.water.length} disabled={!p.water.length} />
              <Opt k="waterPlan" label="Plano de hidratação por horário" count={p.waterPlan.length} disabled={!p.waterPlan.length} />
              <Opt k="todayNote" label="Plano do dia como anotação" disabled={!p.todayPlan.lines.length} />
            </div>
            <p className="muted small">Registros diários existentes nunca são apagados. Itens que já existem são ignorados para evitar duplicação.</p>
            <div className="btn-row">
              <button className="btn" onClick={() => setPreview(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={busy} onClick={doImport}>{busy ? 'Importando…' : 'Confirmar importação'}</button>
            </div>
          </Card>
        </>
      )}

      <Card title="Importações anteriores">
        {!logs.length ? <p className="muted small">Nenhuma importação realizada.</p> : (
          <ul className="entries">
            {logs.map((l) => (
              <li key={l.id}>
                <div><b>{l.fileName}</b> <span className="muted small">{new Date(l.importedAt).toLocaleString('pt-BR')}</span><p className="muted small">{l.summary.join(' ')}</p></div>
                <button className="btn btn-sm" onClick={() => setViewLog(l.id)}>Ver abas</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {viewLog && (() => {
        const l = logs.find((x) => x.id === viewLog)
        if (!l) return null
        return (
          <Modal title={l.fileName} onClose={() => setViewLog(null)} wide>
            {Object.entries(l.sheets).map(([n, rows]) => (
              <details key={n}><summary>{n} ({rows.length} linhas)</summary><RawGrid rows={rows} /></details>
            ))}
          </Modal>
        )
      })()}
    </>
  )
}

function RawGrid({ rows }: { rows: string[][] }) {
  const width = Math.max(0, ...rows.map((r) => r.length))
  return (
    <div className="table-wrap raw-grid">
      <table className="table compact">
        <tbody>
          {rows.slice(0, 200).map((r, i) => (
            <tr key={i}><td className="muted tiny">{i + 1}</td>{Array.from({ length: width }, (_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && <p className="muted tiny">Mostrando 200 de {rows.length} linhas.</p>}
    </div>
  )
}
