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
      }
    >
  >
}

function isApiErrorPayload(x: any): x is { success: false; error?: string } {
  return x && typeof x === "object" && x.success === false
}

export function useClimateData() {
  const calculator = useMemo(() => new ClimateCalculator(), [])

  const [data, setData] = useState<ClimateDataResults | null>(null)
  const [analysisData, setAnalysisData] = useState<ClimateAnalysisResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * ✅ Llama /api/climate-data y normaliza la respuesta a ApiResponse<ClimateData[]>
   * Tu API route devuelve: { success:true, source, data: ClimateData[], requestInfo }
   */
  const fetchClimateData = async (request: ClimateRequest): Promise<ApiResponse<ClimateData[]> | null> => {
    setLoading(true)
    setError(null)

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

      // ✅ Normalizamos: si viene {success:true, data:[...]} lo convertimos a ApiResponse
      const rows: any = payload?.data

      if (!Array.isArray(rows)) {
        throw new Error("Respuesta inválida de /api/climate-data (payload.data no es un array)")
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
      setLoading(false)
    }
  }

  /**
   * ✅ Analysis en cliente
   */
  const fetchClimateAnalysis = async (request: ClimateRequest) => {
    setLoading(true)
    setError(null)

    try {
      const apiResp = await fetchClimateData(request)
      if (!apiResp) throw new Error("No se recibió respuesta de datos climáticos")

      if (!apiResp.success || !apiResp.data) {
        throw new Error(apiResp.error || "La fuente devolvió error o no hay datos")
      }

      const processed = calculator.processClimateData(apiResp.data, request.latitude)
      const summary = calculator.calculateSeasonalSummary(processed)
      const suitability = calculator.analyzePistachioSuitability(summary)

      const analyses: ClimateAnalysisResults["analyses"] = {
        [request.source]: {
          summary,
          suitability,
          dataPoints: processed.length,
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
      setLoading(false)
    }
  }

  return {
    data,
    analysisData,
    loading,
    error,
    fetchClimateData,
    fetchClimateAnalysis,
  }
}
