"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { useState } from "react"
import type { ClimateData } from "@/lib/types"

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
    rawData: Record<
      string,
      {
        success: boolean
        data?: ClimateData[]
        source: string
      }
    >
  }
}

export function HistogramCharts({ data }: HistogramChartsProps) {
  const [selectedSource, setSelectedSource] = useState<string>("")
  const [selectedYear, setSelectedYear] = useState<string>("all")

  // Get available data sources
  const availableSources = data
    ? Object.keys(data.rawData).filter((source) => data.rawData[source].success && data.rawData[source].data)
    : []

  // Set default source if not selected
  const currentSource = selectedSource || availableSources[0] || ""
  const currentData = data?.rawData[currentSource]?.data || []

  // Get available years
  const availableYears = [...new Set(currentData.map((d) => new Date(d.date).getFullYear()))].sort((a, b) => b - a)

  // Filter data by year if selected
  const filteredData =
    selectedYear === "all"
      ? currentData
      : currentData.filter((d) => new Date(d.date).getFullYear() === Number.parseInt(selectedYear))

  // Process data for different chart types
  const processMonthlyData = (data: ClimateData[]) => {
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
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

    data.forEach((day) => {
      const month = new Date(day.date).getMonth()
      monthlyData[month].temperature_max += day.temperature_max
      monthlyData[month].temperature_min += day.temperature_min
      monthlyData[month].temperature_avg += day.temperature_avg
      monthlyData[month].precipitation += day.precipitation
      monthlyData[month].eto += day.eto
      monthlyData[month].etc += day.etc
      monthlyData[month].gdd += day.gdd
      monthlyData[month].chill_hours += day.chill_hours
      monthlyData[month].frost_hours += day.frost_hours
      monthlyData[month].count += 1
    })

    return monthlyData.map((month) => ({
      ...month,
      temperature_max: month.count > 0 ? month.temperature_max / month.count : 0,
      temperature_min: month.count > 0 ? month.temperature_min / month.count : 0,
      temperature_avg: month.count > 0 ? month.temperature_avg / month.count : 0,
      precipitation: month.precipitation,
      eto: month.eto,
      etc: month.etc,
      gdd: month.gdd,
      chill_hours: month.chill_hours,
      frost_hours: month.frost_hours,
    }))
  }

  const processYearlyData = (data: ClimateData[]) => {
    const yearlyData = new Map()

    data.forEach((day) => {
      const year = new Date(day.date).getFullYear()
      if (!yearlyData.has(year)) {
        yearlyData.set(year, {
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

      const yearData = yearlyData.get(year)
      yearData.temperature_max += day.temperature_max
      yearData.temperature_min += day.temperature_min
      yearData.temperature_avg += day.temperature_avg
      yearData.precipitation += day.precipitation
      yearData.eto += day.eto
      yearData.etc += day.etc
      yearData.gdd += day.gdd
      yearData.chill_hours += day.chill_hours
      yearData.frost_hours += day.frost_hours
      if (day.frost_hours > 0) yearData.frost_days += 1
      yearData.count += 1
    })

    return Array.from(yearlyData.values())
      .map((year) => ({
        ...year,
        temperature_max: year.count > 0 ? year.temperature_max / year.count : 0,
        temperature_min: year.count > 0 ? year.temperature_min / year.count : 0,
        temperature_avg: year.count > 0 ? year.temperature_avg / year.count : 0,
      }))
      .sort((a, b) => a.year - b.year)
  }

  const monthlyData = processMonthlyData(filteredData)
  const yearlyData = processYearlyData(currentData)

  // Custom tooltip formatter
  const formatTooltip = (value: any, name: string) => {
    const formatters: Record<string, (v: number) => string> = {
      temperature_max: (v) => `${v.toFixed(1)}°C`,
      temperature_min: (v) => `${v.toFixed(1)}°C`,
      temperature_avg: (v) => `${v.toFixed(1)}°C`,
      precipitation: (v) => `${v.toFixed(1)}mm`,
      eto: (v) => `${v.toFixed(1)}mm`,
      etc: (v) => `${v.toFixed(1)}mm`,
      gdd: (v) => `${v.toFixed(0)}`,
      chill_hours: (v) => `${v.toFixed(0)}h`,
      frost_hours: (v) => `${v.toFixed(0)}h`,
      frost_days: (v) => `${v.toFixed(0)} días`,
    }

    const formatter = formatters[name] || ((v: number) => v.toFixed(1))
    return [formatter(Number(value)), name]
  }

  if (!data || availableSources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            No hay datos disponibles para mostrar histogramas. Por favor, realiza una consulta primero.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Configuración de Visualización</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Fuente de Datos</label>
              <Select value={currentSource} onValueChange={setSelectedSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar fuente" />
                </SelectTrigger>
                <SelectContent>
                  {availableSources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source} ({data.rawData[source].data?.length || 0} días)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Año</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Chart Tabs */}
      <Tabs defaultValue="temperature" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="temperature">Temperatura</TabsTrigger>
          <TabsTrigger value="water">Agua</TabsTrigger>
          <TabsTrigger value="frost">Heladas</TabsTrigger>
          <TabsTrigger value="gdd">Grados Día</TabsTrigger>
          <TabsTrigger value="yearly">Histórico Anual</TabsTrigger>
        </TabsList>

        {/* Temperature Charts */}
        <TabsContent value="temperature" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Temperaturas Mensuales</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="temperature_max"
                      stackId="1"
                      stroke="hsl(var(--chart-5))"
                      fill="hsl(var(--chart-5))"
                      fillOpacity={0.3}
                      name="Temp. Máxima"
                    />
                    <Area
                      type="monotone"
                      dataKey="temperature_min"
                      stackId="2"
                      stroke="hsl(var(--chart-1))"
                      fill="hsl(var(--chart-1))"
                      fillOpacity={0.3}
                      name="Temp. Mínima"
                    />
                    <Line
                      type="monotone"
                      dataKey="temperature_avg"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      name="Temp. Media"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de Temperaturas</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart data={filteredData.slice(0, 100)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="temperature_min" name="Temp. Mín" />
                    <YAxis dataKey="temperature_max" name="Temp. Máx" />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      formatter={(value, name) => [`${Number(value).toFixed(1)}°C`, name]}
                    />
                    <Scatter name="Temperaturas" dataKey="temperature_max" fill="hsl(var(--chart-1))" />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Water Charts */}
        <TabsContent value="water" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Evapotranspiración Mensual</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Legend />
                    <Bar dataKey="eto" fill="hsl(var(--chart-2))" name="ETO" />
                    <Bar dataKey="etc" fill="hsl(var(--chart-3))" name="ETC" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Precipitación vs Evapotranspiración</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Legend />
                    <Bar dataKey="precipitation" fill="hsl(var(--chart-1))" name="Precipitación" />
                    <Line type="monotone" dataKey="etc" stroke="hsl(var(--chart-5))" strokeWidth={2} name="ETC" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Frost Charts */}
        <TabsContent value="frost" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Horas de Helada por Mes</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Bar
                      dataKey="frost_hours"
                      fill="hsl(var(--chart-5))"
                      name="Horas de Helada"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horas Frío Acumuladas</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Area
                      type="monotone"
                      dataKey="chill_hours"
                      stroke="hsl(var(--chart-1))"
                      fill="hsl(var(--chart-1))"
                      fillOpacity={0.6}
                      name="Horas Frío"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Growing Degree Days */}
        <TabsContent value="gdd" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Grados Día Acumulados (Base 10°C)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={formatTooltip} />
                  <Legend />
                  <Bar dataKey="gdd" fill="hsl(var(--chart-4))" name="Grados Día Mensuales" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="temperature_avg"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    name="Temperatura Media"
                    yAxisId="temp"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Yearly Historical Data */}
        <TabsContent value="yearly" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Evolución Anual de Temperaturas</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="temperature_max"
                      stroke="hsl(var(--chart-5))"
                      strokeWidth={2}
                      name="Temp. Máxima"
                    />
                    <Line
                      type="monotone"
                      dataKey="temperature_avg"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      name="Temp. Media"
                    />
                    <Line
                      type="monotone"
                      dataKey="temperature_min"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      name="Temp. Mínima"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Días de Helada por Año</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Bar dataKey="frost_days" fill="hsl(var(--chart-5))" name="Días de Helada" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horas Frío Anuales</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Area
                      type="monotone"
                      dataKey="chill_hours"
                      stroke="hsl(var(--chart-1))"
                      fill="hsl(var(--chart-1))"
                      fillOpacity={0.6}
                      name="Horas Frío"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Grados Día Anuales</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" />
                    <YAxis />
                    <Tooltip formatter={formatTooltip} />
                    <Bar dataKey="gdd" fill="hsl(var(--chart-4))" name="Grados Día" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
