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
  expenses?: Record<number, MonthlyExpenses[]>
  expenseCategories?: Record<number, Record<string, string>>
  hiddenFixed?: Record<number, string[]>
}

interface MonthlyExpenses {
  fixed: Record<string, number>
  variable: Record<string, number>
}

const FIXED_ITEMS = [
  "Kayla's school fees",
  "Khloe's school fees",
  "Parents allowance",
  "Mortgage",
  "Avatr 11",
  "Taxes",
  "Jacelyn Salary",
  "Cynyin's Salary",
  "Jacelyn's CPF",
  "StandChart CC repayment",
  "Monthly Family Food Expense",
  "BoxxPark",
  "Silversea Maint. Fee",
]

const EXPENSE_CATEGORIES = [
  'Recruitment',
  'Servicing',
  'Seminar Selling',
  'TLDR',
  'Personal Expenses',
]

const CATEGORY_COLORS: Record<string, string> = {
  'Recruitment':       '#1a6b4a',
  'Servicing':         '#2563eb',
  'Seminar Selling':   '#d97706',
  'TLDR':              '#7c3aed',
  'Personal Expenses': '#dc2626',
  'Uncategorised':     '#9ca3af',
}

function emptyMonthlyExpenses(): MonthlyExpenses {
  const fixed: Record<string, number> = {}
  FIXED_ITEMS.forEach(k => { fixed[k] = 0 })
  return { fixed, variable: {} }
}

function emptyYearExpenses(): MonthlyExpenses[] {
  return Array(12).fill(null).map(() => emptyMonthlyExpenses())
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
  const expenses: Record<number, MonthlyExpenses[]> = {}
  const expenseCategories: Record<number, Record<string, string>> = {}
  const hiddenFixed: Record<number, string[]> = {}
  for (const y of YEARS) {
    prod[y] = {}
    for (const a of AGENTS[y]) {
      prod[y][a.name] = [...(SEED_PROD[y][a.name] || Array(12).fill(0))]
    }
    renewal[y] = [...SEED_RENEWAL[y]]
    expenses[y] = emptyYearExpenses()
    expenseCategories[y] = {}
    hiddenFixed[y] = []
  }
  return { prod, renewal, expenses, expenseCategories, hiddenFixed }
}

function getAgentProdTotal(data: AllData, year: number, name: string, months?: number): number {
  const arr = data.prod[year]?.[name] || Array(12).fill(0)
  return sum(months ? arr.slice(0, months) : arr)
}

function getAgentORTotal(data: AllData, year: number, name: string, months?: number): number {
  const rate = AGENTS[year]?.find(a => a.name === name)?.rate || 0
  return getAgentProdTotal(data, year, name, months) * rate
}

function getYearORTotal(data: AllData, year: number, months?: number): number {
  return (AGENTS[year] || []).reduce((s, a) => s + getAgentORTotal(data, year, a.name, months), 0)
}

function getYearRenewalTotal(data: AllData, year: number, months?: number): number {
  const arr = data.renewal[year] || Array(12).fill(0)
  return sum(months ? arr.slice(0, months) : arr)
}

function getYearProdTotal(data: AllData, year: number, months?: number): number {
  return (AGENTS[year] || []).reduce((s, a) => s + getAgentProdTotal(data, year, a.name, months), 0)
}

function getMonthOR(data: AllData, year: number, month: number): number {
  return (AGENTS[year] || []).reduce((s, a) => {
    const prod = (data.prod[year]?.[a.name] || [])[month] || 0
    return s + prod * a.rate
  }, 0)
}

function getActiveMonths(data: AllData, year: number): number {
  for (let m = 11; m >= 0; m--) {
    const total = (AGENTS[year] || []).reduce((s, a) => s + ((data.prod[year]?.[a.name] || [])[m] || 0), 0)
    if (total > 0) return m + 1
  }
  return 12
}

function getMonthTotalExpenses(exp: MonthlyExpenses): number {
  return sum(Object.values(exp.fixed)) + sum(Object.values(exp.variable))
}

function getMonthFixedTotal(exp: MonthlyExpenses): number {
  return sum(Object.values(exp.fixed))
}

function getMonthVariableTotal(exp: MonthlyExpenses): number {
  return sum(Object.values(exp.variable))
}

function getCategoryTotals(data: AllData, year: number): Record<string, number> {
  const totals: Record<string, number> = {}
  EXPENSE_CATEGORIES.forEach(c => { totals[c] = 0 })
  totals['Uncategorised'] = 0
  const yearExp = data.expenses?.[year] || emptyYearExpenses()
  const cats = data.expenseCategories?.[year] || {}
  yearExp.forEach(monthExp => {
    Object.entries(monthExp.variable).forEach(([key, val]) => {
      const cat = cats[key] || 'Uncategorised'
      totals[cat] = (totals[cat] || 0) + (val || 0)
    })
  })
  return totals
}

function Badge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ fontSize: 12, color: 'var(--muted)' }}>-</span>
  const pos = value >= 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 500,
      padding: '2px 6px', borderRadius: 4,
      background: pos ? 'var(--green-light)' : 'var(--red-light)',
      color: pos ? 'var(--green)' : 'var(--red)',
    }}>
      {pos ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function MetricCard({ label, value, sub, highlight, negative }: { label: string; value: string; sub?: string; highlight?: boolean; negative?: boolean }) {
  const color = negative ? 'var(--red)' : highlight ? 'var(--accent)' : 'var(--text)'
  const bg = negative ? 'var(--red-light)' : highlight ? 'var(--accent-light)' : 'var(--surface)'
  const border = negative ? 'var(--red)' : highlight ? 'var(--accent)' : 'var(--border)'
  return (
    <div style={{ background: bg, border: '1px solid ' + border, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: negative ? 'var(--red)' : highlight ? 'var(--accent)' : 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: negative ? 'var(--red)' : highlight ? 'var(--accent)' : 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function PieChart({ data: chartData }: { data: Record<string, number> }) {
  const total = sum(Object.values(chartData))
  if (total === 0) return <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px', fontSize: 13 }}>No expense data yet</div>

  let cumAngle = -Math.PI / 2
  const segments = Object.entries(chartData)
    .filter(([, v]) => v > 0)
    .map(([label, value]) => {
      const angle = (value / total) * 2 * Math.PI
      const x1 = 150 + 120 * Math.cos(cumAngle)
      const y1 = 150 + 120 * Math.sin(cumAngle)
      cumAngle += angle
      const x2 = 150 + 120 * Math.cos(cumAngle)
      const y2 = 150 + 120 * Math.sin(cumAngle)
      const largeArc = angle > Math.PI ? 1 : 0
      const midAngle = cumAngle - angle / 2
      const lx = 150 + 145 * Math.cos(midAngle)
      const ly = 150 + 145 * Math.sin(midAngle)
      return { label, value, x1, y1, x2, y2, largeArc, lx, ly, pct: (value / total * 100).toFixed(1) }
    })

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 300 300" style={{ width: 220, height: 220, flexShrink: 0 }}>
        {segments.map((s, i) => (
          <path key={i}
            d={`M 150 150 L ${s.x1} ${s.y1} A 120 120 0 ${s.largeArc} 1 ${s.x2} ${s.y2} Z`}
            fill={CATEGORY_COLORS[s.label] || '#9ca3af'}
            stroke="#fff" strokeWidth="2"
          />
        ))}
        <circle cx="150" cy="150" r="55" fill="white" />
        <text x="150" y="145" textAnchor="middle" style={{ fontSize: 11, fill: '#6b6860' }}>Total</text>
        <text x="150" y="163" textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: '#1a1917' }}>{fmt(total)}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: CATEGORY_COLORS[s.label] || '#9ca3af', flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{fmt(s.value)} ({s.pct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [data, setData] = useState<AllData | null>(null)
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(0)
  const [view, setView] = useState<'month' | 'annual' | 'yoy' | 'performance' | 'expenses'>('month')
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
          if (d.expenses?.[y]) merged.expenses![y] = d.expenses[y]
          if (d.expenseCategories?.[y]) merged.expenseCategories![y] = d.expenseCategories[y]
          if (d.hiddenFixed?.[y]) merged.hiddenFixed![y] = d.hiddenFixed[y]
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
        ...prev,
        prod: { ...prev.prod, [year]: { ...prev.prod[year], [agentName]: prev.prod[year][agentName].map((v, i) => i === m ? (parseFloat(val) || 0) : v) } },
      }
      triggerSave(next)
      return next
    })
  }

  function updateRenewal(m: number, val: string) {
    setData(prev => {
      if (!prev) return prev
      const next: AllData = {
        ...prev,
        renewal: { ...prev.renewal, [year]: prev.renewal[year].map((v, i) => i === m ? (parseFloat(val) || 0) : v) }
      }
      triggerSave(next)
      return next
    })
  }

  function updateFixedExpense(m: number, key: string, val: string) {
    setData(prev => {
      if (!prev) return prev
      const yearExp = [...(prev.expenses?.[year] || emptyYearExpenses())]
      yearExp[m] = { ...yearExp[m], fixed: { ...yearExp[m].fixed, [key]: parseFloat(val) || 0 } }
      const next: AllData = { ...prev, expenses: { ...prev.expenses, [year]: yearExp } }
      triggerSave(next)
      return next
    })
  }

  function updateVariableExpense(m: number, key: string, val: string) {
    setData(prev => {
      if (!prev) return prev
      const yearExp = [...(prev.expenses?.[year] || emptyYearExpenses())]
      yearExp[m] = { ...yearExp[m], variable: { ...yearExp[m].variable, [key]: parseFloat(val) || 0 } }
      const next: AllData = { ...prev, expenses: { ...prev.expenses, [year]: yearExp } }
      triggerSave(next)
      return next
    })
  }

  function addVariableItem(m: number, name: string) {
    if (!name.trim()) return
    setData(prev => {
      if (!prev) return prev
      const yearExp = [...(prev.expenses?.[year] || emptyYearExpenses())]
      yearExp[m] = { ...yearExp[m], variable: { ...yearExp[m].variable, [name.trim()]: 0 } }
      const next: AllData = { ...prev, expenses: { ...prev.expenses, [year]: yearExp } }
      triggerSave(next)
      return next
    })
  }

  function removeVariableItem(m: number, key: string) {
    setData(prev => {
      if (!prev) return prev
      const yearExp = [...(prev.expenses?.[year] || emptyYearExpenses())]
      const newVar = { ...yearExp[m].variable }
      delete newVar[key]
      yearExp[m] = { ...yearExp[m], variable: newVar }
      const next: AllData = { ...prev, expenses: { ...prev.expenses, [year]: yearExp } }
      triggerSave(next)
      return next
    })
  }

  function removeFixedItem(key: string) {
    // Remove from all months for current year and remove from FIXED_ITEMS_HIDDEN tracking
    setData(prev => {
      if (!prev) return prev
      const yearExp = [...(prev.expenses?.[year] || emptyYearExpenses())]
      yearExp.forEach((_, i) => {
        const newFixed = { ...yearExp[i].fixed }
        delete newFixed[key]
        yearExp[i] = { ...yearExp[i], fixed: newFixed }
      })
      const next: AllData = {
        ...prev,
        expenses: { ...prev.expenses, [year]: yearExp },
        hiddenFixed: { ...(prev.hiddenFixed || {}), [year]: [...((prev.hiddenFixed?.[year]) || []).filter(k => k !== key), key] }
      }
      triggerSave(next)
      return next
    })
  }

  function restoreFixedItem(key: string) {
    setData(prev => {
      if (!prev) return prev
      const next: AllData = {
        ...prev,
        hiddenFixed: { ...(prev.hiddenFixed || {}), [year]: ((prev.hiddenFixed?.[year]) || []).filter(k => k !== key) }
      }
      triggerSave(next)
      return next
    })
  }

  function updateCategory(key: string, cat: string) {
    setData(prev => {
      if (!prev) return prev
      const next: AllData = {
        ...prev,
        expenseCategories: {
          ...prev.expenseCategories,
          [year]: { ...(prev.expenseCategories?.[year] || {}), [key]: cat }
        }
      }
      triggerSave(next)
      return next
    })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--muted)' }}>Loading...</div>
    </div>
  )

  if (!data) return null

  const agents = AGENTS[year]
  const ytdMonths = getActiveMonths(data, 2026)
  const yearOR = getYearORTotal(data, year)
  const yearRenewal = getYearRenewalTotal(data, year)
  const yearProd = getYearProdTotal(data, year)
  const yearGrand = yearOR + yearRenewal
  const prevYear = year - 1
  const prevYearExists = YEARS.includes(prevYear)

  const ytdOR = getYearORTotal(data, year, year === 2026 ? ytdMonths : undefined)
  const ytdRenewal = getYearRenewalTotal(data, year, year === 2026 ? ytdMonths : undefined)
  const ytdGrand = ytdOR + ytdRenewal
  const prevYtdOR = prevYearExists ? getYearORTotal(data, prevYear, year === 2026 ? ytdMonths : undefined) : 0
  const prevYtdRenewal = prevYearExists ? getYearRenewalTotal(data, prevYear, year === 2026 ? ytdMonths : undefined) : 0
  const prevYtdGrand = prevYtdOR + prevYtdRenewal
  const ytdPct = pctChange(ytdGrand, prevYtdGrand)

  const yearExpenses = data.expenses?.[year] || emptyYearExpenses()
  const yearTotalExpenses = sum(yearExpenses.map(e => getMonthTotalExpenses(e)))
  const yearNetIncome = yearGrand - yearTotalExpenses

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '24px 16px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Team Production</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Overriding income calculator</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {dbError && <span style={{ color: 'var(--amber)', background: 'var(--amber-light)', padding: '4px 10px', borderRadius: 6 }}>Set up Supabase to sync</span>}
            {saving && <span style={{ color: 'var(--muted)' }}>Saving...</span>}
            {saved && !saving && <span style={{ color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {YEARS.map(y => (
            <button key={y} onClick={() => setYear(y)} style={{ padding: '6px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: y === year ? '1px solid var(--accent)' : '1px solid var(--border)', background: y === year ? 'var(--accent)' : 'var(--surface)', color: y === year ? '#fff' : 'var(--muted)' }}>
              {y}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
          <MetricCard label="Total production" value={fmt(yearProd)} sub={'All agents ' + year} />
          <MetricCard label="Your overriding" value={fmt(yearOR)} sub={yearProd > 0 ? ((yearOR/yearProd)*100).toFixed(1) + '% of production' : undefined} />
          <MetricCard label="Renewal income" value={fmt(yearRenewal)} sub="Year total" />
          <MetricCard label="Grand total" value={fmt(yearGrand)} sub="OR + Renewal" highlight />
          <MetricCard label="Total expenses" value={fmt(yearTotalExpenses)} sub="Year total" negative />
          <MetricCard label="Net income" value={fmt(yearNetIncome)} sub="After expenses" highlight={yearNetIncome > 0} negative={yearNetIncome < 0} />
          {prevYearExists && (
            <MetricCard
              label={'vs ' + prevYear + (year === 2026 ? ' YTD (' + ytdMonths + 'mo)' : '')}
              value={fmtPct(ytdPct)}
              sub={(ytdPct !== null && ytdPct >= 0 ? '+' : '') + fmt(ytdGrand - prevYtdGrand) + ' vs same period'}
            />
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface2)', borderRadius: 8, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
          {(['month', 'annual', 'yoy', 'performance', 'expenses'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none', background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--text)' : 'var(--muted)' }}>
              {v === 'month' ? 'Monthly input' : v === 'annual' ? 'Annual summary' : v === 'yoy' ? 'Year-on-year' : v === 'performance' ? 'Performance' : 'Expenses'}
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
                          <input type="number" min={0} step={0.01} defaultValue={prod || ''} placeholder="0" key={year + '-' + month + '-' + a.name}
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
                    <td style={{ padding: '8px 14px', fontWeight: 600, color: 'var(--amber)' }}>Renewal</td>
                    <td style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--amber)', fontSize: 12 }}>-</td>
                    <td style={{ padding: '4px 14px', textAlign: 'right' }}>
                      <input type="number" min={0} step={0.01} defaultValue={(data.renewal[year]||[])[month]||''} placeholder="0" key={'renewal-' + year + '-' + month}
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
                  <td colSpan={2} style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--amber)' }}>Renewal (full year)</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--amber)' }}>-</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--amber)' }}>{fmt(yearRenewal)}</td>
                </tr>
                <tr style={{ background: 'var(--accent-light)', borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent)' }}>Grand total (OR + Renewal)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontSize: 15 }}>{fmt(yearGrand)}</td>
                </tr>
                <tr style={{ background: 'var(--red-light)', borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--red)' }}>Total expenses</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>-{fmt(yearTotalExpenses)}</td>
                </tr>
                <tr style={{ background: yearNetIncome >= 0 ? 'var(--green-light)' : 'var(--red-light)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, color: yearNetIncome >= 0 ? 'var(--green)' : 'var(--red)' }}>Net income</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: yearNetIncome >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 15 }}>{fmt(yearNetIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {view === 'yoy' && <YoYView data={data} />}
        {view === 'performance' && <PerformanceView data={data} />}
        {view === 'expenses' && (
          <ExpensesView
            data={data} year={year} month={month} setMonth={setMonth}
            onUpdateFixed={updateFixedExpense} onUpdateVariable={updateVariableExpense}
            onAddVariable={addVariableItem} onRemoveVariable={removeVariableItem}
            onUpdateCategory={(m, key, cat) => updateCategory(key, cat)}
            onRemoveFixed={removeFixedItem} onRestoreFixed={restoreFixedItem}
          />
        )}

      </div>
    </div>
  )
}

function CategoriesView({ data, year, onUpdateCategory }: {
  data: AllData
  year: number
  onUpdateCategory: (key: string, cat: string) => void
}) {
  const cats = data.expenseCategories?.[year] || {}
  const yearExp = data.expenses?.[year] || emptyYearExpenses()
  const catTotals = getCategoryTotals(data, year)

  // Collect all unique expense keys
  const allFixedKeys = FIXED_ITEMS
  const allVariableKeys = Array.from(new Set(
    yearExp.flatMap(m => Object.keys(m.variable))
  ))

  const selectStyle = {
    padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Category assignment table */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Assign expenses to categories</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Categories apply across all months for {year}</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Expense item</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Type</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Year total</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Category</th>
              </tr>
            </thead>
            <tbody>
              {allFixedKeys.map((key, idx) => {
                const total = sum(yearExp.map(m => m.fixed[key] || 0))
                return (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{key}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>Fixed</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>{total > 0 ? fmt(total) : '-'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <select
                        value={cats[key] || ''}
                        onChange={e => onUpdateCategory(key, e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Uncategorised</option>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
              {allVariableKeys.map((key, idx) => {
                const total = sum(yearExp.map(m => m.variable[key] || 0))
                return (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: (idx + allFixedKeys.length) % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{key}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>Variable</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>{total > 0 ? fmt(total) : '-'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <select
                        value={cats[key] || ''}
                        onChange={e => onUpdateCategory(key, e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Uncategorised</option>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown table */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Category breakdown — {year}</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Category</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Total</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>% of expenses</th>
              </tr>
            </thead>
            <tbody>
              {[...EXPENSE_CATEGORIES, 'Uncategorised'].map((cat, idx) => {
                const val = catTotals[cat] || 0
                const total = sum(Object.values(catTotals))
                const pct = total > 0 ? (val / total * 100).toFixed(1) : '0.0'
                if (val === 0) return null
                return (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[cat] || '#9ca3af' }} />
                        <span style={{ fontWeight: 500 }}>{cat}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>{fmt(val)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: 'var(--muted)' }}>{pct}%</td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>Total</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(sum(Object.values(catTotals)))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pie chart */}
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Expense distribution</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '24px' }}>
          <PieChart data={catTotals} />
        </div>
      </div>
    </div>
  )
}

function ExpensesView({ data, year, month, setMonth, onUpdateFixed, onUpdateVariable, onAddVariable, onRemoveVariable, onUpdateCategory, onRemoveFixed, onRestoreFixed }: {
  data: AllData
  year: number
  month: number
  setMonth: (m: number) => void
  onUpdateFixed: (m: number, key: string, val: string) => void
  onUpdateVariable: (m: number, key: string, val: string) => void
  onAddVariable: (m: number, name: string) => void
  onRemoveVariable: (m: number, key: string) => void
  onUpdateCategory: (m: number, key: string, cat: string) => void
  onRemoveFixed: (key: string) => void
  onRestoreFixed: (key: string) => void
}) {
  const [newItem, setNewItem] = useState('')
  const yearExp = data.expenses?.[year] || emptyYearExpenses()
  const monthExp = yearExp[month] || emptyMonthlyExpenses()
  const hiddenFixed = data.hiddenFixed?.[year] || []
  const fixedTotal = sum(Object.entries(monthExp.fixed).filter(([k]) => !hiddenFixed.includes(k)).map(([,v]) => v || 0))
  const variableTotal = getMonthVariableTotal(monthExp)
  const totalExp = fixedTotal + variableTotal
  const monthIncome = getMonthOR(data, year, month) + ((data.renewal[year] || [])[month] || 0)
  const netIncome = monthIncome - totalExp
  const annualIncome = MONTHS.reduce((s,_,i) => s + getMonthOR(data,year,i) + ((data.renewal[year]||[])[i]||0), 0)
  const annualExpenses = sum(yearExp.map(e => getMonthTotalExpenses(e)))
  const annualNet = annualIncome - annualExpenses

  const inputStyle = {
    width: '130px', textAlign: 'right' as const, padding: '5px 8px',
    border: '1px solid var(--border)', borderRadius: 6,
    background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none'
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {MONTHS.map((m, i) => (
          <button key={m} onClick={() => setMonth(i)} style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: i === month ? '1px solid var(--accent)' : '1px solid var(--border)', background: i === month ? 'var(--accent-light)' : 'var(--surface)', color: i === month ? 'var(--accent)' : 'var(--muted)' }}>
            {m}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <MetricCard label={MONTHS[month] + ' income'} value={fmt(monthIncome)} sub="OR + Renewal" highlight />
        <MetricCard label="Fixed expenses" value={fmt(fixedTotal)} sub={MONTHS[month]} negative />
        <MetricCard label="Variable expenses" value={fmt(variableTotal)} sub={MONTHS[month]} negative />
        <MetricCard label="Total expenses" value={fmt(totalExp)} sub={MONTHS[month]} negative />
        <MetricCard label="Net income" value={fmt(netIncome)} sub={MONTHS[month]} highlight={netIncome >= 0} negative={netIncome < 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Fixed expenses</p>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Item</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Amount</th>
                  <th style={{ padding: '10px 14px', width: 36, borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const hidden = data.hiddenFixed?.[year] || []
                  const visible = FIXED_ITEMS.filter(i => !hidden.includes(i))
                  return visible.map((item, idx) => (
                    <tr key={item} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 500 }}>{item}</td>
                      <td style={{ padding: '4px 14px', textAlign: 'right' }}>
                        <input type="number" min={0} step={0.01}
                          defaultValue={monthExp.fixed[item] || ''}
                          placeholder="0"
                          key={year + '-' + month + '-fixed-' + item}
                          onChange={e => onUpdateFixed(month, item, e.target.value)}
                          style={inputStyle}
                          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                          onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                        <button onClick={() => onRemoveFixed(item)} title="Hide this item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}>x</button>
                      </td>
                    </tr>
                  ))
                })()}
                <tr style={{ background: 'var(--red-light)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--red)' }}>Total fixed</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(fixedTotal)}</td>
                  <td></td>
                </tr>
                {(data.hiddenFixed?.[year] || []).length > 0 && (
                  <tr style={{ background: 'var(--surface2)' }}>
                    <td colSpan={3} style={{ padding: '8px 14px' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Hidden items (click to restore):</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(data.hiddenFixed?.[year] || []).map(item => (
                          <button key={item} onClick={() => onRestoreFixed(item)}
                            style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}>
                            + {item}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Variable expenses</p>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Item</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Category</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Amount</th>
                  <th style={{ padding: '10px 14px', width: 36, borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(monthExp.variable).length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No variable expenses yet</td></tr>
                )}
                {Object.entries(monthExp.variable).map(([key, val], idx) => (
                  <tr key={key} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{key}</td>
                    <td style={{ padding: '4px 14px' }}>
                      <select
                        value={(data.expenseCategories?.[year] || {})[key] || ''}
                        onChange={e => onUpdateCategory(month, key, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none', cursor: 'pointer', width: '100%' }}
                      >
                        <option value="">Uncategorised</option>
                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 14px', textAlign: 'right' }}>
                      <input type="number" min={0} step={0.01}
                        defaultValue={val || ''}
                        placeholder="0"
                        key={year + '-' + month + '-var-' + key}
                        onChange={e => onUpdateVariable(month, key, e.target.value)}
                        style={inputStyle}
                        onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'} />
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                      <button onClick={() => onRemoveVariable(month, key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16 }}>x</button>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--red-light)' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--red)' }}>Total variable</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(variableTotal)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)}
              placeholder="Add variable expense..."
              onKeyDown={e => { if (e.key === 'Enter') { onAddVariable(month, newItem); setNewItem('') } }}
              style={{ flex: 1, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
            <button onClick={() => { onAddVariable(month, newItem); setNewItem('') }}
              style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Add
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Annual expenses summary</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Month</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Income</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Fixed</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Variable</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Total exp</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Net income</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m, i) => {
                const exp = yearExp[i] || emptyMonthlyExpenses()
                const inc = getMonthOR(data, year, i) + ((data.renewal[year] || [])[i] || 0)
                const fx = getMonthFixedTotal(exp)
                const vr = getMonthVariableTotal(exp)
                const tot = fx + vr
                const net = inc - tot
                return (
                  <tr key={m} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', cursor: 'pointer' }} onClick={() => setMonth(i)}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{m}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>{inc > 0 ? fmt(inc) : '-'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: fx > 0 ? 'var(--red)' : 'var(--muted)' }}>{fx > 0 ? fmt(fx) : '-'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: vr > 0 ? 'var(--red)' : 'var(--muted)' }}>{vr > 0 ? fmt(vr) : '-'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: tot > 0 ? 'var(--red)' : 'var(--muted)' }}>{tot > 0 ? fmt(tot) : '-'}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--muted)' }}>{inc > 0 || tot > 0 ? fmt(net) : '-'}</td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>Year total</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(annualIncome)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(sum(yearExp.map(e => getMonthFixedTotal(e))))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(sum(yearExp.map(e => getMonthVariableTotal(e))))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmt(annualExpenses)}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: annualNet >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(annualNet)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Variable expense categories — {year}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Category</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Total</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const catTotals = getCategoryTotals(data, year)
                  const total = sum(Object.values(catTotals))
                  return [...EXPENSE_CATEGORIES, 'Uncategorised'].map((cat, idx) => {
                    const val = catTotals[cat] || 0
                    if (val === 0) return null
                    return (
                      <tr key={cat} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[cat] || '#9ca3af' }} />
                            <span style={{ fontWeight: 500 }}>{cat}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(val)}</td>
                        <td style={{ padding: '9px 14px', textAlign: 'right', color: 'var(--muted)' }}>{total > 0 ? (val/total*100).toFixed(1) : '0.0'}%</td>
                      </tr>
                    )
                  })
                })()}
                <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>Total</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(sum(Object.values(getCategoryTotals(data, year))))}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px' }}>
            <PieChart data={getCategoryTotals(data, year)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function YoYView({ data }: { data: AllData }) {
  const allNames = Array.from(new Set(YEARS.flatMap(y => AGENTS[y].map(a => a.name))))
  const ytdMonths = getActiveMonths(data, 2026)
  return (
    <div>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
        Agent overriding year-on-year. 24-25 is full year. 25-26 compares same {ytdMonths} months (Jan-{MONTHS[ytdMonths-1]}).
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Agent</th>
              {YEARS.map(y => <th key={y} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{y}</th>)}
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>24 vs 25</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>25 vs 26 YTD</th>
            </tr>
          </thead>
          <tbody>
            {allNames.map((name, idx) => {
              const orByYear = YEARS.map(y => { const a = AGENTS[y].find(a=>a.name===name); return a ? getAgentORTotal(data,y,name) : 0 })
              const or25ytd = AGENTS[2025].find(a=>a.name===name) ? getAgentORTotal(data,2025,name,ytdMonths) : 0
              const or26ytd = AGENTS[2026].find(a=>a.name===name) ? getAgentORTotal(data,2026,name,ytdMonths) : 0
              if (orByYear.every(v=>v===0) && or26ytd===0) return null
              return (
                <tr key={name} style={{ borderBottom: '1px solid var(--border)', background: idx%2===0?'var(--surface)':'var(--surface2)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 500 }}>{name}</td>
                  {orByYear.map((v,i) => <td key={i} style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(v)}</td>)}
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(orByYear[1],orByYear[0])} /></td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(or26ytd,or25ytd)} /></td>
                </tr>
              )
            })}
            <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '10px 14px', fontWeight: 700 }}>Total OR</td>
              {YEARS.map(y => <td key={y} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(getYearORTotal(data,y))}</td>)}
              <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearORTotal(data,2025),getYearORTotal(data,2024))} /></td>
              <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearORTotal(data,2026,ytdMonths),getYearORTotal(data,2025,ytdMonths))} /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>Monthly overriding - all years</p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Month</th>
              {YEARS.map(y => <th key={y} style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>{y}</th>)}
              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>24 vs 25</th>
              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>25 vs 26</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((m,i) => {
              const orByYear = YEARS.map(y => getMonthOR(data,y,i))
              return (
                <tr key={m} style={{ borderBottom: '1px solid var(--border)', background: i%2===0?'var(--surface)':'var(--surface2)' }}>
                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{m}</td>
                  {orByYear.map((v,j) => <td key={j} style={{ padding: '8px 14px', textAlign: 'right' }}>{v>0?fmt(v):'-'}</td>)}
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

function PerformanceView({ data }: { data: AllData }) {
  const ytdMonths = getActiveMonths(data, 2026)
  const allNames = Array.from(new Set(YEARS.flatMap(y => AGENTS[y].map(a => a.name))))
  const incomeRows = YEARS.slice(1).map((y, i) => {
    const prevY = YEARS[i]
    const months = y === 2026 ? ytdMonths : undefined
    const currOR = getYearORTotal(data, y, months)
    const currRen = getYearRenewalTotal(data, y, months)
    const currGrand = currOR + currRen
    const prevOR = getYearORTotal(data, prevY, months)
    const prevRen = getYearRenewalTotal(data, prevY, months)
    const prevGrand = prevOR + prevRen
    return { label: prevY + ' vs ' + y + (y===2026?' YTD ('+ytdMonths+'mo)':''), prevGrand, currGrand, pct: pctChange(currGrand, prevGrand) }
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>My grand total income (OR + Renewal)</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Period</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Previous year</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Current year</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Difference</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx%2===0?'var(--surface)':'var(--surface2)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{row.label}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmt(row.prevGrand)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600 }}>{fmt(row.currGrand)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: row.currGrand >= row.prevGrand ? 'var(--green)' : 'var(--red)' }}>
                    {row.currGrand >= row.prevGrand ? '+' : ''}{fmt(row.currGrand - row.prevGrand)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={row.pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Manager production — year on year</p>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>25 vs 26 compares Jan-{MONTHS[ytdMonths-1]} only (same {ytdMonths} months)</p>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>Manager</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>2024</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>2025</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>2026 YTD</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>24 vs 25</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>25 vs 26 YTD</th>
              </tr>
            </thead>
            <tbody>
              {allNames.map((name, idx) => {
                const prod24 = getAgentProdTotal(data, 2024, name)
                const prod25 = getAgentProdTotal(data, 2025, name)
                const prod25ytd = getAgentProdTotal(data, 2025, name, ytdMonths)
                const prod26 = getAgentProdTotal(data, 2026, name, ytdMonths)
                if (prod24 === 0 && prod25 === 0 && prod26 === 0) return null
                return (
                  <tr key={name} style={{ borderBottom: '1px solid var(--border)', background: idx%2===0?'var(--surface)':'var(--surface2)' }}>
                    <td style={{ padding: '9px 14px', fontWeight: 500 }}>{name}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(prod24)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(prod25)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right' }}>{fmt(prod26)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(prod25, prod24)} /></td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}><Badge value={pctChange(prod26, prod25ytd)} /></td>
                  </tr>
                )
              })}
              <tr style={{ background: 'var(--surface2)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>Team total</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(getYearProdTotal(data,2024))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(getYearProdTotal(data,2025))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{fmt(getYearProdTotal(data,2026,ytdMonths))}</td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearProdTotal(data,2025),getYearProdTotal(data,2024))} /></td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}><Badge value={pctChange(getYearProdTotal(data,2026,ytdMonths),getYearProdTotal(data,2025,ytdMonths))} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
