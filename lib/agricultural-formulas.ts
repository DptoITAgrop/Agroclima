/**
 * Agricultural formulas for pistachio irrigation calculations
 * Based on FAO-56 methodology and pistachio-specific coefficients
 */

export interface ClimateDataPoint {
  date: string
  temperature_max: number
  temperature_min: number
  temperature_avg: number
  humidity: number
  precipitation: number
  wind_speed: number
  solar_radiation: number
  pressure?: number
}

export interface CalculatedData extends ClimateDataPoint {
  eto: number
  etc: number
  kc: number
  frost_hours: number
  chill_hours: number
  gdd: number
}

/**
 * Calculate reference evapotranspiration (ETo) using Penman-Monteith equation
 * Simplified version for daily calculations
 */
export function calculateETo(data: ClimateDataPoint): number {
  const { temperature_max, temperature_min, temperature_avg, humidity, wind_speed, solar_radiation } = data

  // Constants
  const psychrometric = 0.665 // kPa/°C
  const latentHeat = 2.45 // MJ/kg

  // Saturation vapor pressure
  const es_tmax = 0.6108 * Math.exp((17.27 * temperature_max) / (temperature_max + 237.3))
  const es_tmin = 0.6108 * Math.exp((17.27 * temperature_min) / (temperature_min + 237.3))
  const es = (es_tmax + es_tmin) / 2

  // Actual vapor pressure
  const ea = (humidity / 100) * es

  // Slope of saturation vapor pressure curve
  const delta = (4098 * es) / Math.pow(temperature_avg + 237.3, 2)

  // Net radiation (simplified)
  const rn = solar_radiation * 0.77 - 2.45 // MJ/m²/day

  // Soil heat flux (assumed negligible for daily calculations)
  const g = 0

  // Wind speed at 2m height (assumed)
  const u2 = wind_speed

  // Penman-Monteith equation
  const numerator = 0.408 * delta * (rn - g) + psychrometric * (900 / (temperature_avg + 273)) * u2 * (es - ea)
  const denominator = delta + psychrometric * (1 + 0.34 * u2)

  const eto = numerator / denominator

  // Ensure positive value and reasonable range
  return Math.max(0, Math.min(15, eto))
}

/**
 * Calculate crop coefficient (Kc) for pistachio based on growth stage and date
 */
export function calculateKc(date: string): number {
  const dateObj = new Date(date)
  const month = dateObj.getMonth() + 1
  const day = dateObj.getDate()

  // Pistachio growth stages and Kc values
  // Based on Mediterranean climate conditions

  if (month === 12 || month === 1 || month === 2) {
    // Dormancy period
    return 0.3
  } else if (month === 3) {
    // Early bud break
    return 0.4 + (day / 31) * 0.3 // 0.4 to 0.7
  } else if (month === 4) {
    // Flowering
    return 0.7 + (day / 30) * 0.3 // 0.7 to 1.0
  } else if (month === 5) {
    // Fruit set and early development
    return 1.0 + (day / 31) * 0.2 // 1.0 to 1.2
  } else if (month === 6 || month === 7) {
    // Rapid fruit growth
    return 1.2
  } else if (month === 8) {
    // Late fruit development
    return 1.2 - (day / 31) * 0.2 // 1.2 to 1.0
  } else if (month === 9) {
    // Harvest period
    return 1.0 - (day / 30) * 0.3 // 1.0 to 0.7
  } else if (month === 10) {
    // Post-harvest
    return 0.7 - (day / 31) * 0.2 // 0.7 to 0.5
  } else if (month === 11) {
    // Leaf fall and dormancy preparation
    return 0.5 - (day / 30) * 0.2 // 0.5 to 0.3
  }

  return 0.8 // Default value
}

/**
 * Calculate crop evapotranspiration (ETc)
 */
export function calculateETc(eto: number, kc: number): number {
  return eto * kc
}

/**
 * Calculate chill hours (hours below 7.2°C)
 */
export function calculateChillHours(temperature_min: number, temperature_max: number): number {
  // Simplified calculation assuming linear temperature distribution
  const avgTemp = (temperature_min + temperature_max) / 2

  if (temperature_max <= 7.2) {
    return 24 // All day below threshold
  } else if (temperature_min >= 7.2) {
    return 0 // No chill hours
  } else {
    // Approximate hours below 7.2°C
    const ratio = (7.2 - temperature_min) / (temperature_max - temperature_min)
    return Math.max(0, Math.min(24, ratio * 12)) // Approximate half-day calculation
  }
}

/**
 * Calculate frost hours (hours below 0°C)
 */
export function calculateFrostHours(temperature_min: number, temperature_max: number): number {
  if (temperature_max <= 0) {
    return 24 // All day below freezing
  } else if (temperature_min >= 0) {
    return 0 // No frost
  } else {
    // Approximate hours below 0°C
    const ratio = Math.abs(temperature_min) / (temperature_max - temperature_min)
    return Math.max(0, Math.min(24, ratio * 12)) // Approximate calculation
  }
}

/**
 * Calculate Growing Degree Days (GDD) with base temperature 10°C
 */
export function calculateGDD(temperature_min: number, temperature_max: number, baseTemp = 10): number {
  const avgTemp = (temperature_min + temperature_max) / 2
  return Math.max(0, avgTemp - baseTemp)
}

/**
 * Process raw climate data and add calculated agricultural parameters
 */
export function processClimateData(rawData: ClimateDataPoint[]): CalculatedData[] {
  return rawData.map((dataPoint) => {
    const eto = calculateETo(dataPoint)
    const kc = calculateKc(dataPoint.date)
    const etc = calculateETc(eto, kc)
    const chillHours = calculateChillHours(dataPoint.temperature_min, dataPoint.temperature_max)
    const frostHours = calculateFrostHours(dataPoint.temperature_min, dataPoint.temperature_max)
    const gdd = calculateGDD(dataPoint.temperature_min, dataPoint.temperature_max)

    return {
      ...dataPoint,
      eto: Math.round(eto * 100) / 100,
      etc: Math.round(etc * 100) / 100,
      kc: Math.round(kc * 100) / 100,
      frost_hours: Math.round(frostHours * 10) / 10,
      chill_hours: Math.round(chillHours * 10) / 10,
      gdd: Math.round(gdd * 100) / 100,
    }
  })
}

/**
 * Validate and clean climate data
 */
export function validateClimateData(data: any[]): ClimateDataPoint[] {
  return data
    .filter((item) => {
      return (
        item &&
        typeof item.date === "string" &&
        typeof item.temperature_max === "number" &&
        typeof item.temperature_min === "number" &&
        typeof item.temperature_avg === "number" &&
        !isNaN(item.temperature_max) &&
        !isNaN(item.temperature_min) &&
        !isNaN(item.temperature_avg)
      )
    })
    .map((item) => ({
      date: item.date,
      temperature_max: Number(item.temperature_max) || 0,
      temperature_min: Number(item.temperature_min) || 0,
      temperature_avg: Number(item.temperature_avg) || 0,
      humidity: Number(item.humidity) || 50,
      precipitation: Number(item.precipitation) || 0,
      wind_speed: Number(item.wind_speed) || 2,
      solar_radiation: Number(item.solar_radiation) || 15,
      pressure: Number(item.pressure) || 1013,
    }))
}
