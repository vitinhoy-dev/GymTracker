import { useState } from 'react'
import type { ISODate } from '../lib/types'
import { fmtShort } from '../lib/dates'
import { fmtNum } from '../lib/util'

export interface Series {
  name: string
  color: string
  points: { x: ISODate; y: number }[]
}

const W = 640
const PAD = { l: 44, r: 14, t: 14, b: 26 }

function niceRange(min: number, max: number): [number, number] {
  if (min === max) {
    const d = Math.abs(min) * 0.05 || 1
    return [min - d, max + d]
  }
  const pad = (max - min) * 0.12
  return [min - pad, max + pad]
}

/** gráfico de linhas simples; só plota pontos realmente registrados */
export function LineChart({ series, domain, height = 220, unit = '', goal, digits = 1 }: {
  series: Series[]; domain: ISODate[]; height?: number; unit?: string; goal?: number | null; digits?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const all = series.flatMap((s) => s.points.map((p) => p.y))
  if (goal != null) all.push(goal)
  if (!all.length || !domain.length) return null
  const [ymin, ymax] = niceRange(Math.min(...all), Math.max(...all))
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const xi = (d: ISODate) => domain.indexOf(d)
  const X = (i: number) => PAD.l + (domain.length === 1 ? iw / 2 : (i / (domain.length - 1)) * iw)
  const Y = (v: number) => PAD.t + ih - ((v - ymin) / (ymax - ymin)) * ih
  const ticks = Array.from({ length: 4 }, (_, i) => ymin + ((ymax - ymin) * i) / 3)
  const labelEvery = Math.ceil(domain.length / 7)
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={PAD.l - 6} y={Y(t) + 4} textAnchor="end" className="axis">{fmtNum(t, digits)}</text>
          </g>
        ))}
        {domain.map((d, i) => (i % labelEvery === 0 || i === domain.length - 1) && (
          <text key={d} x={X(i)} y={height - 6} textAnchor="middle" className="axis">{fmtShort(d)}</text>
        ))}
        {goal != null && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(goal)} y2={Y(goal)} className="goal-line" />
            <text x={W - PAD.r} y={Y(goal) - 5} textAnchor="end" className="axis goal-text">meta {fmtNum(goal, digits)}</text>
          </g>
        )}
        {series.map((s) => {
          const pts = s.points.filter((p) => xi(p.x) >= 0).sort((a, b) => a.x.localeCompare(b.x))
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(xi(p.x))},${Y(p.y)}`).join(' ')
          return (
            <g key={s.name}>
              {pts.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="line" />}
              {pts.map((p) => (
                <circle key={p.x} cx={X(xi(p.x))} cy={Y(p.y)} r={hover === xi(p.x) ? 5.5 : 3.5} fill="var(--bg-card)" stroke={s.color} strokeWidth={2} />
              ))}
            </g>
          )
        })}
        {domain.map((d, i) => (
          <rect key={d} x={X(i) - iw / domain.length / 2} y={PAD.t} width={iw / domain.length} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={PAD.t} y2={PAD.t + ih} className="hover-line" />}
      </svg>
      <div className="chart-foot">
        {series.length > 1 && series.map((s) => (
          <span key={s.name} className="legend"><i style={{ background: s.color }} />{s.name}</span>
        ))}
        {hover != null && (
          <span className="chart-tip">
            {fmtShort(domain[hover])}:{' '}
            {series.map((s) => {
              const p = s.points.find((q) => q.x === domain[hover])
              return <b key={s.name} style={{ color: s.color }}>{p ? `${fmtNum(p.y, digits)} ${unit}` : 'sem registro'} </b>
            })}
          </span>
        )}
      </div>
    </div>
  )
}

export function BarChart({ data, height = 200, goal, unit = '', digits = 0, color = 'var(--accent)' }: {
  data: { x: ISODate; y: number | null; tone?: 'ok' | 'warn' | 'muted' }[]; height?: number; goal?: number; unit?: string; digits?: number; color?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const vals = data.map((d) => d.y ?? 0)
  const max = Math.max(goal ?? 0, ...vals) * 1.1 || 1
  const iw = W - PAD.l - PAD.r
  const ih = height - PAD.t - PAD.b
  const bw = iw / Math.max(1, data.length)
  const Y = (v: number) => PAD.t + ih - (v / max) * ih
  const labelEvery = Math.ceil(data.length / 7)
  const ticks = [0, max / 3, (2 * max) / 3, max]
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ height }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} className="grid" />
            <text x={PAD.l - 6} y={Y(t) + 4} textAnchor="end" className="axis">{fmtNum(t, digits)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = d.y ?? 0
          const fill = d.tone === 'warn' ? 'var(--warn)' : d.tone === 'muted' ? 'var(--muted-bar)' : color
          return (
            <g key={d.x} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} fill="transparent" />
              {d.y != null && v > 0 && (
                <rect x={PAD.l + i * bw + bw * 0.18} y={Y(v)} width={bw * 0.64} height={Math.max(0, PAD.t + ih - Y(v))} rx={3} fill={fill} opacity={hover === i ? 1 : 0.85} className="bar-rect" />
              )}
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text x={PAD.l + i * bw + bw / 2} y={height - 6} textAnchor="middle" className="axis">{fmtShort(d.x)}</text>
              )}
            </g>
          )
        })}
        {goal != null && <line x1={PAD.l} x2={W - PAD.r} y1={Y(goal)} y2={Y(goal)} className="goal-line" />}
      </svg>
      <div className="chart-foot">
        {goal != null && <span className="legend"><i className="dash" />meta {fmtNum(goal, digits)} {unit}</span>}
        {hover != null && (
          <span className="chart-tip">{fmtShort(data[hover].x)}: <b>{data[hover].y == null ? 'sem registro' : `${fmtNum(data[hover].y, digits)} ${unit}`}</b></span>
        )}
      </div>
    </div>
  )
}
