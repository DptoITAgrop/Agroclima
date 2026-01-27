// app/api/weather/open-meteo/route.ts
import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse, ClimateData, ClimateRequest } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CHILL_THRESHOLD_C = 7.2
const FROST_THRESHOLD_C = 0
const GDD_BASE_C = 7

function isISODate(s?: string) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function dateKeyFromISODateTime(dt: string) {
  // "2025-01-10T13:00" -> "2025-01-10"
  return String(dt).slice(0, 10)
}

async function fetchJson(url: string, timeoutMs = 30000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal })
    const text = await res.text().catch(() => "")
    if (!res.ok) throw new Error(`Open-Meteo error ${res.status}: ${text}`)
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(t)
  }
}

/**
 * Open-Meteo daily:
 * - precipitation_sum: mm
 * - et0_fao_evapotranspiration: mm
 * - shortwave_radiation_sum: normalmente MJ/m²/día
 */
type DailyPayload = {
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
    et0_fao_evapotranspiration?: number[]
    shortwave_radiation_sum?: number[]
    wind_speed_10m_max?: number[]
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
  }
}

type ChillAgg = {
  chillH: number
  frostH: number
}

function mjToKWh(mj: number) {
  // 1 MJ = 0.277777... kWh
  return mj * 0.2777777778
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<ClimateRequest>

    if (!body || body.source !== "OPEN_METEO") {
      return NextResponse.json(
        { success: false, source: "OPEN_METEO", error: "source debe ser OPEN_METEO" } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
      return NextResponse.json(
        { success: false, source: "OPEN_METEO", error: "Faltan coordenadas (latitude/longitude)" } satisfies ApiResponse<
          never
        >,
        { status: 400 },
      )
    }

    if (!isISODate(body.startDate) || !isISODate(body.endDate)) {
      return NextResponse.json(
        {
          success: false,
          source: "OPEN_METEO",
          error: "Fechas inválidas. Usa YYYY-MM-DD en startDate y endDate",
        } satisfies ApiResponse<never>,
        { status: 400 },
      )
    }

    const lat = body.latitude
    const lon = body.longitude
    const startDate = body.startDate!
    const endDate = body.endDate!

    // Elegimos API histórica o forecast según si termina en futuro
    // (si tu rango cruza pasado/futuro, forecast suele funcionar mejor; archive es más estricto)
    const todayISO = new Date().toISOString().slice(0, 10)
    const useForecast = endDate > todayISO

    const baseUrl = useForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive"

    // ✅ DAILY: lo “diario real”
    const dailyVars = [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "et0_fao_evapotranspiration",
      "shortwave_radiation_sum",
      "wind_speed_10m_max",
    ].join(",")

    // ✅ HOURLY: solo lo necesario para horas frío/helada reales
    const hourlyVars = ["temperature_2m"].join(",")

    const url =
      `${baseUrl}` +
      `?latitude=${encodeURIComponent(String(lat))}` +
      `&longitude=${encodeURIComponent(String(lon))}` +
      `&start_date=${encodeURIComponent(startDate)}` +
      `&end_date=${encodeURIComponent(endDate)}` +
      `&daily=${encodeURIComponent(dailyVars)}` +
      `&hourly=${encodeURIComponent(hourlyVars)}` +
      `&timezone=UTC`

    const payload = (await fetchJson(url)) as DailyPayload

    const dTime = payload.daily?.time ?? []
    const tmaxA = payload.daily?.temperature_2m_max ?? []
    const tminA = payload.daily?.temperature_2m_min ?? []
    const pSumA = payload.daily?.precipitation_sum ?? []
    const etoA = payload.daily?.et0_fao_evapotranspiration ?? []
    const radSumA = payload.daily?.shortwave_radiation_sum ?? []
    const windMaxA = payload.daily?.wind_speed_10m_max ?? []

    const hTime = payload.hourly?.time ?? []
    const hTemp = payload.hourly?.temperature_2m ?? []

    if (!Array.isArray(dTime) || dTime.length === 0 || tmaxA.length !== dTime.length || tminA.length !== dTime.length) {
      return NextResponse.json(
        {
          success: false,
          source: "OPEN_METEO",
          error: "Respuesta inesperada de Open-Meteo (daily incompleto)",
          debug: { url, got: { dailyLen: dTime?.length, tmaxLen: tmaxA?.length, tminLen: tminA?.length } },
        } satisfies ApiResponse<never>,
        { status: 502 },
      )
    }

    // ---------
    // 1) Agregar horas frío / helada desde hourly
    // ---------
    const chillByDay: Record<string, ChillAgg> = {}

    if (Array.isArray(hTime) && Array.isArray(hTemp) && hTime.length > 0 && hTime.length === hTemp.length) {
      for (let i = 0; i < hTime.length; i++) {
        const dt = hTime[i]
        const dayKey = dateKeyFromISODateTime(dt)

        const Tc = safeNum(hTemp[i], NaN)
        if (!Number.isFinite(Tc)) continue

        if (!chillByDay[dayKey]) chillByDay[dayKey] = { chillH: 0, frostH: 0 }

        if (Tc < CHILL_THRESHOLD_C) chillByDay[dayKey].chillH += 1
        if (Tc < FROST_THRESHOLD_C) chillByDay[dayKey].frostH += 1
      }
    } else {
      // no es fatal, pero avisamos
      // (sin hourly no puedes calcular horas frío reales)
    }

    // ---------
    // 2) Construir ClimateData[] diario
    // ---------
    const out: ClimateData[] = dTime.map((dateISO, idx) => {
      const tmax = safeNum(tmaxA[idx], 0)
      const tmin = safeNum(tminA[idx], 0)
      const tavg = (tmax + tmin) / 2

      const precip = safeNum(pSumA[idx], 0) // mm/día
      const eto = safeNum(etoA[idx], 0) // mm/día
      const windMax = safeNum(windMaxA[idx], 0)

      // radiación diaria: MJ/m²/día -> kWh/m²/día (como tu ERA5)
      const radMJ = safeNum(radSumA[idx], 0)
      const radKWh = mjToKWh(Math.max(0, radMJ))

      const chill = chillByDay[dateISO]?.chillH ?? 0
      const frost = chillByDay[dateISO]?.frostH ?? 0

      // GDD base 7 diario (coherente con tu motor de variedades)
      const gdd = Math.max(0, tavg - GDD_BASE_C)

      return {
        date: dateISO,
        temperature_max: Number(tmax.toFixed(2)),
        temperature_min: Number(tmin.toFixed(2)),
        temperature_avg: Number(tavg.toFixed(2)),

        // Open-Meteo daily no nos da RH en daily en este endpoint -> dejamos 0
        humidity: 0,

        precipitation: Number(Math.max(0, precip).toFixed(2)),
        wind_speed: Number(Math.max(0, windMax).toFixed(2)), // aquí usamos el max diario como proxy
        solar_radiation: Number(radKWh.toFixed(3)), // kWh/m²/día

        eto: Number(Math.max(0, eto).toFixed(3)), // mm/día
        etc: 0, // lo calculará tu ClimateCalculator con Kc

        frost_hours: frost,
        chill_hours: chill,
        gdd: Number(gdd.toFixed(2)),

        computedChillHeat: true,
        computedFromHourly: true,
      }
    })

    const resp: ApiResponse<ClimateData[]> = {
      success: true,
      source: "OPEN_METEO",
      data: out,
      debug: {
        api: useForecast ? "forecast" : "archive",
        dailyVars,
        hourlyVars,
        days: out.length,
        note:
          hTime.length === 0
            ? "Sin hourly: no se pudieron calcular horas frío/helada reales."
            : undefined,
      },
    }

    return NextResponse.json(resp)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Open-Meteo error"
    return NextResponse.json({ success: false, source: "OPEN_METEO", error: message } satisfies ApiResponse<never>, {
      status: 500,
    })
  }
}
