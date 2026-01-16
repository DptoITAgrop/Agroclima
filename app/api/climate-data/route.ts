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
  // IMPORTANTE: T00:00:00 en "local" está bien si la string ya es día puro.
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ClimateRequest>
    const origin = request.nextUrl.origin

    const isAemet = body.source === "AEMET"

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

      // ✅ Opción A: AEMET DIRECTO (igual que Postman)
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
          latitude: 0,
          longitude: 0,
          startDate: startStr,
          endDate: endStr,
          dayCount,
          postalCode: String(body.postalCode).trim(),
          municipio: aemetPayload.municipio,
        },
      })
    }

    // ✅ Resto (NASA/ERA5/SIAR) sigue igual: vía WeatherService
    if (dayCount < 0) {
      return NextResponse.json({ success: false, error: "endDate must be >= startDate" }, { status: 400 })
    }
    if (dayCount > 730) {
      return NextResponse.json({ success: false, error: "Date range cannot exceed 2 years" }, { status: 400 })
    }

    const weatherService = new WeatherService(origin)

    const climateRequest: ClimateRequest = {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      startDate: startStr,
      endDate: endStr,
      parameters: Array.isArray(body.parameters) ? body.parameters : [],
      source: body.source,
    }

    const result = await weatherService.getClimateDataBySource(climateRequest)

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      source: climateRequest.source,
      data: result.data,
      requestInfo: {
        latitude: climateRequest.latitude,
        longitude: climateRequest.longitude,
        startDate: climateRequest.startDate,
        endDate: climateRequest.endDate,
        dayCount,
      },
    })
  } catch (error) {
    console.error("Climate data API error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
