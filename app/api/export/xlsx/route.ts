// app/api/export/xlsx/route.ts
import { NextRequest, NextResponse } from "next/server"
import { WeatherService } from "@/lib/weather-apis"
import { buildClimateWorkbook } from "@/lib/xlsx-export"
import type { ClimateRequest } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = await req.json()

  const origin = req.nextUrl.origin
  const service = new WeatherService(origin)

  const source = String(body.source || "NASA_POWER")
  const startDate = String(body.startDate || "")
  const endDate = String(body.endDate || "")

  const climateRequest: ClimateRequest = {
    source,
    startDate,
    endDate,
    parameters: Array.isArray(body.parameters) ? body.parameters : [],
    latitude: Number(body.latitude ?? 0),
    longitude: Number(body.longitude ?? 0),
    postalCode: body.postalCode ? String(body.postalCode).trim() : undefined,
    municipio: body.municipio ? String(body.municipio).trim() : undefined,
  } as any

  const resp = await service.getClimateDataBySource(climateRequest)

  if (!resp.success) {
    return NextResponse.json(resp, { status: 400 })
  }

  const workbook = await buildClimateWorkbook({
    meta: {
      latitude: climateRequest.latitude,
      longitude: climateRequest.longitude,
      startDate,
      endDate,
    },
    sources: {
      [source]: resp.data || [],
    },
  })

  const filename = `Agroclima_${source}_${startDate || "NA"}_${endDate || "NA"}.xlsx`

  return new NextResponse(workbook, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
