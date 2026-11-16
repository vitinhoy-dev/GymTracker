import { useMemo, useState } from 'react'
import { Search, Star, PenLine } from 'lucide-react'
import type { Food, ISODate, MealEntry, PlannedItem, Unit } from '../lib/types'
import { useApp } from '../lib/store'
import { db } from '../lib/db'
import { buildEntry } from '../lib/actions'
import { isFoodComplete, macrosFor, toGrams } from '../lib/nutrition'
import { fmtNum, norm, parseNum, uid } from '../lib/util'
import { Badge, Field, Modal, NumInput } from './ui'
import { useFeedback } from './feedback'

export function MacroLine({ kcal, protein, carbs, fat }: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }) {
  if (kcal == null && protein == null && carbs == null && fat == null) return <span className="warn-text small">sem dados nutricionais</span>
  return (
    <span className="macro-line small">
      <b>{kcal == null ? '— ' : fmtNum(kcal)} kcal</b>
      <span className="m-p">P {fmtNum(protein, 1)}</span>
      <span className="m-c">C {fmtNum(carbs, 1)}</span>
      <span className="m-f">G {fmtNum(fat, 1)}</span>
    </span>
  )
}

export function FoodPicker({ value, onChange, autoFocus }: { value: string | null; onChange: (id: string | null) => void; autoFocus?: boolean }) {
  const { foods } = useApp()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const n = norm(q)
    const f = n ? foods.filter((x) => n.split(' ').every((t) => x.nameKey.includes(t))) : foods
    return [...f].sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.nameKey.localeCompare(b.nameKey))
  }, [foods, q])
  return (
    <div className="food-picker">
      <div className="search">
        <Search size={16} />
        <input autoFocus={autoFocus} placeholder="Buscar alimento…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul>
        {list.map((f) => (
          <li key={f.id}>
            <button className={value === f.id ? 'selected' : ''} onClick={() => onChange(f.id)} type="button">
              <span>
                {f.favorite && <Star size={12} className="fav" />} {f.name}
              </span>
              {isFoodComplete(f) ? <span className="muted small">{fmtNum(f.kcal)} kcal/100{f.basis}</span> : <Badge tone="warn">sem dados</Badge>}
            </button>
          </li>
        ))}
        {!list.length && <li className="muted small pad">Nenhum alimento encontrado. Use "Sem cadastro" ou cadastre na base.</li>}
      </ul>
    </div>
  )
}

/** formulário de registro/edição de um item de refeição */
export function EntryModal({ date, slotId, entry, onClose, plannedItems }: {
  date: ISODate; slotId: string | null; entry?: MealEntry; onClose: () => void; plannedItems?: PlannedItem[]
}) {
  const { foods, store } = useApp()
  const { toast } = useFeedback()
  const [mode, setMode] = useState<'base' | 'manual'>(entry && !entry.foodId ? 'manual' : 'base')
  const [foodId, setFoodId] = useState<string | null>(entry?.foodId ?? null)
  const food = foods.find((f) => f.id === foodId)
  const [qty, setQty] = useState(entry ? String(entry.quantity) : '')
  const [unit, setUnit] = useState<Unit>(entry?.unit ?? 'g')
  const [unitGrams, setUnitGrams] = useState('')
  const [slot, setSlot] = useState<string | null>(entry ? entry.slotId : slotId)
  const [subst, setSubst] = useState(entry?.substituteFor ?? '')
  const [note, setNote] = useState(entry?.note ?? '')
  const [offPlan, setOffPlan] = useState(entry?.offPlan ?? slotId === null)
  const [manName, setManName] = useState(entry && !entry.foodId ? entry.name : '')
  const [man, setMan] = useState({
    kcal: entry && !entry.foodId && entry.kcal != null ? String(entry.kcal) : '',
    protein: entry && !entry.foodId && entry.protein != null ? String(entry.protein) : '',
    carbs: entry && !entry.foodId && entry.carbs != null ? String(entry.carbs) : '',
    fat: entry && !entry.foodId && entry.fat != null ? String(entry.fat) : '',
  })
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const q = parseNum(qty)
  const ug = parseNum(unitGrams)
  const effFood = food ? { ...food, unitGrams: food.unitGrams || ug || null } : undefined
  const grams = effFood && q != null ? toGrams(effFood, q, unit) : null
  const preview = effFood ? macrosFor(effFood, grams) : null
  const needsUnitGrams = mode === 'base' && unit === 'un' && !!food && !food.unitGrams

  const pickFood = (id: string | null) => {
    setFoodId(id)
    const f = foods.find((x) => x.id === id)
    if (f && !entry) setUnit(f.unitName ? 'un' : f.basis === 'ml' ? 'ml' : 'g')
  }

  const save = async () => {
    setErr(null)
    if (q == null || q <= 0) return setErr('Informe uma quantidade maior que zero.')
    if (q > 5000) return setErr('Quantidade muito alta. Confira o valor.')
    if (mode === 'base' && !food) return setErr('Selecione um alimento da base ou use "Sem cadastro".')
    if (mode === 'manual' && !manName.trim()) return setErr('Informe o nome do alimento.')
    if (needsUnitGrams && (ug == null || ug <= 0)) return setErr(`Informe o peso de 1 ${food?.unitName ?? 'unidade'} em gramas (do rótulo ou pesando).`)
    const manualVals = {
      kcal: parseNum(man.kcal), protein: parseNum(man.protein), carbs: parseNum(man.carbs), fat: parseNum(man.fat),
    }
    if (mode === 'manual' && Object.values(manualVals).some((v) => v != null && v < 0)) return setErr('Valores nutricionais não podem ser negativos.')
    setSaving(true)
    try {
      if (needsUnitGrams && food && ug) {
        await db.foods.update(food.id, { unitGrams: ug, updatedAt: Date.now() })
      }
      const built = buildEntry({
        date, slotId: slot, food: mode === 'base' ? effFood : undefined, name: manName.trim(), quantity: q, unit,
        manual: mode === 'manual' ? manualVals : undefined, offPlan: slot === null ? true : offPlan, substituteFor: subst, note,
      })
      if (entry) await db.meals.put({ ...built, id: entry.id, createdAt: entry.createdAt })
      else await db.meals.put(built)
      toast(entry ? 'Registro atualizado' : 'Alimento registrado')
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const units: { v: Unit; label: string }[] = [
    { v: 'g', label: 'gramas' }, { v: 'ml', label: 'ml' }, { v: 'un', label: food?.unitName ?? 'unidade' },
  ]

  return (
    <Modal title={entry ? 'Editar registro' : 'Registrar alimento'} onClose={onClose}>
      <div className="tabs-inline">
        <button className={mode === 'base' ? 'active' : ''} onClick={() => setMode('base')}>Escolher alimento</button>
        <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}><PenLine size={14} /> Digitar do rótulo</button>
      </div>
      {mode === 'base' ? (
        <>
          <FoodPicker value={foodId} onChange={pickFood} autoFocus={!entry} />
          {food && !isFoodComplete(food) && (
            <p className="warn-text small">Este alimento ainda não tem valores nutricionais. O registro será salvo, mas não entrará nos totais até você completar os dados do rótulo na base.</p>
          )}
        </>
      ) : (
        <div className="form-grid">
          <Field label="Nome do alimento"><input value={manName} onChange={(e) => setManName(e.target.value)} placeholder="Ex.: Iogurte natural" /></Field>
          <p className="muted small span-all">Informe os valores <b>da quantidade consumida</b>, conforme o rótulo. Deixe em branco o que não souber: nada será estimado.</p>
          <Field label="kcal"><NumInput value={man.kcal} onChange={(e) => setMan({ ...man, kcal: e.target.value })} /></Field>
          <Field label="Proteínas (g)"><NumInput value={man.protein} onChange={(e) => setMan({ ...man, protein: e.target.value })} /></Field>
          <Field label="Carboidratos (g)"><NumInput value={man.carbs} onChange={(e) => setMan({ ...man, carbs: e.target.value })} /></Field>
          <Field label="Gorduras (g)"><NumInput value={man.fat} onChange={(e) => setMan({ ...man, fat: e.target.value })} /></Field>
        </div>
      )}
      <div className="form-grid">
        <Field label="Quantidade">
          <NumInput value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" min={0} />
        </Field>
        <Field label="Unidade">
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
            {units.map((u) => <option key={u.v} value={u.v}>{u.label}</option>)}
          </select>
        </Field>
        {needsUnitGrams && (
          <Field label={`Peso de 1 ${food?.unitName ?? 'unidade'} (g)`} hint="Fica salvo no alimento para os próximos registros.">
            <NumInput value={unitGrams} onChange={(e) => setUnitGrams(e.target.value)} />
          </Field>
        )}
        <Field label="Refeição">
          <select value={slot ?? ''} onChange={(e) => setSlot(e.target.value || null)}>
            {store.settings.meals.map((m) => <option key={m.id} value={m.id}>{m.time} · {m.name}</option>)}
            <option value="">Fora do planejamento</option>
          </select>
        </Field>
      </div>
      <details className="more-fields">
        <summary className="muted small">Mais opções</summary>
        <div className="form-grid">
          {plannedItems && plannedItems.length > 0 && (
            <Field label="No lugar de (substituição)">
              <select value={subst} onChange={(e) => setSubst(e.target.value)}>
                <option value="">—</option>
                {plannedItems.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
              </select>
            </Field>
          )}
          {slot !== null && (
            <label className="check-inline">
              <input type="checkbox" checked={offPlan} onChange={(e) => setOffPlan(e.target.checked)} /> Fora do planejado
            </label>
          )}
          <Field label="Observação"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcional" /></Field>
        </div>
      </details>
      {mode === 'base' && food && (
        <div className="preview-box">
          <span className="muted small">{grams != null ? `${fmtNum(grams, 1)} ${food.basis}` : 'Quantidade em gramas indefinida'}</span>
          <MacroLine kcal={preview?.kcal ?? null} protein={preview?.protein ?? null} carbs={preview?.carbs ?? null} fat={preview?.fat ?? null} />
          <span className="muted tiny">Fonte: {food.source}</span>
        </div>
      )}
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  )
}

/** cadastro/edição de alimento na base, aceitando valores por 100 g ou por porção do rótulo */
export function FoodEditor({ food, onClose }: { food?: Food; onClose: () => void }) {
  const { toast, confirm } = useFeedback()
  const { foods } = useApp()
  const [name, setName] = useState(food?.name ?? '')
  const [source, setSource] = useState(food?.source ?? 'Rótulo')
  const [basis, setBasis] = useState<'g' | 'ml'>(food?.basis ?? 'g')
  const [mode, setMode] = useState<'100' | 'porcao'>('100')
  const [portion, setPortion] = useState('')
  const [vals, setVals] = useState({
    kcal: food?.kcal != null ? String(food.kcal) : '',
    protein: food?.protein != null ? String(food.protein) : '',
    carbs: food?.carbs != null ? String(food.carbs) : '',
    fat: food?.fat != null ? String(food.fat) : '',
  })
  const [unitName, setUnitName] = useState(food?.unitName ?? '')
  const [unitGrams, setUnitGrams] = useState(food?.unitGrams ? String(food.unitGrams) : '')
  const [notes, setNotes] = useState(food?.notes ?? '')
  const [fav, setFav] = useState(food?.favorite ?? false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setErr(null)
    if (!name.trim()) return setErr('Informe o nome.')
    const key = norm(name)
    if (foods.some((f) => f.nameKey === key && f.id !== food?.id)) return setErr('Já existe um alimento com esse nome.')
    let nums = { kcal: parseNum(vals.kcal), protein: parseNum(vals.protein), carbs: parseNum(vals.carbs), fat: parseNum(vals.fat) }
    if (Object.values(nums).some((v) => v != null && v < 0)) return setErr('Valores não podem ser negativos.')
    if (mode === 'porcao') {
      const p = parseNum(portion)
      if (!p || p <= 0) return setErr('Informe o tamanho da porção do rótulo.')
      const k = 100 / p
      const conv = (v: number | null) => (v == null ? null : Math.round(v * k * 100) / 100)
      nums = { kcal: conv(nums.kcal), protein: conv(nums.protein), carbs: conv(nums.carbs), fat: conv(nums.fat) }
    }
    if (nums.protein != null && nums.carbs != null && nums.fat != null && nums.protein + nums.carbs + nums.fat > 101) {
      return setErr('A soma de proteínas, carboidratos e gorduras passa de 100 g por 100 g. Confira os valores.')
    }
    const ug = parseNum(unitGrams)
    const now = Date.now()
    const next: Food = {
      id: food?.id ?? uid('f'), name: name.trim(), nameKey: key, source: source.trim() || 'Rótulo', ...nums, basis,
      unitName: unitName.trim() || undefined, unitGrams: ug && ug > 0 ? ug : null, favorite: fav, notes: notes.trim() || undefined,
      createdAt: food?.createdAt ?? now, updatedAt: now,
    }
    await db.foods.put(next)
    if (food && isFoodComplete(next)) {
      // registros antigos sem dados podem ser recalculados (só com confirmação)
      const pending = await db.meals.where('foodId').equals(food.id).filter((e) => e.kcal == null).toArray()
      if (pending.length && (await confirm({
        title: 'Recalcular registros sem dados?',
        text: `Existem ${pending.length} registro(s) deste alimento sem valores nutricionais. Deseja calcular com os novos valores?`,
        confirmLabel: 'Recalcular',
      }))) {
        for (const e of pending) {
          const m = macrosFor(next, e.grams ?? toGrams(next, e.quantity, e.unit))
          if (m) await db.meals.put({ ...e, grams: e.grams ?? toGrams(next, e.quantity, e.unit), ...m })
        }
      }
    }
    toast(food ? 'Alimento atualizado' : 'Alimento cadastrado')
    onClose()
  }

  return (
    <Modal title={food ? 'Editar alimento' : 'Novo alimento'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Fonte dos dados" hint="Ex.: Rótulo, TACO, nutricionista"><input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
        <Field label="Medido em">
          <select value={basis} onChange={(e) => setBasis(e.target.value as 'g' | 'ml')}><option value="g">gramas</option><option value="ml">mililitros</option></select>
        </Field>
        <Field label="Valores informados">
          <select value={mode} onChange={(e) => setMode(e.target.value as '100' | 'porcao')}>
            <option value="100">por 100 {basis}</option>
            <option value="porcao">por porção do rótulo</option>
          </select>
        </Field>
        {mode === 'porcao' && (
          <Field label={`Porção do rótulo (${basis})`} hint="Os valores serão convertidos para 100.">
            <NumInput value={portion} onChange={(e) => setPortion(e.target.value)} />
          </Field>
        )}
        <Field label="kcal"><NumInput value={vals.kcal} onChange={(e) => setVals({ ...vals, kcal: e.target.value })} /></Field>
        <Field label="Proteínas (g)"><NumInput value={vals.protein} onChange={(e) => setVals({ ...vals, protein: e.target.value })} /></Field>
        <Field label="Carboidratos (g)"><NumInput value={vals.carbs} onChange={(e) => setVals({ ...vals, carbs: e.target.value })} /></Field>
        <Field label="Gorduras (g)"><NumInput value={vals.fat} onChange={(e) => setVals({ ...vals, fat: e.target.value })} /></Field>
        <Field label="Nome da unidade" hint="Ex.: fatia, unidade, scoop"><input value={unitName} onChange={(e) => setUnitName(e.target.value)} /></Field>
        <Field label={`Peso de 1 unidade (${basis})`}><NumInput value={unitGrams} onChange={(e) => setUnitGrams(e.target.value)} /></Field>
        <Field label="Observações"><input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="check-inline"><input type="checkbox" checked={fav} onChange={(e) => setFav(e.target.checked)} /> Favorito</label>
      </div>
      <p className="muted small">Deixe em branco o que não souber. O app não estima valores ausentes.</p>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Salvar</button>
      </div>
    </Modal>
  )
}
