import type { ClimateData } from "./types"

// Meses de campaña de frío (Nov-Feb): 11, 12, 1, 2
// OJO: lo dejamos como number[] (NO readonly) para que TS no proteste.
export const CHILL_SEASON_MONTHS: number[] = [11, 12, 1, 2]

// ✅ Ventana GDD pistacho (Abr-Oct): 4..10
export const GDD_SEASON_MONTHS: number[] = [4, 5, 6, 7, 8, 9, 10]

// Ajusta estos thresholds a vuestro criterio
const CHILL_OPT_MIN = 600
const CHILL_OPT_MAX = 1500

function getMonth1to12(dateISO: string): number {
  return new Date(dateISO).getMonth() + 1
}

function groupByYear(data: ClimateData[]): Record<number, ClimateData[]> {
  const grouped: Record<number, ClimateData[]> = {}
  for (const d of data) {
    const y = new Date(d.date).getFullYear()
    if (!Number.isFinite(y)) continue
    if (!grouped[y]) grouped[y] = []
    grouped[y].push(d)
  }
  return grouped
}

export function filterDailyData(
  data: ClimateData[],
  opts: { year?: number | "all"; months?: number[] } = {},
) {
  let out = Array.isArray(data) ? [...data] : []

  // filtrar por año
  if (opts.year && opts.year !== "all") {
    out = out.filter((d) => new Date(d.date).getFullYear() === opts.year)
  }

  // filtrar por meses (1-12)
  if (opts.months && opts.months.length) {
    const set = new Set(opts.months)
    out = out.filter((d) => set.has(new Date(d.date).getMonth() + 1))
  }

  return out
}

/**
 * Recalcula métricas “tipo dashboard” desde datos diarios.
 * Devuelve EXACTAMENTE las claves que tu climate-dashboard está usando:
 * - summary.avgTemperature
 * - summary.totalPrecipitation
 * - summary.totalETO / totalETC
 * - summary.waterDeficit
 * - summary.frostHours / chillHours
 * - summary.totalGDD / frostDays
 * - warnings (array)
 *
 * ✅ Cambios:
 * - GDD se suma SOLO en Abr-Oct
 * - ChillHours se suma SOLO en Nov-Feb (blindado aquí)
 */
export function recalcMetricsFromDaily(
  data: ClimateData[],
  opts?: {
    gddMonths?: number[] // default Abr-Oct
    chillMonths?: number[] // default Nov-Feb
  },
) {
  const safe = Array.isArray(data) ? data : []
  const dayCount = safe.length

  const gddMonths = opts?.gddMonths?.length ? opts.gddMonths : GDD_SEASON_MONTHS
  const chillMonths = opts?.chillMonths?.length ? opts.chillMonths : CHILL_SEASON_MONTHS

  const gddSet = new Set(gddMonths)
  const chillSet = new Set(chillMonths)

  // para medias: evitar división por 0
  const n = Math.max(1, dayCount)

  const avgTemperature = safe.reduce((s, d) => s + (d.temperature_avg ?? 0), 0) / n

  const totalPrecipitation = safe.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const totalETO = safe.reduce((s, d) => s + (d.eto ?? 0), 0)
  const totalETC = safe.reduce((s, d) => s + (d.etc ?? 0), 0)

  // ✅ ChillHours SOLO Nov-Feb
  const chillHours = safe.reduce((s, d) => {
    const m = getMonth1to12(d.date)
    if (!chillSet.has(m)) return s
    return s + (d.chill_hours ?? 0)
  }, 0)

  const frostHours = safe.reduce((s, d) => s + (d.frost_hours ?? 0), 0)

  // Días de helada: días con frost_hours > 0
  const frostDays = safe.filter((d) => (d.frost_hours ?? 0) > 0).length

  // ✅ GDD SOLO Abr-Oct
  const hasDailyGdd = safe.some((d) => typeof d.gdd === "number")
  const totalGDD = safe.reduce((s, d) => {
    const m = getMonth1to12(d.date)
    if (!gddSet.has(m)) return s

    if (hasDailyGdd) return s + (d.gdd ?? 0)

    const tavg = d.temperature_avg ?? 0
    return s + Math.max(0, tavg - 7)
  }, 0)

  const waterDeficit = Math.max(0, totalETC - totalPrecipitation)

  const warnings: string[] = []
  if (chillHours < CHILL_OPT_MIN) warnings.push("Falta de horas frío: puede haber mala brotación.")
  if (chillHours > CHILL_OPT_MAX) warnings.push("Exceso de horas frío puede retrasar la brotación.")
  if (frostDays > 30) warnings.push(`${frostDays} días de helada pueden dañar floración.`)
  if (waterDeficit > 200) warnings.push("Déficit hídrico elevado: requiere riego suplementario.")

  return {
    summary: {
      dayCount,
      avgTemperature,
      totalPrecipitation,
      totalETO,
      totalETC,
      waterDeficit,
      frostHours,
      chillHours,
      totalGDD,
      frostDays,
    },
    warnings,
  }
}

/**
 * ✅ NUEVO: Para "Histórico 20 años"
 * En vez de sumar 7306 días y comparar contra umbrales anuales,
 * agrupamos por año y devolvemos la MEDIA anual de cada métrica.
 *
 * Esto es lo que debes usar cuando requestInfo.isHistorical === true
 * para que el "Índice de Aptitud General" y factores clave no salgan locos.
 */
export function recalcHistoricalAveragesFromDaily(
  data: ClimateData[],
  opts?: {
    gddMonths?: number[]
    chillMonths?: number[]
  },
) {
  const safe = Array.isArray(data) ? data : []
  const grouped = groupByYear(safe)
  const years = Object.keys(grouped)
    .map((y) => Number(y))
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)

  const totalYears = years.length || 1

  const perYear = years.map((year) => {
    const rows = grouped[year] ?? []
    return {
      year,
      ...recalcMetricsFromDaily(rows, opts),
    }
  })

  const avg = (getter: (x: any) => number) => {
    const n = Math.max(1, perYear.length)
    return perYear.reduce((s, x) => s + (Number(getter(x)) || 0), 0) / n
  }

  const summary = {
    // aquí dayCount = media de días/año (no imprescindible, pero útil)
    dayCount: avg((x) => x.summary.dayCount),

    avgTemperature: avg((x) => x.summary.avgTemperature),

    // medias anuales
    totalPrecipitation: avg((x) => x.summary.totalPrecipitation),
    totalETO: avg((x) => x.summary.totalETO),
    totalETC: avg((x) => x.summary.totalETC),
    waterDeficit: avg((x) => x.summary.waterDeficit),

    frostHours: avg((x) => x.summary.frostHours),
    chillHours: avg((x) => x.summary.chillHours),
    totalGDD: avg((x) => x.summary.totalGDD),
    frostDays: avg((x) => x.summary.frostDays),
  }

  // warnings en base a medias anuales
  const warnings: string[] = []
  if (summary.chillHours < CHILL_OPT_MIN) warnings.push("Falta de horas frío (media anual): puede haber mala brotación.")
  if (summary.chillHours > CHILL_OPT_MAX) warnings.push("Exceso de horas frío (media anual) puede retrasar la brotación.")
  if (summary.frostDays > 30) warnings.push(`${summary.frostDays.toFixed(0)} días/año de helada pueden dañar floración.`)
  if (summary.waterDeficit > 200) warnings.push("Déficit hídrico medio anual elevado: requiere riego suplementario.")

  return {
    summary,
    warnings,
    years,
    totalYears,
    perYear,
  }
}
