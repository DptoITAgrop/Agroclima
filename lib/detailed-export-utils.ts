import jsPDF from "jspdf"
import type { ClimateData } from "./types"

export class DetailedExportService {
  static async exportDetailedReport(
    data: ClimateData[],
    analysisResults: any,
    coordinates: { lat: number; lon: number },
    filename = "informe-detallado-pistacho.pdf",
    isHistorical = false,
  ) {
    const doc = new jsPDF()

    // Add logo to PDF (we'll add this as base64 or use a placeholder)
    const logoBase64 =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" // Placeholder

    try {
      // Header with logo
      doc.addImage(logoBase64, "PNG", 20, 10, 40, 40)
      doc.setFontSize(24)
      doc.setTextColor(34, 139, 34) // Green color
      doc.text("AGROPTIMUM", 70, 25)
      doc.setFontSize(12)
      doc.text("SHAPING PISTACHIO INDUSTRY", 70, 35)

      doc.setTextColor(0, 0, 0) // Reset to black
      doc.setFontSize(18)
      doc.text("Informe Agroclimatico Detallado", 20, 60)

      doc.setFontSize(12)
      doc.text(`Coordenadas: ${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`, 20, 75)
      doc.text(`Período: ${data[0]?.date} - ${data[data.length - 1]?.date}`, 20, 85)
      doc.text(`Tipo de análisis: ${isHistorical ? "Histórico 20 años" : "Actual"}`, 20, 95)
      doc.text(`Fecha del informe: ${new Date().toLocaleDateString("es-ES")}`, 20, 105)

      // Calculate comprehensive statistics
      const avgTemp = data.reduce((sum, d) => sum + d.temperature_avg, 0) / data.length
      const totalPrecip = data.reduce((sum, d) => sum + d.precipitation, 0)
      const avgETO = data.reduce((sum, d) => sum + d.eto, 0) / data.length
      const avgETC = data.reduce((sum, d) => sum + d.etc, 0) / data.length
      const totalFrostHours = data.reduce((sum, d) => sum + d.frost_hours, 0)
      const totalChillHours = data.reduce((sum, d) => sum + d.chill_hours, 0)
      const avgSolarRadiation = data.reduce((sum, d) => sum + d.solar_radiation, 0) / data.length
      const avgHumidity = data.reduce((sum, d) => sum + d.humidity, 0) / data.length
      const waterDeficit = Math.max(0, avgETO * data.length - totalPrecip)
      const irrigationNeed = avgETC * data.length

      // Executive Summary
      doc.setFontSize(16)
      doc.setTextColor(34, 139, 34)
      doc.text("RESUMEN EJECUTIVO", 20, 125)

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      let yPos = 140

      const summaryData = [
        `• Temperatura media anual: ${avgTemp.toFixed(1)}°C`,
        `• Precipitación total: ${totalPrecip.toFixed(0)} mm`,
        `• Radiación solar promedio: ${avgSolarRadiation.toFixed(1)} MJ/m²/día`,
        `• Humedad relativa promedio: ${avgHumidity.toFixed(1)}%`,
        `• Evapotranspiración de referencia (ETO): ${avgETO.toFixed(2)} mm/día`,
        `• Evapotranspiración del cultivo (ETC): ${avgETC.toFixed(2)} mm/día`,
        `• Necesidad hídrica anual: ${irrigationNeed.toFixed(0)} mm`,
        `• Déficit hídrico: ${waterDeficit.toFixed(0)} mm`,
        `• Horas frío acumuladas: ${totalChillHours.toFixed(0)} h`,
        `• Horas de helada: ${totalFrostHours.toFixed(0)} h`,
      ]

      summaryData.forEach((line) => {
        doc.text(line, 25, yPos)
        yPos += 8
      })

      // Risk Assessment
      yPos += 10
      doc.setFontSize(16)
      doc.setTextColor(34, 139, 34)
      doc.text("EVALUACIÓN DE RIESGOS", 20, yPos)

      yPos += 15
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)

      const frostRisk = totalFrostHours > 100 ? "ALTO" : totalFrostHours > 50 ? "MEDIO" : "BAJO"
      const droughtRisk = waterDeficit > 500 ? "ALTO" : waterDeficit > 200 ? "MEDIO" : "BAJO"
      const heatStressRisk = avgTemp > 30 ? "ALTO" : avgTemp > 25 ? "MEDIO" : "BAJO"

      doc.text(`• Riesgo de heladas: ${frostRisk}`, 25, yPos)
      yPos += 8
      doc.text(`• Riesgo de estrés hídrico: ${droughtRisk}`, 25, yPos)
      yPos += 8
      doc.text(`• Riesgo de estrés térmico: ${heatStressRisk}`, 25, yPos)
      yPos += 15

      // Irrigation Recommendations
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      doc.setFontSize(16)
      doc.setTextColor(34, 139, 34)
      doc.text("RECOMENDACIONES DE RIEGO ESPECÍFICAS", 20, yPos)

      yPos += 15
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)

      const irrigationRecommendations = [
        "CALENDARIO DE RIEGO ESTACIONAL:",
        "• Enero-Febrero: Riego cada 15-20 días (dormancia)",
        "• Marzo-Abril: Riego cada 5-7 días (brotación y floración)",
        "• Mayo-Agosto: Riego diario (llenado del fruto)",
        "• Septiembre: Riego cada 3-4 días (maduración)",
        "• Octubre-Diciembre: Riego cada 10-15 días (post-cosecha)",
        "",
        "CANTIDADES RECOMENDADAS:",
        `• Primavera: ${(avgETC * 1.2).toFixed(1)} mm/día`,
        `• Verano: ${(avgETC * 1.5).toFixed(1)} mm/día`,
        `• Otoño: ${(avgETC * 0.8).toFixed(1)} mm/día`,
        `• Invierno: ${(avgETC * 0.4).toFixed(1)} mm/día`,
        "",
        "RECOMENDACIONES CRÍTICAS:",
      ]

      if (frostRisk === "ALTO") {
        irrigationRecommendations.push("⚠️ INSTALAR SISTEMA DE PROTECCIÓN ANTIHELADAS")
      }
      if (droughtRisk === "ALTO") {
        irrigationRecommendations.push("🌵 IMPLEMENTAR RIEGO POR GOTEO DE ALTA EFICIENCIA")
      }
      if (heatStressRisk === "ALTO") {
        irrigationRecommendations.push("🌡️ CONSIDERAR MALLAS DE SOMBREO EN VERANO")
      }

      irrigationRecommendations.push("💧 Instalar sensores de humedad del suelo")
      irrigationRecommendations.push("📊 Monitoreo semanal de condiciones meteorológicas")
      irrigationRecommendations.push("🔄 Ajustar frecuencia según pronóstico del tiempo")

      irrigationRecommendations.forEach((line) => {
        if (yPos > 270) {
          doc.addPage()
          yPos = 20
        }
        doc.text(line, 25, yPos)
        yPos += 8
      })

      // Footer
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      yPos += 20
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text("Este informe ha sido generado por PistachoClima - Agroptimum", 20, yPos)
      doc.text("Basado en datos de NASA POWER, AEMET y SIAR", 20, yPos + 10)
      doc.text(`Generado el ${new Date().toLocaleString("es-ES")}`, 20, yPos + 20)

      doc.save(filename)
    } catch (error) {
      console.error("Error generating detailed PDF:", error)
      // Fallback to simple PDF generation
      this.generateSimplePDF(data, analysisResults, coordinates, filename, isHistorical)
    }
  }

  private static generateSimplePDF(
    data: ClimateData[],
    analysisResults: any,
    coordinates: { lat: number; lon: number },
    filename: string,
    isHistorical: boolean,
  ) {
    const doc = new jsPDF()

    doc.setFontSize(20)
    doc.text("Informe Agroclimatico - Agroptimum", 20, 30)

    doc.setFontSize(12)
    doc.text(`Coordenadas: ${coordinates.lat.toFixed(4)}, ${coordinates.lon.toFixed(4)}`, 20, 50)
    doc.text(`Período: ${data[0]?.date} - ${data[data.length - 1]?.date}`, 20, 60)
    doc.text(`Tipo: ${isHistorical ? "Análisis Histórico 20 años" : "Análisis Actual"}`, 20, 70)

    // Basic statistics
    const avgTemp = data.reduce((sum, d) => sum + d.temperature_avg, 0) / data.length
    const totalPrecip = data.reduce((sum, d) => sum + d.precipitation, 0)
    const avgETC = data.reduce((sum, d) => sum + d.etc, 0) / data.length

    doc.text(`Temperatura media: ${avgTemp.toFixed(1)}°C`, 20, 90)
    doc.text(`Precipitación total: ${totalPrecip.toFixed(0)} mm`, 20, 100)
    doc.text(`Necesidad hídrica: ${(avgETC * data.length).toFixed(0)} mm`, 20, 110)

    doc.save(filename)
  }
}
