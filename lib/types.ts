export interface ClimateData {
  date: string
  temperature_max: number
  temperature_min: number
  temperature_avg: number
  humidity: number
  precipitation: number
  wind_speed: number
  solar_radiation: number
  eto: number
  etc: number
  frost_hours: number
  chill_hours: number
  gdd: number // Growing Degree Days (aquí lo usaremos como “heat units” base 7 por día)
  computedFromHourly?: boolean // 👈 para no machacar en calculadora si viene de ERA5 horario
  computedChillHeat?: boolean
}

export type DataSource = "SIAR" | "AEMET" | "NASA_POWER" | "ERA5"

export interface WeatherStation {
  id: string
  name: string
  latitude: number
  longitude: number
  elevation: number
  source: DataSource
}

export type ClimateMode = "historical" | "forecast"

export interface ClimateRequest {
  latitude: number
  longitude: number
  startDate: string
  endDate: string
  parameters: string[]
  source: DataSource

  // ✅ NUEVO (para AEMET forecast por CP)
  postalCode?: string
  municipio?: string
}





export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  source: string
}

export interface HourlyClimateData {
  datetime: string // ISO format with hour (YYYY-MM-DDTHH:mm:ss)
  temperature: number
  humidity: number
  wind_speed: number
  precipitation: number
  solar_radiation: number
  pressure?: number
  dew_point?: number
}

export interface HourlyClimateRequest extends ClimateRequest {
  resolution: "hourly"
  maxHours?: number // Límite para evitar sobrecarga
}

export interface DailyAggregatedData extends ClimateData {
  hourlyData: HourlyClimateData[]
  temperatureRange: number
  humidityRange: number
  peakSolarRadiation: number
  precipitationIntensity: number
}

export interface VarietyRecommendationRequest {
  latitude: number
  longitude: number
  climateData: ClimateData[]
  includeHourlyAnalysis?: boolean
}
