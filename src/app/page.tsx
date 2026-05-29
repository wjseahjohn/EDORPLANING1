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

function MetricCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? 'var(--accent-light)' : 'var(--surface)', border: `1px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: highlight ? 'var(--accent)' : 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: highlight ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: highlight ? 'var(--accent)' : 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
