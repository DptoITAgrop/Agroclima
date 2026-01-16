import type { ClimateData } from "./types"

// Meses de campaña de frío (Nov-Feb): 11, 12, 1, 2
// OJO: lo dejamos como number[] (NO readonly) para que TS no proteste.
export const CHILL_SEASON_MONTHS: number[] = [11, 12, 1, 2]

// Ajusta estos thresholds a vuestro criterio
const CHILL_OPT_MIN = 600
const CHILL_OPT_MAX = 1500

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
 */
export function recalcMetricsFromDaily(data: ClimateData[]) {
  const safe = Array.isArray(data) ? data : []
  const dayCount = safe.length

  // para medias: evitar división por 0
  const n = Math.max(1, dayCount)

  const avgTemperature =
    safe.reduce((s, d) => s + (d.temperature_avg ?? 0), 0) / n

  const totalPrecipitation = safe.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const totalETO = safe.reduce((s, d) => s + (d.eto ?? 0), 0)
  const totalETC = safe.reduce((s, d) => s + (d.etc ?? 0), 0)

  const chillHours = safe.reduce((s, d) => s + (d.chill_hours ?? 0), 0)
  const frostHours = safe.reduce((s, d) => s + (d.frost_hours ?? 0), 0)

  // Días de helada: días con frost_hours > 0
  const frostDays = safe.filter((d) => (d.frost_hours ?? 0) > 0).length

  // GDD: si viene diario, sumamos; si no, lo estimamos con base 7 (ajústalo si quieres)
  const totalGDD = safe.some((d) => typeof d.gdd === "number")
    ? safe.reduce((s, d) => s + (d.gdd ?? 0), 0)
    : safe.reduce((s, d) => {
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
