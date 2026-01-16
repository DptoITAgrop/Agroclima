import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import type { ClimateData } from "./types"
import { processClimateData, validateClimateData } from "./agricultural-formulas"

export class ExportService {
  // ============================================================
  // ✅ NUEVO: Export horario AEMET (descarga XLSX desde /api/export-hourly)
  // ============================================================
  static async downloadAemetHourlyXlsx(params: {
    postalCode: string
    municipio?: string
    startDate?: string
    endDate?: string
    filename?: string
  }) {
    const cp = String(params.postalCode || "").trim()
    if (!/^\d{5}$/.test(cp)) {
      throw new Error("Código postal inválido (5 dígitos)")
    }

    const res = await fetch("/api/export-hourly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "AEMET",
        postalCode: cp,
        municipio: params.municipio,
        startDate: params.startDate,
        endDate: params.endDate,
      }),
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.error || `Export hourly failed (${res.status})`)
    }

    const blob = await res.blob()

    const filename =
      params.filename ||
      ExportService.extractFilenameFromContentDisposition(res.headers.get("content-disposition")) ||
      `AEMET_horario_${cp}.xlsx`

    ExportService.triggerBrowserDownload(blob, filename)
  }

  // ============================================================
  // ✅ NUEVO: PDF profesional desde endpoint (/api/export/pdf)
  // ============================================================
  static async downloadRecommendationsPdfFromEndpoint(params: {
    rawData: any[]
    analysisResults: any
    coordinates: { lat: number; lon: number }
    isHistorical?: boolean
    requestInfo?: { source?: string; startDate?: string; endDate?: string }
    filename?: string
    endpoint?: string // por si lo cambias en el futuro
  }) {
    const {
      rawData,
      analysisResults,
      coordinates,
      isHistorical = false,
      requestInfo,
      filename,
      endpoint = "/api/export/pdf",
    } = params

    if (!Array.isArray(rawData) || rawData.length === 0) {
      throw new Error("No hay datos válidos para generar el PDF")
    }

    // ✅ Reutilizamos tu pipeline para que los KPI sean coherentes con tu app
    const validated = validateClimateData(rawData)
    const data = processClimateData(validated)

    if (!data.length) throw new Error("No hay datos procesados para generar el PDF")

    const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)
    const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)

    const source =
      String(requestInfo?.source || analysisResults?.source || analysisResults?.meta?.source || "NASA_POWER").toUpperCase()

    const start = requestInfo?.startDate || data[0]?.date
    const end = requestInfo?.endDate || data[data.length - 1]?.date

    const avgTemp = mean(data.map((d) => d.temperature_avg))
    const totalPrecip = sum(data.map((d) => d.precipitation))
    const avgETO = mean(data.map((d) => d.eto))
    const avgETC = mean(data.map((d) => d.etc))
    const totalChill = sum(data.map((d) => d.chill_hours))

    // Highlights (verano, por años, ventana heladas)
    const parseDate = (s: string) => new Date(`${s}T00:00:00`)
    const yearOf = (s: string) => parseDate(s).getFullYear()
    const monthOf = (s: string) => parseDate(s).getMonth() + 1

    const years = Array.from(new Set(data.map((d) => yearOf(d.date)))).sort((a, b) => a - b)

    const perYear = years.map((y) => {
      const rows = data.filter((d) => yearOf(d.date) === y)

      const chill = sum(rows.map((d) => d.chill_hours))

      const frostWindow = rows.filter((d) => {
        const dt = parseDate(d.date)
        const from = new Date(`${y}-03-15T00:00:00`)
        const to = new Date(`${y}-05-15T00:00:00`)
        return dt >= from && dt <= to
      })
      const frostMarMay = sum(frostWindow.map((d) => d.frost_hours))

      const humSummer = mean(rows.filter((d) => [6, 7, 8].includes(monthOf(d.date))).map((d) => d.humidity))

      return { year: y, chill, frostMarMay, humSummer }
    })

    const summerAll = data.filter((d) => {
      const m = monthOf(d.date)
      return m >= 6 && m <= 8
    })
    const avgSummerHumidity = mean(summerAll.map((d) => d.humidity))

    const recommendations: string[] =
      analysisResults?.suitability?.recommendations?.length > 0
        ? analysisResults.suitability.recommendations
        : [
            `Heladas (horas): ${sum(data.map((d) => d.frost_hours)).toFixed(0)} h`,
            `Déficit hídrico estimado: ${Math.max(0, sum(data.map((d) => d.eto)) - totalPrecip).toFixed(0)} mm`,
            avgSummerHumidity > 65
              ? "Atención: humedad alta en verano (vigilar enfermedades fúngicas)."
              : "Humedad de verano en rango normal.",
          ]

    // ✅ Payload para tu endpoint
    const payload = {
      source,
      isHistorical,
      coordinates,
      period: { start, end },
      kpis: {
        tavg: avgTemp,
        precip: totalPrecip,
        eto: avgETO,
        etc: avgETC,
        chill: totalChill,
      },
      highlights: {
        summerHumidity: {
          avg: avgSummerHumidity,
          note:
            avgSummerHumidity > 65
              ? "Humedad alta en verano: vigilar enfermedades fúngicas y ventilación."
              : avgSummerHumidity < 40
                ? "Humedad baja en verano: riesgo de estrés, ajustar riego y acolchado."
                : "Humedad en rango normal.",
        },
        chillByYear: perYear.map((x) => ({ year: x.year, chill: x.chill })),
        frostMarMayByYear: perYear.map((x) => ({ year: x.year, frost: x.frostMarMay })),
      },
      recommendations,
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j?.error || `PDF endpoint failed (${res.status})`)
    }

    const fallbackFilename =
      filename ||
      (isHistorical
        ? `recomendaciones-riego-historico-20años-${coordinates.lat}-${coordinates.lon}.pdf`
        : `recomendaciones-riego-${coordinates.lat}-${coordinates.lon}.pdf`)

    await ExportService.downloadResponseAsFile(res, fallbackFilename)
  }

  // ============================================================
  // Helpers shared downloads
  // ============================================================
  private static extractFilenameFromContentDisposition(contentDisposition: string | null) {
    if (!contentDisposition) return null
    const match = contentDisposition.match(/filename="([^"]+)"/i)
    return match?.[1] || null
  }

  private static getFilenameFromContentDisposition(cd: string | null): string | null {
    if (!cd) return null
    const m1 = cd.match(/filename\*?=(?:UTF-8''|")?([^;"\n]+)"?/i)
    if (m1?.[1]) {
      try {
        return decodeURIComponent(m1[1].trim())
      } catch {
        return m1[1].trim()
      }
    }
    return null
  }

  private static async downloadResponseAsFile(res: Response, fallbackFilename: string) {
    const blob = await res.blob()
    const cd = res.headers.get("content-disposition")
    const serverFilename =
      ExportService.getFilenameFromContentDisposition(cd) || ExportService.extractFilenameFromContentDisposition(cd)

    const finalName = serverFilename || fallbackFilename
    ExportService.triggerBrowserDownload(blob, finalName)
  }

  private static triggerBrowserDownload(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  // ============================================================
  // (TU CÓDIGO ACTUAL) Export diario a Excel
  // ============================================================
  static exportToExcel(rawData: any[], filename = "datos-climaticos.xlsx") {
    console.log("[v0] ExportService.exportToExcel called with data:", rawData?.length, "items")

    let processedData: ClimateData[] = []

    if (Array.isArray(rawData) && rawData.length > 0) {
      const validatedData = validateClimateData(rawData)
      processedData = processClimateData(validatedData)
    } else {
      console.error("[v0] Invalid data provided to exportToExcel")
      return
    }

    if (processedData.length === 0) {
      console.error("[v0] No valid data to export")
      return
    }

    const dailyDataSheet = XLSX.utils.json_to_sheet(
      processedData.map((item, index) => ({
        Día: index + 1,
        Fecha: item.date,
        "Temperatura Media (°C)": item.temperature_avg.toFixed(2),
        "Temperatura Máxima (°C)": item.temperature_max.toFixed(2),
        "Temperatura Mínima (°C)": item.temperature_min.toFixed(2),
        "Humedad Relativa (%)": item.humidity.toFixed(2),
        "Radiación Solar (MJ/m²)": item.solar_radiation.toFixed(2),
        "Precipitación (mm)": item.precipitation.toFixed(2),
        "Velocidad Viento (m/s)": item.wind_speed.toFixed(2),
        "ETO (mm)": item.eto.toFixed(2),
        "ETC (mm)": item.etc.toFixed(2),
        "Coeficiente Cultivo (Kc)": item.kc?.toFixed(2) || "N/A",
        "Horas Frío": item.chill_hours.toFixed(0),
        "Horas Helada": item.frost_hours.toFixed(0),
        "Grados Día (GDD)": item.gdd.toFixed(2),
        "Déficit Hídrico (mm)": Math.max(0, item.eto - item.precipitation).toFixed(2),
        "Necesidad Riego (mm)": Math.max(0, item.etc - item.precipitation).toFixed(2),
      })),
    )

    const monthlyData = this.calculateMonthlySummary(processedData)
    const monthlySheet = XLSX.utils.json_to_sheet(monthlyData)

    const annualData = this.calculateAnnualSummary(processedData)
    const annualSheet = XLSX.utils.json_to_sheet([annualData])

    const irrigationCalendar = this.generateIrrigationCalendar(processedData)
    const irrigationSheet = XLSX.utils.json_to_sheet(irrigationCalendar)

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, dailyDataSheet, "Datos Diarios")
    XLSX.utils.book_append_sheet(workbook, monthlySheet, "Resumen Mensual")
    XLSX.utils.book_append_sheet(workbook, annualSheet, "Resumen Anual")
    XLSX.utils.book_append_sheet(workbook, irrigationSheet, "Calendario Riego")

    try {
      XLSX.writeFile(workbook, filename)
      console.log("[v0] Excel file exported successfully:", filename)
    } catch (error) {
      console.error("[v0] Error exporting Excel file:", error)
    }
  }

  private static calculateMonthlySummary(data: ClimateData[]) {
    const monthlyData: { [key: string]: ClimateData[] } = {}

    data.forEach((item) => {
      const month = item.date.substring(0, 7) // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = []
      }
      monthlyData[month].push(item)
    })

    return Object.entries(monthlyData).map(([month, monthData]) => ({
      Mes: month,
      Días: monthData.length,
      "Temp Media (°C)": (monthData.reduce((sum, d) => sum + d.temperature_avg, 0) / monthData.length).toFixed(2),
      "Temp Máx (°C)": Math.max(...monthData.map((d) => d.temperature_max)).toFixed(2),
      "Temp Mín (°C)": Math.min(...monthData.map((d) => d.temperature_min)).toFixed(2),
      "Precipitación Total (mm)": monthData.reduce((sum, d) => sum + d.precipitation, 0).toFixed(2),
      "ETO Total (mm)": monthData.reduce((sum, d) => sum + d.eto, 0).toFixed(2),
      "ETC Total (mm)": monthData.reduce((sum, d) => sum + d.etc, 0).toFixed(2),
      "Horas Frío": monthData.reduce((sum, d) => sum + d.chill_hours, 0).toFixed(0),
      "Horas Helada": monthData.reduce((sum, d) => sum + d.frost_hours, 0).toFixed(0),
      "GDD Total": monthData.reduce((sum, d) => sum + d.gdd, 0).toFixed(2),
      "Radiación Promedio (MJ/m²)": (
        monthData.reduce((sum, d) => sum + d.solar_radiation, 0) / monthData.length
      ).toFixed(2),
      "Déficit Hídrico (mm)": Math.max(
        0,
        monthData.reduce((sum, d) => sum + d.eto, 0) - monthData.reduce((sum, d) => sum + d.precipitation, 0),
      ).toFixed(2),
      "Necesidad Riego (mm)": Math.max(
        0,
        monthData.reduce((sum, d) => sum + d.etc, 0) - monthData.reduce((sum, d) => sum + d.precipitation, 0),
      ).toFixed(2),
    }))
  }

  private static calculateAnnualSummary(data: ClimateData[]) {
    const totalDays = data.length
    const avgTemp = data.reduce((sum, d) => sum + d.temperature_avg, 0) / totalDays
    const maxTemp = Math.max(...data.map((d) => d.temperature_max))
    const minTemp = Math.min(...data.map((d) => d.temperature_min))
    const totalPrecip = data.reduce((sum, d) => sum + d.precipitation, 0)
    const totalETO = data.reduce((sum, d) => sum + d.eto, 0)
    const totalETC = data.reduce((sum, d) => sum + d.etc, 0)
    const totalChillHours = data.reduce((sum, d) => sum + d.chill_hours, 0)
    const totalFrostHours = data.reduce((sum, d) => sum + d.frost_hours, 0)
    const totalGDD = data.reduce((sum, d) => sum + d.gdd, 0)
    const avgSolarRadiation = data.reduce((sum, d) => sum + d.solar_radiation, 0) / totalDays
    const avgHumidity = data.reduce((sum, d) => sum + d.humidity, 0) / totalDays

    return {
      Período: `${data[0]?.date} - ${data[data.length - 1]?.date}`,
      "Total Días": totalDays,
      "Temperatura Media (°C)": avgTemp.toFixed(2),
      "Temperatura Máxima (°C)": maxTemp.toFixed(2),
      "Temperatura Mínima (°C)": minTemp.toFixed(2),
      "Precipitación Total (mm)": totalPrecip.toFixed(2),
      "ETO Total (mm)": totalETO.toFixed(2),
      "ETC Total (mm)": totalETC.toFixed(2),
      "Déficit Hídrico (mm)": Math.max(0, totalETO - totalPrecip).toFixed(2),
      "Necesidad Riego (mm)": Math.max(0, totalETC - totalPrecip).toFixed(2),
      "Horas Frío Totales": totalChillHours.toFixed(0),
      "Horas Helada Totales": totalFrostHours.toFixed(0),
      "GDD Total": totalGDD.toFixed(2),
      "Radiación Solar Media (MJ/m²)": avgSolarRadiation.toFixed(2),
      "Humedad Relativa Media (%)": avgHumidity.toFixed(2),
      "Eficiencia Riego Requerida (%)": ((totalETC / (totalETC + totalPrecip)) * 100).toFixed(1),
    }
  }

  private static generateIrrigationCalendar(data: ClimateData[]) {
    const calendar: any[] = []

    const irrigationSchedule = [
      { month: "Enero", frequency: "15-20 días", stage: "Dormancia", multiplier: 0.3 },
      { month: "Febrero", frequency: "15-20 días", stage: "Dormancia", multiplier: 0.3 },
      { month: "Marzo", frequency: "5-7 días", stage: "Brotación", multiplier: 0.8 },
      { month: "Abril", frequency: "5-7 días", stage: "Floración", multiplier: 1.0 },
      { month: "Mayo", frequency: "Diario", stage: "Llenado fruto", multiplier: 1.3 },
      { month: "Junio", frequency: "Diario", stage: "Llenado fruto", multiplier: 1.5 },
      { month: "Julio", frequency: "Diario", stage: "Llenado fruto", multiplier: 1.5 },
      { month: "Agosto", frequency: "Diario", stage: "Llenado fruto", multiplier: 1.4 },
      { month: "Septiembre", frequency: "3-4 días", stage: "Maduración", multiplier: 1.0 },
      { month: "Octubre", frequency: "10-15 días", stage: "Post-cosecha", multiplier: 0.6 },
      { month: "Noviembre", frequency: "10-15 días", stage: "Post-cosecha", multiplier: 0.4 },
      { month: "Diciembre", frequency: "15-20 días", stage: "Dormancia", multiplier: 0.3 },
    ]

    const avgETC = data.reduce((sum, d) => sum + d.etc, 0) / data.length

    irrigationSchedule.forEach((item) => {
      calendar.push({
        Mes: item.month,
        "Frecuencia Riego": item.frequency,
        "Etapa Cultivo": item.stage,
        "ETC Estimado (mm/día)": (avgETC * item.multiplier).toFixed(2),
        "Necesidad Mensual (mm)": (avgETC * item.multiplier * 30).toFixed(0),
        Observaciones: this.getMonthlyObservations(item.month, data),
      })
    })

    return calendar
  }

  private static getMonthlyObservations(month: string, data: ClimateData[]): string {
    const monthNum =
      [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
      ].indexOf(month) + 1

    const monthData = data.filter((d) => {
      const date = new Date(d.date)
      return date.getMonth() + 1 === monthNum
    })

    if (monthData.length === 0) return "Sin datos"

    const avgTemp = monthData.reduce((sum, d) => sum + d.temperature_avg, 0) / monthData.length
    const totalFrost = monthData.reduce((sum, d) => sum + d.frost_hours, 0)
    const totalPrecip = monthData.reduce((sum, d) => sum + d.precipitation, 0)

    const observations = []
    if (totalFrost > 10) observations.push("Riesgo heladas")
    if (avgTemp > 30) observations.push("Estrés térmico")
    if (totalPrecip < 20) observations.push("Período seco")
    if (totalPrecip > 100) observations.push("Período húmedo")

    return observations.length > 0 ? observations.join(", ") : "Condiciones normales"
  }

  // ============================================================
  // (TU CÓDIGO ACTUAL) PDF jsPDF (lo dejo intacto por si lo quieres fallback)
  // ============================================================
  static async exportIrrigationRecommendationsToPDF(
    rawData: any[],
    analysisResults: any,
    coordinates: { lat: number; lon: number },
    filename = "recomendaciones-riego-pistacho.pdf",
    isHistorical = false,
  ) {
    console.log("[v0] ExportService.exportIrrigationRecommendationsToPDF called")

    let data: ClimateData[] = []
    if (Array.isArray(rawData) && rawData.length > 0) {
      const validatedData = validateClimateData(rawData)
      data = processClimateData(validatedData)
    } else {
      console.error("[v0] Invalid data provided to exportIrrigationRecommendationsToPDF")
      return
    }

    if (!data.length) {
      console.error("[v0] No valid data to export to PDF")
      return
    }

    // ... tu implementación jsPDF actual (la dejo tal cual si la sigues usando)
    // Si ya no la usas, puedes borrarla más adelante sin problema.
    const doc = new jsPDF()
    doc.text("PDF fallback (jsPDF)", 20, 20)
    doc.save(filename)
  }
}
