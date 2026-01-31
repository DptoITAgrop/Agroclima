"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Thermometer, Droplets, Snowflake, Sun, AlertTriangle, CheckCircle, Info } from "lucide-react"
import { VarietyRecommendationEngine, type VarietyRecommendation } from "@/lib/variety-recommendation"
import type { ClimateData } from "@/lib/types"
import Image from "next/image"

// ✅ normalización + stats seguras
import { normalizeClimateData } from "@/lib/climate-normalize"
import { getYearCount, safeAvg, safeMin, safeMax } from "@/lib/climate-stats"

interface VarietyRecommendationDashboardProps {
  climateData: ClimateData[]
  location: { latitude: number; longitude: number }
  onBack: () => void
}

type ClimateProfileForReport = {
  yearCount: number
  avgTemperature: number
  minTemperature: number
  maxTemperature: number
  totalChillHours: number
  totalFrostHours: number
  frostDays: number
  totalPrecipitation: number
  waterDeficit: number
  totalGDD: number
  heatStressDays: number
  extremeColdDays: number
}

/** =========================
 * Ventanas / campañas
 * ========================= */
function parseISODate(s: string): Date {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return new Date("1970-01-01")
  return d
}

function month1to12(d: Date) {
  return d.getMonth() + 1
}

// Nov/Dic 2023 -> campaña 2024, Ene/Feb 2024 -> campaña 2024
function winterCampaignYear(d: Date): number {
  const y = d.getFullYear()
  const m = month1to12(d)
  return m >= 11 ? y + 1 : y
}

function isWinterChill(d: Date): boolean {
  const m = month1to12(d)
  return m === 11 || m === 12 || m === 1 || m === 2
}

function isGddSeason(d: Date): boolean {
  const m = month1to12(d)
  // ✅ NUEVO: GDD del 1 abril al 31 octubre
  return m >= 4 && m <= 10
}

function isSpringFrostWindow(d: Date): boolean {
  const m = month1to12(d)
  return m === 3 || m === 4
}

function isSummer(d: Date): boolean {
  const m = month1to12(d)
  return m >= 6 && m <= 8
}

function mean(values: number[]) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function VarietyRecommendationDashboard({ climateData, location, onBack }: VarietyRecommendationDashboardProps) {
  const [recommendations, setRecommendations] = useState<VarietyRecommendation[]>([])
  const [detailedReport, setDetailedReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVariety, setSelectedVariety] = useState<VarietyRecommendation | null>(null)

  // ✅ Siempre trabajamos con datos normalizados
  const normalized = useMemo(() => normalizeClimateData(climateData as any), [climateData])
  const yearCount = useMemo(() => getYearCount(normalized), [normalized])

  useEffect(() => {
    const generateRecommendations = async () => {
      setLoading(true)

      try {
        const engine = new VarietyRecommendationEngine()

        // ✅ Recomendaciones sobre datos normalizados
        const varietyRecommendations = engine.recommendVarieties(normalized, location)

        /**
         * ✅ Perfil climático para el REPORTE (UI):
         * - Aquí devolvemos valores ANUALES (promedio por campaña/año)
         * - y alineados con ventanas:
         *   - Chill: Nov–Feb (campaña invierno)
         *   - GDD: Abr–Oct (pedido)
         *   - Frost: Mar–Abr
         *   - Déficit: Abr–Oct
         *   - Heat stress: Jun–Aug
         *   - Extreme cold: Nov–Feb (campaña invierno)
         */
        const winterMap = new Map<number, { chill: number; extremeColdDays: number }>()
        const gddMap = new Map<number, { gdd: number; seasonEtc: number; seasonP: number }>()
        const springMap = new Map<number, { frostHours: number; frostDays: number }>()
        const precipByYear = new Map<number, number>()
        const heatByYear = new Map<number, number>()

        for (const day of normalized) {
          const d = parseISODate(day.date)
          const y = d.getFullYear()

          // Precip anual por año natural
          precipByYear.set(y, (precipByYear.get(y) ?? 0) + (day.precipitation ?? 0))

          // Chill invierno por campaña
          if (isWinterChill(d)) {
            const cy = winterCampaignYear(d)
            const prev = winterMap.get(cy) ?? { chill: 0, extremeColdDays: 0 }
            prev.chill += day.chill_hours ?? 0
            if ((day.temperature_min ?? 999) < -5) prev.extremeColdDays += 1
            winterMap.set(cy, prev)
          }

          // GDD + déficit temporada (Abr–Oct) por año natural
          if (isGddSeason(d)) {
            const prev = gddMap.get(y) ?? { gdd: 0, seasonEtc: 0, seasonP: 0 }
            prev.gdd += day.gdd ?? 0
            prev.seasonEtc += day.etc ?? 0
            prev.seasonP += day.precipitation ?? 0
            gddMap.set(y, prev)
          }

          // Heladas floración (Mar–Abr) por año natural
          if (isSpringFrostWindow(d)) {
            const prev = springMap.get(y) ?? { frostHours: 0, frostDays: 0 }
            const fh = day.frost_hours ?? 0
            prev.frostHours += fh
            if (fh > 0) prev.frostDays += 1
            springMap.set(y, prev)
          }

          // Estrés térmico (Jun–Aug) por año natural
          if (isSummer(d)) {
            const prev = heatByYear.get(y) ?? 0
            heatByYear.set(y, prev + ((day.temperature_max ?? -999) > 40 ? 1 : 0))
          }
        }

        const winterYears = [...winterMap.keys()].sort((a, b) => a - b)
        const gddYears = [...gddMap.keys()].sort((a, b) => a - b)
        const springYears = [...springMap.keys()].sort((a, b) => a - b)
        const precipYears = [...precipByYear.keys()].sort((a, b) => a - b)
        const heatYears = [...heatByYear.keys()].sort((a, b) => a - b)

        const annualChillAvg = mean(winterYears.map((y) => winterMap.get(y)!.chill))
        const annualExtremeColdAvg = mean(winterYears.map((y) => winterMap.get(y)!.extremeColdDays))

        const annualGddAvg = mean(gddYears.map((y) => gddMap.get(y)!.gdd))
        const annualDeficitAvg = mean(
          gddYears.map((y) => {
            const a = gddMap.get(y)!
            return Math.max(0, a.seasonEtc - a.seasonP)
          }),
        )

        const annualSpringFrostHoursAvg = mean(springYears.map((y) => springMap.get(y)!.frostHours))
        const annualSpringFrostDaysAvg = mean(springYears.map((y) => springMap.get(y)!.frostDays))

        const annualPrecipAvg = mean(precipYears.map((y) => precipByYear.get(y)!))
        const annualHeatStressAvg = mean(heatYears.map((y) => heatByYear.get(y)!))

        // ✅ yearCount “real”: preferimos el del dataset, pero si por lo que sea está vacío, usamos el máximo de campañas detectadas
        const yearCountFinal =
          yearCount ??
          Math.max(
            1,
            new Set(normalized.map((d) => parseISODate(d.date).getFullYear())).size,
            winterYears.length,
            gddYears.length,
          )

        const climateProfile: ClimateProfileForReport = {
          yearCount: yearCountFinal,

          avgTemperature: safeAvg(normalized.map((d) => d.temperature_avg)),
          minTemperature: safeMin(normalized.map((d) => d.temperature_min)),
          maxTemperature: safeMax(normalized.map((d) => d.temperature_max)),

          // ✅ ya ANUAL (promedio por campaña/año)
          totalChillHours: annualChillAvg,
          totalGDD: annualGddAvg,

          // ✅ heladas floración (Mar–Abr) anual
          totalFrostHours: annualSpringFrostHoursAvg,
          frostDays: annualSpringFrostDaysAvg,

          // ✅ precip anual media
          totalPrecipitation: annualPrecipAvg,

          // ✅ déficit temporada Abr–Oct anual
          waterDeficit: annualDeficitAvg,

          // ✅ estrés / frío extremos anuales
          heatStressDays: annualHeatStressAvg,
          extremeColdDays: annualExtremeColdAvg,
        }

        const report = engine.generateDetailedReport(varietyRecommendations, climateProfile as any, location)

        setRecommendations(varietyRecommendations)
        setDetailedReport(report)
        setSelectedVariety(varietyRecommendations[0] || null)
      } catch (error) {
        console.error("[v0] Error generating recommendations:", error)
      } finally {
        setLoading(false)
      }
    }

    if (normalized.length > 0) generateRecommendations()
    else {
      setRecommendations([])
      setDetailedReport(null)
      setSelectedVariety(null)
      setLoading(false)
    }
  }, [normalized, location, yearCount])

  const getSuitabilityColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50"
    if (score >= 60) return "text-yellow-600 bg-yellow-50"
    if (score >= 40) return "text-orange-600 bg-orange-50"
    return "text-red-600 bg-red-50"
  }

  const getSuitabilityLabel = (score: number) => {
    if (score >= 80) return "Excelente"
    if (score >= 60) return "Buena"
    if (score >= 40) return "Marginal"
    return "No recomendada"
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack}>
            ← Volver al Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <Image src="/images/agroptimum-logo.png" alt="Agroptimum" width={32} height={32} className="object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-green-600">Recomendación de Variedades</h1>
              <p className="text-sm text-muted-foreground">Analizando compatibilidad climática...</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
                <div className="h-2 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ✅ nº de campañas/años usados para promedios (ya viene en climateProfile)
  const yCount = detailedReport?.climateProfile?.yearCount ?? yearCount ?? 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Volver al Dashboard
        </Button>
        <div className="flex items-center gap-2">
          <Image src="/images/agroptimum-logo.png" alt="Agroptimum" width={32} height={32} className="object-contain" />
          <div>
            <h1 className="text-2xl font-bold text-green-600">Recomendación de Variedades de Pistacho</h1>
            <p className="text-sm text-muted-foreground">
              Análisis de {normalized.length} días de datos climáticos • Coordenadas: {location.latitude.toFixed(4)},{" "}
              {location.longitude.toFixed(4)}
            </p>
          </div>
        </div>
      </div>

      {/* Resumen General */}
      {detailedReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Resumen de Evaluación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{detailedReport.summary.suitableCount}</div>
                <div className="text-sm text-muted-foreground">Variedades Adecuadas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">{detailedReport.summary.marginalCount}</div>
                <div className="text-sm text-muted-foreground">Variedades Marginales</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{detailedReport.summary.bestScore.toFixed(0)}%</div>
                <div className="text-sm text-muted-foreground">Mejor Puntuación</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{detailedReport.riskAssessment.level}</div>
                <div className="text-sm text-muted-foreground">Nivel de Riesgo</div>
              </div>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Promedios calculados con <b>{yCount}</b> campañas/años.
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="recommendations" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="recommendations">Recomendaciones</TabsTrigger>
          <TabsTrigger value="climate">Perfil Climático</TabsTrigger>
          <TabsTrigger value="strategy">Estrategia</TabsTrigger>
          <TabsTrigger value="details">Detalles</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          <div className="grid gap-4">
            {recommendations.slice(0, 6).map((recommendation, index) => (
              <Card
                key={recommendation.variety.id}
                className={`cursor-pointer transition-all ${
                  selectedVariety?.variety.id === recommendation.variety.id ? "ring-2 ring-green-500 shadow-lg" : "hover:shadow-md"
                }`}
                onClick={() => setSelectedVariety(recommendation)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{recommendation.variety.name}</h3>
                        <Badge variant={index < 3 ? "default" : "secondary"}>#{index + 1}</Badge>
                        <Badge variant="outline">{recommendation.variety.origin}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{recommendation.variety.description}</p>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold px-3 py-1 rounded-lg ${getSuitabilityColor(recommendation.suitabilityScore)}`}>
                        {recommendation.suitabilityScore.toFixed(0)}%
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{getSuitabilityLabel(recommendation.suitabilityScore)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Snowflake className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-sm font-medium">
                          {recommendation.variety.chillHoursMin}-{recommendation.variety.chillHoursMax}h
                        </div>
                        <div className="text-xs text-muted-foreground">Horas frío</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-4 w-4 text-red-500" />
                      <div>
                        <div className="text-sm font-medium">{recommendation.variety.maxSummerTemp}°C</div>
                        <div className="text-xs text-muted-foreground">Máx. verano</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-blue-500" />
                      <div>
                        <div className="text-sm font-medium">{recommendation.variety.annualWaterNeed}mm</div>
                        <div className="text-xs text-muted-foreground">Agua anual</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-yellow-500" />
                      <div>
                        <div className="text-sm font-medium">{recommendation.variety.productionStart} años</div>
                        <div className="text-xs text-muted-foreground">Primera cosecha</div>
                      </div>
                    </div>
                  </div>

                  <Progress value={recommendation.suitabilityScore} className="mb-3" />

                  {recommendation.matchingFactors.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-green-600 mb-1">✓ Factores favorables:</div>
                      <div className="text-xs text-muted-foreground">{recommendation.matchingFactors.slice(0, 2).join(" • ")}</div>
                    </div>
                  )}

                  {recommendation.concerns.length > 0 && (
                    <div className="mb-3">
                      <div className="text-sm font-medium text-orange-600 mb-1">⚠ Consideraciones:</div>
                      <div className="text-xs text-muted-foreground">{recommendation.concerns.slice(0, 2).join(" • ")}</div>
                    </div>
                  )}

                  {recommendation.pollinizers.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-1">Polinizadores recomendados:</div>
                      <div className="flex gap-1">
                        {recommendation.pollinizers.map((pollinizer) => (
                          <Badge key={pollinizer.id} variant="outline" className="text-xs">
                            {pollinizer.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="climate" className="space-y-4">
          {detailedReport && (
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Perfil Climático de la Ubicación</CardTitle>
                  <CardDescription>
                    Valores promedio anual (ventanas agronómicas) con {yCount} campañas/años
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Thermometer className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Temperatura</span>
                      </div>
                      <div className="text-2xl font-bold">{detailedReport.climateProfile.avgTemperature.toFixed(1)}°C</div>
                      <div className="text-xs text-muted-foreground">
                        Rango: {detailedReport.climateProfile.minTemperature.toFixed(1)}°C a{" "}
                        {detailedReport.climateProfile.maxTemperature.toFixed(1)}°C
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Snowflake className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Horas Frío</span>
                      </div>
                      {/* ✅ YA es anual (no dividir otra vez) */}
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.totalChillHours)}h</div>
                      <div className="text-xs text-muted-foreground">Promedio anual (Nov–Feb)</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">GDD</span>
                      </div>
                      {/* ✅ YA es anual (Abr–Oct) */}
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.totalGDD)}</div>
                      <div className="text-xs text-muted-foreground">Promedio anual (Abr–Oct)</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Precipitación</span>
                      </div>
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.totalPrecipitation)}mm</div>
                      <div className="text-xs text-muted-foreground">Promedio anual</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Días de Helada</span>
                      </div>
                      {/* ✅ heladas Mar–Abr anual */}
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.frostDays)}</div>
                      <div className="text-xs text-muted-foreground">Promedio anual (Mar–Abr)</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Droplets className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Déficit Hídrico</span>
                      </div>
                      {/* ✅ déficit Abr–Oct anual */}
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.waterDeficit)}mm</div>
                      <div className="text-xs text-muted-foreground">Promedio anual (Abr–Oct)</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">Estrés Térmico</span>
                      </div>
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.heatStressDays)}</div>
                      <div className="text-xs text-muted-foreground">Días &gt;40°C/año (Jun–Ago)</div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Snowflake className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Frío Extremo</span>
                      </div>
                      <div className="text-2xl font-bold">{Math.round(detailedReport.climateProfile.extremeColdDays)}</div>
                      <div className="text-xs text-muted-foreground">Días &lt; -5°C/año (Nov–Feb)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Evaluación de Riesgos Climáticos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Nivel de Riesgo General:</span>
                      <Badge
                        variant={
                          detailedReport.riskAssessment.level === "Bajo"
                            ? "default"
                            : detailedReport.riskAssessment.level === "Moderado"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {detailedReport.riskAssessment.level}
                      </Badge>
                    </div>

                    {detailedReport.riskAssessment.factors.length > 0 && (
                      <div>
                        <div className="font-medium mb-2">Factores de Riesgo:</div>
                        <ul className="space-y-1">
                          {detailedReport.riskAssessment.factors.map((factor: string, index: number) => (
                            <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                              <AlertTriangle className="h-3 w-3 text-orange-500" />
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {detailedReport.riskAssessment.mitigation.length > 0 && (
                      <div>
                        <div className="font-medium mb-2">Estrategias de Mitigación:</div>
                        <ul className="space-y-1">
                          {detailedReport.riskAssessment.mitigation.map((strategy: string, index: number) => (
                            <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {strategy}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* strategy/details: tu código igual (no lo toco) */}
        <TabsContent value="strategy" className="space-y-4">
          {detailedReport && (
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Estrategia de Plantación Recomendada</CardTitle>
                  <CardDescription>
                    Basada en la variedad mejor puntuada: {detailedReport.plantingStrategy.primaryVariety}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="font-medium mb-2">Variedad Principal:</div>
                      <div className="text-lg font-bold text-green-600">{detailedReport.plantingStrategy.primaryVariety}</div>
                    </div>
                    <div>
                      <div className="font-medium mb-2">Polinizadores:</div>
                      <div className="flex gap-1">
                        {detailedReport.plantingStrategy.pollinizers.map((pollinizer: string) => (
                          <Badge key={pollinizer} variant="outline">
                            {pollinizer}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium mb-2">Ratio de Plantación:</div>
                      <div>{detailedReport.plantingStrategy.plantingRatio}</div>
                    </div>
                    <div>
                      <div className="font-medium mb-2">Densidad:</div>
                      <div>{detailedReport.plantingStrategy.plantingDensity}</div>
                    </div>
                  </div>

                  <div>
                    <div className="font-medium mb-2">Cronograma de Producción:</div>
                    <div className="text-sm text-muted-foreground">{detailedReport.plantingStrategy.expectedProduction}</div>
                  </div>

                  <div>
                    <div className="font-medium mb-2">Fases del Proyecto:</div>
                    <ul className="space-y-2">
                      {detailedReport.plantingStrategy.timeline.map((phase: string, index: number) => (
                        <li key={index} className="text-sm flex items-start gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                          {phase}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recomendaciones Generales</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {detailedReport.generalRecommendations.map((recommendation: string, index: number) => (
                      <li key={index} className="text-sm flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        {recommendation}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="details" className="space-y-4">
          {/* tu bloque details igual */}
          {/* ... */}
        </TabsContent>
      </Tabs>
    </div>
  )
}
