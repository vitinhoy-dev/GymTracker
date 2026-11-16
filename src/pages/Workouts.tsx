import { useEffect, useMemo, useRef, useState } from 'react'
import { Dumbbell, Swords, Play, Check, Plus, Minus, Trash2, History as HistoryIcon, LineChart as LineIcon, CalendarRange, Moon, AlertTriangle } from 'lucide-react'
import { useApp } from '../lib/store'
import { dayPlan, summarizeDay, WORKOUT_STATUS_LABEL, MUAY_STATUS_LABEL } from '../lib/day'
import { db } from '../lib/db'
import { newMuay, newSession } from '../lib/actions'
import { fmtBR, fmtShort, WEEKDAYS } from '../lib/dates'
import { fmtNum, norm, parseNum } from '../lib/util'
import type { ISODate, MuaySession, SessionExercise, WorkoutSession, WorkoutStatus } from '../lib/types'
import { Badge, Card, DateNav, Empty, Field, NumInput, PageHeader, Scale, Segmented } from '../components/ui'
import { LineChart } from '../components/charts'
import { useFeedback } from '../components/feedback'
import { AlertList } from '../components/Alerts'
import { dayAlerts } from '../lib/alerts'

type Tab = 'dia' | 'historico' | 'cargas' | 'rotina'

export default function Workouts() {
  const [tab, setTab] = useState<Tab>('dia')
  return (
    <div className="page">
      <PageHeader title="Treino">
        <Segmented size="sm" value={tab} onChange={setTab} options={[
          { value: 'dia', label: <><Dumbbell size={14} /> Hoje</> },
          { value: 'historico', label: <><HistoryIcon size={14} /> Histórico</> },
          { value: 'cargas', label: <><LineIcon size={14} /> Evolução</> },
          { value: 'rotina', label: <><CalendarRange size={14} /> Rotina</> },
        ]} />
      </PageHeader>
      {tab === 'dia' && <DayView />}
      {tab === 'historico' && <HistoryView onOpen={() => setTab('dia')} />}
      {tab === 'cargas' && <LoadsView />}
      {tab === 'rotina' && <RoutineView />}
    </div>
  )
}

const STATUS_OPTS: { value: WorkoutStatus; label: string }[] = [
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'adaptado', label: 'Adaptado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'nao_realizado', label: 'Não realizado' },
]

function DayView() {
  const { store, date, setDate, today, now } = useApp()
  const { toast } = useFeedback()
  const plan = dayPlan(store.settings, date)
  const day = summarizeDay(store, date)
  const [extraTpl, setExtraTpl] = useState('')
  const alerts = dayAlerts(store, day, today, now).filter((a) => a.id === 'fatigue')

  const start = async (templateId: string, status: WorkoutStatus = 'em_andamento') => {
    const t = store.settings.workouts.find((w) => w.id === templateId)
    if (!t) return
    const s = newSession(date, t)
    s.status = status
    await db.workouts.put(s)
    toast(status === 'em_andamento' ? `Treino ${t.name} iniciado` : `Treino registrado como ${WORKOUT_STATUS_LABEL[status].toLowerCase()}`)
  }

  const sessions = [...day.sessions].sort((a, b) => a.createdAt - b.createdAt)
  const scheduledLogged = plan.workout && sessions.some((s) => s.templateId === plan.workout!.id)

  return (
    <>
      <DateNav date={date} setDate={setDate} today={today} />
      <AlertList alerts={alerts} />
      <div className="grid two">
        <Card title={plan.workout ? `Musculação · ${plan.workout.name}` : 'Musculação'} icon={<Dumbbell size={18} />} className="span-2">
          {plan.workout && !scheduledLogged && (
            <div className="start-box">
              <div>
                <strong>{plan.workout.name}</strong>
                <p className="muted small">{plan.workout.exercises.length} exercícios{plan.workout.notes ? ` · ${plan.workout.notes}` : ''}</p>
              </div>
              <div className="btn-row">
                <button className="btn btn-primary" onClick={() => start(plan.workout!.id)}><Play size={16} /> Iniciar treino</button>
                <button className="btn" onClick={() => start(plan.workout!.id, 'nao_realizado')}>Não realizei</button>
                <button className="btn btn-ghost" onClick={() => start(plan.workout!.id, 'cancelado')}>Cancelar treino</button>
              </div>
            </div>
          )}
          {!plan.workout && !sessions.length && (
            <Empty icon={<Moon size={26} />} title="Hoje não tem musculação" />
          )}
          {sessions.map((s) => <SessionEditor key={s.id} session={s} />)}
          <details className="extra-workout">
            <summary className="muted small">Fazer outro treino hoje</summary>
            <div className="inline-form">
              <select value={extraTpl} onChange={(e) => setExtraTpl(e.target.value)}>
                <option value="">Escolher treino…</option>
                {store.settings.workouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button className="btn btn-sm" disabled={!extraTpl} onClick={() => { start(extraTpl); setExtraTpl('') }}><Plus size={14} /> Adicionar</button>
            </div>
          </details>
        </Card>
        <MuayCard date={date} scheduled={plan.muay} sessions={day.muaySessions} />
      </div>
    </>
  )
}

function lastSetsFor(all: WorkoutSession[], current: WorkoutSession, ex: SessionExercise) {
  const key = norm(ex.name)
  const prev = all
    .filter((s) => s.id !== current.id && (s.date < current.date || (s.date === current.date && s.createdAt < current.createdAt)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  for (const s of prev) {
    const e = s.exercises.find((x) => x.exerciseId === ex.exerciseId || norm(x.name) === key)
    if (e && e.sets.some((st) => st.load != null || st.reps != null)) return { date: s.date, sets: e.sets.filter((st) => st.load != null || st.reps != null) }
  }
  return null
}

function SessionEditor({ session }: { session: WorkoutSession }) {
  const { store } = useApp()
  const { toast, confirm } = useFeedback()
  const [s, setS] = useState(session)
  const dirty = useRef(false)
  const latest = useRef(s)
  latest.current = s

  // sincroniza se o registro mudar por fora (ex.: restauração)
  useEffect(() => {
    if (!dirty.current) setS(session)
  }, [session])

  // salvamento automático com debounce
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(async () => {
      await db.workouts.put({ ...latest.current, updatedAt: Date.now() })
      dirty.current = false
    }, 450)
    return () => clearTimeout(t)
  }, [s])
  useEffect(() => () => {
    if (dirty.current) void db.workouts.put({ ...latest.current, updatedAt: Date.now() })
  }, [])

  const update = (fn: (x: WorkoutSession) => WorkoutSession) => {
    dirty.current = true
    setS((cur) => fn(structuredClone(cur)))
  }
  const updEx = (i: number, fn: (e: SessionExercise) => void) => update((x) => { fn(x.exercises[i]); return x })

  const doneCount = s.exercises.filter((e) => e.done).length
  const volume = s.exercises.reduce((a, e) => a + e.sets.reduce((b, st) => b + (st.done && st.load && st.reps && e.unit === 'reps' ? st.load * st.reps : 0), 0), 0)

  const finish = (status: WorkoutStatus) => {
    if (status === 'concluido' && doneCount === 0) {
      toast('Marque pelo menos um exercício como concluído, ou use "Adaptado".', 'info')
      return
    }
    update((x) => ({ ...x, status }))
    toast(`Treino marcado como ${WORKOUT_STATUS_LABEL[status].toLowerCase()}`)
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Excluir sessão de treino?', text: 'Todas as cargas e repetições desta sessão serão apagadas.', danger: true, confirmLabel: 'Excluir' }))) return
    dirty.current = false
    await db.workouts.delete(s.id)
    toast('Sessão excluída')
  }

  const closed = s.status === 'cancelado' || s.status === 'nao_realizado'

  return (
    <div className="session">
      <div className="session-head">
        <div>
          <strong>{s.templateName}</strong>
          <span className="muted small"> · {doneCount}/{s.exercises.length} exercícios · volume {fmtNum(volume)} kg</span>
        </div>
        <select className={`status-select st-${s.status}`} value={s.status} onChange={(e) => finish(e.target.value as WorkoutStatus)}>
          {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {!closed && (
        <div className="exercises">
          {s.exercises.map((e, i) => {
            const last = lastSetsFor(store.workouts, s, e)
            return (
              <div key={e.exerciseId + i} className={`exercise ${e.done ? 'done' : ''}`}>
                <div className="exercise-head">
                  <button className="check-btn" onClick={() => updEx(i, (x) => { x.done = !x.done })} aria-pressed={e.done}>
                    <span className="check-box">{e.done && <Check size={14} strokeWidth={3} />}</span>
                    <span><b>{e.name}</b> <span className="muted small">{e.targetSets}×{e.repsMin}{e.repsMax !== e.repsMin ? `–${e.repsMax}` : ''}{e.unit === 's' ? ' s' : ''}</span></span>
                  </button>
                  {(() => {
                    const tip = store.settings.workouts.find((w) => w.id === s.templateId)?.exercises.find((x) => x.id === e.exerciseId)?.notes
                    return tip ? <span className="info-text tiny">{tip}</span> : null
                  })()}
                  {last && (
                    <span className="muted tiny last">
                      Anterior ({fmtShort(last.date)}): {last.sets.map((st) => `${st.load != null ? fmtNum(st.load, 1) + 'kg' : '—'}×${st.reps ?? '—'}`).join(', ')}
                    </span>
                  )}
                </div>
                <div className="sets">
                  <div className="set-row set-head muted tiny"><span>Série</span><span>Carga (kg)</span><span>{e.unit === 's' ? 'Segundos' : 'Reps'}</span><span>Feita</span></div>
                  {e.sets.map((st, j) => (
                    <div key={j} className={`set-row ${st.done ? 'done' : ''}`}>
                      <span className="muted">{j + 1}</span>
                      <NumInput value={st.load ?? ''} placeholder={last?.sets[j]?.load != null ? String(last.sets[j].load) : 'kg'} onChange={(ev) => updEx(i, (x) => { x.sets[j].load = parseNum(ev.target.value) })} />
                      <NumInput value={st.reps ?? ''} placeholder={`${e.repsMin}${e.repsMax !== e.repsMin ? '–' + e.repsMax : ''}`} onChange={(ev) => updEx(i, (x) => { x.sets[j].reps = parseNum(ev.target.value) })} />
                      <button className={`mini-check ${st.done ? 'on' : ''}`} aria-label="Série feita" aria-pressed={st.done} onClick={() => updEx(i, (x) => {
                        x.sets[j].done = !x.sets[j].done
                        if (x.sets.every((q) => q.done)) x.done = true
                      })}><Check size={14} /></button>
                    </div>
                  ))}
                  <div className="set-tools">
                    <button className="btn btn-ghost btn-xs" onClick={() => updEx(i, (x) => { x.sets.push({ reps: null, load: null, done: false }) })}><Plus size={12} /> série</button>
                    {e.sets.length > 0 && <button className="btn btn-ghost btn-xs" onClick={() => updEx(i, (x) => { x.sets.pop() })}><Minus size={12} /> série</button>}
                    <input className="note-input" placeholder="Observação do exercício" value={e.notes} onChange={(ev) => updEx(i, (x) => { x.notes = ev.target.value })} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="session-foot form-grid">
        <Field label="Duração (min)"><NumInput value={s.durationMin ?? ''} onChange={(e) => update((x) => ({ ...x, durationMin: parseNum(e.target.value) }))} /></Field>
        <div className="field"><span>Fadiga após o treino (1–5)</span><Scale value={s.fatigue} max={5} onChange={(v) => update((x) => ({ ...x, fatigue: v }))} /></div>
        <Field label="Observações"><textarea rows={2} value={s.notes} onChange={(e) => update((x) => ({ ...x, notes: e.target.value }))} placeholder={closed ? 'Motivo (opcional)' : 'Como foi o treino?'} /></Field>
      </div>
      <div className="btn-row">
        {s.status === 'em_andamento' && (
          <>
            <button className="btn btn-primary btn-sm" onClick={() => finish('concluido')}><Check size={14} /> Concluir</button>
            <button className="btn btn-sm" onClick={() => finish('adaptado')}>Concluir como adaptado</button>
          </>
        )}
        <button className="btn btn-ghost btn-sm danger" onClick={remove}><Trash2 size={14} /> Excluir sessão</button>
        <span className="muted tiny">Salvo automaticamente</span>
      </div>
    </div>
  )
}

function MuayCard({ date, scheduled, sessions }: { date: ISODate; scheduled: boolean; sessions: MuaySession[] }) {
  const { toast, confirm } = useFeedback()
  const [editing, setEditing] = useState<MuaySession | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!editing) return
    if (editing.durationMin != null && (editing.durationMin <= 0 || editing.durationMin > 300)) return setErr('Duração entre 1 e 300 min.')
    if (editing.status !== 'nao_realizado' && editing.rpe == null) return setErr('Informe a percepção de esforço (1–10).')
    setErr(null)
    await db.muay.put(editing)
    setEditing(null)
    toast('Muay Thai registrado')
  }

  return (
    <Card title="Muay Thai" icon={<Swords size={18} />} className="span-2" subtitle={scheduled ? 'Programado para hoje à noite' : 'Não programado hoje'}>
      {sessions.map((m) => (
        <div key={m.id} className="muay-row">
          <div>
            <Badge tone={m.status === 'realizado' ? 'ok' : m.status === 'adaptado' ? 'info' : 'warn'}>{MUAY_STATUS_LABEL[m.status]}</Badge>
            <span className="small"> {m.durationMin ? `${m.durationMin} min` : ''} {m.intensity ? `· ${m.intensity}` : ''} {m.rpe ? `· esforço ${m.rpe}/10` : ''}</span>
            {m.notes && <p className="muted small">{m.notes}</p>}
            {(m.rpe ?? 0) >= 9 && <p className="small danger-text"><AlertTriangle size={12} /> Esforço muito alto: considere priorizar recuperação.</p>}
          </div>
          <div className="row-actions">
            <button className="btn btn-sm" onClick={() => setEditing(m)}>Editar</button>
            <button className="icon-btn danger" aria-label="Excluir" onClick={async () => {
              if (await confirm({ title: 'Excluir registro de Muay Thai?', text: 'Esta ação não pode ser desfeita.', danger: true, confirmLabel: 'Excluir' })) {
                await db.muay.delete(m.id)
                toast('Registro excluído')
              }
            }}><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
      {!editing && (
        <div className="btn-row">
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(newMuay(date))}><Plus size={14} /> Registrar sessão</button>
          {scheduled && !sessions.length && <button className="btn btn-sm" onClick={async () => { await db.muay.put({ ...newMuay(date), status: 'nao_realizado', intensity: null }); toast('Registrado como não realizado') }}>Não realizei</button>}
        </div>
      )}
      {editing && (
        <div className="muay-form">
          <div className="form-grid">
            <Field label="Status">
              <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as MuaySession['status'] })}>
                <option value="realizado">Realizado</option><option value="adaptado">Adaptado / mais leve</option><option value="nao_realizado">Não realizado</option>
              </select>
            </Field>
            <Field label="Duração (min)"><NumInput value={editing.durationMin ?? ''} onChange={(e) => setEditing({ ...editing, durationMin: parseNum(e.target.value) })} /></Field>
            <Field label="Intensidade">
              <select value={editing.intensity ?? ''} onChange={(e) => setEditing({ ...editing, intensity: (e.target.value || null) as MuaySession['intensity'] })}>
                <option value="">—</option><option value="leve">Leve</option><option value="moderada">Moderada</option><option value="intensa">Intensa</option>
              </select>
            </Field>
          </div>
          <div className="field"><span>Percepção de esforço (1 = muito leve, 10 = máximo)</span><Scale value={editing.rpe} max={10} onChange={(v) => setEditing({ ...editing, rpe: v })} /></div>
          <Field label="Observações"><textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
          {err && <p className="error-text">{err}</p>}
          <div className="btn-row">
            <button className="btn btn-primary btn-sm" onClick={save}>Salvar</button>
            <button className="btn btn-sm" onClick={() => { setEditing(null); setErr(null) }}>Cancelar</button>
          </div>
        </div>
      )}
    </Card>
  )
}

function HistoryView({ onOpen }: { onOpen: () => void }) {
  const { store, setDate } = useApp()
  const items = [
    ...store.workouts.map((w) => ({ kind: 'w' as const, date: w.date, at: w.createdAt, w })),
    ...store.muay.map((m) => ({ kind: 'm' as const, date: m.date, at: m.createdAt, m })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)
  if (!items.length) return <Card><Empty icon={<HistoryIcon size={26} />} title="Nenhum treino registrado ainda" /></Card>
  return (
    <Card title="Histórico de treinos">
      <ul className="entries history-list">
        {items.map((it) => (
          <li key={it.kind + (it.kind === 'w' ? it.w.id : it.m.id)}>
            <button className="link-row" onClick={() => { setDate(it.date); onOpen() }}>
              <span className="muted small date-col">{fmtBR(it.date)}</span>
              {it.kind === 'w' ? (
                <>
                  <span><Dumbbell size={14} /> <b>{it.w.templateName}</b> <span className="muted small">{it.w.exercises.filter((e) => e.done).length}/{it.w.exercises.length} exercícios{it.w.durationMin ? ` · ${it.w.durationMin} min` : ''}</span></span>
                  <Badge tone={it.w.status === 'concluido' ? 'ok' : it.w.status === 'adaptado' || it.w.status === 'em_andamento' ? 'info' : 'warn'}>{WORKOUT_STATUS_LABEL[it.w.status]}</Badge>
                </>
              ) : (
                <>
                  <span><Swords size={14} /> <b>Muay Thai</b> <span className="muted small">{it.m.durationMin ? `${it.m.durationMin} min` : ''}{it.m.rpe ? ` · esforço ${it.m.rpe}/10` : ''}</span></span>
                  <Badge tone={it.m.status === 'realizado' ? 'ok' : it.m.status === 'adaptado' ? 'info' : 'warn'}>{MUAY_STATUS_LABEL[it.m.status]}</Badge>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function LoadsView() {
  const { store } = useApp()
  const exercises = useMemo(() => {
    const m = new Map<string, string>()
    for (const w of store.settings.workouts) for (const e of w.exercises) m.set(norm(e.name), e.name)
    for (const s of store.workouts) for (const e of s.exercises) m.set(norm(e.name), e.name)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [store])
  const [key, setKey] = useState(exercises[0]?.[0] ?? '')
  const rows = store.workouts
    .filter((s) => s.status !== 'cancelado' && s.status !== 'nao_realizado')
    .flatMap((s) => s.exercises.filter((e) => norm(e.name) === key).map((e) => ({ s, e })))
    .filter(({ e }) => e.sets.some((st) => st.load != null || st.reps != null))
    .sort((a, b) => a.s.date.localeCompare(b.s.date))
  const best = rows.map(({ s, e }) => ({ x: s.date, y: Math.max(0, ...e.sets.map((st) => st.load ?? 0)) })).filter((p) => p.y > 0)
  const vol = rows.map(({ s, e }) => ({ x: s.date, y: e.sets.reduce((a, st) => a + (st.load ?? 0) * (st.reps ?? 0), 0) })).filter((p) => p.y > 0)
  const domain = [...new Set(rows.map((r) => r.s.date))]
  const isTime = rows[0]?.e.unit === 's'
  return (
    <Card title="Comparar cargas entre sessões">
      <Field label="Exercício">
        <select value={key} onChange={(e) => setKey(e.target.value)}>
          {exercises.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
      </Field>
      {!rows.length ? (
        <Empty icon={<LineIcon size={26} />} title="Sem registros deste exercício" text="As comparações aparecem após registrar cargas ou repetições." />
      ) : (
        <>
          {!isTime && best.length > 0 && <><h4 className="chart-title">Maior carga por sessão (kg)</h4><LineChart series={[{ name: 'Maior carga', color: 'var(--accent)', points: best }]} domain={domain} unit="kg" /></>}
          {!isTime && vol.length > 0 && <><h4 className="chart-title">Volume (carga × repetições)</h4><LineChart series={[{ name: 'Volume', color: 'var(--accent-2)', points: vol }]} domain={domain} unit="kg" digits={0} /></>}
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Data</th><th>Treino</th><th>Séries</th><th>Status</th></tr></thead>
              <tbody>
                {[...rows].reverse().map(({ s, e }) => (
                  <tr key={s.id + e.exerciseId}>
                    <td>{fmtBR(s.date)}</td>
                    <td>{s.templateName}</td>
                    <td>{e.sets.map((st) => `${st.load != null ? fmtNum(st.load, 1) + 'kg' : '—'}×${st.reps ?? '—'}${isTime ? 's' : ''}`).join(' · ')}</td>
                    <td>{WORKOUT_STATUS_LABEL[s.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}

function RoutineView() {
  const { store } = useApp()
  const s = store.settings
  return (
    <>
      <Card title="Rotina semanal" subtitle="Para editar, vá em Configurações → Rotina e treinos">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Dia</th><th>Manhã</th><th>Noite</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const r = s.routine[d]
                const w = s.workouts.find((x) => x.id === r?.morning)
                return (
                  <tr key={d}>
                    <td>{WEEKDAYS[d]}</td>
                    <td>{w ? <b>{w.name}</b> : <span className="muted">{r?.muay ? 'Descanso de musculação' : 'Descanso'}</span>}</td>
                    <td>{r?.muay ? <b>Muay Thai intenso</b> : <span className="muted">Descanso</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid three">
        {s.workouts.map((w) => (
          <Card key={w.id} title={w.name} subtitle={w.notes}>
            <ul className="plain-list">
              {w.exercises.map((e) => (
                <li key={e.id}><span>{e.name}{e.notes && <span className="muted tiny"> · {e.notes}</span>}</span><span className="muted">{e.sets}×{e.repsMin}{e.repsMax !== e.repsMin ? `–${e.repsMax}` : ''}{e.unit === 's' ? ' s' : ''}</span></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  )
}
