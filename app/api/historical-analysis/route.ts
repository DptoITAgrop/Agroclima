import { type NextRequest, NextResponse } from "next/server"
import { WeatherService } from "@/lib/weather-apis"
import type { ClimateRequest, DataSource } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = Partial<{
  latitude: number
  longitude: number
  source: DataSource
  startDate: string
  endDate: string
}>

function toISODate(d: Date) {
  return d.toISOString().split("T")[0]
}

function isValidISODate(s?: string) {
  if (!s) return false
  const d = new Date(s)
  return Number.isFinite(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body

    if (body.latitude === undefined || body.longitude === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters (latitude, longitude)" },
        { status: 400 },
      )
    }

    const source: DataSource = body.source ?? "NASA_POWER"

    // ✅ 20 años hacia atrás desde HOY (o desde endDate si lo mandas)
    const end = isValidISODate(body.endDate) ? new Date(body.endDate!) : new Date()
    const start = isValidISODate(body.startDate)
      ? new Date(body.startDate!)
      : new Date(new Date(end).setFullYear(end.getFullYear() - 20))

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid dates (YYYY-MM-DD)" }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ success: false, error: "endDate must be >= startDate" }, { status: 400 })
    }

    const climateRequest: ClimateRequest = {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      startDate: toISODate(start),
      endDate: toISODate(end),
      parameters: [],
      source,
    }

    const weatherService = new WeatherService()

    // ✅ ESTE es el método que existe en tu WeatherService
    const resp = await weatherService.getClimateDataBySource(climateRequest)

    if (!resp.success || !resp.data) {
      return NextResponse.json(
        { success: false, error: resp.error ?? "Historical data fetch failed", source: resp.source ?? source },
        { status: 500 },
      )
    }

    const dayCount = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1

    // ✅ Formato que tu dashboard espera: { data: { analyses, rawData }, requestInfo }
    return NextResponse.json({
      success: true,
      data: {
        analyses: {
          // de momento vacío; luego lo llenamos con el análisis avanzado histórico
          [source]: {},
        },
        rawData: {
          // te paso el array directamente (tu ClimateDashboard lo soporta)
          [source]: resp.data,
        },
      },
      requestInfo: {
        latitude: climateRequest.latitude,
        longitude: climateRequest.longitude,
        startDate: climateRequest.startDate,
        endDate: climateRequest.endDate,
        dayCount,
        isHistorical: true,
      },
    })
  } catch (error) {
    console.error("[historical-analysis] error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Historical analysis error" },
      { status: 500 },
    )
  }
}
