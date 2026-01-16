"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Thermometer, Snowflake, Clock, Droplets, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react"

interface AnalysisData {
  summary: {
    totalDays: number
    avgTemperature: number
    totalGDD: number
    totalChillHours: number
    totalFrostHours: number
    frostDays: number
    totalETO: number
    totalETC: number
    totalPrecipitation: number
    waterDeficit: number
  }
  suitability: {
    suitabilityScore: number
    recommendations: string[]
    warnings: string[]
  }
  dataPoints: number
}

interface ClimateAnalysisResultsProps {
  data: {
    analyses: Record<string, AnalysisData>
  }
}

export function ClimateAnalysisResults({ data }: ClimateAnalysisResultsProps) {
  const sources = Object.keys(data.analyses)

  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">No hay datos de análisis disponibles</p>
        </CardContent>
      </Card>
    )
  }

  // Use the first available source for display (could be enhanced to combine sources)
  const primarySource = sources[0]
  const analysis = data.analyses[primarySource]

  const getSuitabilityColor = (score: number) => {
    if (score >= 80) return "text-green-600"
    if (score >= 60) return "text-yellow-600"
    return "text-red-600"
  }

  const getSuitabilityLabel = (score: number) => {
    if (score >= 80) return "Excelente"
    if (score >= 60) return "Bueno"
    if (score >= 40) return "Regular"
    return "Inadecuado"
  }

  return (
    <div className="space-y-6">
      {/* Suitability Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Índice de Aptitud para Pistacho
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{analysis.suitability.suitabilityScore.toFixed(0)}%</span>
              <Badge
                variant={analysis.suitability.suitabilityScore >= 60 ? "default" : "destructive"}
                className={getSuitabilityColor(analysis.suitability.suitabilityScore)}
              >
                {getSuitabilityLabel(analysis.suitability.suitabilityScore)}
              </Badge>
            </div>
            <Progress value={analysis.suitability.suitabilityScore} className="h-2" />
            <p className="text-sm text-muted-foreground">
              Basado en {analysis.dataPoints} días de datos de {primarySource}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Horas Frío</CardTitle>
            <Snowflake className="h-4 w-4 text-chart-5" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.summary.totalChillHours.toLocaleString()}h</div>
            <p className="text-xs text-muted-foreground">Óptimo: 600-1500h</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Grados Día</CardTitle>
            <Thermometer className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.summary.totalGDD.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Base 10°C</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Días de Helada</CardTitle>
            <Clock className="h-4 w-4 text-chart-3" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.summary.frostDays}</div>
            <p className="text-xs text-muted-foreground">{analysis.summary.totalFrostHours.toFixed(0)}h totales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Déficit Hídrico</CardTitle>
            <Droplets className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analysis.summary.waterDeficit}mm</div>
            <p className="text-xs text-muted-foreground">ETC: {analysis.summary.totalETC}mm</p>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations and Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {analysis.suitability.recommendations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                Recomendaciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analysis.suitability.recommendations.map((rec, index) => (
                  <Alert key={index}>
                    <AlertDescription>{rec}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {analysis.suitability.warnings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="h-5 w-5" />
                Advertencias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {analysis.suitability.warnings.map((warning, index) => (
                  <Alert key={index} variant="destructive">
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Data Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Fuentes de Datos Utilizadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {sources.map((source) => (
              <div key={source} className="text-center">
                <Badge variant="outline" className="mb-2">
                  {source}
                </Badge>
                <p className="text-sm text-muted-foreground">{data.analyses[source].dataPoints} días</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
