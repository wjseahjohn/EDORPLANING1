export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export interface Agent {
  name: string
  rate: number
}

export type YearData = Record<string, number[]>
export type RenewalData = number[]

export const AGENTS: Record<number, Agent[]> = {
  2024: [
    { name: 'John',     rate: 0.48 },
    { name: 'Chris',    rate: 0.13 },
    { name: 'Angie',    rate: 0.08 },
    { name: 'Shiguan',  rate: 0.16 },
    { name: 'Jingyi',   rate: 0.16 },
    { name: 'Melvin',   rate: 0.13 },
    { name: 'Reyna',    rate: 0.16 },
    { name: 'Xunqin',   rate: 0.08 },
    { name: 'Christin', rate: 0.24 },
    { name: 'Kevin',    rate: 0.24 },
  ],
  2025: [
    { name: 'John',     rate: 0.48 },
    { name: 'Chris',    rate: 0.13 },
    { name: 'Angie',    rate: 0.08 },
    { name: 'Shiguan',  rate: 0.16 },
    { name: 'Jingyi',   rate: 0.16 },
    { name: 'Melvin',   rate: 0.13 },
    { name: 'Reyna',    rate: 0.16 },
    { name: 'Xunqin',   rate: 0.08 },
    { name: 'Christin', rate: 0.24 },
    { name: 'Kevin',    rate: 0.24 },
  ],
  2026: [
    { name: 'John',     rate: 0.48 },
    { name: 'Chris',    rate: 0.13 },
    { name: 'Angie',    rate: 0.08 },
    { name: 'Shiguan',  rate: 0.16 },
    { name: 'Jingyi',   rate: 0.16 },
    { name: 'Melvin',   rate: 0.10 },
    { name: 'Reyna',    rate: 0.16 },
    { name: 'Xunqin',   rate: 0.08 },
    { name: 'Christin', rate: 0.24 },
    { name: 'Eslyn',    rate: 0.24 },
  ],
}

export const SEED_PROD: Record<number, YearData> = {
  2024: {
    John:     [13939.68,29040.99,2710.01,5645.85,28240.08,58833.5,21061.52,43878.17,14158.98,29497.87,27020.17,56292.02],
    Chris:    [0,0,117.31,902.41,82.45,634.24,3270.03,13625.14,233.39,1795.29,82.12,631.72],
    Angie:    [1978.4,24729.96,1763.72,220
