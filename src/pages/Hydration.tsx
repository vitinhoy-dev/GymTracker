import { useState } from 'react'
import { Droplets, Trash2, Plus, Pencil } from 'lucide-react'
import { useApp } from '../lib/store'
import { projectDates, summarizeDay } from '../lib/day'
import { addWater } from '../lib/actions'
import { db, saveSettings } from '../lib/db'
import { fmtBR, fmtTime } from '../lib/dates'
import { fmtNum, parseNum } from '../lib/util'
import { Bar, Card, DateNav, Empty, Field, NumInput, PageHeader, Ring } from '../components/ui'
import { BarChart } from '../components/charts'
import { useFeedback } from '../components/feedback'

export default function Hydration() {
  const { store, date, setDate, today, now } = useApp()
  const { toast, confirm } = useFeedback()
  const g = store.settings.goals
  const day = summarizeDay(store, date)
  const [custom, setCustom] = useState('')
  const [goalEdit, setGoalEdit] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const add = async (ml: number) => {
    try {
      await addWater(date, ml)
      toast(`+${fmtNum(ml)} ml em ${date === today ? 'hoje' : fmtBR(date)}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro', 'error')
    }
  }

  const addCustom = async () => {
    const n = parseNum(custom)
    if (n == null || n <= 0 || n > 5000) return setErr('Informe entre 1 e 5000 ml.')
    setErr(null)
    await add(n)
    setCustom('')
  }

  const saveGoal = async () => {
    const n = parseNum(goalEdit)
    if (n == null || n < 500 || n > 8000) return setErr('Meta deve ficar entre 500 e 8000 ml.')
    await saveSettings((s) => { s.goals.waterMl = Math.round(n) })
    setGoalEdit(null)
    setErr(null)
    toast('Meta de água atualizada')
  }

  const dates = projectDates(store.settings)
  const history = dates.map((d) => {
    const ml = store.water.filter((w) => w.date === d).reduce((a, w) => a + w.ml, 0)
    return { x: d, y: d > today ? null : ml, tone: (ml >= g.waterMl ? 'ok' : 'muted') as 'ok' | 'muted' }
  })

  return (
    <div className="page">
      <PageHeader title="Hidratação" subtitle="Registre apenas o que você realmente bebeu." />
      <DateNav date={date} setDate={setDate} today={today} />
      <div className="grid two">
        <Card title="Consumo do dia" icon={<Droplets size={18} />}>
          <div className="water-main">
            <Ring value={day.waterMl / 1000} goal={g.waterMl / 1000} label="Água" unit="L" size={170} digits={2} color="var(--c-water)" />
            <div className="water-side">
              <Bar value={day.waterMl} goal={g.waterMl} label="Progresso" unit="ml" color="var(--c-water)" />
              <p className="muted small">
                {day.waterMl >= g.waterMl ? 'Meta atingida.' : `Faltam ${fmtNum(g.waterMl - day.waterMl)} ml para a meta.`}
              </p>
              <div className="quick-row">
                {[100, 250, 500].map((ml) => <button key={ml} className="btn btn-water" onClick={() => add(ml)}>+{ml} ml</button>)}
              </div>
              <div className="inline-form">
                <NumInput placeholder="Outra quantidade (ml)" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} />
                <button className="btn" onClick={addCustom}><Plus size={14} /> Adicionar</button>
              </div>
              <div className="goal-line-edit">
                {goalEdit === null ? (
                  <span className="muted small">Meta diária: <b>{fmtNum(g.waterMl)} ml</b> <button className="link-btn" onClick={() => setGoalEdit(String(g.waterMl))}><Pencil size={12} /> editar</button></span>
                ) : (
                  <div className="inline-form">
                    <Field label="Meta (ml)"><NumInput value={goalEdit} onChange={(e) => setGoalEdit(e.target.value)} /></Field>
                    <button className="btn btn-primary btn-sm" onClick={saveGoal}>Salvar</button>
                    <button className="btn btn-sm" onClick={() => setGoalEdit(null)}>Cancelar</button>
                  </div>
                )}
              </div>
              {err && <p className="error-text">{err}</p>}
            </div>
          </div>
        </Card>
        <Card title="Registros do dia">
          {day.waterEntries.length === 0 ? (
            <Empty icon={<Droplets size={26} />} title="Nenhum registro" text="Use os botões rápidos para registrar." />
          ) : (
            <ul className="entries">
              {[...day.waterEntries].reverse().map((w) => (
                <li key={w.id}>
                  <span><b>{fmtNum(w.ml)} ml</b> <span className="muted small">às {fmtTime(w.at)}{w.id.startsWith('imp_') ? ' · importado' : ''}</span></span>
                  <button className="icon-btn danger" aria-label="Excluir" onClick={async () => {
                    if (await confirm({ title: 'Excluir registro de água?', text: `Remover ${w.ml} ml?`, danger: true, confirmLabel: 'Excluir' })) {
                      await db.water.delete(w.id)
                      toast('Registro removido')
                    }
                  }}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {store.settings.waterPlan && store.settings.waterPlan.length > 0 && (
        <Card title="Plano por horário" subtitle="Referência importada da planilha. O progresso usa apenas o que você registrou.">
          <ul className="plain-list small">
            {(() => {
              let acc = 0
              return store.settings.waterPlan.map((w) => {
                acc += w.ml
                const until = w.until
                const drank = day.waterEntries.filter((e) => !until || fmtTime(e.at) <= until).reduce((a, e) => a + e.ml, 0)
                const due = date < today || (date === today && (!until ? false : now >= until))
                return (
                  <li key={w.label}>
                    <span><b>{w.label}</b> · {fmtNum(w.ml)} ml{w.note ? <span className="muted"> · {w.note}</span> : null}</span>
                    <span className={drank >= acc ? 'ok-text' : due ? 'warn-text' : 'muted'}>{fmtNum(drank)} / {fmtNum(acc)} ml acumulado</span>
                  </li>
                )
              })
            })()}
          </ul>
        </Card>
      )}
      <Card title="Resumo por dia" subtitle="Consumo real registrado em cada dia do projeto">
        <BarChart data={history} goal={g.waterMl} unit="ml" color="var(--c-water)" />
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>Data</th><th>Consumo</th><th>Meta</th><th>%</th></tr></thead>
            <tbody>
              {history.filter((h) => h.y != null).reverse().map((h) => (
                <tr key={h.x} className={h.x === date ? 'row-active' : ''} onClick={() => setDate(h.x)}>
                  <td>{fmtBR(h.x)}</td><td>{fmtNum(h.y)} ml</td><td>{fmtNum(g.waterMl)} ml</td>
                  <td className={(h.y ?? 0) >= g.waterMl ? 'ok-text' : 'muted'}>{fmtNum(((h.y ?? 0) / g.waterMl) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
