"use client"

import { useMemo, useState } from "react"
import type { ClimateRequest, ClimateData, ApiResponse, DataSource } from "@/lib/types"
import { ClimateCalculator } from "@/lib/climate-calculations"

type ClimateDataResults = Partial<Record<DataSource, ApiResponse<ClimateData[]>>>

interface ClimateAnalysisResults {
  rawData: ClimateDataResults
  analyses: Partial<
    Record<
      DataSource,
      {
        summary: any
        suitability: any
        dataPoints: number

        // ✅ NUEVO: para explotar histórico 20 años en UI
        breakdowns?: {
          yearly: Array<{
            year: number
            temperature_max: number
            temperature_min: number
            temperature_avg: number
            precipitation: number
            eto: number
            etc: number
            gdd: number
            chill_hours: number
            frost_hours: number
            frost_days: number
            count: number
          }>
          monthly: Array<{
            year: number
            month: number // 1..12
            temperature_max: number
            temperature_min: number
            temperature_avg: number
            precipitation: number
            eto: number
            etc: number
            gdd: number
            chill_hours: number
            frost_hours: number
            frost_days: number
            count: number
          }>
        }
      }
    >
  >
}

function isApiErrorPayload(x: any): x is { success: false; error?: string } {
  return x && typeof x === "object" && x.success === false
}

function clampNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? v : fallback
}

function getDateValue(d: any): string {
  const v = d?.date ?? d?.time ?? d?.timestamp ?? d?.datetime
  return typeof v === "string" ? v : v?.toString?.() ?? ""
}

/**
 * ✅ Normaliza payloads típicos de /api/climate-data a ClimateData[]
 * Soporta:
 * - payload.data = [...]
 * - payload.data.data = [...]
 * - payload = { success:true, data:[...] }
 * - payload = [...]
 */
function normalizeRows(payload: any): ClimateData[] {
  if (!payload) return []

  if (Array.isArray(payload)) return payload as ClimateData[]
  if (Array.isArray(payload?.data)) return payload.data as ClimateData[]
  if (Array.isArray(payload?.data?.data)) return payload.data.data as ClimateData[]

  // algunos backends devuelven "rows" o "result"
  if (Array.isArray(payload?.rows)) return payload.rows as ClimateData[]
  if (Array.isArray(payload?.result)) return payload.result as ClimateData[]
  if (Array.isArray(payload?.values)) return payload.values as ClimateData[]

  return []
}

function buildBreakdowns(processed: ClimateData[]) {
  const yearlyMap = new Map<number, any>()
  const monthlyMap = new Map<string, any>()

  for (const day of processed as any[]) {
    const dt = new Date(getDateValue(day))
    const year = dt.getFullYear()
    const month = dt.getMonth() + 1
    if (!Number.isFinite(year) || year < 1900 || !Number.isFinite(month) || month < 1 || month > 12) continue

    // yearly
    if (!yearlyMap.has(year)) {
      yearlyMap.set(year, {
        year,
        temperature_max: 0,
        temperature_min: 0,
        temperature_avg: 0,
        precipitation: 0,
        eto: 0,
        etc: 0,
        gdd: 0,
        chill_hours: 0,
        frost_hours: 0,
        frost_days: 0,
        count: 0,
      })
    }
    const y = yearlyMap.get(year)
    y.temperature_max += clampNumber(day.temperature_max)
    y.temperature_min += clampNumber(day.temperature_min)
    y.temperature_avg += clampNumber(day.temperature_avg)
    y.precipitation += clampNumber(day.precipitation)
    y.eto += clampNumber(day.eto)
    y.etc += clampNumber(day.etc)
    y.gdd += clampNumber(day.gdd)
    y.chill_hours += clampNumber(day.chill_hours)
    y.frost_hours += clampNumber(day.frost_hours)
    if (clampNumber(day.frost_hours) > 0) y.frost_days += 1
    y.count += 1

    // monthly (year-month)
    const key = `${year}-${month}`
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, {
        year,
        month,
        temperature_max: 0,
        temperature_min: 0,
        temperature_avg: 0,
        precipitation: 0,
        eto: 0,
        etc: 0,
        gdd: 0,
        chill_hours: 0,
        frost_hours: 0,
        frost_days: 0,
        count: 0,
      })
    }
    const m = monthlyMap.get(key)
    m.temperature_max += clampNumber(day.temperature_max)
    m.temperature_min += clampNumber(day.temperature_min)
    m.temperature_avg += clampNumber(day.temperature_avg)
    m.precipitation += clampNumber(day.precipitation)
    m.eto += clampNumber(day.eto)
    m.etc += clampNumber(day.etc)
    m.gdd += clampNumber(day.gdd)
    m.chill_hours += clampNumber(day.chill_hours)
    m.frost_hours += clampNumber(day.frost_hours)
    if (clampNumber(day.frost_hours) > 0) m.frost_days += 1
    m.count += 1
  }

  const yearly = Array.from(yearlyMap.values())
    .map((y) => ({
      ...y,
      temperature_max: y.count ? y.temperature_max / y.count : 0,
      temperature_min: y.count ? y.temperature_min / y.count : 0,
      temperature_avg: y.count ? y.temperature_avg / y.count : 0,
    }))
    .sort((a, b) => a.year - b.year)

  const monthly = Array.from(monthlyMap.values())
    .map((m) => ({
      ...m,
      temperature_max: m.count ? m.temperature_max / m.count : 0,
      temperature_min: m.count ? m.temperature_min / m.count : 0,
      temperature_avg: m.count ? m.temperature_avg / m.count : 0,
    }))
    .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))

  return { yearly, monthly }
}

export function useClimateData() {
  const calculator = useMemo(() => new ClimateCalculator(), [])

  const [data, setData] = useState<ClimateDataResults | null>(null)
  const [analysisData, setAnalysisData] = useState<ClimateAnalysisResults | null>(null)

  // ✅ loading “robusto” para paralelos
  const [loadingCount, setLoadingCount] = useState(0)
  const loading = loadingCount > 0

  const [error, setError] = useState<string | null>(null)

  const beginLoading = () => setLoadingCount((c) => c + 1)
  const endLoading = () => setLoadingCount((c) => Math.max(0, c - 1))

  /**
   * ✅ Fetch bajo nivel: devuelve ApiResponse<ClimateData[]> ya normalizada
   * - NO hace cálculo de suitability
   * - deja data[source] cacheada
   */
  const fetchClimateData = async (request: ClimateRequest): Promise<ApiResponse<ClimateData[]> | null> => {
    setError(null)
    beginLoading()

    try {
      const response = await fetch("/api/climate-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        const msg =
          payload?.error ||
          payload?.message ||
          (isApiErrorPayload(payload) ? payload.error : null) ||
          "Failed to fetch climate data"
        throw new Error(msg)
      }

      const rows = normalizeRows(payload)

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Respuesta inválida de /api/climate-data (no hay datos en payload.data)")
      }

      const apiResp: ApiResponse<ClimateData[]> = {
        success: true,
        source: request.source,
        data: rows as ClimateData[],
      }

      setData((prev) => ({
        ...(prev ?? {}),
        [request.source]: apiResp,
      }))

      return apiResp
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred"
      setError(msg)
      return null
    } finally {
      endLoading()
    }
  }

  /**
   * ✅ Analysis para 1 fuente (tu actual, pero bien)
   * - usa fetchClimateData
   * - procesa -> summary/suitability
   * - añade breakdowns (yearly/monthly)
   */
  const fetchClimateAnalysisForSource = async (request: ClimateRequest) => {
    setError(null)
    beginLoading()

    try {
      const apiResp = await fetchClimateData(request)
      if (!apiResp) throw new Error("No se recibió respuesta de datos climáticos")

      if (!apiResp.success || !apiResp.data) {
        throw new Error(apiResp.error || "La fuente devolvió error o no hay datos")
      }

      const processed = calculator.processClimateData(apiResp.data, request.latitude)
      const summary = calculator.calculateSeasonalSummary(processed)
      const suitability = calculator.analyzePistachioSuitability(summary)

      const breakdowns = buildBreakdowns(processed)

      const analyses: ClimateAnalysisResults["analyses"] = {
        [request.source]: {
          summary,
          suitability,
          dataPoints: processed.length,
          breakdowns,
        },
      }

      const rawData: ClimateDataResults = {
        [request.source]: { ...apiResp, data: processed },
      }

      const analysisResult: ClimateAnalysisResults = { rawData, analyses }

      setAnalysisData(analysisResult)
      setData((prev) => ({ ...(prev ?? {}), ...rawData }))

      return analysisResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred"
      setError(msg)
      return null
    } finally {
      endLoading()
    }
  }

  /**
   * ✅ Multi-fuente (ideal “Histórico 20 años”):
   * Le pasas un array de requests (p.ej. OpenMeteo + PowerNasa),
   * y te devuelve un analysisData combinado.
   */
  const fetchClimateAnalysisMulti = async (requests: ClimateRequest[]) => {
    setError(null)
    beginLoading()

    try {
      if (!requests?.length) throw new Error("No se recibieron requests para multi-fuente")

      // Paralelo
      const results = await Promise.all(
        requests.map(async (req) => {
          const apiResp = await fetchClimateData(req)
          if (!apiResp?.success || !apiResp.data) {
            return { source: req.source, ok: false as const, error: apiResp?.error || "Sin datos", data: [] as ClimateData[] }
          }
          const processed = calculator.processClimateData(apiResp.data, req.latitude)
          const summary = calculator.calculateSeasonalSummary(processed)
          const suitability = calculator.analyzePistachioSuitability(summary)
          const breakdowns = buildBreakdowns(processed)

          return {
            source: req.source,
            ok: true as const,
            apiResp,
            processed,
            summary,
            suitability,
            breakdowns,
          }
        })
      )

      const rawData: ClimateDataResults = {}
      const analyses: ClimateAnalysisResults["analyses"] = {}

      for (const r of results as any[]) {
        if (!r?.ok) continue
        rawData[r.source] = { ...r.apiResp, data: r.processed }
        analyses[r.source] = {
          summary: r.summary,
          suitability: r.suitability,
          dataPoints: r.processed.length,
          breakdowns: r.breakdowns,
        }
      }

      const analysisResult: ClimateAnalysisResults = { rawData, analyses }

      setAnalysisData(analysisResult)
      setData((prev) => ({ ...(prev ?? {}), ...rawData }))

      // Si ninguna fuente devolvió datos, error claro:
      if (Object.keys(rawData).length === 0) {
        const errs = results
          .map((r: any) => `${r.source}: ${r.error ?? "sin datos"}`)
          .join(" | ")
        throw new Error(`Ninguna fuente devolvió datos. ${errs}`)
      }

      return analysisResult
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error occurred"
      setError(msg)
      return null
    } finally {
      endLoading()
    }
  }

  // ✅ Para no romper tu API actual (alias)
  const fetchClimateAnalysis = fetchClimateAnalysisForSource

  return {
    data,
    analysisData,
    loading,
    error,
    fetchClimateData,
    fetchClimateAnalysis, // 1 fuente
    fetchClimateAnalysisForSource, // 1 fuente (explicit)
    fetchClimateAnalysisMulti, // multi fuente (OpenMeteo + PowerNasa para 20 años)
  }
}
