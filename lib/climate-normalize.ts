import type { ClimateData } from "./types"

function toNum(v: any, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Normaliza ClimateData en runtime para evitar NaN/undefined/string/null.
 * - Convierte todo a number seguro
 * - Asegura date string
 */
export function normalizeClimateData(raw: any[]): ClimateData[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map((d) => {
      const date = typeof d?.date === "string" ? d.date : String(d?.date ?? "")
      return {
        date,

        temperature_max: toNum(d?.temperature_max),
        temperature_min: toNum(d?.temperature_min),
        temperature_avg: toNum(d?.temperature_avg),

        humidity: toNum(d?.humidity),
        precipitation: toNum(d?.precipitation),
        wind_speed: toNum(d?.wind_speed),
        solar_radiation: toNum(d?.solar_radiation),

        eto: toNum(d?.eto),
        etc: toNum(d?.etc),

        frost_hours: toNum(d?.frost_hours),
        chill_hours: toNum(d?.chill_hours),
        gdd: toNum(d?.gdd),
      } satisfies ClimateData
    })
    // opcional: filtrar fechas inválidas
    .filter((d) => d.date && !Number.isNaN(new Date(d.date).getTime()))
}
