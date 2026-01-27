// lib/types.ts

/**
 * Fuentes soportadas
 */
export type DataSource = "SIAR" | "AEMET" | "NASA_POWER" | "ERA5" | "OPEN_METEO"

export interface ClimateRequest {
  source: DataSource

  // Para fuentes por coordenadas
  latitude?: number
  longitude?: number
  startDate?: string // ISO yyyy-mm-dd
  endDate?: string // ISO yyyy-mm-dd

  // Para AEMET (por CP / municipio)
  postalCode?: string
  municipio?: string

  // Otros
  parameters?: string[]
}

/**
 * Modelo unificado (diario) para toda la app.
 *
 * Importante:
 * - Mantén SIEMPRE `date` en ISO (yyyy-mm-dd) para agrupar por campañas/ventanas.
 * - Si alguna fuente no trae un campo, ponlo como `undefined` y el motor lo tratará como 0 con `|| 0`.
 * - Unidades esperadas (recomendado):
 *   - temperature_*: °C
 *   - humidity: % (0-100)
 *   - precipitation: mm/día
 *   - wind_speed: m/s (o km/h, pero entonces documentarlo y unificarlo)
 *   - solar_radiation: MJ/m²/día o W/m² (pero unificar en toda la app)
 *   - eto: mm/día (ETo referencia)
 *   - etc: mm/día (ETc cultivo) -> si no aplicas Kc, puedes dejar etc = eto
 *   - frost_hours: horas/día con T < 0°C (o el umbral que uses)
 *   - chill_hours: horas/día bajo el umbral de frío (modelo simple) o equivalente
 *   - gdd: grados-día/día (base definida, ej. 7°C)
 */
export interface ClimateData {
  date: string

  // Temperaturas (recomendado: siempre presentes)
  temperature_max: number
  temperature_min: number
  temperature_avg: number

  // Variables que pueden faltar según fuente (las dejamos opcionales)
  humidity?: number
  precipitation?: number
  wind_speed?: number
  solar_radiation?: number

  // Evapotranspiración
  eto?: number
  etc?: number

  // Índices/agregados (pueden venir calculados o computados)
  frost_hours?: number
  chill_hours?: number
  gdd?: number

  // Flags de trazabilidad
  computedChillHeat?: boolean // true si chill/gdd/frost se calcularon en tu app
  computedFromHourly?: boolean // true si proviene de agregación horaria (ERA5/Open-Meteo)
}

/**
 * Respuesta estándar de tus endpoints.
 * `source` te permite indicar qué proveedor devolvió datos realmente (por ejemplo, fallback).
 */
export interface ApiResponse<T> {
  success: boolean
  source: DataSource | string
  data?: T
  error?: string

  // debug libre (ideal para inspeccionar unidades / cobertura)
  debug?: Record<string, any>
}
