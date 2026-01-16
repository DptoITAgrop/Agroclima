import type { ClimateData } from "./types"

export function getYearCount(data: ClimateData[]): number {
  const years = new Set<number>()
  for (const d of data) {
    const y = new Date(d.date).getFullYear()
    if (Number.isFinite(y)) years.add(y)
  }
  return Math.max(1, years.size)
}

export function safeAvg(nums: number[]): number {
  if (!nums.length) return 0
  const sum = nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
  return sum / nums.length
}

export function safeMin(nums: number[]): number {
  const clean = nums.filter((n) => Number.isFinite(n))
  return clean.length ? Math.min(...clean) : 0
}

export function safeMax(nums: number[]): number {
  const clean = nums.filter((n) => Number.isFinite(n))
  return clean.length ? Math.max(...clean) : 0
}
