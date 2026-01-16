"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, TrendingUp, Droplets, Thermometer, Sun } from "lucide-react"
import Image from "next/image"
import type { ClimateData } from "@/lib/types"

interface DetailedReportProps {
  climateData: ClimateData[]
  analysisResults: any
  coordinates: { lat: number; lon: number }
  isHistorical?: boolean
}

export function DetailedReport({
  climateData,
  analysisResults,
  coordinates,
  isHistorical = false,
}: DetailedReportProps) {
  console.log("[v0] DetailedReport climateData:", climateData)
  console.log("[v0] DetailedReport climateData type:", typeof climateData)
  console.log("[v0] DetailedReport climateData isArray:", Array.isArray(climateData))

  // Validate and ensure climateData is an array with data
  const validClimateData = Array.isArray(climateData) && climateData.length > 0 ? climateData : []

  if (validClimateData.length === 0) {
    return (
      <div className="space-y-6">
        {/* Header with Logo */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Image
                src="/images/agroptimum-logo.png"
                alt="Agroptimum - Shaping Pistachio Industry"
                width={150}
                height={150}
                className="object-contain"
              />
            </div>
            <CardTitle className="text-2xl text-green-700">Informe Agroclimatico Detallado para Pistacho</CardTitle>
            <p className="text-muted-foreground">
              {isHistorical ? "Análisis Histórico de 20 Años" : "Análisis Climático Actual"}
            </p>
            <p className="text-sm text-muted-foreground">
              Coordenadas: {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No hay datos climáticos disponibles para generar el informe detallado.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Por favor, intente realizar una nueva consulta con diferentes parámetros.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Calculate comprehensive statistics with safe array operations
  const avgTemp = validClimateData.reduce((sum, d) => sum + (d.temperature_avg || 0), 0) / validClimateData.length
  const totalPrecip = validClimateData.reduce((sum, d) => sum + (d.precipitation || 0), 0)
  const avgETO = validClimateData.reduce((sum, d) => sum + (d.eto || 0), 0) / validClimateData.length
  const avgETC = validClimateData.reduce((sum, d) => sum + (d.etc || 0), 0) / validClimateData.length
  const totalFrostHours = validClimateData.reduce((sum, d) => sum + (d.frost_hours || 0), 0)
  const totalChillHours = validClimateData.reduce((sum, d) => sum + (d.chill_hours || 0), 0)
  const avgSolarRadiation =
    validClimateData.reduce((sum, d) => sum + (d.solar_radiation || 0), 0) / validClimateData.length
  const avgHumidity = validClimateData.reduce((sum, d) => sum + (d.humidity || 0), 0) / validClimateData.length

  // Calculate water deficit
  const waterDeficit = Math.max(0, avgETO * validClimateData.length - totalPrecip)
  const irrigationNeed = avgETC * validClimateData.length

  // Risk assessments
  const frostRisk = totalFrostHours > 100 ? "Alto" : totalFrostHours > 50 ? "Medio" : "Bajo"
  const droughtRisk = waterDeficit > 500 ? "Alto" : waterDeficit > 200 ? "Medio" : "Bajo"
  const heatStressRisk = avgTemp > 30 ? "Alto" : avgTemp > 25 ? "Medio" : "Bajo"

  const generateDetailedPDF = () => {
    // Enhanced PDF generation with detailed report
    import("@/lib/detailed-export-utils").then(({ DetailedExportService }) => {
      const filename = isHistorical
        ? `informe-detallado-historico-20años-${coordinates.lat}-${coordinates.lon}.pdf`
        : `informe-detallado-${coordinates.lat}-${coordinates.lon}.pdf`

      DetailedExportService.exportDetailedReport(validClimateData, analysisResults, coordinates, filename, isHistorical)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header with Logo */}
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src="/images/agroptimum-logo.png"
              alt="Agroptimum - Shaping Pistachio Industry"
              width={150}
              height={150}
              className="object-contain"
            />
          </div>
          <CardTitle className="text-2xl text-green-700">Informe Agroclimatico Detallado para Pistacho</CardTitle>
          <p className="text-muted-foreground">
            {isHistorical ? "Análisis Histórico de 20 Años" : "Análisis Climático Actual"}
          </p>
          <p className="text-sm text-muted-foreground">
            Coordenadas: {coordinates.lat.toFixed(4)}, {coordinates.lon.toFixed(4)}
          </p>
          <p className="text-xs text-muted-foreground">Datos procesados: {validClimateData.length} registros</p>
        </CardHeader>
      </Card>

      {/* Executive Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Resumen Ejecutivo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Thermometer className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Temperatura</span>
              </div>
              <p className="text-2xl font-bold text-blue-600">{avgTemp.toFixed(1)}°C</p>
              <p className="text-sm text-blue-700">Promedio anual</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Droplets className="h-4 w-4 text-green-600" />
                <span className="font-medium text-green-800">Precipitación</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{totalPrecip.toFixed(0)} mm</p>
              <p className="text-sm text-green-700">Total anual</p>
            </div>

            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sun className="h-4 w-4 text-yellow-600" />
                <span className="font-medium text-yellow-800">Radiación Solar</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600">{avgSolarRadiation.toFixed(1)} MJ/m²</p>
              <p className="text-sm text-yellow-700">Promedio diario</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Irrigation Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-600" />
            Recomendaciones de Riego Específicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-lg mb-3">Necesidades Hídricas</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  • <strong>ETC Promedio:</strong> {avgETC.toFixed(2)} mm/día
                </li>
                <li>
                  • <strong>Necesidad Anual:</strong> {irrigationNeed.toFixed(0)} mm
                </li>
                <li>
                  • <strong>Déficit Hídrico:</strong> {waterDeficit.toFixed(0)} mm
                </li>
                <li>
                  • <strong>Eficiencia Requerida:</strong>{" "}
                  {((irrigationNeed / (irrigationNeed + totalPrecip)) * 100).toFixed(1)}%
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-lg mb-3">Calendario de Riego</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  • <strong>Enero-Febrero:</strong> Riego cada 15-20 días
                </li>
                <li>
                  • <strong>Marzo-Abril:</strong> Riego cada 5-7 días (floración)
                </li>
                <li>
                  • <strong>Mayo-Agosto:</strong> Riego diario (llenado fruto)
                </li>
                <li>
                  • <strong>Septiembre:</strong> Riego cada 3-4 días (maduración)
                </li>
                <li>
                  • <strong>Octubre-Diciembre:</strong> Riego cada 10-15 días
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="font-semibold text-amber-800 mb-2">Recomendaciones Críticas</h4>
            <ul className="space-y-1 text-sm text-amber-700">
              {frostRisk === "Alto" && (
                <li>
                  ⚠️ <strong>Riesgo de Heladas Alto:</strong> Instalar sistemas de protección antiheladas
                </li>
              )}
              {droughtRisk === "Alto" && (
                <li>
                  🌵 <strong>Estrés Hídrico Alto:</strong> Implementar riego por goteo de alta eficiencia
                </li>
              )}
              {heatStressRisk === "Alto" && (
                <li>
                  🌡️ <strong>Estrés Térmico Alto:</strong> Considerar mallas de sombreo en verano
                </li>
              )}
              <li>
                💧 <strong>Monitoreo:</strong> Instalar sensores de humedad del suelo a 30-60 cm de profundidad
              </li>
              <li>
                📊 <strong>Ajustes:</strong> Modificar frecuencia según condiciones meteorológicas semanales
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Risk Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Análisis de Riesgos Climáticos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`p-4 rounded-lg border-2 ${
                frostRisk === "Alto"
                  ? "bg-red-50 border-red-200"
                  : frostRisk === "Medio"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-green-50 border-green-200"
              }`}
            >
              <h4 className="font-semibold mb-2">Riesgo de Heladas</h4>
              <p
                className={`text-2xl font-bold ${
                  frostRisk === "Alto" ? "text-red-600" : frostRisk === "Medio" ? "text-yellow-600" : "text-green-600"
                }`}
              >
                {frostRisk}
              </p>
              <p className="text-sm mt-1">{totalFrostHours.toFixed(0)} horas de helada</p>
            </div>

            <div
              className={`p-4 rounded-lg border-2 ${
                droughtRisk === "Alto"
                  ? "bg-red-50 border-red-200"
                  : droughtRisk === "Medio"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-green-50 border-green-200"
              }`}
            >
              <h4 className="font-semibold mb-2">Estrés Hídrico</h4>
              <p
                className={`text-2xl font-bold ${
                  droughtRisk === "Alto"
                    ? "text-red-600"
                    : droughtRisk === "Medio"
                      ? "text-yellow-600"
                      : "text-green-600"
                }`}
              >
                {droughtRisk}
              </p>
              <p className="text-sm mt-1">{waterDeficit.toFixed(0)} mm déficit</p>
            </div>

            <div
              className={`p-4 rounded-lg border-2 ${
                heatStressRisk === "Alto"
                  ? "bg-red-50 border-red-200"
                  : heatStressRisk === "Medio"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-green-50 border-green-200"
              }`}
            >
              <h4 className="font-semibold mb-2">Estrés Térmico</h4>
              <p
                className={`text-2xl font-bold ${
                  heatStressRisk === "Alto"
                    ? "text-red-600"
                    : heatStressRisk === "Medio"
                      ? "text-yellow-600"
                      : "text-green-600"
                }`}
              >
                {heatStressRisk}
              </p>
              <p className="text-sm mt-1">{avgTemp.toFixed(1)}°C promedio</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Download Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Descargar Informe Completo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={generateDetailedPDF} className="flex items-center gap-2 bg-green-600 hover:bg-green-700">
              <FileText className="h-4 w-4" />
              Descargar Informe PDF Detallado
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            El informe incluye análisis completo, gráficos, recomendaciones específicas y el logo de Agroptimum.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
