// lib/xlsx-export.ts
import ExcelJS from "exceljs"
import type { ClimateData } from "./types"
import { promises as fs } from "fs"
import path from "path"

const GREEN = "FF00B050"
const ZEBRA_1 = "FFF3F9F2"
const ZEBRA_2 = "FFFFFFFF"

export type ExportPayload = {
  meta: {
    latitude: number
    longitude: number
    startDate: string
    endDate: string
  }
  sources: Record<string, ClimateData[] | undefined>
}

type RowOut = {
  day: number
  date: string
  tmean: number
  tmax: number
  tmin: number
  rh: number
  rs: number
  pr: number
  wind: number
  eto: number
  etc: number
  kc: number

  // extras (si existen en tus datos)
  chill: number
  frost: number
  gdd: number
  deficit: number
  need: number
}

const DEFAULT_KC = 0.3

const COLUMNS: Array<{ header: string; key: keyof RowOut; width: number; numFmt?: string }> = [
  { header: "Día", key: "day", width: 6, numFmt: "0" },
  { header: "Fecha", key: "date", width: 12, numFmt: "yyyy-mm-dd" },
  { header: "Temperatura Media (°C)", key: "tmean", width: 22, numFmt: "0.00" },
  { header: "Temperatura Máxima (°C)", key: "tmax", width: 24, numFmt: "0.00" },
  { header: "Temperatura Mínima (°C)", key: "tmin", width: 24, numFmt: "0.00" },
  { header: "Humedad Relativa (%)", key: "rh", width: 20, numFmt: "0.00" },
  { header: "Radiación Solar (MJ/m²)", key: "rs", width: 24, numFmt: "0.00" },
  { header: "Precipitación (mm)", key: "pr", width: 18, numFmt: "0.00" },
  { header: "Velocidad Viento (m/s)", key: "wind", width: 22, numFmt: "0.00" },
  { header: "ETO (mm)", key: "eto", width: 10, numFmt: "0.00" },
  { header: "ETC (mm)", key: "etc", width: 10, numFmt: "0.00" },
  { header: "Coeficiente Kc", key: "kc", width: 16, numFmt: "0.00" },

  // extras
  { header: "Horas Frío", key: "chill", width: 12, numFmt: "0" },
  { header: "Horas Helada", key: "frost", width: 12, numFmt: "0" },
  { header: "GDD", key: "gdd", width: 10, numFmt: "0.00" },
  { header: "Déficit Hídrico", key: "deficit", width: 14, numFmt: "0.00" },
  { header: "Necesidad Riego (mm)", key: "need", width: 18, numFmt: "0.00" },
]

function borderThin(): ExcelJS.Borders {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  }
}

function setSheetDefaults(ws: ExcelJS.Worksheet) {
  ws.properties.defaultRowHeight = 18
  ws.views = [{ state: "normal" }]
}

function getNum(row: any, keys: string[]): number {
  for (const k of keys) {
    const v = row?.[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  }
  return 0
}

async function loadLogoPng(): Promise<Buffer | null> {
  // ✅ Ajusta aquí si tu logo se llama distinto
  // según lo que has dicho: public/images/Vector.png
  const logoPath = path.join(process.cwd(), "public", "images", "Vector.png")
  try {
    return await fs.readFile(logoPath)
  } catch {
    return null
  }
}

function addTopHeaderBlock(ws: ExcelJS.Worksheet) {
  // Reservamos 2 filas para logo + título (como cabecera “bonita”)
  ws.spliceRows(1, 0, [], [])
  ws.getRow(1).height = 42
  ws.getRow(2).height = 20
}

function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  // Título centrado (fila 1)
  const totalCols = Math.max(1, ws.columnCount || 10)
  const fromCol = 1
  const toCol = Math.min(totalCols, 12) // evita celdas infinitas si hay muchas columnas

  ws.mergeCells(1, fromCol, 1, toCol)
  ws.mergeCells(2, fromCol, 2, toCol)

  const c1 = ws.getCell(1, fromCol)
  c1.value = title
  c1.font = { bold: true, size: 14 }
  c1.alignment = { vertical: "middle", horizontal: "center" }

  const c2 = ws.getCell(2, fromCol)
  c2.value = subtitle
  c2.font = { italic: true, size: 10, color: { argb: "FF444444" } }
  c2.alignment = { vertical: "middle", horizontal: "center" }
}

async function addLogoCentered(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet) {
  const logo = await loadLogoPng()
  if (!logo) return

  const imageId = wb.addImage({ buffer: logo, extension: "png" })

  // Intento de centrado real: colocamos el logo alrededor del centro de la tabla.
  // ExcelJS posiciona por columnas/filas (no pixeles exactos), así que esto es “visual”.
  const totalCols = Math.max(1, ws.columnCount || 12)
  const midCol = Math.max(0, Math.floor(totalCols / 2) - 1)

  ws.addImage(imageId, {
    tl: { col: midCol, row: 0 }, // fila 1 (row=0)
    ext: { width: 170, height: 55 },
  })
}

function styleHeaderRow(ws: ExcelJS.Worksheet, headerRowIndex: number) {
  const header = ws.getRow(headerRowIndex)
  header.height = 22

  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
    cell.border = borderThin()
  })

  ws.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: ws.columnCount },
  }

  ws.views = [{ state: "frozen", ySplit: headerRowIndex }]
}

function styleZebra(ws: ExcelJS.Worksheet, fromRow: number) {
  for (let r = fromRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    row.height = 18
    const fill = r % 2 === 0 ? ZEBRA_1 : ZEBRA_2

    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = borderThin()
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } }
      cell.alignment = { vertical: "middle", horizontal: col <= 2 ? "left" : "right" }
    })
  }
}

function pickMainSource(sources: Record<string, ClimateData[] | undefined>) {
  const preferred = ["SIAR", "AEMET", "NASA_POWER", "ERA5"]
  for (const p of preferred) {
    const r = sources[p]
    if (r && r.length) return { name: p, rows: r }
  }
  const first = Object.entries(sources).find(([, r]) => r && r.length)
  return first ? { name: first[0], rows: first[1]! } : { name: "NO_DATA", rows: [] as ClimateData[] }
}

function normalize(rows: ClimateData[], kc = DEFAULT_KC): RowOut[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  return sorted.map((d, idx) => {
    const eto = getNum(d, ["eto", "eto_mm", "ETO"])
    const etcRaw = getNum(d, ["etc", "etc_mm", "ETC"])
    const etc = etcRaw || eto * kc

    return {
      day: idx + 1,
      date: d.date,
      tmean: getNum(d, ["temperature_avg", "tmean", "tavg", "T2M"]),
      tmax: getNum(d, ["temperature_max", "tmax", "T2M_MAX"]),
      tmin: getNum(d, ["temperature_min", "tmin", "T2M_MIN"]),
      rh: getNum(d, ["humidity", "rh", "RH2M"]),
      rs: getNum(d, ["solar_radiation", "rs", "ALLSKY_SFC_SW_DWN"]),
      pr: getNum(d, ["precipitation", "pr", "PRECTOTCORR"]),
      wind: getNum(d, ["wind_speed", "wind", "WS2M"]),
      eto,
      etc,
      kc,

      chill: getNum(d, ["chill_hours", "chill", "horas_frio"]),
      frost: getNum(d, ["frost_hours", "frost", "horas_helada"]),
      gdd: getNum(d, ["gdd", "gdd_total", "grados_dia"]),
      deficit: getNum(d, ["deficit_hidrico", "deficit", "deficit_mm"]),
      need: getNum(d, ["necesidad_riego", "need_irrigation", "riego_mm"]),
    }
  })
}

function ym(date: string) {
  // YYYY-MM
  return date.slice(0, 7)
}
function year(date: string) {
  return date.slice(0, 4)
}

function mean(arr: number[]) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
}
function sum(arr: number[]) {
  return arr.reduce((s, x) => s + x, 0)
}

function buildMonthly(rows: RowOut[]) {
  const groups = new Map<string, RowOut[]>()
  for (const r of rows) {
    const k = ym(r.date)
    const g = groups.get(k) || []
    g.push(r)
    groups.set(k, g)
  }

  const keys = [...groups.keys()].sort()
  return keys.map((k) => {
    const g = groups.get(k) || []
    return {
      mes: k,
      dias: g.length,
      tmean: mean(g.map((x) => x.tmean)),
      tmax: mean(g.map((x) => x.tmax)),
      tmin: mean(g.map((x) => x.tmin)),
      pr: sum(g.map((x) => x.pr)),
      eto: sum(g.map((x) => x.eto)),
      etc: sum(g.map((x) => x.etc)),
      chill: sum(g.map((x) => x.chill)),
      frost: sum(g.map((x) => x.frost)),
      gdd: sum(g.map((x) => x.gdd)),
      deficit: sum(g.map((x) => x.deficit)),
      need: sum(g.map((x) => x.need)),
      rs: mean(g.map((x) => x.rs)),
      rh: mean(g.map((x) => x.rh)),
    }
  })
}

function buildAnnual(rows: RowOut[]) {
  const groups = new Map<string, RowOut[]>()
  for (const r of rows) {
    const k = year(r.date)
    const g = groups.get(k) || []
    g.push(r)
    groups.set(k, g)
  }

  const keys = [...groups.keys()].sort()
  return keys.map((k) => {
    const g = groups.get(k) || []
    return {
      año: k,
      dias: g.length,
      tmean: mean(g.map((x) => x.tmean)),
      tmax: mean(g.map((x) => x.tmax)),
      tmin: mean(g.map((x) => x.tmin)),
      pr: sum(g.map((x) => x.pr)),
      eto: sum(g.map((x) => x.eto)),
      etc: sum(g.map((x) => x.etc)),
      chill: sum(g.map((x) => x.chill)),
      frost: sum(g.map((x) => x.frost)),
      gdd: sum(g.map((x) => x.gdd)),
      deficit: sum(g.map((x) => x.deficit)),
      need: sum(g.map((x) => x.need)),
      rs: mean(g.map((x) => x.rs)),
      rh: mean(g.map((x) => x.rh)),
    }
  })
}

function applyNumFormats(ws: ExcelJS.Worksheet, headerRowIndex: number, columns: typeof COLUMNS) {
  columns.forEach((c, i) => {
    if (!c.numFmt) return
    const colIndex = i + 1
    for (let r = headerRowIndex + 1; r <= ws.rowCount; r++) {
      ws.getRow(r).getCell(colIndex).numFmt = c.numFmt
    }
  })
}

function styleSimpleSheetHeader(ws: ExcelJS.Worksheet, headerRowIndex: number) {
  styleHeaderRow(ws, headerRowIndex)
  styleZebra(ws, headerRowIndex + 1)
}

export async function buildClimateWorkbook(payload: ExportPayload): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Agroclima"
  wb.created = new Date()

  // ---------------- INFO ----------------
  const info = wb.addWorksheet("INFO")
  setSheetDefaults(info)
  info.columns = [
    { header: "Campo", key: "k", width: 22 },
    { header: "Valor", key: "v", width: 44 },
  ]
  info.addRows([
    { k: "latitude", v: payload.meta.latitude },
    { k: "longitude", v: payload.meta.longitude },
    { k: "startDate", v: payload.meta.startDate },
    { k: "endDate", v: payload.meta.endDate },
    { k: "generatedAt", v: new Date().toISOString() },
  ])
  styleHeaderRow(info, 1)
  styleZebra(info, 2)

  // ----------- Hoja principal: Datos Diarios -----------
  const main = pickMainSource(payload.sources)
  const dailyRows = normalize(main.rows, DEFAULT_KC)

  const ws = wb.addWorksheet("Datos Diarios")
  setSheetDefaults(ws)

  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }))

  addTopHeaderBlock(ws)
  await addLogoCentered(wb, ws)

  styleTitle(
    ws,
    "Agroclima - Datos meteorológicos (Diarios)",
    `Fuente: ${main.name} / ${payload.meta.startDate} → ${payload.meta.endDate} / (${payload.meta.latitude}, ${payload.meta.longitude})`,
  )

  // Cabecera real de tabla en fila 3
  const headerRowIndex = 3

  // Añadir filas (desde fila 4)
  dailyRows.forEach((r) => ws.addRow(r))

  styleHeaderRow(ws, headerRowIndex)
  styleZebra(ws, headerRowIndex + 1)
  applyNumFormats(ws, headerRowIndex, COLUMNS)

  // ----------- Resumen Mensual -----------
  const monthly = wb.addWorksheet("Resumen Mensual")
  setSheetDefaults(monthly)

  monthly.columns = [
    { header: "Mes", key: "mes", width: 10 },
    { header: "Días", key: "dias", width: 8, style: { numFmt: "0" } },
    { header: "Temp Media (°C)", key: "tmean", width: 16, style: { numFmt: "0.00" } },
    { header: "Temp Máx (°C)", key: "tmax", width: 16, style: { numFmt: "0.00" } },
    { header: "Temp Mín (°C)", key: "tmin", width: 16, style: { numFmt: "0.00" } },
    { header: "Precipitación (mm)", key: "pr", width: 18, style: { numFmt: "0.00" } },
    { header: "ETO Total (mm)", key: "eto", width: 14, style: { numFmt: "0.00" } },
    { header: "ETC Total (mm)", key: "etc", width: 14, style: { numFmt: "0.00" } },
    { header: "Horas Frío", key: "chill", width: 12, style: { numFmt: "0" } },
    { header: "Horas Helada", key: "frost", width: 12, style: { numFmt: "0" } },
    { header: "GDD Total", key: "gdd", width: 12, style: { numFmt: "0.00" } },
    { header: "Radiación Prom", key: "rs", width: 14, style: { numFmt: "0.00" } },
    { header: "HR Prom (%)", key: "rh", width: 12, style: { numFmt: "0.00" } },
    { header: "Déficit Hídrico", key: "deficit", width: 14, style: { numFmt: "0.00" } },
    { header: "Necesidad Riego (mm)", key: "need", width: 18, style: { numFmt: "0.00" } },
  ]

  addTopHeaderBlock(monthly)
  await addLogoCentered(wb, monthly)
  styleTitle(
    monthly,
    "Agroclima - Resumen Mensual",
    `Fuente: ${main.name} / ${payload.meta.startDate} → ${payload.meta.endDate} / (${payload.meta.latitude}, ${payload.meta.longitude})`,
  )

  buildMonthly(dailyRows).forEach((r) => monthly.addRow(r))

  styleSimpleSheetHeader(monthly, 3)

  // ----------- Resumen Anual -----------
  const annual = wb.addWorksheet("Resumen Anual")
  setSheetDefaults(annual)

  annual.columns = [
    { header: "Año", key: "año", width: 8 },
    { header: "Días", key: "dias", width: 8, style: { numFmt: "0" } },
    { header: "Temp Media (°C)", key: "tmean", width: 16, style: { numFmt: "0.00" } },
    { header: "Temp Máx (°C)", key: "tmax", width: 16, style: { numFmt: "0.00" } },
    { header: "Temp Mín (°C)", key: "tmin", width: 16, style: { numFmt: "0.00" } },
    { header: "Precipitación (mm)", key: "pr", width: 18, style: { numFmt: "0.00" } },
    { header: "ETO Total (mm)", key: "eto", width: 14, style: { numFmt: "0.00" } },
    { header: "ETC Total (mm)", key: "etc", width: 14, style: { numFmt: "0.00" } },
    { header: "Horas Frío", key: "chill", width: 12, style: { numFmt: "0" } },
    { header: "Horas Helada", key: "frost", width: 12, style: { numFmt: "0" } },
    { header: "GDD Total", key: "gdd", width: 12, style: { numFmt: "0.00" } },
    { header: "Radiación Prom", key: "rs", width: 14, style: { numFmt: "0.00" } },
    { header: "HR Prom (%)", key: "rh", width: 12, style: { numFmt: "0.00" } },
    { header: "Déficit Hídrico", key: "deficit", width: 14, style: { numFmt: "0.00" } },
    { header: "Necesidad Riego (mm)", key: "need", width: 18, style: { numFmt: "0.00" } },
  ]

  addTopHeaderBlock(annual)
  await addLogoCentered(wb, annual)
  styleTitle(
    annual,
    "Agroclima - Resumen Anual",
    `Fuente: ${main.name} / ${payload.meta.startDate} → ${payload.meta.endDate} / (${payload.meta.latitude}, ${payload.meta.longitude})`,
  )

  buildAnnual(dailyRows).forEach((r) => annual.addRow(r))

  styleSimpleSheetHeader(annual, 3)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
