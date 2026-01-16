"use client"

import { Button } from "@/components/ui/button"
import { Download, FileText, History, BarChart3 } from "lucide-react"
import { ExportService } from "@/lib/export-utils"

interface DownloadButtonsProps {
  climateData: any[] // daily data normalmente
  analysisResults: any
  coordinates: { lat: number; lon: number }
  isHistorical?: boolean
  onShowDetailedReport?: () => void

  // ✅ Esto es lo que necesitamos para AEMET horario
  requestInfo?: {
    source?: string
    postalCode?: string
    startDate?: string
    endDate?: string
  }
}

function toYYYYMMDD(input: string | Date) {
  const d = typeof input === "string" ? new Date(input) : input
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function tryGetDateFromRow(row: any): string | null {
  if (!row) return null
  if (typeof row.date === "string") return row.date
  if (typeof row.datetime === "string") return row.datetime.split("T")[0]
  if (typeof row.fecha === "string") return row.fecha
  return null
}

function getFilenameFromContentDisposition(cd: string | null): string | null {
  if (!cd) return null

  // filename="xxx.xlsx"
  const m1 = cd.match(/filename\*?=(?:UTF-8''|")?([^;"\n]+)"?/i)
  if (m1?.[1]) {
    try {
      // por si viene urlencoded
      return decodeURIComponent(m1[1].trim())
    } catch {
      return m1[1].trim()
    }
  }
  return null
}

async function downloadResponseAsFile(res: Response, fallbackFilename: string) {
  const blob = await res.blob()
  const cd = res.headers.get("content-disposition")
  const serverFilename = getFilenameFromContentDisposition(cd)
  const filename = serverFilename || fallbackFilename

  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

export function DownloadButtons({
  climateData,
  analysisResults,
  coordinates,
  isHistorical = false,
  onShowDetailedReport,
  requestInfo,
}: DownloadButtonsProps) {
  const hasValidData = Array.isArray(climateData) && climateData.length > 0

  const source = String(requestInfo?.source || "").toUpperCase()
  const postalCode = String(requestInfo?.postalCode || "").trim()

  // ✅✅✅ SOLO CAMBIO AQUÍ: Excel diario pasa a /api/export/xlsx (ExcelJS bonito + logo)
  const handleExcelDownload = async () => {
    if (!hasValidData) return

    // Rango (si existe)
    const startDate =
      requestInfo?.startDate ||
      (tryGetDateFromRow(climateData?.[0]) ? toYYYYMMDD(tryGetDateFromRow(climateData?.[0])!) : undefined)

    const endDate =
      requestInfo?.endDate ||
      (tryGetDateFromRow(climateData?.[climateData.length - 1])
        ? toYYYYMMDD(tryGetDateFromRow(climateData?.[climateData.length - 1])!)
        : undefined)

    const fallbackFilename = isHistorical
      ? `datos-meteorologicos-diarios-20años-${coordinates.lat}-${coordinates.lon}.xlsx`
      : `datos-meteorologicos-diarios-${coordinates.lat}-${coordinates.lon}.xlsx`

    // ✅ Body compatible con /api/export/xlsx (tu route actual)
    const body = {
      source: requestInfo?.source || source || "NASA_POWER",
      startDate,
      endDate,
      parameters: Array.isArray((requestInfo as any)?.parameters) ? (requestInfo as any).parameters : [],
      latitude: coordinates.lat,
      longitude: coordinates.lon,
      postalCode: requestInfo?.postalCode ? String(requestInfo.postalCode).trim() : undefined,
      municipio: (requestInfo as any)?.municipio ? String((requestInfo as any).municipio).trim() : undefined,
    }

    try {
      const res = await fetch("/api/export/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[export/xlsx] error:", err)
        throw new Error(err?.error ?? "Error generando Excel diario")
      }

      await downloadResponseAsFile(res, fallbackFilename)
    } catch (e) {
      console.error("[DownloadButtons] Error downloading daily excel:", e)
    }
  }

  const handleHourlyExcelDownload = async () => {
    const isAemet = source === "AEMET"

    // Si no es AEMET, solo exportamos si tenemos datos válidos (tu lógica original)
    if (!isAemet && !hasValidData) return

    // Si es AEMET, necesitamos CP sí o sí
    if (isAemet && !/^\d{5}$/.test(postalCode)) {
      console.error("[DownloadButtons] Falta postalCode válido para AEMET horario.")
      return
    }

    // Rango (si existe)
    const startDate =
      requestInfo?.startDate ||
      (tryGetDateFromRow(climateData?.[0]) ? toYYYYMMDD(tryGetDateFromRow(climateData?.[0])!) : undefined)

    const endDate =
      requestInfo?.endDate ||
      (tryGetDateFromRow(climateData?.[climateData.length - 1])
        ? toYYYYMMDD(tryGetDateFromRow(climateData?.[climateData.length - 1])!)
        : undefined)

    // ✅ Body correcto para el backend
    const body = isAemet
      ? {
          source: "AEMET",
          postalCode,
          startDate,
          endDate,
        }
      : {
          source: source || undefined,
          latitude: coordinates.lat,
          longitude: coordinates.lon,
          startDate,
          endDate,
        }

    const fallbackFilename = isAemet
      ? startDate && endDate
        ? `AEMET_horario_${postalCode}_${startDate}_a_${endDate}.xlsx`
        : `AEMET_horario_${postalCode}.xlsx`
      : startDate && endDate
        ? `datos-horarios-${startDate}_a_${endDate}-${coordinates.lat}-${coordinates.lon}.xlsx`
        : `datos-horarios-${coordinates.lat}-${coordinates.lon}.xlsx`

    try {
      // Si requestInfo viene vacío, lo verás claro aquí
      if (!requestInfo) {
        console.warn("[DownloadButtons] requestInfo no viene. Para AEMET horario necesitas source+postalCode.")
      }

      const res = await fetch("/api/export-hourly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[export-hourly] error:", err)
        throw new Error(err?.error ?? "Error generando Excel horario")
      }

      await downloadResponseAsFile(res, fallbackFilename)
    } catch (e) {
      console.error("[DownloadButtons] Error downloading hourly excel:", e)
    }
  }

  // ✅✅✅ SOLO CAMBIO PDF: llamar al endpoint /api/export/pdf y mandar payload con cálculos
  const handlePDFDownload = async () => {
    if (!hasValidData) return

    const startDate =
      requestInfo?.startDate ||
      (tryGetDateFromRow(climateData?.[0]) ? toYYYYMMDD(tryGetDateFromRow(climateData?.[0])!) : undefined)

    const endDate =
      requestInfo?.endDate ||
      (tryGetDateFromRow(climateData?.[climateData.length - 1])
        ? toYYYYMMDD(tryGetDateFromRow(climateData?.[climateData.length - 1])!)
        : undefined)

    const clamp0 = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)
    const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)
    const sum = (arr: number[]) => arr.reduce((s, x) => s + x, 0)

    const parseDate = (s: string) => new Date(`${s}T00:00:00`)
    const yearOf = (s: string) => parseDate(s).getFullYear()
    const monthOf = (s: string) => parseDate(s).getMonth() + 1

    // extrae números con fallback robusto
    const getNum = (row: any, keys: string[]) => {
      for (const k of keys) {
        const v = row?.[k]
        if (typeof v === "number" && Number.isFinite(v)) return v
      }
      return 0
    }

    // Adaptación a tu ClimateData procesado (por si ya viene con nombres normalizados)
    const tavgArr = climateData.map((r) => getNum(r, ["temperature_avg", "tmean_c", "tavg", "T2M", "temp", "tmean"]))
    const precipArr = climateData.map((r) => getNum(r, ["precipitation", "precip_mm", "precip", "PRECTOTCORR", "p"]))
    const etoArr = climateData.map((r) => getNum(r, ["eto", "eto_mm", "ETO", "eto0"]))
    const etcArr = climateData.map((r) => getNum(r, ["etc", "etc_mm", "ETC"]))
    const chillArr = climateData.map((r) => clamp0(getNum(r, ["chill_hours", "chill", "horas_frio"])))
    const frostArr = climateData.map((r) => clamp0(getNum(r, ["frost_hours", "frost", "horas_helada"])))
    const humArr = climateData.map((r) => getNum(r, ["humidity", "rh2m", "RH2M", "hum"]))

    const kpis = {
      tavg: mean(tavgArr),
      precip: sum(precipArr),
      eto: mean(etoArr),
      etc: mean(etcArr),
      chill: sum(chillArr),
    }

    // humedad verano (Jun-Ago)
    const summerRows = climateData.filter((r) => {
      const d = tryGetDateFromRow(r)
      if (!d) return false
      const m = monthOf(d)
      return m >= 6 && m <= 8
    })
    const summerHum = mean(summerRows.map((r) => getNum(r, ["humidity", "rh2m", "RH2M", "hum"])))
    const summerNote =
      summerHum >= 65
        ? "Humedad alta en verano: vigilar enfermedades fúngicas."
        : summerHum <= 40
          ? "Humedad baja en verano: posible estrés hídrico."
          : "Humedad en rango normal."

    // por años: horas frío y heladas ventana 15 Mar–15 May
    const years = Array.from(
      new Set(
        climateData
          .map((r) => tryGetDateFromRow(r))
          .filter(Boolean)
          .map((d) => yearOf(d!)),
      ),
    ).sort((a, b) => a - b)

    const chillByYear = years.map((y) => {
      const rows = climateData.filter((r) => {
        const d = tryGetDateFromRow(r)
        return d ? yearOf(d) === y : false
      })
      const chill = sum(rows.map((r) => clamp0(getNum(r, ["chill_hours", "chill", "horas_frio"]))))
      return { year: y, chill }
    })

    const frostMarMayByYear = years.map((y) => {
      const from = new Date(`${y}-03-15T00:00:00`)
      const to = new Date(`${y}-05-15T00:00:00`)
      const rows = climateData.filter((r) => {
        const d = tryGetDateFromRow(r)
        if (!d) return false
        const dt = parseDate(d)
        return dt >= from && dt <= to
      })
      const frost = sum(rows.map((r) => clamp0(getNum(r, ["frost_hours", "frost", "horas_helada"]))))
      return { year: y, frost }
    })

    // recomendaciones: intenta coger las más útiles
    const recommendations: string[] =
      analysisResults?.suitability?.recommendations ||
      analysisResults?.recommendations ||
      analysisResults?.summary?.recommendations ||
      []

    const payload = {
      source: requestInfo?.source || source || "NASA_POWER",
      isHistorical,
      coordinates,
      period: { start: startDate || "", end: endDate || "" },
      kpis,
      highlights: {
        summerHumidity: { avg: summerHum, note: summerNote },
        chillByYear,
        frostMarMayByYear,
      },
      recommendations,
    }

    const fallbackFilename = isHistorical
      ? `recomendaciones-riego-historico-20años-${coordinates.lat}-${coordinates.lon}.pdf`
      : `recomendaciones-riego-${coordinates.lat}-${coordinates.lon}.pdf`

    try {
      // ✅ OJO: ruta correcta del endpoint -> /api/export/pdf
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error("[export/pdf] error:", err)
        throw new Error(err?.error ?? "Error generando PDF")
      }

      await downloadResponseAsFile(res, fallbackFilename)
    } catch (e) {
      console.error("[DownloadButtons] Error downloading PDF:", e)
    }
  }

  // ✅ AEMET: habilita horario si hay CP válido (aunque climateData sea raro)
  const enableHourly = source === "AEMET" ? /^\d{5}$/.test(postalCode) : hasValidData

  return (
    <div className="flex flex-wrap gap-4 mt-6">
      <Button
        onClick={() => void handleExcelDownload()}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        disabled={!hasValidData}
      >
        <Download className="h-4 w-4" />
        {isHistorical ? "Excel Datos Diarios 20 Años" : "Excel Datos Meteorológicos Diarios"}
      </Button>

      <Button
        onClick={handleHourlyExcelDownload}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700"
        disabled={!enableHourly}
        title={source === "AEMET" && !/^\d{5}$/.test(postalCode) ? "Introduce un código postal válido" : undefined}
      >
        <Download className="h-4 w-4" />
        {isHistorical ? "Excel Datos Horarios (por años)" : "Excel Datos Horarios"}
      </Button>

      <Button
        onClick={() => void handlePDFDownload()}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700"
        disabled={!hasValidData}
      >
        <FileText className="h-4 w-4" />
        {isHistorical ? "PDF Recomendaciones Históricas" : "PDF Recomendaciones"}
      </Button>

      {onShowDetailedReport && (
        <Button
          onClick={onShowDetailedReport}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          disabled={!hasValidData}
        >
          <BarChart3 className="h-4 w-4" />
          Ver Informe Detallado
        </Button>
      )}

      {isHistorical && (
        <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded-md">
          <History className="h-4 w-4" />
          Análisis de 20 años
        </div>
      )}

      {!hasValidData && source !== "AEMET" && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">⚠️ No hay datos válidos para exportar</div>
      )}
    </div>
  )
}
