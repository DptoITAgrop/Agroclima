// app/api/climate-data/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { WeatherService } from "@/lib/weather-apis"
import type { ClimateRequest } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isYYYYMMDD(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function normalizeToYYYYMMDD(input?: string) {
  // acepta "YYYY-MM-DD" o ISO tipo "YYYY-MM-DDTHH:mm:ssZ"
  const s = String(input || "").trim()
  if (!s) return ""
  return s.slice(0, 10)
}

function toDateOrNull(yyyyMMdd: string) {
  if (!isYYYYMMDD(yyyyMMdd)) return null
  const d = new Date(`${yyyyMMdd}T00:00:00`)
  return Number.isFinite(d.getTime()) ? d : null
}

function diffDaysInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

function addDaysYYYYMMDD(baseYYYYMMDD: string, days: number) {
  const d = toDateOrNull(baseYYYYMMDD)
  if (!d) return ""
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function clampYYYYMMDD(s: string) {
  // defensa por si llega algo raro
  return normalizeToYYYYMMDD(s)
}

function sortAndDedupeByDate<T extends { date: string }>(rows: T[]) {
  const map = new Map<string, T>()
  for (const r of rows) {
    const key = clampYYYYMMDD(r.date)
    if (!key) continue
    // si hay duplicado, nos quedamos el último (normalmente idéntico)
    map.set(key, { ...r, date: key })
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

function splitRangeIntoChunks(startStr: string, endStr: string, maxDaysInclusive: number) {
  const start = toDateOrNull(startStr)
  const end = toDateOrNull(endStr)
  if (!start || !end) return []

  const chunks: Array<{ start: string; end: string }> = []
  let cursor = new Date(start)

  while (cursor.getTime() <= end.getTime()) {
    const chunkStart = new Date(cursor)
    const chunkEnd = new Date(cursor)
    chunkEnd.setDate(chunkEnd.getDate() + (maxDaysInclusive - 1))
    if (chunkEnd.getTime() > end.getTime()) chunkEnd.setTime(end.getTime())

    const s = chunkStart.toISOString().slice(0, 10)
    const e = chunkEnd.toISOString().slice(0, 10)
    chunks.push({ start: s, end: e })

    // siguiente día tras el chunkEnd
    cursor = new Date(chunkEnd)
    cursor.setDate(cursor.getDate() + 1)
  }

  return chunks
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ClimateRequest> & {
      isHistorical?: boolean
    }

    const origin = process.env.INTERNAL_BASE_URL || request.nextUrl.origin
    const isAemet = body.source === "AEMET"
    const isHistorical = !!(body as any)?.isHistorical

    // ✅ source siempre obligatorio
    if (!body.source) {
      return NextResponse.json({ success: false, error: "Missing required parameter (source)" }, { status: 400 })
    }

    // ✅ Validación por fuente
    if (isAemet) {
      // AEMET: solo CP obligatorio
      if (!body.postalCode || !/^\d{5}$/.test(String(body.postalCode).trim())) {
        return NextResponse.json({ success: false, error: "Código postal inválido (5 dígitos)" }, { status: 400 })
      }
    } else {
      // NASA/ERA5/SIAR: fechas + lat/lon obligatorios
      if (!body.startDate || !body.endDate) {
        return NextResponse.json(
          { success: false, error: "Missing required parameters (startDate, endDate)" },
          { status: 400 },
        )
      }
      if (body.latitude === undefined || body.longitude === undefined) {
        return NextResponse.json(
          { success: false, error: "Missing required parameters (latitude, longitude)" },
          { status: 400 },
        )
      }
    }

    // ✅ Fechas (AEMET: opcionales; resto: obligatorias)
    const todayStr = new Date().toISOString().slice(0, 10)

    let startStr = ""
    let endStr = ""

    if (isAemet) {
      // si no vienen fechas, default = hoy -> hoy+6
      startStr = normalizeToYYYYMMDD(body.startDate) || todayStr
      endStr = normalizeToYYYYMMDD(body.endDate) || addDaysYYYYMMDD(startStr, 6)
    } else {
      startStr = normalizeToYYYYMMDD(body.startDate)
      endStr = normalizeToYYYYMMDD(body.endDate)
    }

    const startDateObj = toDateOrNull(startStr)
    const endDateObj = toDateOrNull(endStr)

    if (!startDateObj || !endDateObj) {
      return NextResponse.json(
        { success: false, error: "Invalid dates (use YYYY-MM-DD)", debug: { startStr, endStr } },
        { status: 400 },
      )
    }

    if (endDateObj.getTime() < startDateObj.getTime()) {
      return NextResponse.json({ success: false, error: "endDate must be >= startDate" }, { status: 400 })
    }

    const daysDiffInclusive = diffDaysInclusive(startDateObj, endDateObj)
    const dayCount = daysDiffInclusive - 1 // mantengo tu dayCount anterior (end-start)

    // --------------------
    // AEMET (forecast)
    // --------------------
    if (isAemet) {
      // AEMET: forecast futuro y máximo 7 días
      if (startStr < todayStr) {
        return NextResponse.json(
          { success: false, error: "AEMET solo permite previsión futura (desde hoy).", debug: { startStr, todayStr } },
          { status: 400 },
        )
      }
      if (daysDiffInclusive > 7) {
        return NextResponse.json({ success: false, error: "Rango de fechas excedido (máx 7 días)" }, { status: 400 })
      }

      const aemetRes = await fetch(`${origin}/api/weather/aemet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          postalCode: String(body.postalCode).trim(),
          startDate: startStr,
          endDate: endStr,
          municipio: body.municipio ? String(body.municipio).trim() : undefined,
        }),
      })

      const aemetPayload = await aemetRes.json().catch(() => null)

      if (!aemetRes.ok || !aemetPayload?.success) {
        return NextResponse.json(
          {
            success: false,
            error: aemetPayload?.error || "Error AEMET",
            source: "AEMET",
            debug: aemetPayload,
          },
          { status: 400 },
        )
      }

      return NextResponse.json({
        success: true,
        source: "AEMET",
        data: aemetPayload.data,
        requestInfo: {
          source: "AEMET",
          latitude: 0,
          longitude: 0,
          startDate: startStr,
          endDate: endStr,
          dayCount,
          isHistorical: false,
          postalCode: String(body.postalCode).trim(),
          municipio: aemetPayload.municipio,
          municipioNombre: aemetPayload.municipioNombre,
        },
      })
    }

    // --------------------
    // Resto (NASA/ERA5/SIAR)
    // --------------------
    if (dayCount < 0) {
      return NextResponse.json({ success: false, error: "endDate must be >= startDate" }, { status: 400 })
    }

    const weatherService = new WeatherService(origin)

    const baseReq: ClimateRequest = {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      startDate: startStr,
      endDate: endStr,
      parameters: Array.isArray(body.parameters) ? body.parameters : [],
      source: body.source,
    }

    // ✅ Caso normal: limitamos a 2 años
    if (!isHistorical) {
      if (dayCount > 730) {
        return NextResponse.json(
          {
            success: false,
            error: "Date range cannot exceed 2 years (activa isHistorical para rangos largos)",
          },
          { status: 400 },
        )
      }

      const result = await weatherService.getClimateDataBySource(baseReq)
      if (!result.success) return NextResponse.json(result, { status: 400 })

      return NextResponse.json({
        success: true,
        source: baseReq.source,
        data: result.data,
        requestInfo: {
          source: baseReq.source,
          latitude: baseReq.latitude,
          longitude: baseReq.longitude,
          startDate: baseReq.startDate,
          endDate: baseReq.endDate,
          dayCount,
          isHistorical: false,
        },
      })
    }

    // ✅ Histórico: chunking <= 730 días por llamada y merge final
    const chunks = splitRangeIntoChunks(startStr, endStr, 730)

    if (!chunks.length) {
      return NextResponse.json({ success: false, error: "No se pudo generar el rango histórico" }, { status: 400 })
    }

    const merged: any[] = []

    for (const c of chunks) {
      const chunkReq: ClimateRequest = {
        ...baseReq,
        startDate: c.start,
        endDate: c.end,
      }

      const r = await weatherService.getClimateDataBySource(chunkReq)
      if (!r.success) {
        return NextResponse.json(
          {
            success: false,
            error: r.error || "Error obteniendo chunk histórico",
            source: baseReq.source,
            debug: { chunk: c },
          },
          { status: 400 },
        )
      }

      if (Array.isArray(r.data)) merged.push(...r.data)
    }

    const finalData = sortAndDedupeByDate(merged)

    const yearsCount = new Set(finalData.map((d: any) => String(d.date || "").slice(0, 4)).filter(Boolean)).size

    return NextResponse.json({
      success: true,
      source: baseReq.source,
      data: finalData,
      requestInfo: {
        source: baseReq.source,
        latitude: baseReq.latitude,
        longitude: baseReq.longitude,
        startDate: startStr,
        endDate: endStr,
        dayCount: diffDaysInclusive(startDateObj, endDateObj) - 1,
        isHistorical: true,
        yearsCount,
        chunksCount: chunks.length,
      },
    })
  } catch (error) {
    console.error("Climate data API error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
