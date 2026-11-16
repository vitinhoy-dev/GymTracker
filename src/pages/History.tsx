import { useState } from 'react'
import { Droplets, Dumbbell, Swords, Scale as ScaleIcon, Lock } from 'lucide-react'
import { useApp } from '../lib/store'
import { projectDates, summarizeDay } from '../lib/day'
import { WEEKDAYS_SHORT, weekday, fmtShort, fmtBR } from '../lib/dates'
import { fmtNum } from '../lib/util'
import { Card, PageHeader, Segmented } from '../components/ui'
import { DayClosing } from '../components/DayClosing'

export default function History() {
  const { store, today, date, setDate } = useApp()
  const g = store.settings.goals
  const dates = projectDates(store.settings)
  const [view, setView] = useState<'calendario' | 'lista'>('calendario')
  const selected = dates.includes(date) ? date : dates.includes(today) ? today : dates[0]
  const summaries = dates.map((d) => summarizeDay(store, d))
  const lead = dates.length ? weekday(dates[0]) : 0
  const sel = selected ? summarizeDay(store, selected) : null

  return (
    <div className="page">
      <PageHeader title="Histórico e calendário" subtitle="Clique em um dia para ver o fechamento. Os registros de cada dia ficam separados e nunca são sobrescritos.">
        <Segmented value={view} onChange={setView} options={[{ value: 'calendario', label: 'Calendário' }, { value: 'lista', label: 'Fechamentos' }]} />
      </PageHeader>
      <div className="history-layout">
        <Card>
          {view === 'calendario' ? (
            <div className="calendar">
              {WEEKDAYS_SHORT.map((w) => <div key={w} className="cal-head">{w}</div>)}
              {Array.from({ length: lead }, (_, i) => <div key={'pad' + i} />)}
              {summaries.map((d) => {
                const future = d.date > today
                const kcalPct = g.kcal ? (d.totals.kcal / g.kcal) * 100 : 0
                return (
                  <button key={d.date} className={`cal-day ${d.date === selected ? 'selected' : ''} ${d.date === today ? 'today' : ''} ${future ? 'future' : ''}`}
                    onClick={() => setDate(d.date)} aria-label={`Abrir ${fmtBR(d.date)}`}>
                    <span className="cal-num">{fmtShort(d.date)}{d.meta?.closedAt && <Lock size={10} />}</span>
                    {!future && (
                      <>
                        <span className={`cal-kcal ${kcalPct > 100 ? 'warn-text' : ''}`}>{d.entries.length ? `${fmtNum(d.totals.kcal)} kcal` : '—'}</span>
                        <span className="cal-icons">
                          <i title="Água" className={d.waterMl >= g.waterMl ? 'on' : d.waterMl > 0 ? 'part' : ''}><Droplets size={11} /></i>
                          {d.plan.workout && <i title="Musculação" className={d.workoutStatus === 'concluido' || d.workoutStatus === 'adaptado' ? 'on' : d.workoutStatus === 'pendente' ? '' : 'bad'}><Dumbbell size={11} /></i>}
                          {d.plan.muay && <i title="Muay Thai" className={d.muayStatus === 'realizado' || d.muayStatus === 'adaptado' ? 'on' : d.muayStatus === 'pendente' ? '' : 'bad'}><Swords size={11} /></i>}
                          {d.weightKg != null && <i title="Peso" className="on"><ScaleIcon size={11} /></i>}
                        </span>
                        <span className="cal-bar"><span style={{ width: `${d.checklistPct}%` }} /></span>
                      </>
                    )}
                    {future && <span className="muted tiny">{d.plan.workout?.name ?? (d.plan.muay ? 'Muay Thai' : 'Descanso')}</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table compact">
                <thead><tr><th>Data</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Água</th><th>Treino</th><th>Muay</th><th>Checklist</th><th>Peso</th></tr></thead>
                <tbody>
                  {summaries.filter((d) => d.date <= today).reverse().map((d) => (
                    <tr key={d.date} className={d.date === selected ? 'row-active' : ''} onClick={() => setDate(d.date)}>
                      <td>{fmtShort(d.date)}</td>
                      <td className={d.totals.kcal > g.kcal ? 'warn-text' : ''}>{fmtNum(d.totals.kcal)}</td>
                      <td>{fmtNum(d.totals.protein)}</td><td>{fmtNum(d.totals.carbs)}</td><td>{fmtNum(d.totals.fat)}</td>
                      <td>{fmtNum(d.waterMl / 1000, 2)} L</td>
                      <td>{d.plan.workout ? d.workoutStatus.replace('_', ' ') : '—'}</td>
                      <td>{d.plan.muay ? d.muayStatus.replace('_', ' ') : '—'}</td>
                      <td>{fmtNum(d.checklistPct)}%</td>
                      <td>{d.weightKg != null ? fmtNum(d.weightKg, 1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted tiny cal-legend">
            <Droplets size={11} /> água · <Dumbbell size={11} /> musculação · <Swords size={11} /> Muay Thai · <ScaleIcon size={11} /> peso · barra = checklist. Verde: concluído; laranja: não realizado/cancelado.
          </p>
        </Card>
        {sel && <Card className="closing-card"><DayClosing day={sel} /></Card>}
      </div>
    </div>
  )
}
