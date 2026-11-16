import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ClipboardCheck, Ban, RotateCcw, Star, BookmarkPlus, Utensils, Search, Database, Bookmark } from 'lucide-react'
import { useApp } from '../lib/store'
import { summarizeDay } from '../lib/day'
import { db, updateDayMeta } from '../lib/db'
import { buildEntry } from '../lib/actions'
import { isFoodComplete, macrosFor, sumEntries, toGrams } from '../lib/nutrition'
import type { CustomMeal, Food as FoodT, ISODate, MealEntry, MealSlot, PlannedItem, Unit } from '../lib/types'
import { fmtNum, norm, parseNum, uid } from '../lib/util'
import { Badge, Bar, Card, DateNav, Empty, Field, Modal, NumInput, PageHeader, Segmented } from '../components/ui'
import { EntryModal, FoodEditor, MacroLine, FoodPicker } from '../components/FoodForms'
import { useFeedback } from '../components/feedback'

type Tab = 'diario' | 'base' | 'salvas'

export function planText(items: PlannedItem[], foods: FoodT[]) {
  return items
    .map((it) => {
      if (!it.amount) return it.name
      const amt = it.amountMax ? `${fmtNum(it.amount)}–${fmtNum(it.amountMax)}` : fmtNum(it.amount)
      if (it.unit !== 'un') return `${amt} ${it.unit} ${it.name}`
      const unitName = foods.find((f) => f.id === it.foodId)?.unitName
      const plural = (it.amountMax ?? it.amount) > 1
      return unitName && unitName !== 'unidade' ? `${amt} ${unitName}${plural ? 's' : ''} de ${it.name}` : `${amt} ${it.name}`
    })
    .join(' + ')
}

export default function Food() {
  const [tab, setTab] = useState<Tab>('diario')
  return (
    <div className="page">
      <PageHeader title="Alimentação" subtitle="Registre o que você realmente comeu. As metas são estimativas iniciais e podem ser ajustadas em Configurações.">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'diario', label: <><Utensils size={14} /> Diário</> },
          { value: 'base', label: <><Database size={14} /> Base de alimentos</> },
          { value: 'salvas', label: <><Bookmark size={14} /> Refeições salvas</> },
        ]} />
      </PageHeader>
      {tab === 'diario' && <Diary />}
      {tab === 'base' && <FoodBase />}
      {tab === 'salvas' && <SavedMeals />}
    </div>
  )
}

function Diary() {
  const { store, date, setDate, today, foods, customMeals } = useApp()
  const { toast, confirm } = useFeedback()
  const s = store.settings
  const g = s.goals
  const day = summarizeDay(store, date)
  const [modal, setModal] = useState<{ slotId: string | null; entry?: MealEntry; planned?: PlannedItem[] } | null>(null)
  const [planSlot, setPlanSlot] = useState<MealSlot | null>(null)
  const [savedFor, setSavedFor] = useState<string | null | undefined>(undefined)
  const [saveAs, setSaveAs] = useState<MealEntry[] | null>(null)

  const activeIds = new Set(day.plan.activeSlots.map((m) => m.id))
  const inactive = s.meals.filter((m) => !activeIds.has(m.id)).sort((a, b) => a.time.localeCompare(b.time))
  const knownIds = new Set(s.meals.map((m) => m.id))
  const extras = day.entries.filter((e) => !e.slotId || !knownIds.has(e.slotId))

  const del = async (e: MealEntry) => {
    if (!(await confirm({ title: 'Excluir registro?', text: `Remover "${e.name}" deste dia?`, confirmLabel: 'Excluir', danger: true }))) return
    await db.meals.delete(e.id)
    toast('Registro excluído')
  }

  const skip = async (slot: MealSlot, skipped: boolean) => {
    await updateDayMeta(date, (d) => {
      d.skippedSlots = skipped ? [...new Set([...d.skippedSlots, slot.id])] : d.skippedSlots.filter((x) => x !== slot.id)
    })
    toast(skipped ? `${slot.name} marcada como não realizada hoje` : `${slot.name} voltou a ficar pendente`, 'info')
  }

  const renderSlot = (m: MealSlot, active: boolean) => {
    const entries = day.entries.filter((e) => e.slotId === m.id)
    const st = day.slotState[m.id]
    const t = day.bySlot[m.id]
    return (
      <Card key={m.id} className={`slot slot-${active ? st : 'inactive'}`}
        title={<>{m.name} {active ? <Badge tone={st === 'registrada' ? 'ok' : st === 'dispensada' ? 'muted' : 'warn'}>{st}</Badge> : <Badge tone="muted">não programada hoje</Badge>}</>}
        subtitle={<>{m.time}{m.timeEnd ? `–${m.timeEnd}` : ''} · Plano: {planText(m.plan, foods) || '—'}</>}
        action={entries.length > 0 && <MacroLine kcal={t.kcal} protein={t.protein} carbs={t.carbs} fat={t.fat} />}
      >
        {entries.length > 0 && (
          <ul className="entries">
            {entries.map((e) => <EntryRow key={e.id} e={e} onEdit={() => setModal({ slotId: m.id, entry: e, planned: m.plan })} onDelete={() => del(e)} />)}
          </ul>
        )}
        <div className="slot-actions">
          <button className="btn btn-sm btn-primary" onClick={() => setModal({ slotId: m.id, planned: m.plan })}><Plus size={14} /> Alimento</button>
          {m.plan.length > 0 && <button className="btn btn-sm" onClick={() => setPlanSlot(m)}><ClipboardCheck size={14} /> Registrar como planejado</button>}
          {customMeals.length > 0 && <button className="btn btn-sm" onClick={() => setSavedFor(m.id)}><Bookmark size={14} /> Refeição salva</button>}
          {entries.length > 0 && <button className="btn btn-sm btn-ghost" onClick={() => setSaveAs(entries)}><BookmarkPlus size={14} /> Salvar como refeição</button>}
          {active && st === 'pendente' && <button className="btn btn-sm btn-ghost" onClick={() => skip(m, true)}><Ban size={14} /> Não fiz esta refeição</button>}
          {active && st === 'dispensada' && <button className="btn btn-sm btn-ghost" onClick={() => skip(m, false)}><RotateCcw size={14} /> Desfazer</button>}
        </div>
      </Card>
    )
  }

  return (
    <>
      <DateNav date={date} setDate={setDate} today={today} />
      <Card className="totals-card">
        <div className="totals">
          <Bar label="Calorias" value={day.totals.kcal} goal={g.kcal} unit="kcal" />
          <Bar label="Proteínas" value={day.totals.protein} goal={g.proteinG} unit="g" color="var(--c-protein)" />
          <Bar label="Carboidratos" value={day.totals.carbs} goal={g.carbsG} unit="g" color="var(--c-carbs)" />
          <Bar label="Gorduras" value={day.totals.fat} goal={g.fatG} unit="g" color="var(--c-fat)" />
        </div>
        <p className="muted small">
          {day.pendingSlots.length ? `Pendentes: ${day.pendingSlots.map((x) => x.name).join(', ')}.` : day.entries.length ? 'Todas as refeições programadas foram registradas ou marcadas.' : ''}
          {day.totals.missing > 0 && <span className="warn-text"> {day.totals.missing} item(ns) com dados nutricionais incompletos: só os valores informados entram nos totais.</span>}
        </p>
      </Card>

      <div className="slots">
        {day.plan.activeSlots.map((m) => renderSlot(m, true))}
        <Card title={<>Fora do planejamento {extras.length > 0 && <Badge tone="info">{extras.length}</Badge>}</>} subtitle="Lanches extras, beliscos e qualquer item não planejado"
          action={extras.length > 0 && (() => { const t = sumEntries(extras); return <MacroLine kcal={t.kcal} protein={t.protein} carbs={t.carbs} fat={t.fat} /> })()}>
          {extras.length > 0 && (
            <ul className="entries">
              {extras.map((e) => <EntryRow key={e.id} e={e} onEdit={() => setModal({ slotId: null, entry: e })} onDelete={() => del(e)} />)}
            </ul>
          )}
          <div className="slot-actions">
            <button className="btn btn-sm" onClick={() => setModal({ slotId: null })}><Plus size={14} /> Registrar item extra</button>
            {customMeals.length > 0 && <button className="btn btn-sm" onClick={() => setSavedFor(null)}><Bookmark size={14} /> Refeição salva</button>}
          </div>
        </Card>
        {inactive.length > 0 && (
          <details className="inactive-slots">
            <summary className="muted">Refeições não programadas para este dia ({inactive.length})</summary>
            {inactive.map((m) => renderSlot(m, false))}
          </details>
        )}
      </div>

      {modal && <EntryModal date={date} slotId={modal.slotId} entry={modal.entry} plannedItems={modal.planned} onClose={() => setModal(null)} />}
      {planSlot && <PlanModal date={date} slot={planSlot} onClose={() => setPlanSlot(null)} />}
      {savedFor !== undefined && <ApplySavedModal date={date} slotId={savedFor} onClose={() => setSavedFor(undefined)} />}
      {saveAs && <SaveAsModal entries={saveAs} onClose={() => setSaveAs(null)} />}
    </>
  )
}

function EntryRow({ e, onEdit, onDelete }: { e: MealEntry; onEdit: () => void; onDelete: () => void }) {
  return (
    <li>
      <div>
        <strong>{e.name}</strong>
        <span className="muted small">
          {' '}{fmtNum(e.quantity, 1)} {e.unit === 'un' ? 'un' : e.unit}{e.unit === 'un' && e.grams != null ? ` (${fmtNum(e.grams)} g)` : ''}
          {e.substituteFor && ` · substitui ${e.substituteFor}`}
          {e.offPlan && e.slotId && ' · fora do planejado'}
          {e.note && ` · ${e.note}`}
        </span>
      </div>
      <div className="row-actions">
        <MacroLine kcal={e.kcal} protein={e.protein} carbs={e.carbs} fat={e.fat} />
        <button className="icon-btn" onClick={onEdit} aria-label="Editar"><Pencil size={15} /></button>
        <button className="icon-btn danger" onClick={onDelete} aria-label="Excluir"><Trash2 size={15} /></button>
      </div>
    </li>
  )
}

/** revisar e registrar os itens planejados de uma refeição */
function PlanModal({ date, slot, onClose }: { date: ISODate; slot: MealSlot; onClose: () => void }) {
  const { foods } = useApp()
  const { toast } = useFeedback()
  const [rows, setRows] = useState(() =>
    slot.plan.map((it) => ({
      include: it.amount > 0 || !!it.foodId,
      foodId: it.foodId ?? '',
      name: it.name,
      qty: it.amount ? String(it.amount) : '',
      unit: it.unit,
      unitGrams: '',
    })),
  )
  const [err, setErr] = useState<string | null>(null)
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    setErr(null)
    const toSave = rows.filter((r) => r.include)
    if (!toSave.length) return setErr('Selecione ao menos um item.')
    for (const r of toSave) {
      const q = parseNum(r.qty)
      if (!r.foodId) return setErr(`Escolha um alimento da base para "${r.name}" ou desmarque o item.`)
      if (q == null || q <= 0) return setErr(`Informe a quantidade de "${r.name}".`)
      const f = foods.find((x) => x.id === r.foodId)
      if (r.unit === 'un' && f && !f.unitGrams && !(parseNum(r.unitGrams) ?? 0)) return setErr(`Informe o peso de 1 ${f.unitName ?? 'unidade'} de "${f.name}".`)
    }
    const entries: MealEntry[] = []
    for (const r of toSave) {
      let f = foods.find((x) => x.id === r.foodId)!
      const ug = parseNum(r.unitGrams)
      if (r.unit === 'un' && !f.unitGrams && ug) {
        await db.foods.update(f.id, { unitGrams: ug, updatedAt: Date.now() })
        f = { ...f, unitGrams: ug }
      }
      entries.push(buildEntry({ date, slotId: slot.id, food: f, quantity: parseNum(r.qty)!, unit: r.unit, offPlan: false }))
    }
    await db.meals.bulkPut(entries.map((e, i) => ({ ...e, createdAt: e.createdAt + i })))
    toast(`${entries.length} item(ns) registrados em ${slot.name}`)
    onClose()
  }

  return (
    <Modal title={`Registrar ${slot.name}`} onClose={onClose}>
      <p className="muted small">Confira as quantidades que você realmente comeu. Itens desmarcados não são registrados.</p>
      <div className="plan-rows">
        {rows.map((r, i) => {
          const f = foods.find((x) => x.id === r.foodId)
          const q = parseNum(r.qty)
          const eff = f ? { ...f, unitGrams: f.unitGrams || parseNum(r.unitGrams) || null } : undefined
          const m = eff && q != null ? macrosFor(eff, toGrams(eff, q, r.unit)) : null
          return (
            <div key={i} className={`plan-row ${r.include ? '' : 'off'}`}>
              <label className="check-inline"><input type="checkbox" checked={r.include} onChange={(e) => upd(i, { include: e.target.checked })} /> <b>{r.name}</b></label>
              <select value={r.foodId} onChange={(e) => upd(i, { foodId: e.target.value })}>
                <option value="">Escolher alimento…</option>
                {foods.map((x) => <option key={x.id} value={x.id}>{x.name}{isFoodComplete(x) ? '' : ' (sem dados)'}</option>)}
              </select>
              <div className="plan-qty">
                <NumInput value={r.qty} onChange={(e) => upd(i, { qty: e.target.value })} placeholder="qtd" />
                <select value={r.unit} onChange={(e) => upd(i, { unit: e.target.value as Unit })}>
                  <option value="g">g</option><option value="ml">ml</option><option value="un">{f?.unitName ?? 'un'}</option>
                </select>
                {r.unit === 'un' && f && !f.unitGrams && (
                  <NumInput value={r.unitGrams} onChange={(e) => upd(i, { unitGrams: e.target.value })} placeholder={`g por ${f.unitName ?? 'un'}`} />
                )}
              </div>
              <MacroLine kcal={m?.kcal ?? null} protein={m?.protein ?? null} carbs={m?.carbs ?? null} fat={m?.fat ?? null} />
            </div>
          )
        })}
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Registrar</button>
      </div>
    </Modal>
  )
}

function ApplySavedModal({ date, slotId, onClose }: { date: ISODate; slotId: string | null; onClose: () => void }) {
  const { customMeals, foods } = useApp()
  const { toast } = useFeedback()
  const apply = async (cm: CustomMeal) => {
    const entries = cm.items.map((it, i) => {
      const f = foods.find((x) => x.id === it.foodId)
      const e = buildEntry({ date, slotId, food: f, name: it.name, quantity: it.quantity, unit: it.unit, offPlan: slotId === null })
      return { ...e, createdAt: e.createdAt + i }
    })
    await db.meals.bulkPut(entries)
    toast(`"${cm.name}" registrada (${entries.length} itens)`)
    onClose()
  }
  return (
    <Modal title="Usar refeição salva" onClose={onClose} small>
      <ul className="pick-list">
        {[...customMeals].sort((a, b) => Number(b.favorite) - Number(a.favorite)).map((cm) => (
          <li key={cm.id}>
            <button onClick={() => apply(cm)}>
              <span>{cm.favorite && <Star size={12} className="fav" />} {cm.name}</span>
              <span className="muted small">{cm.items.map((i) => `${fmtNum(i.quantity)} ${i.unit} ${i.name}`).join(' + ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function SaveAsModal({ entries, onClose }: { entries: MealEntry[]; onClose: () => void }) {
  const { toast } = useFeedback()
  const [name, setName] = useState('')
  const save = async () => {
    if (!name.trim()) return
    await db.customMeals.put({
      id: uid('cm'), name: name.trim(), favorite: true, createdAt: Date.now(),
      items: entries.map((e) => ({ foodId: e.foodId, name: e.name, quantity: e.quantity, unit: e.unit })),
    })
    toast('Refeição salva')
    onClose()
  }
  return (
    <Modal title="Salvar como refeição personalizada" onClose={onClose} small>
      <Field label="Nome"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Café com whey" /></Field>
      <p className="muted small">{entries.map((e) => e.name).join(' + ')}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Salvar</button>
      </div>
    </Modal>
  )
}

function FoodBase() {
  const { foods } = useApp()
  const { toast, confirm } = useFeedback()
  const [q, setQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState<FoodT | null | undefined>(undefined)
  const list = useMemo(() => {
    const n = norm(q)
    return foods.filter((f) => (!n || n.split(' ').every((t) => f.nameKey.includes(t))) && (!onlyFav || f.favorite) && (!onlyMissing || !isFoodComplete(f)))
  }, [foods, q, onlyFav, onlyMissing])
  const missing = foods.filter((f) => !isFoodComplete(f)).length

  const remove = async (f: FoodT) => {
    const used = await db.meals.where('foodId').equals(f.id).count()
    if (!(await confirm({
      title: 'Excluir alimento?',
      text: used ? `"${f.name}" aparece em ${used} registro(s). Os registros antigos serão mantidos com os valores já calculados.` : `Excluir "${f.name}" da base?`,
      danger: true, confirmLabel: 'Excluir',
    }))) return
    await db.foods.delete(f.id)
    toast('Alimento excluído')
  }

  return (
    <>
      <Card>
        <div className="toolbar">
          <div className="search grow"><Search size={16} /><input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="check-inline"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} /> Favoritos</label>
          <label className="check-inline"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Sem dados ({missing})</label>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}><Plus size={14} /> Novo alimento</button>
        </div>
        {missing > 0 && <p className="warn-text small">{missing} alimento(s) precisam dos dados do rótulo (ex.: whey e farinha de aveia variam por marca).</p>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th></th><th>Alimento</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Base</th><th>Unidade</th><th>Fonte</th><th></th></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td><button className={`icon-btn ${f.favorite ? 'fav' : ''}`} aria-label="Favorito" onClick={() => db.foods.update(f.id, { favorite: !f.favorite })}><Star size={15} fill={f.favorite ? 'currentColor' : 'none'} /></button></td>
                  <td>{f.name} {!isFoodComplete(f) && <Badge tone="warn">sem dados</Badge>}</td>
                  <td>{fmtNum(f.kcal, 1)}</td><td>{fmtNum(f.protein, 1)}</td><td>{fmtNum(f.carbs, 1)}</td><td>{fmtNum(f.fat, 1)}</td>
                  <td className="muted small">100 {f.basis}</td>
                  <td className="muted small">{f.unitName ? `${f.unitName}${f.unitGrams ? ` = ${fmtNum(f.unitGrams)} ${f.basis}` : ' (peso não informado)'}` : '—'}</td>
                  <td className="muted small">{f.source}</td>
                  <td className="nowrap">
                    <button className="icon-btn" onClick={() => setEditing(f)} aria-label="Editar"><Pencil size={15} /></button>
                    <button className="icon-btn danger" onClick={() => remove(f)} aria-label="Excluir"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted tiny">Valores iniciais marcados como TACO foram transcritos da Tabela Brasileira de Composição de Alimentos (NEPA/UNICAMP, 4ª ed.) por 100 g. Confira e ajuste se usar outra referência ou se o rótulo do seu produto for diferente.</p>
      </Card>
      {editing !== undefined && <FoodEditor food={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </>
  )
}

function SavedMeals() {
  const { customMeals, foods } = useApp()
  const { toast, confirm } = useFeedback()
  const [editing, setEditing] = useState<CustomMeal | null | undefined>(undefined)
  return (
    <>
      <Card title="Refeições personalizadas" subtitle="Combinações salvas para registrar com um clique"
        action={<button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}><Plus size={14} /> Nova</button>}>
        {customMeals.length === 0 ? (
          <Empty icon={<Bookmark size={28} />} title="Nenhuma refeição salva" text='Crie aqui ou use "Salvar como refeição" em uma refeição registrada.' />
        ) : (
          <ul className="entries">
            {customMeals.map((cm) => {
              const t = sumEntries(cm.items.map((it) => {
                const f = foods.find((x) => x.id === it.foodId)
                const m = f ? macrosFor(f, toGrams(f, it.quantity, it.unit)) : null
                return { kcal: m?.kcal ?? null, protein: m?.protein ?? null, carbs: m?.carbs ?? null, fat: m?.fat ?? null }
              }))
              return (
                <li key={cm.id}>
                  <div>
                    <strong>{cm.favorite && <Star size={12} className="fav" />} {cm.name}</strong>
                    <span className="muted small"> {cm.items.map((i) => `${fmtNum(i.quantity)} ${i.unit} ${i.name}`).join(' + ')}</span>
                  </div>
                  <div className="row-actions">
                    {t.missing ? <span className="warn-text small">{t.missing} item(ns) sem dados</span> : <MacroLine kcal={t.kcal} protein={t.protein} carbs={t.carbs} fat={t.fat} />}
                    <button className="icon-btn" onClick={() => setEditing(cm)} aria-label="Editar"><Pencil size={15} /></button>
                    <button className="icon-btn danger" aria-label="Excluir" onClick={async () => {
                      if (await confirm({ title: 'Excluir refeição salva?', text: `"${cm.name}" será removida (registros já feitos não mudam).`, danger: true, confirmLabel: 'Excluir' })) {
                        await db.customMeals.delete(cm.id)
                        toast('Refeição removida')
                      }
                    }}><Trash2 size={15} /></button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {editing !== undefined && <CustomMealEditor meal={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </>
  )
}

function CustomMealEditor({ meal, onClose }: { meal?: CustomMeal; onClose: () => void }) {
  const { foods } = useApp()
  const { toast } = useFeedback()
  const [name, setName] = useState(meal?.name ?? '')
  const [fav, setFav] = useState(meal?.favorite ?? true)
  const [items, setItems] = useState(meal?.items ?? [])
  const [pick, setPick] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<Unit>('g')
  const [err, setErr] = useState<string | null>(null)
  const add = () => {
    const f = foods.find((x) => x.id === pick)
    const q = parseNum(qty)
    if (!f || !q || q <= 0) return setErr('Escolha o alimento e a quantidade.')
    if (unit === 'un' && !f.unitGrams) return setErr(`Defina o peso de 1 ${f.unitName ?? 'unidade'} de "${f.name}" na base de alimentos ou use gramas.`)
    setErr(null)
    setItems([...items, { foodId: f.id, name: f.name, quantity: q, unit }])
    setQty('')
  }
  const save = async () => {
    if (!name.trim() || !items.length) return setErr('Informe o nome e ao menos um item.')
    await db.customMeals.put({ id: meal?.id ?? uid('cm'), name: name.trim(), favorite: fav, items, createdAt: meal?.createdAt ?? Date.now() })
    toast('Refeição salva')
    onClose()
  }
  return (
    <Modal title={meal ? 'Editar refeição salva' : 'Nova refeição salva'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <label className="check-inline"><input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} /> Favorita</label>
      </div>
      <ul className="entries">
        {items.map((it, i) => (
          <li key={i}>
            <span>{fmtNum(it.quantity)} {it.unit} {it.name}</span>
            <button className="icon-btn danger" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>
      <FoodPicker value={pick} onChange={(id) => { setPick(id); const f = foods.find((x) => x.id === id); setUnit(f?.unitName && f.unitGrams ? 'un' : 'g') }} />
      <div className="form-grid">
        <Field label="Quantidade"><NumInput value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Unidade">
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}><option value="g">g</option><option value="ml">ml</option><option value="un">unidade</option></select>
        </Field>
        <button className="btn" onClick={add}><Plus size={14} /> Adicionar item</button>
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Salvar</button>
      </div>
    </Modal>
  )
}
