import type { ClimateData } from "./types"

export interface PistachioParameters {
  // Crop coefficients for different growth stages
  kcInitial: number
  kcDevelopment: number
  kcMid: number
  kcLate: number

  // Temperature thresholds
  baseTemperature: number // Base temperature for GDD (legacy)
  frostThreshold: number // 0°C
  chillThreshold: number // 7.2°C (simple model)

  // Growth stages dates (day of year)
  budBreak: number
  flowering: number
  fruitDevelopment: number
  harvest: number
}

export const DEFAULT_PISTACHIO_PARAMS: PistachioParameters = {
  kcInitial: 0.45,
  kcDevelopment: 0.75,
  kcMid: 1.1,
  kcLate: 0.85,

  // ⚠️ Mantenemos este campo para compatibilidad,
  // pero en esta app vamos a usar base 7°C para consistencia con ERA5/NASA.
  baseTemperature: 10,

  frostThreshold: 0,
  chillThreshold: 7.2,

  budBreak: 90,
  flowering: 120,
  fruitDevelopment: 180,
  harvest: 270,
}

type SeasonalSummary = {
  totalDays: number
  avgTemperature: number
  totalGDD: number
  totalChillHours: number
  totalFrostHours: number
  frostDays: number
  totalETO: number
  totalETC: number
  totalPrecipitation: number
  waterDeficit: number

  /**
   * ✅ NUEVO: útil para UI/debug (no rompe si no lo usas).
   * - yearsCount: cuántos años/campañas se han detectado para anualizar
   * - isAnnualized: true si hemos anualizado (multi-año)
   */
  yearsCount?: number
  isAnnualized?: boolean
}

export class ClimateCalculator {
  private params: PistachioParameters

  // ✅ Consistencia con el resto del proyecto (tu motor usa base 7)
  private readonly gddBaseC = 7

  constructor(params: PistachioParameters = DEFAULT_PISTACHIO_PARAMS) {
    this.params = params
  }

  // ----------------------------
  // Core agromet calculations
  // ----------------------------

  /**
   * Reference Evapotranspiration (ETO) - Hargreaves-Samani (simplified)
   * ETO = 0.0023 * (Tmean + 17.8) * sqrt(Tmax - Tmin) * Ra
   */
  calculateETO(
    tempMax: number,
    tempMin: number,
    _humidity: number,
    _windSpeed: number,
    _solarRadiation: number,
    latitude: number,
    dayOfYear: number,
  ): number {
    const tempMean = (tempMax + tempMin) / 2
    const ra = this.calculateExtraterrestrialRadiation(latitude, dayOfYear)
    const eto = 0.0023 * (tempMean + 17.8) * Math.sqrt(Math.abs(tempMax - tempMin)) * ra
    return Math.max(0, eto)
  }

  /**
   * Crop Evapotranspiration (ETC) = ETO * Kc
   */
  calculateETC(eto: number, dayOfYear: number): number {
    const kc = this.getCropCoefficient(dayOfYear)
    return eto * kc
  }

  private getCropCoefficient(dayOfYear: number): number {
    if (dayOfYear < this.params.budBreak) return this.params.kcInitial

    if (dayOfYear < this.params.flowering) {
      const progress = (dayOfYear - this.params.budBreak) / (this.params.flowering - this.params.budBreak)
      return this.params.kcInitial + progress * (this.params.kcDevelopment - this.params.kcInitial)
    }

    if (dayOfYear < this.params.fruitDevelopment) {
      const progress = (dayOfYear - this.params.flowering) / (this.params.fruitDevelopment - this.params.flowering)
      return this.params.kcDevelopment + progress * (this.params.kcMid - this.params.kcDevelopment)
    }

    if (dayOfYear < this.params.harvest) {
      const progress = (dayOfYear - this.params.fruitDevelopment) / (this.params.harvest - this.params.fruitDevelopment)
      return this.params.kcMid + progress * (this.params.kcLate - this.params.kcMid)
    }

    return this.params.kcLate
  }

  private calculateExtraterrestrialRadiation(latitude: number, dayOfYear: number): number {
    const latRad = (latitude * Math.PI) / 180
    const solarDeclination = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
    const sunsetHourAngle = Math.acos(-Math.tan(latRad) * Math.tan(solarDeclination))

    const ra =
      ((24 * 60) / Math.PI) *
      0.082 *
      (sunsetHourAngle * Math.sin(latRad) * Math.sin(solarDeclination) +
        Math.cos(latRad) * Math.cos(solarDeclination) * Math.sin(sunsetHourAngle))

    return Math.max(0, ra)
  }

  /**
   * GDD simple (base 7°C para consistencia con el resto de la app)
   */
  calculateGDD(tempMax: number, tempMin: number): number {
    const tempMean = (tempMax + tempMin) / 2
    return Math.max(0, tempMean - this.gddBaseC)
  }

  /**
   * Chill hours simple (lineal bajo umbral 7.2°C)
   */
  calculateChillHours(tempMax: number, tempMin: number): number {
    const tmax = Number.isFinite(tempMax) ? tempMax : 0
    const tmin = Number.isFinite(tempMin) ? tempMin : 0

    if (tmax <= this.params.chillThreshold) return 24
    if (tmin >= this.params.chillThreshold) return 0

    const denom = tmax - tmin
    if (denom === 0) return tmax < this.params.chillThreshold ? 24 : 0

    const hoursBelow = (24 * (this.params.chillThreshold - tmin)) / denom
    return Math.max(0, Math.min(24, hoursBelow))
  }

  /**
   * Frost hours simple (lineal bajo 0°C)
   */
  calculateFrostHours(tempMax: number, tempMin: number): number {
    const tmax = Number.isFinite(tempMax) ? tempMax : 0
    const tmin = Number.isFinite(tempMin) ? tempMin : 0

    if (tmax <= this.params.frostThreshold) return 24
    if (tmin >= this.params.frostThreshold) return 0

    const denom = tmax - tmin
    if (denom === 0) return tmax < this.params.frostThreshold ? 24 : 0

    const hoursBelow = (24 * (this.params.frostThreshold - tmin)) / denom
    return Math.max(0, Math.min(24, hoursBelow))
  }

  private getDayOfYear(dateISO: string): number {
    const date = new Date(`${dateISO}T00:00:00`)
    const start = new Date(date.getFullYear(), 0, 0)
    return Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  }

  private safeNum(n: unknown, fallback = 0): number {
    const x = typeof n === "number" ? n : Number(n)
    return Number.isFinite(x) ? x : fallback
  }

  private getMonthDay(dateISO: string): { month: number; day: number } {
    const d = new Date(`${dateISO}T00:00:00`)
    return { month: d.getMonth() + 1, day: d.getDate() }
  }

  /**
   * Ventana de Horas Frío pistacho:
   * - desde 1 Nov hasta 1 Mar (1 Mar NO incluido)
   * => Nov, Dic, Ene, Feb
   */
  private isInChillWindow(dateISO: string): boolean {
    const { month } = this.getMonthDay(dateISO)
    return month === 11 || month === 12 || month === 1 || month === 2
  }

  /**
   * ✅ NUEVO: Ventana GDD pistacho:
   * - desde 1 Abr hasta 31 Oct (inclusive)
   * => Abr, May, Jun, Jul, Ago, Sep, Oct
   */
  private isInGddWindow(dateISO: string): boolean {
    const { month } = this.getMonthDay(dateISO)
    return month >= 4 && month <= 10
  }

  /**
   * ✅ NUEVO: Año de campaña para invierno (Nov–Feb)
   * - Nov/Dic 2023 → campaña 2024
   * - Ene/Feb 2024 → campaña 2024
   */
  private winterCampaignYear(dateISO: string): number {
    const d = new Date(`${dateISO}T00:00:00`)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return m >= 11 ? y + 1 : y
  }

  private clamp0(n: number): number {
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }

  /**
   * Sanity check físico para ETo/ETc DIARIA.
   */
  private sanitizeDailyET(value: number): number {
    const v = this.safeNum(value, 0)
    if (v <= 0) return 0
    if (v > 20) return 20
    return v
  }

  /**
   * Procesa data diaria y añade ETO/ETC siempre que falten.
   *
   * ✅ HF:
   * - Fuera de Nov–Feb => chill_hours = 0
   */
  processClimateData(data: ClimateData[], latitude?: number): ClimateData[] {
    return data.map((day) => {
      const dayOfYear = this.getDayOfYear(day.date)

      const tmax = this.safeNum(day.temperature_max)
      const tmin = this.safeNum(day.temperature_min)
      const hum = this.safeNum(day.humidity)
      const ws = this.safeNum(day.wind_speed)
      const sr = this.safeNum(day.solar_radiation)

      const latSafe = typeof latitude === "number" && Number.isFinite(latitude) ? latitude : 0

      const incomingEto = this.sanitizeDailyET(this.safeNum((day as any).eto, 0))
      const incomingEtc = this.sanitizeDailyET(this.safeNum((day as any).etc, 0))

      const etoComputed = this.sanitizeDailyET(this.calculateETO(tmax, tmin, hum, ws, sr, latSafe, dayOfYear))
      const etcComputed = this.sanitizeDailyET(this.calculateETC(etoComputed, dayOfYear))

      const eto = incomingEto > 0 ? incomingEto : etoComputed
      const etc = incomingEtc > 0 ? incomingEtc : etcComputed

      const inChillWindow = this.isInChillWindow(day.date)

      // 2) Si ya viene calculado (ERA5/NASA), NO recalcular índices térmicos
      if ((day as any).computedChillHeat) {
        const incomingChill = this.clamp0(this.safeNum((day as any).chill_hours))
        const incomingFrost = this.clamp0(this.safeNum((day as any).frost_hours))
        const incomingGdd = this.clamp0(this.safeNum((day as any).gdd))

        return {
          ...day,
          eto: Number.parseFloat(eto.toFixed(2)),
          etc: Number.parseFloat(etc.toFixed(2)),
          gdd: Number.parseFloat(incomingGdd.toFixed(1)),
          chill_hours: Number.parseFloat((inChillWindow ? incomingChill : 0).toFixed(1)),
          frost_hours: Number.parseFloat(incomingFrost.toFixed(1)),
        }
      }

      // 3) Caso fuentes sin cálculo
      const gdd = this.calculateGDD(tmax, tmin)

      const chillRaw = this.calculateChillHours(tmax, tmin)
      const chill = inChillWindow ? chillRaw : 0

      const frost = this.calculateFrostHours(tmax, tmin)

      return {
        ...day,
        eto: Number.parseFloat(this.clamp0(eto).toFixed(2)),
        etc: Number.parseFloat(this.clamp0(etc).toFixed(2)),
        gdd: Number.parseFloat(this.clamp0(gdd).toFixed(1)),
        chill_hours: Number.parseFloat(this.clamp0(chill).toFixed(1)),
        frost_hours: Number.parseFloat(this.clamp0(frost).toFixed(1)),
      }
    })
  }

  // ----------------------------
  // Summaries & suitability
  // ----------------------------

  /**
   * ✅ CAMBIO CLAVE:
   * - Si el dataset tiene >1 año, anualiza automáticamente:
   *   - GDD: media anual SOLO Abr–Oct
   *   - Chill: media por campaña de invierno (Nov–Feb)
   *   - FrostDays / FrostHours / ETO / ETC / Precip / Deficit: media anual calendario
   *
   * Así el suitabilityScore deja de "reventar" por acumulación de 20 años.
   */
  calculateSeasonalSummary(data: ClimateData[]): SeasonalSummary {
    const safe = Array.isArray(data) ? data : []
    const totalDays = safe.length || 1

    // Detecta años calendario presentes
    const calendarYears = new Set<number>()
    for (const day of safe) {
      const y = new Date(`${day.date}T00:00:00`).getFullYear()
      if (Number.isFinite(y)) calendarYears.add(y)
    }
    const yearsCount = Math.max(1, calendarYears.size)

    // Si es 1 año (o menos), mantenemos un resumen "normal", pero:
    // ✅ GDD SOLO Abr–Oct
    if (yearsCount <= 1) {
      const totalGDD = safe.reduce((sum, day) => {
        if (!this.isInGddWindow(day.date)) return sum
        return sum + this.clamp0(this.safeNum((day as any).gdd))
      }, 0)

      const totalChillHours = safe.reduce((sum, day) => {
        if (!this.isInChillWindow(day.date)) return sum
        return sum + this.clamp0(this.safeNum((day as any).chill_hours))
      }, 0)

      const totalFrostHours = safe.reduce((sum, day) => sum + this.clamp0(this.safeNum((day as any).frost_hours)), 0)
      const totalETO = safe.reduce((sum, day) => sum + this.clamp0(this.safeNum((day as any).eto)), 0)
      const totalETC = safe.reduce((sum, day) => sum + this.clamp0(this.safeNum((day as any).etc)), 0)
      const totalPrecipitation = safe.reduce(
        (sum, day) => sum + this.clamp0(this.safeNum((day as any).precipitation)),
        0,
      )

      const frostDays = safe.filter((day) => this.clamp0(this.safeNum((day as any).frost_hours)) > 0).length
      const avgTemperature = safe.reduce((sum, day) => sum + this.safeNum((day as any).temperature_avg), 0) / totalDays

      const deficit = Math.max(0, totalETC - totalPrecipitation)

      return {
        totalDays: safe.length,
        avgTemperature: Number.parseFloat(avgTemperature.toFixed(1)),
        totalGDD: Number.parseFloat(totalGDD.toFixed(1)),
        totalChillHours: Number.parseFloat(totalChillHours.toFixed(1)),
        totalFrostHours: Number.parseFloat(totalFrostHours.toFixed(1)),
        frostDays,
        totalETO: Number.parseFloat(totalETO.toFixed(1)),
        totalETC: Number.parseFloat(totalETC.toFixed(1)),
        totalPrecipitation: Number.parseFloat(totalPrecipitation.toFixed(1)),
        waterDeficit: Number.parseFloat(deficit.toFixed(1)),
        yearsCount,
        isAnnualized: false,
      }
    }

    // ----------------------------------------------------------
    // ✅ MULTI-AÑO: anualizar (media por año/campaña)
    // ----------------------------------------------------------

    // Agg anual calendario
    const yearAgg = new Map<
      number,
      {
        days: number
        tempSum: number
        gddSeason: number
        frostHours: number
        frostDays: number
        eto: number
        etc: number
        precip: number
      }
    >()

    const ensureYear = (y: number) => {
      const existing = yearAgg.get(y)
      if (existing) return existing
      const init = { days: 0, tempSum: 0, gddSeason: 0, frostHours: 0, frostDays: 0, eto: 0, etc: 0, precip: 0 }
      yearAgg.set(y, init)
      return init
    }

    // Agg por campaña de invierno (Nov–Feb)
    const winterAgg = new Map<number, number>() // campaignYear -> chillHoursSum

    const addWinter = (campaignYear: number, chill: number) => {
      winterAgg.set(campaignYear, (winterAgg.get(campaignYear) ?? 0) + chill)
    }

    for (const day of safe) {
      const d = new Date(`${day.date}T00:00:00`)
      const y = d.getFullYear()
      if (!Number.isFinite(y)) continue

      const a = ensureYear(y)

      const tavg = this.safeNum((day as any).temperature_avg)
      a.days += 1
      a.tempSum += tavg

      // ✅ GDD SOLO Abr–Oct (y por año calendario)
      if (this.isInGddWindow(day.date)) {
        a.gddSeason += this.clamp0(this.safeNum((day as any).gdd))
      }

      const frostH = this.clamp0(this.safeNum((day as any).frost_hours))
      a.frostHours += frostH
      if (frostH > 0) a.frostDays += 1

      a.eto += this.clamp0(this.safeNum((day as any).eto))
      a.etc += this.clamp0(this.safeNum((day as any).etc))
      a.precip += this.clamp0(this.safeNum((day as any).precipitation))

      // ✅ Chill SOLO Nov–Feb y anualizado por campaña invierno
      if (this.isInChillWindow(day.date)) {
        const campaignY = this.winterCampaignYear(day.date)
        const chill = this.clamp0(this.safeNum((day as any).chill_hours))
        addWinter(campaignY, chill)
      }
    }

    const years = [...yearAgg.keys()].sort((a, b) => a - b)
    const winterYears = [...winterAgg.keys()].sort((a, b) => a - b)

    const mean = (arr: number[]) => {
      if (!arr.length) return 0
      return arr.reduce((s, v) => s + v, 0) / arr.length
    }

    const yearlyAvgTemps = years.map((yy) => {
      const a = yearAgg.get(yy)!
      return a.days ? a.tempSum / a.days : 0
    })

    const yearlyGddSeason = years.map((yy) => yearAgg.get(yy)!.gddSeason)
    const yearlyFrostHours = years.map((yy) => yearAgg.get(yy)!.frostHours)
    const yearlyFrostDays = years.map((yy) => yearAgg.get(yy)!.frostDays)
    const yearlyETO = years.map((yy) => yearAgg.get(yy)!.eto)
    const yearlyETC = years.map((yy) => yearAgg.get(yy)!.etc)
    const yearlyPrecip = years.map((yy) => yearAgg.get(yy)!.precip)
    const yearlyDeficit = years.map((yy) => Math.max(0, yearAgg.get(yy)!.etc - yearAgg.get(yy)!.precip))

    const yearlyChill = winterYears.map((wy) => winterAgg.get(wy) ?? 0)

    const avgTemperature = mean(yearlyAvgTemps)
    const totalGDD = mean(yearlyGddSeason)
    const totalChillHours = mean(yearlyChill)
    const totalFrostHours = mean(yearlyFrostHours)
    const frostDays = mean(yearlyFrostDays)
    const totalETO = mean(yearlyETO)
    const totalETC = mean(yearlyETC)
    const totalPrecipitation = mean(yearlyPrecip)
    const waterDeficit = mean(yearlyDeficit)

    return {
      totalDays: safe.length,
      avgTemperature: Number.parseFloat(avgTemperature.toFixed(1)),
      totalGDD: Number.parseFloat(totalGDD.toFixed(1)),
      totalChillHours: Number.parseFloat(totalChillHours.toFixed(1)),
      totalFrostHours: Number.parseFloat(totalFrostHours.toFixed(1)),
      frostDays: Number.parseFloat(frostDays.toFixed(1)) as any, // (en UI lo usas como number; aquí queda ok)
      totalETO: Number.parseFloat(totalETO.toFixed(1)),
      totalETC: Number.parseFloat(totalETC.toFixed(1)),
      totalPrecipitation: Number.parseFloat(totalPrecipitation.toFixed(1)),
      waterDeficit: Number.parseFloat(waterDeficit.toFixed(1)),
      yearsCount,
      isAnnualized: true,
    }
  }

  analyzePistachioSuitability(seasonalSummary: SeasonalSummary) {
    const recommendations: string[] = []
    const warnings: string[] = []

    // Chill hours (pistachio: ~600-1500)
    if (seasonalSummary.totalChillHours < 600) {
      warnings.push("Insuficientes horas frío para una buena producción de pistacho")
    } else if (seasonalSummary.totalChillHours > 1500) {
      warnings.push("Exceso de horas frío puede retrasar la brotación")
    } else {
      recommendations.push("Horas frío adecuadas para el cultivo de pistacho")
    }

    // Heat units / GDD (✅ ahora es Abr–Oct, y anualizado si histórico)
    if (seasonalSummary.totalGDD < 1500) {
      warnings.push("Insuficientes grados día (Abr–Oct) para completar el ciclo del pistacho")
    } else if (seasonalSummary.totalGDD > 3200) {
      warnings.push("Calor acumulado alto (Abr–Oct): vigilar estrés térmico y riego en verano")
    } else {
      recommendations.push("Acumulación térmica adecuada (Abr–Oct)")
    }

    // Frost risk
    if (seasonalSummary.frostDays > 10) {
      warnings.push(`${seasonalSummary.frostDays.toFixed?.(0) ?? seasonalSummary.frostDays} días de helada pueden dañar la floración`)
    }

    // Water deficit
    if (seasonalSummary.waterDeficit > 300) {
      recommendations.push(`Déficit hídrico de ${seasonalSummary.waterDeficit}mm: requiere riego suplementario`)
    }

    // ✅ Transparencia si es histórico
    if (seasonalSummary.isAnnualized) {
      recommendations.push(`Índices anualizados sobre ${seasonalSummary.yearsCount} años/campañas`)
    }

    return {
      suitabilityScore: this.calculateSuitabilityScore(seasonalSummary),
      recommendations,
      warnings,
    }
  }

  private calculateSuitabilityScore(summary: SeasonalSummary): number {
    let score = 100

    if (summary.totalChillHours < 600 || summary.totalChillHours > 1500) score -= 30
    if (summary.totalGDD < 1500) score -= 25

    // ✅ no penalizar fuerte por "exceso de GDD"
    if (summary.totalGDD > 3400) score -= 8

    // frostDays aquí ya es anual medio si histórico
    if (summary.frostDays > 10) score -= summary.frostDays * 2

    // waterDeficit aquí ya es anual medio si histórico
    if (summary.waterDeficit > 500) score -= Math.min(25, (summary.waterDeficit - 500) / 40)

    return Math.max(0, Math.min(100, Math.round(score)))
  }

  // ----------------------------
  // Historical trends
  // ----------------------------

  calculateHistoricalTrends(data: ClimateData[]) {
    const yearlyData = this.groupDataByYear(data)
    const years = Object.keys(yearlyData).sort()

    if (years.length < 2) {
      return {
        temperatureTrend: 0,
        precipitationTrend: 0,
        chillHoursTrend: 0,
        frostDaysTrend: 0,
        yearlyAverages: {} as Record<string, SeasonalSummary>,
        totalYears: years.length,
        climateStability: { temperatureVariability: 0, precipitationVariability: 0, stabilityScore: 50 },
      }
    }

    const yearlyAverages: Record<string, SeasonalSummary> = {}
    const temperatureByYear: number[] = []
    const precipitationByYear: number[] = []
    const chillHoursByYear: number[] = []
    const frostDaysByYear: number[] = []

    years.forEach((year) => {
      const summary = this.calculateSeasonalSummary(yearlyData[year])
      yearlyAverages[year] = summary
      temperatureByYear.push(summary.avgTemperature)
      precipitationByYear.push(summary.totalPrecipitation)
      chillHoursByYear.push(summary.totalChillHours)
      frostDaysByYear.push(Number(summary.frostDays) || 0)
    })

    const climateStability = this.assessClimateStability(yearlyAverages)

    return {
      temperatureTrend: this.calculateLinearTrend(temperatureByYear),
      precipitationTrend: this.calculateLinearTrend(precipitationByYear),
      chillHoursTrend: this.calculateLinearTrend(chillHoursByYear),
      frostDaysTrend: this.calculateLinearTrend(frostDaysByYear),
      yearlyAverages,
      totalYears: years.length,
      climateStability,
    }
  }

  private groupDataByYear(data: ClimateData[]): Record<string, ClimateData[]> {
    const grouped: Record<string, ClimateData[]> = {}
    for (const day of data) {
      const year = day.date.split("-")[0]
      if (!grouped[year]) grouped[year] = []
      grouped[year].push(day)
    }
    return grouped
  }

  private calculateLinearTrend(values: number[]): number {
    const n = values.length
    if (n < 2) return 0

    const xSum = (n * (n - 1)) / 2
    const ySum = values.reduce((sum, val) => sum + val, 0)
    const xySum = values.reduce((sum, val, index) => sum + val * index, 0)
    const x2Sum = values.reduce((sum, _, index) => sum + index * index, 0)

    const denom = n * x2Sum - xSum * xSum
    if (denom === 0) return 0

    const slope = (n * xySum - xSum * ySum) / denom
    return Number.parseFloat(slope.toFixed(3))
  }

  private assessClimateStability(yearlyAverages: Record<string, SeasonalSummary>): {
    temperatureVariability: number
    precipitationVariability: number
    stabilityScore: number
  } {
    const years = Object.keys(yearlyAverages)
    if (years.length < 3) return { temperatureVariability: 0, precipitationVariability: 0, stabilityScore: 50 }

    const temperatures = years.map((y) => yearlyAverages[y].avgTemperature)
    const precipitations = years.map((y) => yearlyAverages[y].totalPrecipitation)

    const tempVariability = this.calculateCoefficientOfVariation(temperatures)
    const precipVariability = this.calculateCoefficientOfVariation(precipitations)

    const stabilityScore = Math.max(0, 100 - (tempVariability + precipVariability) * 10)

    return {
      temperatureVariability: Number.parseFloat(tempVariability.toFixed(2)),
      precipitationVariability: Number.parseFloat(precipVariability.toFixed(2)),
      stabilityScore: Number.parseFloat(stabilityScore.toFixed(1)),
    }
  }

  private calculateCoefficientOfVariation(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    if (mean === 0) return 0
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    return (Math.sqrt(variance) / mean) * 100
  }

  // ----------------------------
  // Irrigation recommendations
  // ----------------------------

  generateIrrigationRecommendations(
    historicalTrends: ReturnType<typeof this.calculateHistoricalTrends>,
    currentSummary: SeasonalSummary,
  ) {
    const recommendations: string[] = []
    const warnings: string[] = []

    if (historicalTrends.temperatureTrend > 0.1) {
      recommendations.push(
        `Tendencia al calentamiento (+${historicalTrends.temperatureTrend}°C/año): Considerar variedades más resistentes al calor`,
      )
      recommendations.push("Aumentar frecuencia de riego en verano debido al incremento de temperaturas")
    } else if (historicalTrends.temperatureTrend < -0.1) {
      recommendations.push(
        `Tendencia al enfriamiento (${historicalTrends.temperatureTrend}°C/año): Protección contra heladas tardías`,
      )
    }

    if (historicalTrends.precipitationTrend < -5) {
      warnings.push(
        `Tendencia a menor precipitación (${historicalTrends.precipitationTrend}mm/año): Planificar sistemas de riego más eficientes`,
      )
      recommendations.push("Implementar riego por goteo y mulching para conservar humedad")
    } else if (historicalTrends.precipitationTrend > 5) {
      recommendations.push(
        `Tendencia a mayor precipitación (+${historicalTrends.precipitationTrend}mm/año): Mejorar drenaje del suelo`,
      )
    }

    if (historicalTrends.chillHoursTrend < -10) {
      warnings.push(`Reducción de horas frío (${historicalTrends.chillHoursTrend} horas/año): Puede afectar la floración`)
      recommendations.push("Considerar variedades de pistacho con menores requerimientos de frío")
    }

    if (historicalTrends.climateStability.stabilityScore < 60) {
      warnings.push("Alta variabilidad climática detectada: Implementar estrategias de manejo adaptativo")
      recommendations.push("Diversificar variedades y fechas de plantación para reducir riesgos")
    }

    if (currentSummary.waterDeficit > 300) {
      const irrigationNeeds = Math.ceil(currentSummary.waterDeficit / 25)
      recommendations.push(
        `Déficit hídrico de ${currentSummary.waterDeficit}mm requiere aproximadamente ${irrigationNeeds} riegos suplementarios`,
      )
      recommendations.push("Programar riegos durante floración (abril-mayo) y desarrollo del fruto (junio-agosto)")
    }

    return {
      recommendations,
      warnings,
      irrigationSchedule: this.generateIrrigationSchedule(historicalTrends),
      waterRequirements: {
        annualNeed: currentSummary.totalETC,
        naturalSupply: currentSummary.totalPrecipitation,
        irrigationNeed: Math.max(0, currentSummary.waterDeficit),
      },
    }
  }

  private generateIrrigationSchedule(trends: ReturnType<typeof this.calculateHistoricalTrends>) {
    const schedule: Array<{ period: string; frequency: string; amount: string; notes: string }> = []

    schedule.push({
      period: "Primavera (Marzo-Mayo)",
      frequency: "Cada 10-15 días",
      amount: "25-30mm por riego",
      notes: "Crítico durante floración y cuajado del fruto",
    })

    const summerAmount = trends.temperatureTrend > 0.1 ? "35-40mm" : "30-35mm"
    schedule.push({
      period: "Verano (Junio-Agosto)",
      frequency: "Cada 7-10 días",
      amount: `${summerAmount} por riego`,
      notes: "Período de máxima demanda hídrica",
    })

    schedule.push({
      period: "Otoño (Septiembre-Octubre)",
      frequency: "Cada 15-20 días",
      amount: "20-25mm por riego",
      notes: "Reducir gradualmente hasta la cosecha",
    })

    return schedule
  }
}
