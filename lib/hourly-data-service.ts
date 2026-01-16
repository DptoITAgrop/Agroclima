import type { ClimateData, ClimateRequest, ApiResponse } from "./types"

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

export class HourlyDataService {
  private maxHoursPerRequest = 8760 // 1 año de datos horarios máximo por request

  /**
   * Obtiene datos climáticos horarios históricos
   */
  async getHourlyHistoricalData(
    latitude: number,
    longitude: number,
    startDate: string,
    endDate: string,
    maxHours?: number,
  ): Promise<ApiResponse<HourlyClimateData[]>> {
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const hoursDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60))

      // Limitar el número de horas para evitar sobrecarga
      const requestLimit = maxHours || this.maxHoursPerRequest
      if (hoursDiff > requestLimit) {
        return {
          success: false,
          error: `Período demasiado largo. Máximo ${requestLimit} horas (${Math.floor(requestLimit / 24)} días)`,
          source: "HOURLY_SERVICE",
        }
      }

      // Llamar a la API de datos horarios
      const response = await fetch("/api/weather/hourly", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude,
          longitude,
          startDate,
          endDate,
          resolution: "hourly",
        }),
      })

      if (!response.ok) {
        throw new Error(`Hourly API error: ${response.status}`)
      }

      const result = await response.json()
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error obteniendo datos horarios",
        source: "HOURLY_SERVICE",
      }
    }
  }

  /**
   * Agrega datos horarios a datos diarios con trazabilidad completa
   */
  aggregateHourlyToDaily(hourlyData: HourlyClimateData[]): DailyAggregatedData[] {
    // Agrupar datos por día
    const dailyGroups = this.groupHourlyDataByDay(hourlyData)

    return Object.entries(dailyGroups).map(([date, hours]) => {
      const temperatures = hours.map((h) => h.temperature)
      const humidities = hours.map((h) => h.humidity)
      const precipitations = hours.map((h) => h.precipitation)
      const solarRadiations = hours.map((h) => h.solar_radiation)
      const windSpeeds = hours.map((h) => h.wind_speed)

      const temperature_max = Math.max(...temperatures)
      const temperature_min = Math.min(...temperatures)
      const temperature_avg = temperatures.reduce((sum, t) => sum + t, 0) / temperatures.length

      const humidity = humidities.reduce((sum, h) => sum + h, 0) / humidities.length
      const precipitation = precipitations.reduce((sum, p) => sum + p, 0)
      const solar_radiation = solarRadiations.reduce((sum, s) => sum + s, 0) / solarRadiations.length
      const wind_speed = windSpeeds.reduce((sum, w) => sum + w, 0) / windSpeeds.length

      return {
        date,
        temperature_max: Number.parseFloat(temperature_max.toFixed(1)),
        temperature_min: Number.parseFloat(temperature_min.toFixed(1)),
        temperature_avg: Number.parseFloat(temperature_avg.toFixed(1)),
        humidity: Number.parseFloat(humidity.toFixed(1)),
        precipitation: Number.parseFloat(precipitation.toFixed(1)),
        wind_speed: Number.parseFloat(wind_speed.toFixed(1)),
        solar_radiation: Number.parseFloat(solar_radiation.toFixed(1)),
        eto: 0, // Se calculará después
        etc: 0, // Se calculará después
        frost_hours: this.calculateFrostHoursFromHourly(hours),
        chill_hours: this.calculateChillHoursFromHourly(hours),
        gdd: 0, // Se calculará después

        // Datos adicionales con trazabilidad
        hourlyData: hours,
        temperatureRange: Number.parseFloat((temperature_max - temperature_min).toFixed(1)),
        humidityRange: Number.parseFloat((Math.max(...humidities) - Math.min(...humidities)).toFixed(1)),
        peakSolarRadiation: Math.max(...solarRadiations),
        precipitationIntensity: Math.max(...precipitations),
      }
    })
  }

  /**
   * Agrupa datos horarios por día
   */
  private groupHourlyDataByDay(hourlyData: HourlyClimateData[]): Record<string, HourlyClimateData[]> {
    const groups: Record<string, HourlyClimateData[]> = {}

    hourlyData.forEach((hour) => {
      const date = hour.datetime.split("T")[0] // Extraer solo la fecha YYYY-MM-DD
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(hour)
    })

    return groups
  }

  /**
   * Calcula horas de helada exactas a partir de datos horarios
   */
  private calculateFrostHoursFromHourly(hourlyData: HourlyClimateData[]): number {
    return hourlyData.filter((hour) => hour.temperature <= 0).length
  }

  /**
   * Calcula horas frío exactas a partir de datos horarios
   */
  private calculateChillHoursFromHourly(hourlyData: HourlyClimateData[]): number {
    return hourlyData.filter((hour) => hour.temperature <= 7.2).length
  }

  /**
   * Genera reporte de trazabilidad climática
   */
  generateTraceabilityReport(
    dailyData: DailyAggregatedData[],
    location: { latitude: number; longitude: number },
    period: { start: string; end: string },
  ) {
    const totalHours = dailyData.reduce((sum, day) => sum + day.hourlyData.length, 0)
    const totalDays = dailyData.length

    // Estadísticas de temperatura por hora del día
    const hourlyTemperatureStats = this.calculateHourlyTemperatureStats(dailyData)

    // Patrones estacionales
    const seasonalPatterns = this.analyzeSeasonalPatterns(dailyData)

    // Eventos extremos
    const extremeEvents = this.identifyExtremeEvents(dailyData)

    return {
      metadata: {
        location,
        period,
        totalDays,
        totalHours,
        dataCompleteness: (totalHours / (totalDays * 24)) * 100,
        generatedAt: new Date().toISOString(),
      },
      hourlyTemperatureStats,
      seasonalPatterns,
      extremeEvents,
      dataQuality: this.assessDataQuality(dailyData),
      climateIndicators: this.calculateClimateIndicators(dailyData),
    }
  }

  /**
   * Calcula estadísticas de temperatura por hora del día
   */
  private calculateHourlyTemperatureStats(dailyData: DailyAggregatedData[]) {
    const hourlyStats: Record<number, { avg: number; min: number; max: number; count: number }> = {}

    // Inicializar estadísticas para cada hora (0-23)
    for (let hour = 0; hour < 24; hour++) {
      hourlyStats[hour] = { avg: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, count: 0 }
    }

    // Procesar todos los datos horarios
    dailyData.forEach((day) => {
      day.hourlyData.forEach((hour) => {
        const hourOfDay = new Date(hour.datetime).getHours()
        const temp = hour.temperature

        hourlyStats[hourOfDay].min = Math.min(hourlyStats[hourOfDay].min, temp)
        hourlyStats[hourOfDay].max = Math.max(hourlyStats[hourOfDay].max, temp)
        hourlyStats[hourOfDay].avg += temp
        hourlyStats[hourOfDay].count++
      })
    })

    // Calcular promedios
    Object.keys(hourlyStats).forEach((hour) => {
      const h = Number.parseInt(hour)
      if (hourlyStats[h].count > 0) {
        hourlyStats[h].avg = hourlyStats[h].avg / hourlyStats[h].count
      }
    })

    return hourlyStats
  }

  /**
   * Analiza patrones estacionales
   */
  private analyzeSeasonalPatterns(dailyData: DailyAggregatedData[]) {
    const seasons = {
      spring: { months: [3, 4, 5], data: [] as DailyAggregatedData[] },
      summer: { months: [6, 7, 8], data: [] as DailyAggregatedData[] },
      autumn: { months: [9, 10, 11], data: [] as DailyAggregatedData[] },
      winter: { months: [12, 1, 2], data: [] as DailyAggregatedData[] },
    }

    // Clasificar datos por estación
    dailyData.forEach((day) => {
      const month = new Date(day.date).getMonth() + 1

      if (seasons.spring.months.includes(month)) seasons.spring.data.push(day)
      else if (seasons.summer.months.includes(month)) seasons.summer.data.push(day)
      else if (seasons.autumn.months.includes(month)) seasons.autumn.data.push(day)
      else if (seasons.winter.months.includes(month)) seasons.winter.data.push(day)
    })

    // Calcular estadísticas por estación
    const seasonalStats = {}
    Object.entries(seasons).forEach(([season, info]) => {
      if (info.data.length > 0) {
        const temps = info.data.map((d) => d.temperature_avg)
        const precips = info.data.map((d) => d.precipitation)

        seasonalStats[season] = {
          avgTemperature: temps.reduce((sum, t) => sum + t, 0) / temps.length,
          totalPrecipitation: precips.reduce((sum, p) => sum + p, 0),
          dayCount: info.data.length,
          temperatureRange: {
            min: Math.min(...info.data.map((d) => d.temperature_min)),
            max: Math.max(...info.data.map((d) => d.temperature_max)),
          },
        }
      }
    })

    return seasonalStats
  }

  /**
   * Identifica eventos climáticos extremos
   */
  private identifyExtremeEvents(dailyData: DailyAggregatedData[]) {
    const events = {
      heatWaves: [] as Array<{ start: string; end: string; maxTemp: number; duration: number }>,
      coldSpells: [] as Array<{ start: string; end: string; minTemp: number; duration: number }>,
      heavyRain: [] as Array<{ date: string; amount: number; intensity: number }>,
      drought: [] as Array<{ start: string; end: string; duration: number }>,
    }

    // Detectar olas de calor (3+ días consecutivos >35°C)
    let heatWaveStart: string | null = null
    let heatWaveDays = 0
    let maxHeatTemp = 0

    dailyData.forEach((day) => {
      if (day.temperature_max > 35) {
        if (!heatWaveStart) {
          heatWaveStart = day.date
          heatWaveDays = 1
          maxHeatTemp = day.temperature_max
        } else {
          heatWaveDays++
          maxHeatTemp = Math.max(maxHeatTemp, day.temperature_max)
        }
      } else {
        if (heatWaveStart && heatWaveDays >= 3) {
          events.heatWaves.push({
            start: heatWaveStart,
            end: dailyData[dailyData.indexOf(day) - 1]?.date || day.date,
            maxTemp: maxHeatTemp,
            duration: heatWaveDays,
          })
        }
        heatWaveStart = null
        heatWaveDays = 0
        maxHeatTemp = 0
      }
    })

    // Detectar períodos fríos (3+ días consecutivos <0°C mínima)
    let coldSpellStart: string | null = null
    let coldSpellDays = 0
    let minColdTemp = 0

    dailyData.forEach((day) => {
      if (day.temperature_min < 0) {
        if (!coldSpellStart) {
          coldSpellStart = day.date
          coldSpellDays = 1
          minColdTemp = day.temperature_min
        } else {
          coldSpellDays++
          minColdTemp = Math.min(minColdTemp, day.temperature_min)
        }
      } else {
        if (coldSpellStart && coldSpellDays >= 3) {
          events.coldSpells.push({
            start: coldSpellStart,
            end: dailyData[dailyData.indexOf(day) - 1]?.date || day.date,
            minTemp: minColdTemp,
            duration: coldSpellDays,
          })
        }
        coldSpellStart = null
        coldSpellDays = 0
        minColdTemp = 0
      }
    })

    // Detectar lluvias intensas (>20mm/día)
    dailyData.forEach((day) => {
      if (day.precipitation > 20) {
        events.heavyRain.push({
          date: day.date,
          amount: day.precipitation,
          intensity: day.precipitationIntensity,
        })
      }
    })

    return events
  }

  /**
   * Evalúa la calidad de los datos
   */
  private assessDataQuality(dailyData: DailyAggregatedData[]) {
    const totalExpectedHours = dailyData.length * 24
    const actualHours = dailyData.reduce((sum, day) => sum + day.hourlyData.length, 0)

    const missingDataDays = dailyData.filter((day) => day.hourlyData.length < 24).length
    const completeDataDays = dailyData.length - missingDataDays

    return {
      completeness: (actualHours / totalExpectedHours) * 100,
      totalDays: dailyData.length,
      completeDataDays,
      missingDataDays,
      averageHoursPerDay: actualHours / dailyData.length,
      qualityScore: this.calculateQualityScore(dailyData),
    }
  }

  /**
   * Calcula indicadores climáticos específicos
   */
  private calculateClimateIndicators(dailyData: DailyAggregatedData[]) {
    const allHourlyData = dailyData.flatMap((day) => day.hourlyData)

    return {
      totalHours: allHourlyData.length,
      temperatureExtremes: {
        absoluteMin: Math.min(...allHourlyData.map((h) => h.temperature)),
        absoluteMax: Math.max(...allHourlyData.map((h) => h.temperature)),
        hoursAbove40: allHourlyData.filter((h) => h.temperature > 40).length,
        hoursBelow0: allHourlyData.filter((h) => h.temperature < 0).length,
        hoursBelow7_2: allHourlyData.filter((h) => h.temperature <= 7.2).length,
      },
      precipitationStats: {
        totalPrecipitation: dailyData.reduce((sum, day) => sum + day.precipitation, 0),
        maxDailyPrecipitation: Math.max(...dailyData.map((day) => day.precipitation)),
        maxHourlyIntensity: Math.max(...dailyData.map((day) => day.precipitationIntensity)),
        dryDays: dailyData.filter((day) => day.precipitation < 0.1).length,
        wetDays: dailyData.filter((day) => day.precipitation >= 0.1).length,
      },
      solarRadiationStats: {
        averageDaily: dailyData.reduce((sum, day) => sum + day.solar_radiation, 0) / dailyData.length,
        peakRadiation: Math.max(...dailyData.map((day) => day.peakSolarRadiation)),
        totalRadiation: dailyData.reduce((sum, day) => sum + day.solar_radiation, 0),
      },
    }
  }

  private calculateQualityScore(dailyData: DailyAggregatedData[]): number {
    let score = 100

    // Penalizar días con datos incompletos
    const incompleteDays = dailyData.filter((day) => day.hourlyData.length < 24).length
    score -= (incompleteDays / dailyData.length) * 30

    // Penalizar valores extremos sospechosos
    const suspiciousValues = dailyData.filter(
      (day) => day.temperature_max > 60 || day.temperature_min < -50 || day.precipitation > 500,
    ).length
    score -= (suspiciousValues / dailyData.length) * 20

    return Math.max(0, Math.min(100, score))
  }
}
