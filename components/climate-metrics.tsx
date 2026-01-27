// components/climate-metrics.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Thermometer, Snowflake, Clock, Droplets } from "lucide-react"

type AnyObj = Record<string, any>

type ClimateLikeDay = {
  date: string
  temperature_max?: number
  temperature_min?: number
  temperature_avg?: number
  precipitation?: number
  eto?: number
  etc?: number
  frost_hours?: number
  chill_hours?: number
  gdd?: number
}

type Props = {
  /**
   * Puedes pasar:
   * - ClimateData[]
   * - { data: ClimateData[] }
   * - { rawData: ClimateData[] }
   * - { analyses: { rawData: ClimateData[] } }
   */
  data?: any
  /**
   * Opcional: lo usamos para texto contextual
   */
  requestInfo?: {
    startDate?: string
    endDate?: string
    source?: string
    latitude?: number
    longitude?: number
  }
}

function safeNum(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function parseISODate(s?: string) {
  if (!s || typeof s !== "string") return null
  // "YYYY-MM-DD"
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const dt = new Date(`${s}T00:00:00`)
  return Number.isFinite(dt.getTime()) ? dt : null
}

function formatCompact(n: number, decimals = 0) {
  const v = Number.isFinite(n) ? n : 0
  return v.toLocaleString("es-ES", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
}

function extractDays(input: any): ClimateLikeDay[] {
  if (!input) return []
  if (Array.isArray(input)) return input as ClimateLikeDay[]

  const obj = input as AnyObj

  // casos típicos
  const direct = obj?.data
  if (Array.isArray(direct)) return direct as ClimateLikeDay[]

  const raw = obj?.rawData
  if (Array.isArray(raw)) return raw as ClimateLikeDay[]

  const analysesRaw = obj?.analyses?.rawData
  if (Array.isArray(analysesRaw)) return analysesRaw as ClimateLikeDay[]

  // algunos endpoints devuelven { data: { rawData } }
  const nestedRaw = obj?.data?.rawData
  if (Array.isArray(nestedRaw)) return nestedRaw as ClimateLikeDay[]

  return []
}

function dayAvgTemp(d: ClimateLikeDay) {
  const avg = safeNum(d.temperature_avg, NaN)
  if (Number.isFinite(avg)) return avg

  const tmax = safeNum(d.temperature_max, NaN)
  const tmin = safeNum(d.temperature_min, NaN)
  if (Number.isFinite(tmax) && Number.isFinite(tmin)) return (tmax + tmin) / 2

  // si solo hay uno
  if (Number.isFinite(tmax)) return tmax
  if (Number.isFinite(tmin)) return tmin

  return NaN
}

function isInChillWindow(dateISO: string) {
  // pistacho: Nov–Feb
  const d = new Date(`${dateISO}T00:00:00`)
  const m = d.getMonth() + 1
  return m === 11 || m === 12 || m === 1 || m === 2
}

export function ClimateMetrics({ data, requestInfo }: Props) {
  const days = useMemo(() => {
    const arr = extractDays(data)
    return arr
      .filter((d) => typeof d?.date === "string" && d.date.length >= 10)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  }, [data])

  const computed = useMemo(() => {
    if (!days.length) {
      return {
        hasData: false,
        avgTemp: 0,
        frostDays: 0,
        chillHours: 0,
        etoTotal: 0,
        etcTotal: 0,
        precipTotal: 0,
        from: requestInfo?.startDate ?? null,
        to: requestInfo?.endDate ?? null,
        source: requestInfo?.source ?? null,
      }
    }

    const temps: number[] = []
    let frostDays = 0
    let chillHours = 0
    let etoTotal = 0
    let etcTotal = 0
    let precipTotal = 0

    for (const d of days) {
      const t = dayAvgTemp(d)
      if (Number.isFinite(t)) temps.push(t)

      // heladas: preferimos frost_hours si existe (más preciso)
      const frostH = safeNum(d.frost_hours, NaN)
      if (Number.isFinite(frostH)) {
        if (frostH > 0) frostDays += 1
      } else {
        // fallback: Tmin < 0
        const tmin = safeNum(d.temperature_min, NaN)
        if (Number.isFinite(tmin) && tmin < 0) frostDays += 1
      }

      // horas frío: si existe chill_hours y está en ventana Nov–Feb
      const ch = safeNum(d.chill_hours, NaN)
      if (Number.isFinite(ch) && isInChillWindow(d.date)) chillHours += Math.max(0, ch)

      etoTotal += Math.max(0, safeNum(d.eto, 0))
      etcTotal += Math.max(0, safeNum(d.etc, 0))
      precipTotal += Math.max(0, safeNum(d.precipitation, 0))
    }

    const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : NaN

    const from = days[0]?.date ?? null
    const to = days[days.length - 1]?.date ?? null

    return {
      hasData: true,
      avgTemp: Number.isFinite(avgTemp) ? avgTemp : 0,
      frostDays,
      chillHours,
      etoTotal,
      etcTotal,
      precipTotal,
      from,
      to,
      source: requestInfo?.source ?? null,
    }
  }, [days, requestInfo?.source])

  // “Cambio” (texto secundario) inteligente:
  // - si tenemos ETC calculada (distinto de 0) mostramos Kc/ETC
  // - si no, mostramos balance hídrico aproximado (ET0 - lluvia)
  const secondary = useMemo(() => {
    if (!computed.hasData) return null

    const hasEtc = computed.etcTotal > 0.0001
    if (hasEtc) {
      const kcApprox = computed.etoTotal > 0 ? computed.etcTotal / computed.etoTotal : 0
      return {
        eto: `ET0 total · ${formatCompact(computed.etoTotal, 0)} mm`,
        chill: `Ventana Nov–Feb · ${formatCompact(computed.chillHours, 0)} h`,
        frost: `Eventos detectados · ${computed.frostDays}`,
        temp: `Periodo · ${computed.from} → ${computed.to}`,
        etc: `Kc aprox · ${formatCompact(kcApprox, 2)}`,
      }
    }

    const deficit = computed.etoTotal - computed.precipTotal
    return {
      eto: `ET0 total · ${formatCompact(computed.etoTotal, 0)} mm`,
      chill: `Ventana Nov–Feb · ${formatCompact(computed.chillHours, 0)} h`,
      frost: `Eventos detectados · ${computed.frostDays}`,
      temp: `Periodo · ${computed.from} → ${computed.to}`,
      etc: `${deficit > 0 ? "Déficit" : "Superávit"} · ${formatCompact(Math.abs(deficit), 0)} mm (ET0 - lluvia)`,
    }
  }, [computed])

  const metrics = useMemo(() => {
    if (!computed.hasData) {
      return [
        {
          title: "Temperatura Media",
          value: "—",
          change: "Selecciona fuente y genera un análisis",
          icon: Thermometer,
          color: "text-chart-1",
        },
        {
          title: "Días de Helada",
          value: "—",
          change: "Calculado con Tmin < 0°C o frost_hours",
          icon: Snowflake,
          color: "text-chart-5",
        },
        {
          title: "Horas Frío (Nov–Feb)",
          value: "—",
          change: "Acumuladas con umbral de frío",
          icon: Clock,
          color: "text-chart-3",
        },
        {
          title: "ET0 / Balance",
          value: "—",
          change: "ET0 real (si viene) + balance hídrico",
          icon: Droplets,
          color: "text-chart-2",
        },
      ]
    }

    return [
      {
        title: "Temperatura Media",
        value: `${formatCompact(computed.avgTemp, 1)}°C`,
        change: secondary?.temp ?? "",
        icon: Thermometer,
        color: "text-chart-1",
      },
      {
        title: "Días de Helada",
        value: `${computed.frostDays} día${computed.frostDays === 1 ? "" : "s"}`,
        change: secondary?.frost ?? "",
        icon: Snowflake,
        color: "text-chart-5",
      },
      {
        title: "Horas Frío (Nov–Feb)",
        value: `${formatCompact(computed.chillHours, 0)} h`,
        change: secondary?.chill ?? "",
        icon: Clock,
        color: "text-chart-3",
      },
      {
        title: "ET0 / Balance",
        value: `${formatCompact(computed.etoTotal, 0)} mm`,
        change: secondary?.etc ?? "",
        icon: Droplets,
        color: "text-chart-2",
      },
    ]
  }, [computed, secondary])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <Card key={m.title} className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
            <CardTitle className="text-xs font-medium">{m.title}</CardTitle>
            <m.icon className={`h-4 w-4 ${m.color}`} />
          </CardHeader>

          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-extrabold tracking-tight">{m.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{m.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
