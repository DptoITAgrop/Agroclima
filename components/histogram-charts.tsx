"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ClimateData } from "@/lib/types"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Area,
  AreaChart,
  ScatterChart,
  Scatter,
  Legend,
} from "recharts"

interface HistogramChartsProps {
  data?: {
    analyses: Record<
      string,
      {
        summary: any
        suitability: any
        dataPoints: number
      }
    >
    rawData: Record<string, any>
  }
}

/** =========================================================
 *  Helpers PRO (tooltip, labels, formateo)
 *  ========================================================= */
function clampNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? v : fallback
}

function niceName(key: string) {
  const map: Record<string, string> = {
    temperature_max: "Temp. Máxima",
    temperature_min: "Temp. Mínima",
    temperature_avg: "Temp. Media",
    precipitation: "Precipitación",
    eto: "ETo",
    etc: "ETc",
    gdd: "Grados Día",
    chill_hours: "Horas Frío",
    frost_hours: "Horas Helada",
    frost_days: "Días de Helada",
    temp_range: "Rango (Max–Min)",
  }
  return map[key] ?? key
}

function getDateValue(d: any): string {
  // soporta date, time, timestamp...
  const v = d?.date ?? d?.time ?? d?.timestamp ?? d?.datetime
  return typeof v === "string" ? v : v?.toString?.() ?? ""
}

/**
 * Normaliza rawData[source] a un array ClimateData[]
 * Soporta:
 * - array directo
 * - { data: [...] }
 * - { success: true, data: [...] }
 * - { success: true, data: { data: [...] } }
 */
function normalizeClimateArray(raw: any): ClimateData[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as ClimateData[]

  // casos típicos
  if (Array.isArray(raw?.data)) return raw.data as ClimateData[]
  if (Array.isArray(raw?.data?.data)) return raw.data.data as ClimateData[]

  // si viene { success: true, data: [...] }
  if (raw?.success && Array.isArray(raw?.data)) return raw.data as ClimateData[]
  if (raw?.success && Array.isArray(raw?.data?.data)) return raw.data.data as ClimateData[]

  // algunas APIs meten { result: [...] } o { values: [...] }
  if (Array.isArray(raw?.result)) return raw.result as ClimateData[]
  if (Array.isArray(raw?.values)) return raw.values as ClimateData[]

  return []
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: any[]
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-border/60 bg-background/90 backdrop-blur px-3 py-2 shadow-lg">
      <div className="text-xs font-semibold text-foreground">{label}</div>
      <div className="mt-1 space-y-1">
        {payload
          .filter((p) => p?.value !== undefined && p?.name !== "__ghost__")
          .map((p, i) => {
            const key = String(p?.dataKey ?? p?.name ?? "")
            const name = niceName(key)
            const v = clampNumber(p?.value, 0)

            const formatted =
              key.includes("temperature")
                ? `${v.toFixed(1)}°C`
                : key === "gdd"
                  ? `${v.toFixed(0)}`
                  : key.includes("hours")
                    ? `${v.toFixed(0)}h`
                    : key.includes("days")
                      ? `${v.toFixed(0)} días`
                      : `${v.toFixed(1)}mm`

            return (
              <div key={i} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{name}</span>
                <span className="font-semibold text-foreground">{formatted}</span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

export function HistogramCharts({ data }: HistogramChartsProps) {
  const [selectedSource, setSelectedSource] = useState<string>("")
  const [selectedYear, setSelectedYear] = useState<string>("all")

  // ✅ detectar modo oscuro (en tu app lo controlas con class "dark" en <html>)
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const update = () => setIsDark(root.classList.contains("dark"))
    update()

    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])

  /** =========================================================
   *  🎨 Paleta: en dark -> verde corporativo
   *  ========================================================= */
  const COLORS = useMemo(() => {
    const G1 = "hsl(142 76% 36%)"
    const G2 = "hsl(148 64% 29%)"
    const G3 = "hsl(152 68% 45%)"
    const G4 = "hsl(160 84% 39%)"
    const G5 = "hsl(140 85% 65%)"

    const L1 = "hsl(var(--chart-1))"
    const L2 = "hsl(var(--chart-2))"
    const L3 = "hsl(var(--chart-3))"
    const L4 = "hsl(var(--chart-4))"
    const L5 = "hsl(var(--chart-5))"

    return isDark
      ? {
          primary: G1,
          secondary: G3,
          accent: G4,
          soft: G5,
          deep: G2,
          grid: "rgba(255,255,255,0.10)",
          axis: "rgba(255,255,255,0.55)",
        }
      : {
          primary: L1,
          secondary: L3,
          accent: L4,
          soft: L5,
          deep: L2,
          grid: "rgba(0,0,0,0.08)",
          axis: "rgba(0,0,0,0.55)",
        }
  }, [isDark])

  /** =========================================================
   *  ✅ Fuentes disponibles (normalizadas)
   *  ========================================================= */
  const availableSources = useMemo(() => {
    const rawMap = data?.rawData ?? {}
    return Object.keys(rawMap).filter((source) => {
      const arr = normalizeClimateArray(rawMap[source])
      return arr.length > 0
    })
  }, [data])

  // ✅ Source actual (con fallback estable)
  const currentSource = useMemo(() => {
    if (selectedSource && availableSources.includes(selectedSource)) return selectedSource
    return availableSources[0] ?? ""
  }, [selectedSource, availableSources])

  // ✅ Si cambia availableSources y selectedSource ya no vale, lo reparamos
  useEffect(() => {
    if (!selectedSource && availableSources[0]) {
      setSelectedSource(availableSources[0])
    } else if (selectedSource && availableSources.length > 0 && !availableSources.includes(selectedSource)) {
      setSelectedSource(availableSources[0])
    }
  }, [availableSources, selectedSource])

  // ✅ Datos normalizados de la fuente actual
  const currentData = useMemo(() => {
    const raw = data?.rawData?.[currentSource]
    return normalizeClimateArray(raw)
  }, [data, currentSource])

  // Get available years
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    currentData.forEach((d: any) => {
      const dt = new Date(getDateValue(d))
      const y = dt.getFullYear()
      if (Number.isFinite(y) && y > 1900) years.add(y)
    })
    return [...years].sort((a, b) => b - a)
  }, [currentData])

  // Filter data by year if selected
  const filteredData = useMemo(() => {
    if (selectedYear === "all") return currentData
    const y = Number.parseInt(selectedYear)
    return currentData.filter((d: any) => new Date(getDateValue(d)).getFullYear() === y)
  }, [currentData, selectedYear])

  // Monthly aggregation
  const monthlyData = useMemo(() => {
    const base = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(0, i).toLocaleString("es", { month: "short" }),
      monthNum: i + 1,
      temperature_max: 0,
      temperature_min: 0,
      temperature_avg: 0,
      precipitation: 0,
      eto: 0,
      etc: 0,
      gdd: 0,
      chill_hours: 0,
      frost_hours: 0,
      count: 0,
    }))

    filteredData.forEach((day: any) => {
      const dt = new Date(getDateValue(day))
      const m = dt.getMonth()
      if (!(m >= 0 && m <= 11)) return

      const row = base[m]
      row.temperature_max += clampNumber(day.temperature_max)
      row.temperature_min += clampNumber(day.temperature_min)
      row.temperature_avg += clampNumber(day.temperature_avg)
      row.precipitation += clampNumber(day.precipitation)
      row.eto += clampNumber(day.eto)
      row.etc += clampNumber(day.etc)
      row.gdd += clampNumber(day.gdd)
      row.chill_hours += clampNumber(day.chill_hours)
      row.frost_hours += clampNumber(day.frost_hours)
      row.count += 1
    })

    return base.map((m) => {
      const max = m.count ? m.temperature_max / m.count : 0
      const min = m.count ? m.temperature_min / m.count : 0
      const avg = m.count ? m.temperature_avg / m.count : 0

      return {
        ...m,
        temperature_max: max,
        temperature_min: min,
        temperature_avg: avg,
        temp_range: Math.max(0, max - min),
        precipitation: m.precipitation,
        eto: m.eto,
        etc: m.etc,
        gdd: m.gdd,
        chill_hours: m.chill_hours,
        frost_hours: m.frost_hours,
      }
    })
  }, [filteredData])

  // Yearly aggregation (histórico anual)
  const yearlyData = useMemo(() => {
    const map = new Map<number, any>()

    currentData.forEach((day: any) => {
      const dt = new Date(getDateValue(day))
      const year = dt.getFullYear()
      if (!Number.isFinite(year) || year < 1900) return

      if (!map.has(year)) {
        map.set(year, {
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
      const y = map.get(year)
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
    })

    return Array.from(map.values())
      .map((y) => ({
        ...y,
        temperature_max: y.count ? y.temperature_max / y.count : 0,
        temperature_min: y.count ? y.temperature_min / y.count : 0,
        temperature_avg: y.count ? y.temperature_avg / y.count : 0,
      }))
      .sort((a, b) => a.year - b.year)
  }, [currentData])

  // Scatter sampling
  const scatterData = useMemo(() => {
    const maxPoints = 160
    if (filteredData.length <= maxPoints) return filteredData
    const step = Math.ceil(filteredData.length / maxPoints)
    return filteredData.filter((_, idx) => idx % step === 0)
  }, [filteredData])

  if (!data || availableSources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            No hay datos disponibles para mostrar visualizaciones. Por favor, realiza una consulta primero.
          </p>
          <p className="text-xs text-muted-foreground text-center mt-2">
            (Tip: ahora soportamos rawData como array directo o {`{ success, data }`}. Si sigue saliendo, es que la API no está devolviendo datos.)
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card className="border-border/60 bg-background/60 backdrop-blur">
        <CardHeader>
          <CardTitle>Configuración de Visualización</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Fuente de Datos</label>
              <Select value={currentSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar fuente" />
                </SelectTrigger>
                <SelectContent>
                  {availableSources.map((source) => {
                    const n = normalizeClimateArray(data.rawData[source]).length
                    return (
                      <SelectItem key={source} value={source}>
                        {source} ({n} días)
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Año</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los años</SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Consejo: usa “Todos los años” para ver estacionalidad. Filtra un año para comparar campañas.
          </div>
        </CardContent>
      </Card>

      {/* Chart Tabs */}
      <Tabs defaultValue="temperature" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <TabsTrigger value="temperature">Temperatura</TabsTrigger>
          <TabsTrigger value="water">Agua</TabsTrigger>
          <TabsTrigger value="frost">Heladas</TabsTrigger>
          <TabsTrigger value="gdd">Grados Día</TabsTrigger>
          <TabsTrigger value="yearly">Histórico Anual</TabsTrigger>
        </TabsList>

        {/* Temperature */}
        <TabsContent value="temperature" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Temperaturas Mensuales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tempBand" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.primary} stopOpacity={isDark ? 0.22 : 0.28} />
                          <stop offset="100%" stopColor={COLORS.primary} stopOpacity={isDark ? 0.06 : 0.05} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        stroke={COLORS.axis}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}°`}
                        width={36}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />

                      <Area
                        type="monotone"
                        dataKey="temperature_min"
                        stackId="tempBand"
                        stroke="transparent"
                        fill="transparent"
                        name="__ghost__"
                        isAnimationActive
                      />
                      <Area
                        type="monotone"
                        dataKey="temp_range"
                        stackId="tempBand"
                        stroke={COLORS.primary}
                        fill="url(#tempBand)"
                        name="Rango (Max–Min)"
                        isAnimationActive
                      />

                      <Line
                        type="monotone"
                        dataKey="temperature_avg"
                        stroke={isDark ? COLORS.soft : COLORS.secondary}
                        strokeWidth={2.6}
                        dot={false}
                        name="Temp. Media"
                        isAnimationActive
                      />

                      <Line
                        type="monotone"
                        dataKey="temperature_max"
                        stroke={isDark ? COLORS.primary : COLORS.soft}
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="6 4"
                        name="Temp. Máxima"
                        isAnimationActive
                      />
                      <Line
                        type="monotone"
                        dataKey="temperature_min"
                        stroke={isDark ? COLORS.accent : COLORS.deep}
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="6 4"
                        name="Temp. Mínima"
                        isAnimationActive
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Distribución de Temperaturas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis
                        dataKey="temperature_min"
                        tickLine={false}
                        axisLine={false}
                        stroke={COLORS.axis}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}°`}
                      />
                      <YAxis
                        dataKey="temperature_max"
                        tickLine={false}
                        axisLine={false}
                        stroke={COLORS.axis}
                        tickFormatter={(v) => `${Number(v).toFixed(0)}°`}
                        width={36}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Scatter name="Puntos" data={scatterData} dataKey="temperature_max" fill={COLORS.primary} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Water */}
        <TabsContent value="water" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Evapotranspiración Mensual</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />

                      <Bar dataKey="eto" fill={COLORS.primary} name="ETo" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="etc" fill={COLORS.accent} name="ETc" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Precipitación vs ETc (Dual Axis)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />

                      <YAxis yAxisId="mm" tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <YAxis yAxisId="etc" orientation="right" tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />

                      <Tooltip content={<CustomTooltip />} />
                      <Legend />

                      <Bar yAxisId="mm" dataKey="precipitation" fill={COLORS.deep} name="Precipitación" radius={[6, 6, 0, 0]} />
                      <Line yAxisId="etc" type="monotone" dataKey="etc" stroke={COLORS.primary} strokeWidth={2.6} dot={false} name="ETc" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Frost */}
        <TabsContent value="frost" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Horas de Helada por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />

                      <Bar dataKey="frost_hours" fill={COLORS.primary} name="Horas de Helada" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Horas Frío Acumuladas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="chillFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.primary} stopOpacity={isDark ? 0.4 : 0.55} />
                          <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.1} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />

                      <Area type="monotone" dataKey="chill_hours" stroke={COLORS.primary} fill="url(#chillFill)" name="Horas Frío" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* GDD */}
        <TabsContent value="gdd" className="space-y-4">
          <Card className="border-border/60 bg-background/60 backdrop-blur">
            <CardHeader>
              <CardTitle>Grados Día (GDD) vs Temperatura Media</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[360px] sm:h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} stroke={COLORS.axis} />

                    <YAxis yAxisId="gdd" tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                    <YAxis yAxisId="temp" orientation="right" tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}°`} />

                    <Tooltip content={<CustomTooltip />} />
                    <Legend />

                    <Bar yAxisId="gdd" dataKey="gdd" fill={COLORS.primary} name="GDD (mensual)" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="temp" type="monotone" dataKey="temperature_avg" stroke={COLORS.soft} strokeWidth={2.6} dot={false} name="Temp. Media" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Yearly */}
        <TabsContent value="yearly" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Evolución Anual de Temperaturas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={yearlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} tickFormatter={(v) => `${Number(v).toFixed(0)}°`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />

                      <Line type="monotone" dataKey="temperature_max" stroke={COLORS.soft} strokeWidth={2.4} dot={false} name="Temp. Máxima" />
                      <Line type="monotone" dataKey="temperature_avg" stroke={COLORS.primary} strokeWidth={2.8} dot={false} name="Temp. Media" />
                      <Line type="monotone" dataKey="temperature_min" stroke={COLORS.accent} strokeWidth={2.4} dot={false} name="Temp. Mínima" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Días de Helada por Año</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />

                      <Bar dataKey="frost_days" fill={COLORS.primary} name="Días de Helada" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Horas Frío Anuales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={yearlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="yearChill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.primary} stopOpacity={isDark ? 0.4 : 0.55} />
                          <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.1} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />

                      <Area type="monotone" dataKey="chill_hours" stroke={COLORS.primary} fill="url(#yearChill)" name="Horas Frío" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-background/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Grados Día Anuales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px] sm:h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
                      <XAxis dataKey="year" tickLine={false} axisLine={false} stroke={COLORS.axis} />
                      <YAxis tickLine={false} axisLine={false} stroke={COLORS.axis} width={36} />
                      <Tooltip content={<CustomTooltip />} />

                      <Bar dataKey="gdd" fill={COLORS.primary} name="GDD" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
