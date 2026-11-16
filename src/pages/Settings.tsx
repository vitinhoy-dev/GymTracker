import { useState } from 'react'
import { User, Utensils, CalendarRange, ListChecks, FileSpreadsheet, DatabaseBackup, Plus, Trash2, ArrowUp, ArrowDown, Save } from 'lucide-react'
import { useApp } from '../lib/store'
import { saveSettings } from '../lib/db'
import { isValidISO, diffDays, WEEKDAYS } from '../lib/dates'
import { kcalFromMacros } from '../lib/nutrition'
import { fmtNum, parseNum, uid } from '../lib/util'
import type { ChecklistItemDef, MealSlot, Settings, Unit, WorkoutTemplate, MealCondition } from '../lib/types'
import { Card, Field, NumInput, PageHeader, Segmented } from '../components/ui'
import { useFeedback } from '../components/feedback'
import ImportPanel from './ImportPanel'
import BackupPanel from './BackupPanel'

type Tab = 'perfil' | 'refeicoes' | 'rotina' | 'checklist' | 'importar' | 'backup'

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('perfil')
  return (
    <div className="page">
      <PageHeader title="Configurações e importação" subtitle="As alterações refletem imediatamente em todos os indicadores." />
      <div className="tabs-scroll">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'perfil', label: <><User size={14} /> Perfil e metas</> },
          { value: 'refeicoes', label: <><Utensils size={14} /> Refeições</> },
          { value: 'rotina', label: <><CalendarRange size={14} /> Rotina e treinos</> },
          { value: 'checklist', label: <><ListChecks size={14} /> Checklist</> },
          { value: 'importar', label: <><FileSpreadsheet size={14} /> Importar planilha</> },
          { value: 'backup', label: <><DatabaseBackup size={14} /> Backup e exportação</> },
        ]} />
      </div>
      {tab === 'perfil' && <ProfileForm />}
      {tab === 'refeicoes' && <MealsEditor />}
      {tab === 'rotina' && <RoutineEditor />}
      {tab === 'checklist' && <ChecklistEditor />}
      {tab === 'importar' && <ImportPanel />}
      {tab === 'backup' && <BackupPanel />}
    </div>
  )
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className={`save-bar ${dirty ? 'show' : ''}`}>
      <span className="small">Alterações não salvas</span>
      <button className="btn btn-sm" onClick={onReset}>Descartar</button>
      <button className="btn btn-primary btn-sm" onClick={onSave}><Save size={14} /> Salvar</button>
    </div>
  )
}

function ProfileForm() {
  const { store } = useApp()
  const { toast } = useFeedback()
  const s = store.settings
  const init = () => ({
    age: String(s.profile.age), heightCm: String(s.profile.heightCm), startWeightKg: String(s.profile.startWeightKg),
    targetWeightKg: s.profile.targetWeightKg != null ? String(s.profile.targetWeightKg) : '', sex: s.profile.sex, level: s.profile.level, objective: s.profile.objective,
    kcal: String(s.goals.kcal), proteinG: String(s.goals.proteinG), carbsG: String(s.goals.carbsG), fatG: String(s.goals.fatG), waterMl: String(s.goals.waterMl),
    startDate: s.startDate, endDate: s.endDate,
  })
  const [f, setF] = useState(init)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof ReturnType<typeof init>, v: string) => setF({ ...f, [k]: v })
  const dirty = JSON.stringify(f) !== JSON.stringify(init())

  const save = async () => {
    const e: Record<string, string> = {}
    const n = (k: keyof typeof f, min: number, max: number, label: string, optional = false) => {
      const v = parseNum(f[k])
      if (v == null) {
        if (!optional) e[k] = `Informe ${label}.`
        return null
      }
      if (v < min || v > max) e[k] = `${label} deve ficar entre ${min} e ${max}.`
      return v
    }
    const age = n('age', 10, 100, 'a idade')
    const heightCm = n('heightCm', 100, 230, 'a altura (cm)')
    const startWeightKg = n('startWeightKg', 30, 250, 'o peso inicial')
    const targetWeightKg = n('targetWeightKg', 30, 250, 'a meta de peso', true)
    const kcal = n('kcal', 800, 6000, 'a meta calórica')
    const proteinG = n('proteinG', 0, 500, 'a proteína')
    const carbsG = n('carbsG', 0, 900, 'os carboidratos')
    const fatG = n('fatG', 0, 300, 'as gorduras')
    const waterMl = n('waterMl', 500, 8000, 'a meta de água (ml)')
    if (!isValidISO(f.startDate)) e.startDate = 'Data inválida.'
    if (!isValidISO(f.endDate)) e.endDate = 'Data inválida.'
    if (!e.startDate && !e.endDate && f.endDate < f.startDate) e.endDate = 'O fim deve ser depois do início.'
    if (!e.startDate && !e.endDate && diffDays(f.startDate, f.endDate) > 365) e.endDate = 'Período máximo de 1 ano.'
    setErrors(e)
    if (Object.keys(e).length) return toast('Corrija os campos destacados.', 'error')
    await saveSettings((x) => {
      x.profile = { ...x.profile, sex: f.sex as Settings['profile']['sex'], age: age!, heightCm: heightCm!, startWeightKg: startWeightKg!, targetWeightKg, level: f.level, objective: f.objective }
      x.goals = { kcal: kcal!, proteinG: proteinG!, carbsG: carbsG!, fatG: fatG!, waterMl: waterMl! }
      x.startDate = f.startDate
      x.endDate = f.endDate
    })
    toast('Configurações salvas')
  }

  const macroKcal = kcalFromMacros(parseNum(f.proteinG) ?? 0, parseNum(f.carbsG) ?? 0, parseNum(f.fatG) ?? 0)
  const diff = macroKcal - (parseNum(f.kcal) ?? 0)

  return (
    <>
      <div className="grid two">
        <Card title="Perfil">
          <div className="form-grid">
            <Field label="Sexo"><select value={f.sex} onChange={(e) => set('sex', e.target.value)}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select></Field>
            <Field label="Idade" error={errors.age}><NumInput value={f.age} onChange={(e) => set('age', e.target.value)} /></Field>
            <Field label="Altura (cm)" error={errors.heightCm}><NumInput value={f.heightCm} onChange={(e) => set('heightCm', e.target.value)} /></Field>
            <Field label="Peso inicial (kg)" error={errors.startWeightKg}><NumInput value={f.startWeightKg} onChange={(e) => set('startWeightKg', e.target.value)} /></Field>
            <Field label="Meta de peso (kg)" hint="Opcional" error={errors.targetWeightKg}><NumInput value={f.targetWeightKg} onChange={(e) => set('targetWeightKg', e.target.value)} /></Field>
            <Field label="Nível de musculação"><input value={f.level} onChange={(e) => set('level', e.target.value)} /></Field>
            <Field label="Objetivo"><input value={f.objective} onChange={(e) => set('objective', e.target.value)} /></Field>
          </div>
        </Card>
        <Card title="Período do projeto">
          <div className="form-grid">
            <Field label="Data de início" error={errors.startDate}><input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
            <Field label="Data de encerramento" error={errors.endDate}><input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
          </div>
          {isValidISO(f.startDate) && isValidISO(f.endDate) && f.endDate >= f.startDate && <p className="muted small">{diffDays(f.startDate, f.endDate) + 1} dias de projeto. Registros fora do período continuam salvos.</p>}
        </Card>
        <Card title="Metas diárias" subtitle="Estimativas iniciais, não prescrição médica ou nutricional." className="span-2">
          <div className="form-grid five">
            <Field label="Calorias (kcal)" error={errors.kcal}><NumInput value={f.kcal} onChange={(e) => set('kcal', e.target.value)} /></Field>
            <Field label="Proteínas (g)" error={errors.proteinG}><NumInput value={f.proteinG} onChange={(e) => set('proteinG', e.target.value)} /></Field>
            <Field label="Carboidratos (g)" error={errors.carbsG}><NumInput value={f.carbsG} onChange={(e) => set('carbsG', e.target.value)} /></Field>
            <Field label="Gorduras (g)" error={errors.fatG}><NumInput value={f.fatG} onChange={(e) => set('fatG', e.target.value)} /></Field>
            <Field label="Água (ml)" error={errors.waterMl}><NumInput value={f.waterMl} onChange={(e) => set('waterMl', e.target.value)} /></Field>
          </div>
          <p className={`small ${Math.abs(diff) > 100 ? 'warn-text' : 'muted'}`}>
            Os macros somam {fmtNum(macroKcal)} kcal (4/4/9 kcal por g), {diff >= 0 ? '+' : ''}{fmtNum(diff)} kcal em relação à meta calórica.
          </p>
        </Card>
      </div>
      <SaveBar dirty={dirty} onSave={save} onReset={() => { setF(init()); setErrors({}) }} />
    </>
  )
}

function MealsEditor() {
  const { store, foods } = useApp()
  const { toast, confirm } = useFeedback()
  const [meals, setMeals] = useState<MealSlot[]>(() => structuredClone(store.settings.meals))
  const dirty = JSON.stringify(meals) !== JSON.stringify(store.settings.meals)
  const upd = (i: number, fn: (m: MealSlot) => void) => setMeals((ms) => ms.map((m, j) => { if (j !== i) return m; const c = structuredClone(m); fn(c); return c }))

  const save = async () => {
    for (const m of meals) {
      if (!m.name.trim()) return toast('Toda refeição precisa de um nome.', 'error')
      if (!/^\d{2}:\d{2}$/.test(m.time)) return toast(`Horário inválido em "${m.name}".`, 'error')
      if (m.plan.some((p) => !p.name.trim() || p.amount < 0)) return toast(`Item inválido em "${m.name}".`, 'error')
    }
    const removed = store.settings.meals.filter((m) => !meals.some((x) => x.id === m.id))
    if (removed.length) {
      const used = store.meals.filter((e) => removed.some((r) => r.id === e.slotId)).length
      if (used && !(await confirm({ title: 'Remover refeições?', text: `${removed.map((r) => r.name).join(', ')} tem ${used} registro(s) antigos. Eles serão mantidos e aparecerão como "fora do planejamento".`, confirmLabel: 'Remover' }))) return
    }
    await saveSettings((s) => { s.meals = [...meals].sort((a, b) => a.time.localeCompare(b.time)) })
    toast('Plano de refeições salvo')
  }

  return (
    <>
      <p className="muted small">Refeições condicionais só são exigidas nos dias em que a atividade acontece (ex.: pré-treino apenas em dias de musculação).</p>
      <div className="grid two">
        {meals.map((m, i) => (
          <Card key={m.id} title={m.name || 'Nova refeição'} action={
            <button className="icon-btn danger" aria-label="Remover refeição" onClick={() => setMeals(meals.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          }>
            <div className="form-grid">
              <Field label="Nome"><input value={m.name} onChange={(e) => upd(i, (x) => { x.name = e.target.value })} /></Field>
              <Field label="Horário"><input type="time" value={m.time} onChange={(e) => upd(i, (x) => { x.time = e.target.value })} /></Field>
              <Field label="Até (opcional)"><input type="time" value={m.timeEnd ?? ''} onChange={(e) => upd(i, (x) => { x.timeEnd = e.target.value || undefined })} /></Field>
              <Field label="Exigida em">
                <select value={m.condition} onChange={(e) => upd(i, (x) => { x.condition = e.target.value as MealCondition })}>
                  <option value="always">Todos os dias</option>
                  <option value="morningWorkout">Dias de musculação</option>
                  <option value="muay">Dias de Muay Thai</option>
                </select>
              </Field>
            </div>
            <h4 className="small muted">Itens planejados</h4>
            {m.plan.map((p, k) => (
              <div key={k} className="plan-edit-row">
                <input value={p.name} onChange={(e) => upd(i, (x) => { x.plan[k].name = e.target.value })} placeholder="Nome" />
                <select value={p.foodId ?? ''} onChange={(e) => upd(i, (x) => { x.plan[k].foodId = e.target.value || undefined })}>
                  <option value="">(sem vínculo)</option>
                  {foods.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <NumInput value={p.amount || ''} placeholder="qtd" onChange={(e) => upd(i, (x) => { x.plan[k].amount = parseNum(e.target.value) ?? 0 })} />
                <NumInput value={p.amountMax ?? ''} placeholder="até" onChange={(e) => upd(i, (x) => { x.plan[k].amountMax = parseNum(e.target.value) ?? undefined })} />
                <select value={p.unit} onChange={(e) => upd(i, (x) => { x.plan[k].unit = e.target.value as Unit })}><option value="g">g</option><option value="ml">ml</option><option value="un">un</option></select>
                <button className="icon-btn danger" aria-label="Remover item" onClick={() => upd(i, (x) => { x.plan.splice(k, 1) })}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => upd(i, (x) => { x.plan.push({ name: '', amount: 0, unit: 'g' }) })}><Plus size={14} /> Item</button>
          </Card>
        ))}
      </div>
      <button className="btn" onClick={() => setMeals([...meals, { id: uid('m'), name: 'Nova refeição', time: '10:00', condition: 'always', plan: [] }])}><Plus size={14} /> Adicionar refeição</button>
      <SaveBar dirty={dirty} onSave={save} onReset={() => setMeals(structuredClone(store.settings.meals))} />
    </>
  )
}

function RoutineEditor() {
  const { store } = useApp()
  const { toast } = useFeedback()
  const [routine, setRoutine] = useState(() => structuredClone(store.settings.routine))
  const [workouts, setWorkouts] = useState<WorkoutTemplate[]>(() => structuredClone(store.settings.workouts))
  const dirty = JSON.stringify(routine) !== JSON.stringify(store.settings.routine) || JSON.stringify(workouts) !== JSON.stringify(store.settings.workouts)
  const updW = (i: number, fn: (w: WorkoutTemplate) => void) => setWorkouts((ws) => ws.map((w, j) => { if (j !== i) return w; const c = structuredClone(w); fn(c); return c }))

  const save = async () => {
    for (const w of workouts) {
      if (!w.name.trim()) return toast('Todo treino precisa de nome.', 'error')
      for (const e of w.exercises) {
        if (!e.name.trim()) return toast(`Exercício sem nome em "${w.name}".`, 'error')
        if (e.sets < 1 || e.repsMin < 1 || e.repsMax < e.repsMin) return toast(`Séries/repetições inválidas em "${e.name}".`, 'error')
      }
    }
    const ids = new Set(workouts.map((w) => w.id))
    const r = structuredClone(routine)
    for (const k of Object.keys(r)) if (r[+k].morning && !ids.has(r[+k].morning!)) r[+k].morning = null
    await saveSettings((s) => { s.routine = r; s.workouts = workouts })
    setRoutine(r)
    toast('Rotina e treinos salvos. Sessões já registradas não mudam.')
  }

  return (
    <>
      <Card title="Rotina semanal">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Dia</th><th>Manhã (musculação)</th><th>Noite (Muay Thai)</th></tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <tr key={d}>
                  <td>{WEEKDAYS[d]}</td>
                  <td>
                    <select value={routine[d]?.morning ?? ''} onChange={(e) => setRoutine({ ...routine, [d]: { ...routine[d], morning: e.target.value || null } })}>
                      <option value="">Descanso</option>
                      {workouts.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <label className="check-inline"><input type="checkbox" checked={!!routine[d]?.muay} onChange={(e) => setRoutine({ ...routine, [d]: { ...routine[d], muay: e.target.checked } })} /> Muay Thai</label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid two">
        {workouts.map((w, i) => (
          <Card key={w.id} title={w.name || 'Novo treino'} action={<button className="icon-btn danger" aria-label="Remover treino" onClick={() => setWorkouts(workouts.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}>
            <div className="form-grid">
              <Field label="Nome"><input value={w.name} onChange={(e) => updW(i, (x) => { x.name = e.target.value })} /></Field>
              <Field label="Orientações"><input value={w.notes ?? ''} onChange={(e) => updW(i, (x) => { x.notes = e.target.value || undefined })} /></Field>
            </div>
            <div className="ex-edit-head muted tiny"><span>Exercício</span><span>Séries</span><span>Mín</span><span>Máx</span><span>Tipo</span><span /></div>
            {w.exercises.map((e, k) => (
              <div key={e.id} className="ex-edit-row">
                <input value={e.name} onChange={(ev) => updW(i, (x) => { x.exercises[k].name = ev.target.value })} />
                <NumInput value={e.sets} onChange={(ev) => updW(i, (x) => { x.exercises[k].sets = parseNum(ev.target.value) ?? 0 })} />
                <NumInput value={e.repsMin} onChange={(ev) => updW(i, (x) => { x.exercises[k].repsMin = parseNum(ev.target.value) ?? 0 })} />
                <NumInput value={e.repsMax} onChange={(ev) => updW(i, (x) => { x.exercises[k].repsMax = parseNum(ev.target.value) ?? 0 })} />
                <select value={e.unit} onChange={(ev) => updW(i, (x) => { x.exercises[k].unit = ev.target.value as 'reps' | 's' })}><option value="reps">reps</option><option value="s">seg</option></select>
                <span className="nowrap">
                  <button className="icon-btn" aria-label="Subir" disabled={k === 0} onClick={() => updW(i, (x) => { const [it] = x.exercises.splice(k, 1); x.exercises.splice(k - 1, 0, it) })}><ArrowUp size={13} /></button>
                  <button className="icon-btn" aria-label="Descer" disabled={k === w.exercises.length - 1} onClick={() => updW(i, (x) => { const [it] = x.exercises.splice(k, 1); x.exercises.splice(k + 1, 0, it) })}><ArrowDown size={13} /></button>
                  <button className="icon-btn danger" aria-label="Remover" onClick={() => updW(i, (x) => { x.exercises.splice(k, 1) })}><Trash2 size={13} /></button>
                </span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => updW(i, (x) => { x.exercises.push({ id: uid('e'), name: '', sets: 3, repsMin: 10, repsMax: 12, unit: 'reps' }) })}><Plus size={14} /> Exercício</button>
          </Card>
        ))}
      </div>
      <button className="btn" onClick={() => setWorkouts([...workouts, { id: uid('w'), name: 'Novo treino', exercises: [] }])}><Plus size={14} /> Novo treino</button>
      <SaveBar dirty={dirty} onSave={save} onReset={() => { setRoutine(structuredClone(store.settings.routine)); setWorkouts(structuredClone(store.settings.workouts)) }} />
    </>
  )
}

function ChecklistEditor() {
  const { store } = useApp()
  const { toast } = useFeedback()
  const [items, setItems] = useState<ChecklistItemDef[]>(() => structuredClone(store.settings.checklist))
  const [label, setLabel] = useState('')
  const dirty = JSON.stringify(items) !== JSON.stringify(store.settings.checklist)
  const AUTO_DESC: Record<string, string> = {
    allMealsLogged: 'marcado quando todas as refeições do dia tiverem registro',
    proteinMet: 'marcado quando a proteína registrada atingir a meta',
    waterMet: 'marcado quando a água registrada atingir a meta',
    workoutDone: 'marcado quando o treino for registrado como concluído ou adaptado',
    muayDone: 'marcado quando o Muay Thai for registrado como realizado ou adaptado',
    weightLogged: 'marcado quando houver peso registrado no dia',
  }
  return (
    <>
      <Card title="Itens do checklist diário" subtitle="Itens automáticos podem ser desmarcados manualmente no dia. Itens opcionais não contam no percentual.">
        <ul className="entries">
          {items.map((it, i) => (
            <li key={it.key}>
              <div className="grow">
                <input className="inline-input" value={it.label} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <span className="muted tiny">{it.auto ? `Automático: ${AUTO_DESC[it.auto]}` : 'Manual'}{it.appliesTo === 'workoutDay' ? ' · só em dias de musculação' : it.appliesTo === 'muayDay' ? ' · só em dias de Muay Thai' : ''}</span>
              </div>
              <div className="row-actions">
                <label className="check-inline small"><input type="checkbox" checked={!!it.optional} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, optional: e.target.checked } : x)))} /> opcional</label>
                <label className="check-inline small"><input type="checkbox" checked={it.enabled} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /> ativo</label>
                {it.key.startsWith('custom_') && <button className="icon-btn danger" aria-label="Remover" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
              </div>
            </li>
          ))}
        </ul>
        <div className="inline-form">
          <input placeholder="Novo item (ex.: Dormi 8 horas)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn btn-sm" disabled={!label.trim()} onClick={() => { setItems([...items, { key: 'custom_' + uid(), label: label.trim(), enabled: true }]); setLabel('') }}><Plus size={14} /> Adicionar</button>
        </div>
      </Card>
      <SaveBar dirty={dirty} onSave={async () => {
        if (items.some((x) => !x.label.trim())) return toast('Itens não podem ficar sem texto.', 'error')
        await saveSettings((s) => { s.checklist = items })
        toast('Checklist salvo')
      }} onReset={() => setItems(structuredClone(store.settings.checklist))} />
    </>
  )
}
