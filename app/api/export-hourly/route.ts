// app/api/export-hourly/route.ts
import "server-only"
import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AEMET_API_KEY = process.env.AEMET_API_KEY || ""
const AEMET_BASE = "https://opendata.aemet.es/opendata/api"

// ---------- Types ----------
type Body = {
  source?: string

  // AEMET
  postalCode?: string
  municipio?: string

  // NASA POWER (y compat)
  latitude?: number
  longitude?: number

  startDate?: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
}

function isYYYYMMDD(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function normalizeToYYYYMMDD(s?: string) {
  return String(s || "").trim().slice(0, 10)
}

function yyyymmddFromYYYYMMDD(s: string) {
  return s.replaceAll("-", "")
}

function safeNumber(v: any, fillValue = -999) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n === fillValue) return null
  return n
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function toISODateFromKey(keyYYYYMMDDHH: string) {
  // "2026010108" => date="2026-01-01", hour="08"
  const y = keyYYYYMMDDHH.slice(0, 4)
  const m = keyYYYYMMDDHH.slice(4, 6)
  const d = keyYYYYMMDDHH.slice(6, 8)
  const hh = keyYYYYMMDDHH.slice(8, 10)
  return {
    date: `${y}-${m}-${d}`,
    hour: hh,
    datetime: `${y}-${m}-${d} ${hh}:00`,
  }
}

// ---------- AEMET 2-step ----------
async function aemetGetDatosUrl(endpointUrl: string) {
  const res = await fetch(endpointUrl, {
    method: "GET",
    headers: { api_key: AEMET_API_KEY, accept: "application/json" },
    cache: "no-store",
  })
  const json = await res.json().catch(() => null)
  if (!json?.datos) {
    const estado = json?.estado
    const descripcion = json?.descripcion
    throw new Error(`AEMET: sin datos (estado=${estado}) ${descripcion || ""}`.trim())
  }
  return String(json.datos)
}

async function aemetDownloadFinalJson(datosUrl: string) {
  const res = await fetch(datosUrl, { headers: { accept: "application/json" }, cache: "no-store" })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`AEMET download error ${res.status}: ${txt}`)
  }
  return await res.json()
}

// ---------- Resolver municipio INE (reutiliza /api/weather/aemet) ----------
async function resolveMunicipioViaDaily(req: NextRequest, postalCode: string): Promise<string> {
  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/weather/aemet`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ postalCode }),
  })

  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.success || !j?.municipio) {
    throw new Error(j?.error || "No se pudo resolver municipio AEMET desde el código postal.")
  }
  return String(j.municipio)
}

// ---------- Parse AEMET horaria -> filas ----------
function mapAemetMunicipioHourly(predJson: any) {
  const root = Array.isArray(predJson) ? predJson[0] : predJson
  const dias = root?.prediccion?.dia
  if (!Array.isArray(dias)) return []

  const out: any[] = []

  const expandPeriodoToHours = (periodoRaw: any): string[] => {
    const p = String(periodoRaw ?? "").trim()
    if (!p) return []
    if (/^\d{1,2}$/.test(p)) return [p.padStart(2, "0")]

    const m = p.match(/^(\d{1,2})-(\d{1,2})$/)
    if (m) {
      const a = Number(m[1])
      const b = Number(m[2])
      if (!Number.isFinite(a) || !Number.isFinite(b)) return []
      const start = Math.max(0, Math.min(24, a))
      const end = Math.max(0, Math.min(24, b))
      const hours: string[] = []
      for (let h = start; h < end; h++) hours.push(String(h).padStart(2, "0"))
      return hours
    }
    return []
  }

  const mapByHourFlexible = (arr: any[]) => {
    const m = new Map<string, any>()
    for (const it of arr || []) {
      const hours = expandPeriodoToHours(it?.periodo)
      for (const hh of hours) m.set(hh, it)
    }
    return m
  }

  for (const d of dias) {
    const date = String(d?.fecha ?? "").slice(0, 10)
    if (!date) continue

    const temps: any[] = Array.isArray(d?.temperatura) ? d.temperatura : []
    const hr: any[] = Array.isArray(d?.humedadRelativa) ? d.humedadRelativa : []
    const sky: any[] = Array.isArray(d?.estadoCielo) ? d.estadoCielo : []
    const wind: any[] = Array.isArray(d?.vientoAndRachaMax) ? d.vientoAndRachaMax : []
    const probPrec: any[] = Array.isArray(d?.probPrecipitacion) ? d.probPrecipitacion : []

    const tMap = mapByHourFlexible(temps)
    const hrMap = mapByHourFlexible(hr)
    const skyMap = mapByHourFlexible(sky)
    const wMap = mapByHourFlexible(wind)
    const pMap = mapByHourFlexible(probPrec)

    for (let hh = 0; hh < 24; hh++) {
      const H = String(hh).padStart(2, "0")
      const t = tMap.get(H)
      if (!t) continue

      const h = hrMap.get(H)
      const s = skyMap.get(H)
      const w = wMap.get(H)
      const p = pMap.get(H)

      const tempC = Number(t?.value)
      const hum = Number(h?.value)

      const windKmh = Number(w?.velocidad)
      const gustKmh = Number(w?.racha)

      const windMs = Number.isFinite(windKmh) ? windKmh / 3.6 : null
      const gustMs = Number.isFinite(gustKmh) ? gustKmh / 3.6 : null
      const prob = Number(p?.value)

      out.push({
        datetime: `${date} ${H}:00`,
        date,
        hour: H,
        temperature_c: Number.isFinite(tempC) ? tempC : null,
        humidity_pct: Number.isFinite(hum) ? hum : null,
        precipitation_prob_pct: Number.isFinite(prob) ? prob : null,
        wind_ms: windMs,
        gust_ms: gustMs,
        sky: String(s?.descripcion ?? ""),
      })
    }
  }

  return out
}

// ---------- NASA POWER hourly -> rows + calc ----------
function chillUtahUnit(tempC: number | null) {
  if (tempC === null) return 0
  // Utah model (clásico)
  if (tempC < 1.4) return 0
  if (tempC < 2.4) return 0.5
  if (tempC < 9.1) return 1
  if (tempC < 12.4) return 0.5
  if (tempC < 15.9) return 0
  if (tempC < 18.0) return -0.5
  return -1
}

function chillSimpleHour(tempC: number | null) {
  if (tempC === null) return 0
  // “Horas frío” simple (aprox): 0–7.2°C
  return tempC >= 0 && tempC <= 7.2 ? 1 : 0
}

function gddBase7Hour(tempC: number | null, base = 7) {
  if (tempC === null) return 0
  // Grados-día por hora (para sumar y obtener GDD del día)
  return Math.max(0, tempC - base) / 24
}

// Ra FAO-56 (MJ/m2/day) para Hargreaves
function dayOfYear(yyyy_mm_dd: string) {
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const start = new Date(Date.UTC(y, 0, 0))
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function raFAO56_MJ_m2_day(latDeg: number, j: number) {
  const Gsc = 0.0820 // MJ m-2 min-1
  const phi = (latDeg * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365)
  const delta = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39)
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))))
  const Ra =
    ((24 * 60) / Math.PI) *
    Gsc *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  return Ra
}

function etoHargreaves_mm_day(tmin: number | null, tmax: number | null, tmean: number | null, ra: number | null) {
  if (tmin === null || tmax === null || tmean === null || ra === null) return null
  const td = tmax - tmin
  if (!Number.isFinite(td) || td <= 0) return null
  // FAO-56 Hargreaves (aprox)
  return 0.0023 * (tmean + 17.8) * Math.sqrt(td) * ra
}

async function fetchNasaPowerHourly(params: {
  latitude: number
  longitude: number
  startYYYYMMDD: string
  endYYYYMMDD: string
}) {
  const { latitude, longitude, startYYYYMMDD, endYYYYMMDD } = params

  const url =
    "https://power.larc.nasa.gov/api/temporal/hourly/point" +
    `?parameters=T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN` +
    `&community=AG` +
    `&latitude=${encodeURIComponent(String(latitude))}` +
    `&longitude=${encodeURIComponent(String(longitude))}` +
    `&start=${encodeURIComponent(startYYYYMMDD)}` +
    `&end=${encodeURIComponent(endYYYYMMDD)}` +
    `&format=JSON`

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`NASA POWER hourly error ${res.status}: ${txt}`)
  }
  return await res.json()
}

function mapNasaPowerHourlyToRows(nasaJson: any) {
  const feature = Array.isArray(nasaJson?.features) ? nasaJson.features[0] : nasaJson
  const fill = Number(nasaJson?.header?.fill_value ?? -999)

  const paramRoot = feature?.properties?.parameter
  if (!paramRoot || typeof paramRoot !== "object") return []

  const tMap = paramRoot?.T2M || {}
  const rhMap = paramRoot?.RH2M || {}
  const wsMap = paramRoot?.WS2M || {}
  const swMap = paramRoot?.ALLSKY_SFC_SW_DWN || {}

  const keys = Object.keys(tMap).sort() // "YYYYMMDDHH"
  const out: any[] = []

  let chillSimpleCum = 0
  let chillUtahCum = 0
  let gdd7Cum = 0

  for (const k of keys) {
    const { date, hour, datetime } = toISODateFromKey(k)

    const tempC = safeNumber(tMap[k], fill)
    const rh = safeNumber(rhMap[k], fill)
    const ws = safeNumber(wsMap[k], fill)
    const sw = safeNumber(swMap[k], fill)

    const chillS = chillSimpleHour(tempC)
    const chillU = chillUtahUnit(tempC)
    const gdd7 = gddBase7Hour(tempC, 7)

    chillSimpleCum += chillS
    chillUtahCum += chillU
    gdd7Cum += gdd7

    out.push({
      datetime,
      date,
      hour,
      temperature_c: tempC,
      humidity_pct: rh,
      wind_ms: ws,
      solar_mj_hr: sw,

      // cálculos por hora
      chill_simple_h: chillS,
      chill_utah_u: Number(chillU.toFixed(2)),
      gdd_base7_h: Number(gdd7.toFixed(4)),

      // acumulados
      chill_simple_cum: Number(chillSimpleCum.toFixed(2)),
      chill_utah_cum: Number(chillUtahCum.toFixed(2)),
      gdd_base7_cum: Number(gdd7Cum.toFixed(2)),
    })
  }

  return out
}

function buildDailySummaryFromHourly(hourlyRows: any[], latitude: number) {
  const byDate = new Map<string, any[]>()
  for (const r of hourlyRows) {
    const d = String(r.date)
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(r)
  }

  const out: any[] = []
  const dates = Array.from(byDate.keys()).sort()

  for (const date of dates) {
    const rows = byDate.get(date) || []
    const temps = rows.map((r) => r.temperature_c).filter((v) => typeof v === "number") as number[]
    const tmin = temps.length ? Math.min(...temps) : null
    const tmax = temps.length ? Math.max(...temps) : null
    const tmean = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null

    const gdd7 = rows.reduce((acc, r) => acc + (Number(r.gdd_base7_h) || 0), 0)
    const chillS = rows.reduce((acc, r) => acc + (Number(r.chill_simple_h) || 0), 0)
    const chillU = rows.reduce((acc, r) => acc + (Number(r.chill_utah_u) || 0), 0)

    const j = dayOfYear(date)
    const ra = Number.isFinite(latitude) ? raFAO56_MJ_m2_day(latitude, j) : null
    const eto = etoHargreaves_mm_day(tmin, tmax, tmean, ra)

    out.push({
      date,
      tmin_c: tmin !== null ? Number(tmin.toFixed(2)) : null,
      tmax_c: tmax !== null ? Number(tmax.toFixed(2)) : null,
      tmean_c: tmean !== null ? Number(tmean.toFixed(2)) : null,
      gdd_base7: Number(gdd7.toFixed(2)),
      chill_simple_h: Number(chillS.toFixed(2)),
      chill_utah_u: Number(chillU.toFixed(2)),
      ra_mj_m2_day: ra !== null ? Number(ra.toFixed(2)) : null,
      eto_hargreaves_mm: eto !== null ? Number(eto.toFixed(2)) : null,
    })
  }

  return out
}

// ---------- Excel (estilo + logo + meta + 2 hojas) ----------
async function buildStyledWorkbook(args: {
  title: string
  subtitleLeft: string
  subtitleRight: string
  rangeText: string
  generatedText: string
  sheetName: string
  rows: any[]
  dailySheetName?: string
  dailyRows?: any[]
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Agroclima"
  wb.created = new Date()

  const ws = wb.addWorksheet(args.sheetName, {
    views: [{ state: "frozen", ySplit: 7 }],
    properties: { defaultRowHeight: 18 },
  })

  // --- Logo (si existe en /public/Vector.png) ---
  try {
    const logoPath = path.join(process.cwd(), "public", "Vector.png")
    if (fs.existsSync(logoPath)) {
      const img = wb.addImage({
        buffer: fs.readFileSync(logoPath),
        extension: "png",
      })
      // Logo aprox A1:C5
      ws.addImage(img, {
        tl: { col: 0, row: 0 },
        ext: { width: 140, height: 140 },
      })
    }
  } catch {
    // si falla el logo, no rompemos nada
  }

  // --- Header meta (filas 1-5) ---
  ws.mergeCells("D1:K1")
  ws.getCell("D1").value = args.title
  ws.getCell("D1").font = { bold: true, size: 20 }
  ws.getCell("D1").alignment = { vertical: "middle", horizontal: "center" }

  ws.mergeCells("D2:K2")
  ws.getCell("D2").value = args.subtitleLeft
  ws.getCell("D2").font = { bold: true, size: 12, color: { argb: "FF1F2937" } }
  ws.getCell("D2").alignment = { vertical: "middle", horizontal: "center" }

  ws.mergeCells("D3:K3")
  ws.getCell("D3").value = args.subtitleRight
  ws.getCell("D3").font = { size: 11, color: { argb: "FF374151" } }
  ws.getCell("D3").alignment = { vertical: "middle", horizontal: "center" }

  ws.mergeCells("D4:K4")
  ws.getCell("D4").value = args.rangeText
  ws.getCell("D4").font = { size: 11, color: { argb: "FF374151" } }
  ws.getCell("D4").alignment = { vertical: "middle", horizontal: "center" }

  ws.mergeCells("D5:K5")
  ws.getCell("D5").value = args.generatedText
  ws.getCell("D5").font = { size: 10, color: { argb: "FF6B7280" } }
  ws.getCell("D5").alignment = { vertical: "middle", horizontal: "center" }

  // --- Tabla (desde fila 7) ---
  const columns = Object.keys(args.rows[0] || {})
  ws.getRow(7).values = ["", ...columns]

  // Header style
  const headerRow = ws.getRow(7)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF15803D" }, // verde
    }
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.border = {
      top: { style: "thin", color: { argb: "FF0B3D1E" } },
      left: { style: "thin", color: { argb: "FF0B3D1E" } },
      bottom: { style: "thin", color: { argb: "FF0B3D1E" } },
      right: { style: "thin", color: { argb: "FF0B3D1E" } },
    }
  })

  // Data rows
  for (let i = 0; i < args.rows.length; i++) {
    const rowIndex = 8 + i
    const r = args.rows[i]
    const row = ws.getRow(rowIndex)
    row.values = ["", ...columns.map((c) => r[c])]

    // zebra + borders
    const isEven = i % 2 === 0
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      }
      if (isEven) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } }
      }
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false }
    })
  }

  // Column widths (auto-ish)
  columns.forEach((c, idx) => {
    const col = ws.getColumn(idx + 1)
    col.width = Math.max(12, Math.min(28, c.length + 2))
  })

  // AutoFilter
  ws.autoFilter = {
    from: { row: 7, column: 1 },
    to: { row: 7, column: columns.length },
  }

  // --- Daily sheet (si existe) ---
  if (args.dailyRows && args.dailyRows.length) {
    const ws2 = wb.addWorksheet(args.dailySheetName || "DAILY_SUMMARY", {
      views: [{ state: "frozen", ySplit: 2 }],
    })

    const cols2 = Object.keys(args.dailyRows[0] || {})
    ws2.getRow(1).values = ["", ...cols2]
    const hr2 = ws2.getRow(1)
    hr2.height = 20
    hr2.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15803D" } }
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
      cell.alignment = { vertical: "middle", horizontal: "center" }
    })

    for (let i = 0; i < args.dailyRows.length; i++) {
      const row = ws2.getRow(2 + i)
      row.values = ["", ...cols2.map((c) => args.dailyRows![i][c])]
      const isEven = i % 2 === 0
      row.eachCell((cell) => {
        if (isEven) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } }
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      })
    }

    cols2.forEach((c, idx) => {
      ws2.getColumn(idx + 1).width = Math.max(12, Math.min(26, c.length + 2))
    })
    ws2.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols2.length },
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ---------- Handler ----------
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body
    const source = String(body.source || "").toUpperCase()

    const startStr = normalizeToYYYYMMDD(body.startDate)
    const endStr = normalizeToYYYYMMDD(body.endDate)

    if (!isYYYYMMDD(startStr) || !isYYYYMMDD(endStr)) {
      return NextResponse.json(
        { success: false, error: "Faltan fechas válidas (startDate/endDate) en formato YYYY-MM-DD" },
        { status: 400 },
      )
    }

    // =========================================================
    // ✅ AEMET
    // =========================================================
    if (source === "AEMET") {
      if (!AEMET_API_KEY) {
        return NextResponse.json({ success: false, error: "Falta AEMET_API_KEY" }, { status: 500 })
      }

      const cp = String(body.postalCode || "").trim()
      if (!/^\d{5}$/.test(cp)) {
        return NextResponse.json({ success: false, error: "Código postal inválido (5 dígitos)" }, { status: 400 })
      }

      let muni = String(body.municipio || "").trim()
      if (!/^\d{5}$/.test(muni)) {
        muni = await resolveMunicipioViaDaily(req, cp)
      }

      const endpoint = `${AEMET_BASE}/prediccion/especifica/municipio/horaria/${muni}`
      const datosUrl = await aemetGetDatosUrl(endpoint)
      const predJson = await aemetDownloadFinalJson(datosUrl)

      let rows = mapAemetMunicipioHourly(predJson)
      rows = rows.filter((r) => r.date >= startStr && r.date <= endStr)

      if (!rows.length) {
        return NextResponse.json(
          { success: false, error: "Sin datos horarios AEMET para exportar", debug: { municipio: muni, postalCode: cp } },
          { status: 400 },
        )
      }

      const now = new Date()
      const buf = await buildStyledWorkbook({
        title: "Agroclima",
        subtitleLeft: "Powered by Agroptimum",
        subtitleRight: "Fuente: AEMET (Predicción Horaria por municipio)",
        rangeText: `Rango: ${startStr} → ${endStr}   |   CP: ${cp}   |   Municipio INE: ${muni}`,
        generatedText: `Generado: ${now.toLocaleString("es-ES")}`,
        sheetName: "AEMET_HOURLY",
        rows,
      })

      const filename = `AEMET_horario_${cp}_${startStr}_a_${endStr}.xlsx`

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      })
    }

    // =========================================================
    // ✅ NASA POWER (NASA_POWER)
    // =========================================================
    if (source === "NASA_POWER") {
      const lat = Number(body.latitude)
      const lon = Number(body.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return NextResponse.json(
          { success: false, error: "NASA_POWER hourly requiere latitude/longitude numéricos" },
          { status: 400 },
        )
      }

      const startYYYYMMDD = yyyymmddFromYYYYMMDD(startStr)
      const endYYYYMMDD = yyyymmddFromYYYYMMDD(endStr)

      const nasaJson = await fetchNasaPowerHourly({ latitude: lat, longitude: lon, startYYYYMMDD, endYYYYMMDD })
      let rows = mapNasaPowerHourlyToRows(nasaJson)
      rows = rows.filter((r) => r.date >= startStr && r.date <= endStr)

      if (!rows.length) {
        return NextResponse.json({ success: false, error: "Sin datos horarios NASA_POWER para exportar" }, { status: 400 })
      }

      const daily = buildDailySummaryFromHourly(rows, lat)

      const now = new Date()
      const buf = await buildStyledWorkbook({
        title: "Agroclima",
        subtitleLeft: "Powered by Agroptimum",
        subtitleRight: "Fuente: NASA POWER (Hourly Single Point)",
        rangeText: `Rango: ${startStr} → ${endStr}   |   Lat: ${lat}   |   Lon: ${lon}`,
        generatedText: `Generado: ${now.toLocaleString("es-ES")}`,
        sheetName: "NASA_POWER_HOURLY",
        rows,
        dailySheetName: "DAILY_SUMMARY",
        dailyRows: daily,
      })

      const filename = `NASA_POWER_horario_${startStr}_a_${endStr}_${lat}_${lon}.xlsx`

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      })
    }

    // =========================================================
    // ❌ Otros
    // =========================================================
    return NextResponse.json(
      { success: false, error: `export-hourly: source no soportada (${source}). Usa AEMET o NASA_POWER.` },
      { status: 400 },
    )
  } catch (e) {
    console.error("export-hourly error:", e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "export-hourly error" },
      { status: 500 },
    )
  }
}
