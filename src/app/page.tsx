'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  MONTHS, AGENTS, YEARS, SEED_PROD, SEED_RENEWAL,
  YearData, RenewalData,
  calcOR, sum, pctChange, fmt, fmtPct
} from '@/lib/data'

interface AllData {
  prod: Record<number, YearData>
  renewal: Record<number, RenewalData>
}

async function dbLoad(): Promise<AllData | null> {
  const { data, error } = await supabase
    .from('production_data')
    .select('payload')
    .eq('id', 1)
    .single()
  if (error || !data) return null
  return data.payload as AllData
}

async function dbSave(payload: AllData) {
  await supabase.from('production_data').upsert({ id: 1, payload })
}

function deepCloneSeed(): AllData {
  const prod: Record<number, YearData> = {}
  const renewal: Record<number, RenewalData> = {}
  for (const y of YEARS) {
    prod[y] = {}
    for (const a of AGENTS[y]) {
      prod[y][a.name] = [...(SEED_PROD[y][a.name] || Array(12).fill(0))]
    }
    renewal[y] = [...SEED_RENEWAL[y]]
  }
  return { prod, renewal }
}

function getAgentProdTotal(data: AllData, year: number, name: string): number {
  return sum(data.prod[year]?.[name] || Array(12).fill(0))
}

function getAgentORTotal(data: AllData, year: number, name: string): number {
  const rate = AGENTS[year]?.find(a => a.name === name)?.rate || 0
  return getAgentProdTotal(data, year, name) * rate
}

function getYearORTotal(data: AllData, year: number): number {
  return (AGENTS[year] || []).reduce((s, a) => s + getAgentORTotal(data, year, a.name), 0)
}

function getYearRenewalTotal(data: AllData, year: number): number {
  return sum(data.renewal[year] || Array(12).fill(0))
}

function getYearProdTotal(data: AllData, year: number): number {
  return (AGENTS[year] || []).reduce((s, a) => s + getAgentProdTotal(data, year, a.name), 0)
}

function getMonthOR(data: AllData, year: number, month: number): number {
  return (AGENTS[year] || []).reduce((s, a) => {
    const prod = (data.prod[year]?.[a.name] || [])[month] || 0
    return s + prod * a.rate
  }, 0)
}

function Badge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-[var(--muted)]">–</span>
  const pos = value >= 0
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
      style={{ background: pos ? 'var(--green-light)' : 'var(--red-light)', color: pos ? 'var(--green)' : 'var(--red)' }}>
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}export default function Home() {
  const [data, setData] = useState<AllData | null>(null)
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)
  const [view, setView] = useState<'month' | 'annual' | 'yoy'>('month')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    dbLoad().then(d => {
      if (d) {
        const merged = deepCloneSeed()
        for (const y of YEARS) {
          for (const a of AGENTS[y]) {
            if (d.prod[y]?.[a.name]) merged.prod[y][a.name] = d.prod[y][a.name]
          }
          if (d.renewal[y]) merged.renewal[y] = d.renewal[y]
        }
        setData(merged)
      } else {
        setData(deepCloneSeed())
        setDbError(true)
      }
      setLoading(false)
    })
  }, [])

  const triggerSave = useCallback((newData: AllData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await dbSave(newData)
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 1200)
  }, [])

  function updateProd(agentName: string, m: number, val: string) {
    setData(prev => {
      if (!prev) return prev
      const next: AllData = {
        prod: { ...prev.prod, [year]: { ...prev.prod[year], [agentName]: prev.prod[year][agentName].map((v, i) => i === m ? (parseFloat(val) || 0) : v) } },
        renewal: prev.renewal
      }
      triggerSave(next)
      return next
    })
  }

  function updateRenewal(m: number, val: string) {
    setData(prev => {
      if (!prev) return prev
      const next: AllData = {
        prod: prev.prod,
        renewal: { ...prev.renewal, [year]: prev.renewal[year].map((v, i) => i === m ? (parseFloat(val) || 0) : v) }
      }
      triggerSave(next)
      return next
    })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--muted)' }}>Loading…</div>
    </div>
  )

  if (!data) return null

  const agents = AGENTS[year]
  const yearOR = getYearORTotal(data, year)
  const yearRenewal = getYearRenewalTotal(data, year)
  const yearProd = getYearProdTotal(data, year)
  const prevYear = year - 1
  const prevYearOR = YEARS.includes(prevYear) ? getYearORTotal(data, prevYear) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Team Production</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Overriding income calculator</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {dbError && <span style={{ color: 'var(--amber)', background: 'var(--amber-light)', padding: '4px 10px', borderRadius: 6 }}>⚠ Set up Supabase to sync</span>}
            {saving && <span style={{ color: 'var(--muted)' }}>Saving…</span>}
            {saved && !saving && <span style={{ color: 'var(--green)' }}>✓ Saved</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)} style={{ padding: '6px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: y === year ? '1px solid var(--accent)' : '1px solid var(--border)', background: y === year ? 'var(--accent)' : 'var(--surface)', color: y === year ? '#fff' : 'var(--muted)' }}>
              {y}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
          <MetricCard label="Total production" value={fmt(yearProd)} sub={`All agents ${year}`} />
          <MetricCard label="Your overriding" value={fmt(yearOR)} sub={yearProd > 0 ? `${((yearOR/yearProd)*100).toFixed(1)}% of production` : undefined} />
          <MetricCard label="Renewal income" value={fmt(yearRenewal)} sub="Year total" />
          <MetricCard label="Grand total" value={fmt(yearOR + yearRenewal)} sub="OR + Renewal" />
          {prevYearOR > 0 && <MetricCard label={`vs ${prevYear}`} value={fmtPct(pctChange(yearOR, prevYearOR))} sub={`${fmt(Math.abs(yearOR - prevYearOR))} ${yearOR >= prevYearOR ? 'more' : 'less'}`} />}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface2)', borderRadius: 8, padding: 4, width: 'fit-content' }}>
          {(['month','annual','yoy'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--text)' : 'var(--muted)' }}>
              {v === 'month' ? 'Monthly input' : v === 'annual' ? 'Annual summary' : 'Year-on-year'}
            </button>
          ))}
        </div>

        {view === 'month' && (
          <>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
              {MONTHS.map((m, i) => (
                <button key={m} onClick={() => setMonth(i)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: i === month ? '1px solid var(--accent)' : '1px solid var(--border)', background: i === month ? 'var(--accent-light)' : 'var(--surface)', color: i === month ? 'var(--accent)' : 'var(--muted)' }}>
                  {m}
                </button>
              ))}
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Agent</th>
                    <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: 64 }}>Rate</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: 140 }}>{MONTHS[month]} production</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: 120 }}>Your OR</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, idx) => {
                    const prod = (data.prod[year]?.[a.name] || [])[month] || 0
                    const or = calcOR(prod, a.rate)
                    return (
                      <tr key={a.name} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                        <td style={{ padding: '8px 14px', fontWeight: 500 }}>{a.name}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{Math.round(a.rate*100)}%</td>
                        <td style={{ padding: '4px 14px', textAlign: 'right' }}>
                          <input type="number" min={0} step={1} defaultValue={prod || ''} placeholder="0" key={`${year}-${month}-${a.name}`}
                            onChange={e => updateProd(a.name, month, e.target.value)}
                            style={{ width: '100%', textAlign: 'right', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
                            onFocus={e => e.target.style.borderColor='var(--accent)'}
                            onBlur={e => e.target.style.borderColor='var(--border)'} />
                        </td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500 }}>{fmt(or)}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--amber-light)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 600, color: 'var(--amber)' }}>↻ Renewal</td>
                    <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--amber)', fontSize: 12 }}>–</td>
                    <td style={{ padding: '4px 14px', textAlign: 'right' }}>
                      <input type="number" min={0} step={1} defaultValue={(data.renewal[year]||[])[month]||''} placeholder="0" key={`renewal-${year}-${month}`}
                        onChange={e => updateRenewal(month, e.target.value)}
                        style={{ width: '100%', textAlign: 'right', padding: '5px 8px', border: '1px solid #d97706', borderRadius: 6, background: '#fff', color: 'var(--amber)', fontSize: 13, outline: 'none', fontWeight: 500 }} />
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--amber)' }}>{fmt((data.renewal[year]||[])[month]||0)}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <td colSpan={2} style={{ padding: '9px 14px', fontWeight: 600 }}>Month subtotal (OR only)</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 500 }}>{fmt(agents.reduce((s,a)=>s+((data.prod[year]?.[a.name]||[])[month]||0),0))}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(getMonthOR(data,year,month))}</td>
                  </tr>
                  <tr style={{ background: 'var(--accent-light)' }}>
                    <td colSpan={3} style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--accent)' }}>Total income (OR + Renewal)</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt(getMonthOR(data,year,month)+((data.renewal[year]||[])[month]||0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === 'annual' && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Agent</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)', width: 60 }}>Rate</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Total production</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Your OR</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a, idx) => (
                  <tr key={a.name} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 500 }}>{a.name}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>{Math.round(a.rate*100)}%</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(getAgentProdTotal(data,year,a.name))}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 500 }}>{fmt(getAgentORTotal(data,year,a.name))}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--amber-light)', borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={2} style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--amber)' }}>↻ Renewal (full year)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--amber)' }}>–</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--amber)' }}>{fmt(yearRenewal)}</td>
                </tr>
                <tr style={{ background: 'var(--accent-light)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent)' }}>Grand total (OR + Renewal)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>{fmt(yearOR+yearRenewal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {view === 'yoy' && <YoYView data={data} />}
      </div>
    </div>
  )
}

function YoYView({ data }: { data: AllData }) {
  const allNames = Array.from(new Set(YEARS.flatMap(y => AGENTS[y].map(a => a.name))))
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Agent overriding — year-on-year. 2026 is YTD (Jan–May).</p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Agent</th>
              {YEARS.map(y => <th key={y} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{y}</th>)}
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>24→25</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>25→26 YTD</th>
            </tr>
          </thead>
          <tbody>
            {allNames.map((name, idx) => {
              const orByYear = YEARS.map(y => { const a = AGENTS[y].find(a=>a.name===name); return a ? getAgentORTotal(data,y,name) : 0 })
              const or25ytd = AGENTS[2025].find(a=>a.name===name) ? sum((data.prod[2025]?.[name]||[]).slice(0,5))*(AGENTS[2025].find(a=>a.name===name)?.rate||0) : 0
              if (orByYear.every(v=>v===0)) return null
              return (
                <tr key={name} style={{ borderBottom: '1px solid var(--border)', background: idx%2===0?'var(--surface)':'var(--surface2)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 500 }}>{name}</td>
                  {orByYear.map((v,i) => <td key={i} style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(v)}</td>)}
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(orByYear[1],orByYear[0])} /></td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(orByYear[2],or25ytd)} /></td>
                </tr>
              )
            })}
            <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '10px 14px', fontWeight: 700 }}>Total OR</td>
              {YEARS.map(y => <td key={y} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(getYearORTotal(data,y))}</td>)}
              <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearORTotal(data,2025),getYearORTotal(data,2024))} /></td>
              <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearORTotal(data,2026),sum(AGENTS[2025].flatMap(a=>[sum((data.prod[2025]?.[a.name]||[]).slice(0,5))*a.rate])))} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Monthly overriding — all years</p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Month</th>
              {YEARS.map(y => <th key={y} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{y}</th>)}
              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>24→25</th>
              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>25→26</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((m,i) => {
              const orByYear = YEARS.map(y => getMonthOR(data,y,i))
              return (
                <tr key={m} style={{ borderBottom: '1px solid var(--border)', background: i%2===0?'var(--surface)':'var(--surface2)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{m}</td>
                  {orByYear.map((v,j) => <td key={j} style={{ padding: '8px 14px', textAlign: 'right' }}>{v>0?fmt(v):'–'}</td>)}
                  <td style={{ padding: '8px 14px', textAlign: 'center' }}><Badge value={pctChange(orByYear[1],orByYear[0])} /></td>
                  <td style={{ padding: '8px 14px', textAlign: 'center' }}><Badge value={orByYear[2]>0?pctChange(orByYear[2],orByYear[1]):null} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
