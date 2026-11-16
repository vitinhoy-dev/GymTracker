import { useEffect, useMemo, useState } from 'react'
import { Scale as ScaleIcon, Ruler, Camera, Plus, Trash2, Pencil, Image as ImageIcon, BarChart3 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../lib/store'
import { projectDates, summarizeDay } from '../lib/day'
import { db } from '../lib/db'
import { fmtBR } from '../lib/dates'
import { fmtNum, parseNum, uid } from '../lib/util'
import type { BodyLog, ISODate, Photo } from '../lib/types'
import { Card, Empty, Field, Modal, NumInput, PageHeader } from '../components/ui'
import { BarChart, LineChart } from '../components/charts'
import { useFeedback } from '../components/feedback'

const DEFAULT_MEASURES = ['Peito', 'Braço', 'Coxa', 'Quadril']
const COLORS = ['var(--accent)', 'var(--c-water)', 'var(--c-carbs)', 'var(--c-fat)', 'var(--c-protein)', '#c084fc']

export default function Progress() {
  const { store, today } = useApp()
  const s = store.settings
  const [editing, setEditing] = useState<BodyLog | null | undefined>(undefined)
  const { toast, confirm } = useFeedback()
  const dates = projectDates(s)
  const logs = [...store.body].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)

  // um ponto por dia: último registro do dia
  const lastOfDay = (pick: (b: BodyLog) => number | null) => {
    const m = new Map<ISODate, number>()
    for (const b of logs) {
      const v = pick(b)
      if (v != null) m.set(b.date, v)
    }
    return [...m.entries()].map(([x, y]) => ({ x, y }))
  }
  const weight = lastOfDay((b) => b.weightKg)
  const waist = lastOfDay((b) => b.waistCm)
  const measureKeys = [...new Set(logs.flatMap((b) => Object.keys(b.measures)))]
  const measureSeries = [
    ...(waist.length ? [{ name: 'Cintura/abdômen', color: COLORS[0], points: waist }] : []),
    ...measureKeys.map((k, i) => ({ name: k, color: COLORS[(i + 1) % COLORS.length], points: lastOfDay((b) => b.measures[k] ?? null) })),
  ].filter((x) => x.points.length)
  const bodyFat = lastOfDay((b) => b.bodyFatPct)

  const domainFor = (pts: { x: ISODate }[]) => {
    const extra = pts.map((p) => p.x).filter((d) => !dates.includes(d))
    return [...new Set([...dates, ...extra])].sort()
  }

  // consistência: quantas categorias foram registradas por dia (alimentação, água, treino/muay, peso/medidas, checklist)
  const consistency = dates.map((d) => {
    if (d > today) return { x: d, y: null }
    const day = summarizeDay(store, d)
    const n = [
      day.entries.length > 0,
      day.waterEntries.length > 0,
      day.sessions.length > 0 || day.muaySessions.length > 0,
      day.bodyLogs.length > 0,
      Object.keys(day.meta?.checklist ?? {}).length > 0 || day.checklist.some((c) => c.source === 'auto'),
    ].filter(Boolean).length
    return { x: d, y: n, tone: (n >= 4 ? 'ok' : 'muted') as 'ok' | 'muted' }
  })

  const first = logs[0]
  const last = logs[logs.length - 1]
  const firstW = weight[0]
  const lastW = weight[weight.length - 1]

  const remove = async (b: BodyLog) => {
    if (!(await confirm({ title: 'Excluir registro?', text: `Remover o registro de ${fmtBR(b.date)}?`, danger: true, confirmLabel: 'Excluir' }))) return
    await db.body.delete(b.id)
    toast('Registro excluído')
  }

  return (
    <div className="page">
      <PageHeader title="Evolução física" subtitle="Peso, medidas, fotos e observações. Percentual de gordura só aparece se você informar uma medição.">
        <button className="btn btn-primary" onClick={() => setEditing(null)}><Plus size={16} /> Novo registro</button>
      </PageHeader>

      <div className="grid stats-grid">
        <div className="stat"><div className="stat-label"><ScaleIcon size={15} />Peso inicial (perfil)</div><div className="stat-value">{fmtNum(s.profile.startWeightKg, 1)} kg</div></div>
        <div className="stat"><div className="stat-label">Primeiro registro</div><div className="stat-value">{firstW ? `${fmtNum(firstW.y, 1)} kg` : '—'}</div><div className="muted small">{firstW ? fmtBR(firstW.x) : 'sem registro'}</div></div>
        <div className="stat"><div className="stat-label">Último registro</div><div className="stat-value">{lastW ? `${fmtNum(lastW.y, 1)} kg` : '—'}</div><div className="muted small">{lastW ? fmtBR(lastW.x) : 'sem registro'}</div></div>
        <div className="stat"><div className="stat-label">Variação desde o peso inicial</div><div className="stat-value">{lastW ? `${lastW.y - s.profile.startWeightKg >= 0 ? '+' : ''}${fmtNum(lastW.y - s.profile.startWeightKg, 1)} kg` : '—'}</div></div>
      </div>

      <div className="grid two">
        <Card title="Evolução do peso" icon={<ScaleIcon size={18} />}>
          {weight.length ? <LineChart series={[{ name: 'Peso', color: 'var(--accent)', points: weight }]} domain={domainFor(weight)} unit="kg" goal={s.profile.targetWeightKg} />
            : <Empty icon={<ScaleIcon size={26} />} title="Nenhum peso registrado" text='Use "Novo registro" para começar.' />}
        </Card>
        <Card title="Evolução das medidas" icon={<Ruler size={18} />}>
          {measureSeries.length ? <LineChart series={measureSeries} domain={domainFor(measureSeries.flatMap((m) => m.points))} unit="cm" />
            : <Empty icon={<Ruler size={26} />} title="Nenhuma medida registrada" />}
        </Card>
        <Card title="Consistência dos registros" icon={<BarChart3 size={18} />} subtitle="Categorias registradas por dia (alimentação, água, treino, corpo, checklist)">
          <BarChart data={consistency} goal={5} unit="de 5" />
        </Card>
        <Card title="Início × fim" subtitle="Comparação entre o primeiro e o último registro">
          {first && last && first.id !== last.id ? (
            <CompareTable first={first} last={last} keys={measureKeys} />
          ) : (
            <Empty title="Registros insuficientes" text="A comparação aparece quando houver pelo menos dois registros." />
          )}
          {bodyFat.length > 0 && <p className="small">% de gordura medido: {bodyFat.map((b) => `${fmtBR(b.x)}: ${fmtNum(b.y, 1)}%`).join(' · ')}</p>}
        </Card>
      </div>

      <Card title="Registros" icon={<Ruler size={18} />}>
        {!logs.length ? <Empty title="Nenhum registro ainda" /> : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>Data</th><th>Peso</th><th>Cintura</th>{measureKeys.map((k) => <th key={k}>{k}</th>)}<th>% gordura</th><th>Observações</th><th></th></tr></thead>
              <tbody>
                {[...logs].reverse().map((b) => (
                  <tr key={b.id}>
                    <td>{fmtBR(b.date)}</td>
                    <td>{b.weightKg != null ? `${fmtNum(b.weightKg, 1)} kg` : '—'}</td>
                    <td>{b.waistCm != null ? `${fmtNum(b.waistCm, 1)} cm` : '—'}</td>
                    {measureKeys.map((k) => <td key={k}>{b.measures[k] != null ? fmtNum(b.measures[k], 1) : '—'}</td>)}
                    <td>{b.bodyFatPct != null ? `${fmtNum(b.bodyFatPct, 1)}%` : '—'}</td>
                    <td className="muted small">{b.notes}</td>
                    <td className="nowrap">
                      <button className="icon-btn" aria-label="Editar" onClick={() => setEditing(b)}><Pencil size={15} /></button>
                      <button className="icon-btn danger" aria-label="Excluir" onClick={() => remove(b)}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Photos />
      {editing !== undefined && <BodyForm log={editing ?? undefined} measureKeys={[...new Set([...DEFAULT_MEASURES, ...measureKeys])]} onClose={() => setEditing(undefined)} />}
    </div>
  )
}

function CompareTable({ first, last, keys }: { first: BodyLog; last: BodyLog; keys: string[] }) {
  const row = (label: string, a: number | null | undefined, b: number | null | undefined, unit: string) => (
    <tr key={label}>
      <td>{label}</td>
      <td>{a != null ? `${fmtNum(a, 1)} ${unit}` : '—'}</td>
      <td>{b != null ? `${fmtNum(b, 1)} ${unit}` : '—'}</td>
      <td>{a != null && b != null ? `${b - a >= 0 ? '+' : ''}${fmtNum(b - a, 1)} ${unit}` : '—'}</td>
    </tr>
  )
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead><tr><th></th><th>{fmtBR(first.date)}</th><th>{fmtBR(last.date)}</th><th>Diferença</th></tr></thead>
        <tbody>
          {row('Peso', first.weightKg, last.weightKg, 'kg')}
          {row('Cintura/abdômen', first.waistCm, last.waistCm, 'cm')}
          {keys.map((k) => row(k, first.measures[k], last.measures[k], 'cm'))}
          {(first.bodyFatPct != null || last.bodyFatPct != null) && row('% gordura (medido)', first.bodyFatPct, last.bodyFatPct, '%')}
        </tbody>
      </table>
    </div>
  )
}

function BodyForm({ log, measureKeys, onClose }: { log?: BodyLog; measureKeys: string[]; onClose: () => void }) {
  const { date } = useApp()
  const { toast } = useFeedback()
  const [d, setD] = useState(log?.date ?? date)
  const [weight, setWeight] = useState(log?.weightKg != null ? String(log.weightKg) : '')
  const [waist, setWaist] = useState(log?.waistCm != null ? String(log.waistCm) : '')
  const [keys, setKeys] = useState(measureKeys)
  const [measures, setMeasures] = useState<Record<string, string>>(Object.fromEntries(Object.entries(log?.measures ?? {}).map(([k, v]) => [k, String(v)])))
  const [newKey, setNewKey] = useState('')
  const [bf, setBf] = useState(log?.bodyFatPct != null ? String(log.bodyFatPct) : '')
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setErr(null)
    if (!d) return setErr('Informe a data.')
    const w = parseNum(weight), wa = parseNum(waist), b = parseNum(bf)
    if (w != null && (w < 30 || w > 250)) return setErr('Peso fora do intervalo (30–250 kg).')
    if (wa != null && (wa < 40 || wa > 200)) return setErr('Cintura fora do intervalo (40–200 cm).')
    if (b != null && (b < 2 || b > 60)) return setErr('% de gordura fora do intervalo (2–60%).')
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(measures)) {
      const n = parseNum(v)
      if (n != null) {
        if (n <= 0 || n > 250) return setErr(`Medida "${k}" inválida.`)
        m[k] = n
      }
    }
    if (w == null && wa == null && !Object.keys(m).length && b == null && !notes.trim()) return setErr('Preencha pelo menos um campo.')
    await db.body.put({ id: log?.id ?? uid('b'), date: d, weightKg: w, waistCm: wa, measures: m, bodyFatPct: b, notes: notes.trim(), createdAt: log?.createdAt ?? Date.now() })
    toast('Registro salvo')
    onClose()
  }

  return (
    <Modal title={log ? 'Editar registro corporal' : 'Novo registro corporal'} onClose={onClose}>
      <div className="form-grid">
        <Field label="Data"><input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        <Field label="Peso (kg)"><NumInput value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus /></Field>
        <Field label="Circunferência abdominal (cm)"><NumInput value={waist} onChange={(e) => setWaist(e.target.value)} /></Field>
        {keys.map((k) => (
          <Field key={k} label={`${k} (cm)`}><NumInput value={measures[k] ?? ''} onChange={(e) => setMeasures({ ...measures, [k]: e.target.value })} /></Field>
        ))}
        <div className="inline-form">
          <input placeholder="Outra medida (ex.: Panturrilha)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <button className="btn btn-sm" onClick={() => { const k = newKey.trim(); if (k && !keys.includes(k)) setKeys([...keys, k]); setNewKey('') }}><Plus size={14} /></button>
        </div>
        <Field label="% de gordura (opcional)" hint="Somente se você tiver uma medição real (bioimpedância, dobras etc.)."><NumInput value={bf} onChange={(e) => setBf(e.target.value)} /></Field>
        <Field label="Observações"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {err && <p className="error-text">{err}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save}>Salvar</button>
      </div>
    </Modal>
  )
}

function PhotoImg({ photo, className }: { photo: Photo; className?: string }) {
  const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <img src={url} alt={`Foto de ${fmtBR(photo.date)}`} className={className} loading="lazy" />
}

async function compress(file: File): Promise<Blob> {
  // reduz fotos grandes para economizar espaço local (máx. 1600 px)
  try {
    const bmp = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size < 1_500_000) return file
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85))
  } catch {
    return file
  }
}

function Photos() {
  const { date } = useApp()
  const { toast, confirm } = useFeedback()
  const photos = useLiveQuery(() => db.photos.orderBy('date').toArray(), []) ?? []
  const [d, setD] = useState(date)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<Photo | null>(null)

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        const blob = await compress(f)
        await db.photos.put({ id: uid('p'), date: d, blob, note: '', createdAt: Date.now() })
      }
      toast('Foto(s) salva(s) no dispositivo')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar foto', 'error')
    } finally {
      setBusy(false)
    }
  }

  const firstP = photos[0]
  const lastP = photos[photos.length - 1]

  return (
    <Card title="Fotografias de evolução" icon={<Camera size={18} />} subtitle="Ficam salvas apenas neste navegador e entram no backup JSON."
      action={
        <div className="inline-form">
          <input type="date" value={d} onChange={(e) => setD(e.target.value)} aria-label="Data da foto" />
          <label className={`btn btn-primary btn-sm ${busy ? 'disabled' : ''}`}>
            <Camera size={14} /> {busy ? 'Salvando…' : 'Adicionar foto'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      }>
      {!photos.length ? (
        <Empty icon={<ImageIcon size={26} />} title="Nenhuma foto" text="Tire fotos sempre com a mesma luz e posição para comparar melhor." />
      ) : (
        <>
          {firstP && lastP && firstP.id !== lastP.id && (
            <div className="compare-photos">
              <figure><PhotoImg photo={firstP} /><figcaption>Início · {fmtBR(firstP.date)}</figcaption></figure>
              <figure><PhotoImg photo={lastP} /><figcaption>Mais recente · {fmtBR(lastP.date)}</figcaption></figure>
            </div>
          )}
          <div className="gallery">
            {photos.map((p) => (
              <button key={p.id} className="thumb" onClick={() => setView(p)}>
                <PhotoImg photo={p} />
                <span>{fmtBR(p.date)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {view && (
        <Modal title={`Foto de ${fmtBR(view.date)}`} onClose={() => setView(null)} wide>
          <PhotoImg photo={view} className="photo-full" />
          <Field label="Observação">
            <input defaultValue={view.note} onBlur={(e) => db.photos.update(view.id, { note: e.target.value })} />
          </Field>
          <div className="modal-actions">
            <button className="btn btn-danger" onClick={async () => {
              if (await confirm({ title: 'Excluir foto?', text: 'A foto será apagada deste navegador.', danger: true, confirmLabel: 'Excluir' })) {
                await db.photos.delete(view.id)
                setView(null)
                toast('Foto excluída')
              }
            }}><Trash2 size={14} /> Excluir</button>
            <button className="btn" onClick={() => setView(null)}>Fechar</button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
