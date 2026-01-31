"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"

import {
  Download,
  Share2,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  MapPin,
  Database,
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowLeft,
} from "lucide-react"

import { ClimateAnalysisResults } from "./climate-analysis-results"
import { HistogramCharts } from "./histogram-charts"
import { DownloadButtons } from "./download-buttons"
import { DetailedReport } from "./detailed-report"
import { VarietyRecommendationDashboard } from "./variety-recommendation-dashboard"

// ✅ Recalc dinámico del dashboard
import {
  CHILL_SEASON_MONTHS,
  filterDailyData,
  recalcMetricsFromDaily,
  recalcHistoricalAveragesFromDaily,
} from "@/lib/dashboard-recalc"

type RequestInfo = {
  latitude: number
  longitude: number
  startDate: string
  endDate: string
  dayCount: number
  isHistorical?: boolean

  // ✅ NUEVO (no rompe nada si viene undefined)
  source?: string
  postalCode?: string
  municipio?: string
  municipioNombre?: string
}

interface ClimateDashboardProps {
  data: {
    analyses: Record<string, any>
    rawData: Record<string, any>
  }
  requestInfo: RequestInfo
  onBackToForm?: () => void
}

function clampNumber(n: unknown, fallback = 0) {
  const v = typeof n === "number" ? n : Number(n)
  return Number.isFinite(v) ? v : fallback
}

/**
 * ✅ Score “dashboard” para que el índice NO dependa del total 20 años.
 * Reglas alineadas con tu ClimateCalculator (pero usando valores medios anuales).
 */
function calculateSuitabilityScoreFromSummary(summary: {
  chillHours: number
  totalGDD: number
  frostDays: number
  waterDeficit: number
}) {
  let score = 100

  // Chill hours (ideal 600-1500)
  if (summary.chillHours < 600 || summary.chillHours > 1500) score -= 30

  // GDD (Abr-Oct) ideal 1500-3000
  if (summary.totalGDD < 1500) score -= 25
  if (summary.totalGDD > 3400) score -= 8

  // Frost days
  if (summary.frostDays > 10) score -= summary.frostDays * 2

  // Water deficit
  if (summary.waterDeficit > 500) score -= Math.min(25, (summary.waterDeficit - 500) / 40)

  return Math.max(0, Math.min(100, Math.round(score)))
}

function scoreLabel(score: number) {
  if (score >= 80) return "Excelente"
  if (score >= 60) return "Bueno"
  if (score >= 40) return "Regular"
  return "Inadecuado"
}

export function ClimateDashboard({ data, requestInfo, onBackToForm }: ClimateDashboardProps) {
  const [activeTab, setActiveTab] = useState("overview")
  const [showDetailedReport, setShowDetailedReport] = useState(false)
  const [showVarietyRecommendation, setShowVarietyRecommendation] = useState(false)

  const sources = Object.keys(data.analyses || {})
  const primarySource = sources[0]
  const primaryAnalysis = primarySource ? data.analyses[primarySource] : null

  const rawClimateData = primarySource ? data.rawData?.[primarySource] : null
  let climateData: any[] = []

  console.log("[v0] Raw climate data structure:", typeof rawClimateData, Array.isArray(rawClimateData))

  if (Array.isArray(rawClimateData)) {
    climateData = rawClimateData
  } else if (rawClimateData && (rawClimateData as any).data && Array.isArray((rawClimateData as any).data)) {
    climateData = (rawClimateData as any).data
  } else if (rawClimateData && (rawClimateData as any).success && Array.isArray((rawClimateData as any).data)) {
    climateData = (rawClimateData as any).data
  } else {
    console.log("[v0] No valid climate data found, using empty array")
    climateData = []
  }

  console.log("[v0] Final climate data length:", climateData.length)

  const isHistorical = Boolean(requestInfo?.isHistorical)

  // ==========================================================
  // ✅ DASHBOARD LIVE METRICS (recalculadas desde climateData)
  //   - Normal: totales del periodo seleccionado
  //   - Histórico: medias anuales (20 años)
  // ==========================================================
  const liveAllYear = useMemo(() => {
    const all = filterDailyData(climateData as any, { year: "all" })
    return isHistorical ? recalcHistoricalAveragesFromDaily(all as any) : recalcMetricsFromDaily(all as any)
  }, [climateData, isHistorical])

  const liveChillSeason = useMemo(() => {
    // En normal: filtramos Nov-Feb
    // En histórico: lo calculamos por año y luego media anual (aquí filtramos por meses para que sea más “legible”)
    const chillSeasonDaily = filterDailyData(climateData as any, { year: "all", months: CHILL_SEASON_MONTHS })
    return isHistorical
      ? recalcHistoricalAveragesFromDaily(chillSeasonDaily as any, { chillMonths: CHILL_SEASON_MONTHS })
      : recalcMetricsFromDaily(chillSeasonDaily as any, { chillMonths: CHILL_SEASON_MONTHS })
  }, [climateData, isHistorical])

  const comparisonMetrics = useMemo(() => {
    const all = liveAllYear?.summary
    const chill = liveChillSeason?.summary
    if (!all || !chill) return null

    // En histórico, queremos “por año” implícito (media anual).
    // En normal, son totales del rango seleccionado.
    return {
      chillHours: {
        value: clampNumber(chill.chillHours),
        optimal: { min: 600, max: 1500 },
        status:
          clampNumber(chill.chillHours) >= 600 && clampNumber(chill.chillHours) <= 1500
            ? "optimal"
            : clampNumber(chill.chillHours) < 600
              ? "low"
              : "high",
      },
      gdd: {
        value: clampNumber(all.totalGDD),
        optimal: { min: 1500, max: 3000 },
        status:
          clampNumber(all.totalGDD) >= 1500 && clampNumber(all.totalGDD) <= 3000
            ? "optimal"
            : clampNumber(all.totalGDD) < 1500
              ? "low"
              : "high",
      },
      frostDays: {
        value: clampNumber(all.frostDays),
        optimal: { min: 0, max: 10 },
        status: clampNumber(all.frostDays) <= 10 ? "optimal" : "high",
      },
      waterDeficit: {
        value: clampNumber(all.waterDeficit),
        optimal: { min: 0, max: 500 },
        status: clampNumber(all.waterDeficit) <= 500 ? "optimal" : "high",
      },
    }
  }, [liveAllYear, liveChillSeason])

  // ✅ Si es histórico, calculamos un score basado en MEDIAS anuales del dashboard.
  // Si NO es histórico, dejamos el de primaryAnalysis (tu cálculo original).
  const displayedSuitabilityScore = useMemo(() => {
    if (!isHistorical) return clampNumber(primaryAnalysis?.suitability?.suitabilityScore, 0)
    const s = liveAllYear?.summary
    if (!s) return 0
    return calculateSuitabilityScoreFromSummary({
      chillHours: clampNumber(liveChillSeason?.summary?.chillHours, 0),
      totalGDD: clampNumber(s.totalGDD, 0),
      frostDays: clampNumber(s.frostDays, 0),
      waterDeficit: clampNumber(s.waterDeficit, 0),
    })
  }, [isHistorical, primaryAnalysis, liveAllYear, liveChillSeason])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "optimal":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "low":
        return <TrendingDown className="h-4 w-4 text-yellow-600" />
      case "high":
        return <TrendingUp className="h-4 w-4 text-red-600" />
      default:
        return <Minus className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "optimal":
        return "text-green-600"
      case "low":
        return "text-yellow-600"
      case "high":
        return "text-red-600"
      default:
        return "text-gray-600"
    }
  }

  // ✅ helper para mostrar 2 decimales
  const fmt2 = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) ? n.toFixed(2) : "0.00"
  }

  const exportData = () => {
    const exportPayload = {
      requestInfo,
      analyses: data.analyses,
      generatedAt: new Date().toISOString(),
      location: `${requestInfo.latitude}, ${requestInfo.longitude}`,
    }

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pistacho-climate-analysis-${requestInfo.startDate}-${requestInfo.endDate}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const shareResults = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Análisis Climático PistachoClima",
          text: `Análisis climático para coordenadas ${requestInfo.latitude}, ${requestInfo.longitude}`,
          url: window.location.href,
        })
      } catch (error) {
        console.log("Error sharing:", error)
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert("Enlace copiado al portapapeles")
    }
  }

  if (!data || sources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">
            No hay datos disponibles para mostrar el dashboard. Por favor, realiza una consulta primero.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (showVarietyRecommendation) {
    return (
      <VarietyRecommendationDashboard
        climateData={climateData}
        location={{ latitude: requestInfo.latitude, longitude: requestInfo.longitude }}
        onBack={() => setShowVarietyRecommendation(false)}
      />
    )
  }

  if (showDetailedReport) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => setShowDetailedReport(false)} className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver al Dashboard
          </Button>
          {onBackToForm && (
            <Button variant="outline" onClick={onBackToForm} className="flex items-center gap-2 bg-transparent">
              <ArrowLeft className="h-4 w-4" />
              Nueva Consulta
            </Button>
          )}
        </div>
        <DetailedReport
          climateData={climateData}
          analysisResults={primaryAnalysis}
          coordinates={{ lat: requestInfo.latitude, lon: requestInfo.longitude }}
          isHistorical={requestInfo.isHistorical}
        />
      </div>
    )
  }

  const isAemet = String(requestInfo?.source || primarySource || "").toUpperCase() === "AEMET"
  const postalCode = String(requestInfo?.postalCode || "").trim()
  const municipioNombre = String(requestInfo?.municipioNombre || "").trim()

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Dashboard de Resultados</CardTitle>

              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />

                  {isAemet ? (
                    <>
                      {municipioNombre ? (
                        <span>{municipioNombre}</span>
                      ) : postalCode ? (
                        <span>CP: {postalCode}</span>
                      ) : (
                        <span>AEMET</span>
                      )}
                      <span className="text-muted-foreground">•</span>
                      {requestInfo.latitude.toFixed(4)}, {requestInfo.longitude.toFixed(4)}
                    </>
                  ) : (
                    <>
                      {requestInfo.latitude.toFixed(4)}, {requestInfo.longitude.toFixed(4)}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {requestInfo.startDate} - {requestInfo.endDate}
                </div>

                <div className="flex items-center gap-1">
                  <Database className="h-4 w-4" />
                  {requestInfo.dayCount} días
                </div>

                {requestInfo.isHistorical && (
                  <Badge variant="secondary" className="text-xs">
                    Análisis Histórico 20 años (medias anuales)
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {onBackToForm && (
                <Button variant="outline" size="sm" onClick={onBackToForm}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Nueva Consulta
                </Button>
              )}

              <Button
                variant="default"
                size="sm"
                onClick={() => setShowVarietyRecommendation(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                🌱 Recomendación de Variedades
              </Button>

              <Button variant="outline" size="sm" onClick={shareResults}>
                <Share2 className="h-4 w-4 mr-2" />
                Compartir
              </Button>

              <Button variant="outline" size="sm" onClick={exportData}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descargar Datos y Reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <DownloadButtons
            climateData={climateData}
            analysisResults={primaryAnalysis}
            coordinates={{ lat: requestInfo.latitude, lon: requestInfo.longitude }}
            isHistorical={requestInfo.isHistorical}
            onShowDetailedReport={() => setShowDetailedReport(true)}
            requestInfo={{
              source: primarySource,
              postalCode: (requestInfo as any)?.postalCode,
              startDate: requestInfo.startDate,
              endDate: requestInfo.endDate,
            }}
          />
        </CardContent>
      </Card>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Resumen Ejecutivo</TabsTrigger>
          <TabsTrigger value="analysis">Análisis Detallado</TabsTrigger>
          <TabsTrigger value="charts">Visualizaciones</TabsTrigger>
          <TabsTrigger value="recommendations">Recomendaciones</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Suitability Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Índice de Aptitud General
              </CardTitle>
              {isHistorical && (
                <CardDescription>
                  Mostrando <strong>medias anuales</strong> del histórico (20 años), no el total acumulado.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary mb-2">{displayedSuitabilityScore.toFixed(0)}%</div>
                    <Badge
                      variant={displayedSuitabilityScore >= 60 ? "default" : "destructive"}
                      className="text-sm"
                    >
                      {scoreLabel(displayedSuitabilityScore)}
                    </Badge>
                  </div>
                  <Progress value={displayedSuitabilityScore} className="h-3" />
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium">Factores Clave{isHistorical ? " (media anual)" : ""}:</h4>
                  {comparisonMetrics && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Horas Frío (Nov-Feb)</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(comparisonMetrics.chillHours.status)}
                          <span className={`text-sm ${getStatusColor(comparisonMetrics.chillHours.status)}`}>
                            {comparisonMetrics.chillHours.value.toLocaleString()}h
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Grados Día (Abr-Oct)</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(comparisonMetrics.gdd.status)}
                          <span className={`text-sm ${getStatusColor(comparisonMetrics.gdd.status)}`}>
                            {comparisonMetrics.gdd.value.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Días de Helada</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(comparisonMetrics.frostDays.status)}
                          <span className={`text-sm ${getStatusColor(comparisonMetrics.frostDays.status)}`}>
                            {comparisonMetrics.frostDays.value.toFixed(0)} días
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm">Déficit Hídrico</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(comparisonMetrics.waterDeficit.status)}
                          <span className={`text-sm ${getStatusColor(comparisonMetrics.waterDeficit.status)}`}>
                            {comparisonMetrics.waterDeficit.value.toFixed(1)}mm
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Fuentes de Datos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sources.length}</div>
                <div className="space-y-1 mt-2">
                  {sources.map((source) => (
                    <Badge key={source} variant="outline" className="text-xs">
                      {source}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Período Analizado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{requestInfo.dayCount}</div>
                <p className="text-xs text-muted-foreground mt-1">días de datos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Temperatura Media</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fmt2(liveAllYear?.summary?.avgTemperature)}°C</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isHistorical ? "media anual (histórico)" : "promedio recalculado del período"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Key Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                Alertas Importantes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {liveAllYear.warnings?.length > 0 ? (
                  liveAllYear.warnings.map((warning: string, index: number) => (
                    <Alert key={index} variant="destructive">
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>No se detectaron alertas críticas para el cultivo de pistacho</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis">
          <ClimateAnalysisResults data={data} />
        </TabsContent>

        {/* Charts Tab */}
        <TabsContent value="charts">
          <HistogramCharts data={data} />
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-6">
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                🌱 Recomendación de Variedades de Pistacho
              </CardTitle>
              <CardDescription>
                Descubre qué variedades de pistacho son más adecuadas para estas condiciones climáticas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Análisis basado en {climateData.length} días de datos climáticos históricos
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Evaluación de 6 variedades principales con requerimientos específicos
                  </p>
                </div>
                <Button onClick={() => setShowVarietyRecommendation(true)} className="bg-green-600 hover:bg-green-700">
                  Ver Recomendaciones Detalladas
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-5 w-5" />
                  Recomendaciones de Cultivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {primaryAnalysis?.suitability?.recommendations?.length > 0 ? (
                    primaryAnalysis.suitability.recommendations.map((rec: string, index: number) => (
                      <Alert key={index}>
                        <Info className="h-4 w-4" />
                        <AlertDescription>{rec}</AlertDescription>
                      </Alert>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No hay recomendaciones específicas disponibles.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-700">
                  <AlertTriangle className="h-5 w-5" />
                  Gestión de Riesgos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {liveAllYear.warnings?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium">Riesgos Identificados:</h4>
                      {liveAllYear.warnings.map((warning: string, index: number) => (
                        <Alert key={index} variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>{warning}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
