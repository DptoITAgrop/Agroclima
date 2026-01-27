import type { ClimateData } from "./types"
import { PISTACHIO_VARIETIES, type PistachioVariety } from "./pistachio-varieties"
import { ClimateCalculator } from "./climate-calculations"

export interface VarietyRecommendation {
  variety: PistachioVariety
  suitabilityScore: number
  matchingFactors: string[]
  concerns: string[]
  recommendations: string[]
  pollinizers: PistachioVariety[]
}

export interface ClimateProfile {
  // Resumen “realista” (basado en campañas + percentiles)
  avgTemperature: number
  minTemperature: number
  maxTemperature: number

  // Para scoring: valores conservadores por campaña
  totalChillHours: number // P10 de horas frío (Nov–Feb)
  totalFrostHours: number // P90 de frost_hours (Mar–Abr) sumados
  frostDays: number // P90 de días con helada (Mar–Abr)

  totalPrecipitation: number // Mediana anual (todas las fechas disponibles)
  waterDeficit: number // P90 de déficit hídrico en temporada (Mar–Oct)
  totalGDD: number // P10 de GDD (Mar–Oct)

  heatStressDays: number // P90 de días >40°C (Jun–Aug)
  extremeColdDays: number // P90 de días < -5°C (Nov–Feb)

  // Debug / transparencia para UI o logs
  campaigns?: {
    years: number[]
    chillWinterByYear: Record<number, number>
    gddSeasonByYear: Record<number, number>
    springFrostDaysByYear: Record<number, number>
    summerHeatStressDaysByYear: Record<number, number>
    winterExtremeColdDaysByYear: Record<number, number>
    waterDeficitSeasonByYear: Record<number, number>
  }
}

type CampaignAgg = {
  // Winter chill: Nov–Feb (asignado al “año de febrero”)
  winterChillHours: number
  winterExtremeColdDays: number

  // Spring frost risk: Mar–Abr
  springFrostDays: number
  springFrostHours: number

  // Growing season heat: Mar–Oct
  seasonGDD: number
  seasonPrecip: number
  seasonETC: number

  // Summer heat stress: Jun–Aug
  summerHeatStressDays: number
}

function parseISODate(s: string): Date {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date in ClimateData: ${s}`)
  return d
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const w = idx - lo
  return sorted[lo] * (1 - w) + sorted[hi] * w
}

/**
 * Define el “año de campaña” para el invierno:
 * - Nov/Dic 2023 pertenecen a campaña 2024 (porque el invierno termina en Feb 2024)
 * - Ene/Feb 2024 pertenecen a campaña 2024
 */
function winterCampaignYear(d: Date): number {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  return m >= 11 ? y + 1 : y
}

function isWinter(d: Date): boolean {
  const m = d.getMonth() + 1
  return m === 11 || m === 12 || m === 1 || m === 2
}

function isGrowingSeason(d: Date): boolean {
  const m = d.getMonth() + 1
  return m >= 3 && m <= 10
}

function isSpringFrostWindow(d: Date): boolean {
  const m = d.getMonth() + 1
  return m === 3 || m === 4
}

function isSummer(d: Date): boolean {
  const m = d.getMonth() + 1
  return m >= 6 && m <= 8
}

export class VarietyRecommendationEngine {
  private calculator = new ClimateCalculator()

  /**
   * Analiza datos climáticos y recomienda variedades de pistacho
   */
  recommendVarieties(
    climateData: ClimateData[],
    location: { latitude: number; longitude: number },
  ): VarietyRecommendation[] {
    // Seguridad mínima: sin campaña completa no hay recomendación real
    if (!climateData?.length || climateData.length < 300) {
      // (Puedes convertir esto en throw si prefieres que la API devuelva 400)
      return PISTACHIO_VARIETIES.filter((v) => v.type === "female")
        .map((v) => ({
          variety: v,
          suitabilityScore: 0,
          matchingFactors: [],
          concerns: ["Datos insuficientes: se requiere al menos 1 campaña completa (≥300 días) para recomendar variedades."],
          recommendations: ["Amplía el rango de fechas (ideal 5–10 campañas)."],
          pollinizers: [],
        }))
        .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    }

    const climateProfile = this.createClimateProfile(climateData)

    const recommendations = PISTACHIO_VARIETIES.filter((variety) => variety.type === "female")
      .map((variety) => this.evaluateVariety(variety, climateProfile, location))
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)

    return recommendations
  }

  /**
   * Crea un perfil climático “real” por campañas y ventanas agronómicas
   */
  private createClimateProfile(climateData: ClimateData[]): ClimateProfile {
    const totalDays = climateData.length

    // Estadísticos globales (solo para contexto)
    const avgTemperature = climateData.reduce((sum, day) => sum + day.temperature_avg, 0) / totalDays
    const minTemperature = Math.min(...climateData.map((day) => day.temperature_min))
    const maxTemperature = Math.max(...climateData.map((day) => day.temperature_max))

    // Agrupar por campaña
    const byYear = new Map<number, CampaignAgg>()

    const ensure = (y: number): CampaignAgg => {
      const existing = byYear.get(y)
      if (existing) return existing
      const init: CampaignAgg = {
        winterChillHours: 0,
        winterExtremeColdDays: 0,
        springFrostDays: 0,
        springFrostHours: 0,
        seasonGDD: 0,
        seasonPrecip: 0,
        seasonETC: 0,
        summerHeatStressDays: 0,
      }
      byYear.set(y, init)
      return init
    }

    for (const day of climateData) {
      const d = parseISODate(day.date)

      // Winter chill (Nov–Feb) -> campaña de Febrero
      if (isWinter(d)) {
        const y = winterCampaignYear(d)
        const agg = ensure(y)
        agg.winterChillHours += day.chill_hours || 0
        if ((day.temperature_min ?? 999) < -5) agg.winterExtremeColdDays += 1
      }

      // Growing season (Mar–Oct) -> campaña del año natural
      if (isGrowingSeason(d)) {
        const y = d.getFullYear()
        const agg = ensure(y)
        agg.seasonGDD += day.gdd || 0
        agg.seasonPrecip += day.precipitation || 0
        agg.seasonETC += day.etc || 0
      }

      // Spring frost risk (Mar–Abr)
      if (isSpringFrostWindow(d)) {
        const y = d.getFullYear()
        const agg = ensure(y)
        agg.springFrostHours += day.frost_hours || 0
        if ((day.frost_hours || 0) > 0) agg.springFrostDays += 1
      }

      // Summer heat stress (Jun–Aug)
      if (isSummer(d)) {
        const y = d.getFullYear()
        const agg = ensure(y)
        if ((day.temperature_max ?? -999) > 40) agg.summerHeatStressDays += 1
      }
    }

    const years = [...byYear.keys()].sort((a, b) => a - b)

    // Si no tenemos al menos 1 invierno y 1 temporada, bajar fiabilidad
    // (no rompemos, pero los percentiles tenderán a 0)
    const winterChill = years.map((y) => byYear.get(y)!.winterChillHours).filter((v) => v > 0)
    const seasonGDD = years.map((y) => byYear.get(y)!.seasonGDD).filter((v) => v > 0)

    // Water deficit por campaña (Mar–Oct)
    const waterDeficitSeason = years.map((y) => {
      const a = byYear.get(y)!
      return Math.max(0, a.seasonETC - a.seasonPrecip)
    })

    const springFrostDays = years.map((y) => byYear.get(y)!.springFrostDays)
    const springFrostHours = years.map((y) => byYear.get(y)!.springFrostHours)
    const summerHeatStressDays = years.map((y) => byYear.get(y)!.summerHeatStressDays)
    const winterExtremeColdDays = years.map((y) => byYear.get(y)!.winterExtremeColdDays)

    // Percentiles “año malo”
    const chillP10 = percentile(winterChill, 0.10)
    const gddP10 = percentile(seasonGDD, 0.10)
    const frostDaysP90 = percentile(springFrostDays, 0.90)
    const frostHoursP90 = percentile(springFrostHours, 0.90)
    const heatStressP90 = percentile(summerHeatStressDays, 0.90)
    const extremeColdP90 = percentile(winterExtremeColdDays, 0.90)
    const waterDeficitP90 = percentile(waterDeficitSeason, 0.90)

    // Precipitación anual “informativa” (mediana)
    const annualPrecip = climateData.reduce((sum, day) => sum + (day.precipitation || 0), 0)
    // Si tienes varios años, esto es “precip total del rango”; la mostramos como mediana anual estimada:
    const approxYears = Math.max(1, new Set(climateData.map((d) => parseISODate(d.date).getFullYear())).size)
    const medianAnnualPrecip = annualPrecip / approxYears

    const campaigns: ClimateProfile["campaigns"] = {
      years,
      chillWinterByYear: Object.fromEntries(years.map((y) => [y, Math.round(byYear.get(y)!.winterChillHours)])),
      gddSeasonByYear: Object.fromEntries(years.map((y) => [y, Math.round(byYear.get(y)!.seasonGDD)])),
      springFrostDaysByYear: Object.fromEntries(years.map((y) => [y, byYear.get(y)!.springFrostDays])),
      summerHeatStressDaysByYear: Object.fromEntries(years.map((y) => [y, byYear.get(y)!.summerHeatStressDays])),
      winterExtremeColdDaysByYear: Object.fromEntries(years.map((y) => [y, byYear.get(y)!.winterExtremeColdDays])),
      waterDeficitSeasonByYear: Object.fromEntries(
        years.map((y) => [y, Math.round(Math.max(0, byYear.get(y)!.seasonETC - byYear.get(y)!.seasonPrecip))]),
      ),
    }

    return {
      avgTemperature: Number.parseFloat(avgTemperature.toFixed(1)),
      minTemperature: Number.parseFloat(minTemperature.toFixed(1)),
      maxTemperature: Number.parseFloat(maxTemperature.toFixed(1)),

      // ✅ “totales” ya NO son totales del rango, son métricas anuales conservadoras por campaña
      totalChillHours: Math.round(chillP10),
      totalGDD: Math.round(gddP10),

      frostDays: Math.round(frostDaysP90),
      totalFrostHours: Math.round(frostHoursP90),

      totalPrecipitation: Math.round(medianAnnualPrecip),
      waterDeficit: Math.round(waterDeficitP90),

      heatStressDays: Math.round(heatStressP90),
      extremeColdDays: Math.round(extremeColdP90),

      campaigns,
    }
  }

  /**
   * Evalúa una variedad específica contra el perfil climático
   */
  private evaluateVariety(
    variety: PistachioVariety,
    climate: ClimateProfile,
    location: { latitude: number; longitude: number },
  ): VarietyRecommendation {
    let score = 100
    const matchingFactors: string[] = []
    const concerns: string[] = []
    const recommendations: string[] = []

    // Horas frío (25%)
    const chillScore = this.evaluateChillHours(variety, climate, matchingFactors, concerns)
    score = score * 0.75 + chillScore * 0.25

    // Calor extremo (20%)
    const heatScore = this.evaluateHeatTolerance(variety, climate, matchingFactors, concerns)
    score = score * 0.8 + heatScore * 0.2

    // Frío extremo (15%)
    const coldScore = this.evaluateColdTolerance(variety, climate, matchingFactors, concerns)
    score = score * 0.85 + coldScore * 0.15

    // Agua (20%)
    const waterScore = this.evaluateWaterRequirements(variety, climate, matchingFactors, concerns)
    score = score * 0.8 + waterScore * 0.2

    // Acumulación térmica (10%)
    const thermalScore = this.evaluateThermalAccumulation(variety, climate, matchingFactors, concerns)
    score = score * 0.9 + thermalScore * 0.1

    // Riesgos (10%) (heladas floración + estrés térmico)
    const riskScore = this.evaluateClimateRisks(variety, climate, matchingFactors, concerns)
    score = score * 0.9 + riskScore * 0.1

    this.generateSpecificRecommendations(variety, climate, recommendations)

    // Polinizadores compatibles (pero ahora deberías VALIDAR que cumplen frío también)
    const pollinizers = variety.pollinizers
      .map((id) => PISTACHIO_VARIETIES.find((v) => v.id === id))
      .filter(Boolean) as PistachioVariety[]

    // ✅ Validación simple de polinizadores: si ninguno cumple frío mínimo, penaliza y avisa
    if (pollinizers.length) {
      const viablePollinizers = pollinizers.filter((p) => climate.totalChillHours >= p.chillHoursMin)
      if (!viablePollinizers.length) {
        concerns.push("Polinización en riesgo: los polinizadores sugeridos no alcanzan el mínimo de horas frío en un año desfavorable.")
        score = score - 15
      }
    }

    return {
      variety,
      suitabilityScore: Math.max(0, Math.min(100, Number.parseFloat(score.toFixed(1)))),
      matchingFactors,
      concerns,
      recommendations,
      pollinizers,
    }
  }

  private evaluateChillHours(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    // ✅ Ya es “anual conservador” (P10 invierno)
    const annualChillHours = climate.totalChillHours

    if (annualChillHours >= variety.chillHoursMin && annualChillHours <= variety.chillHoursMax) {
      matching.push(`Horas frío adecuadas (P10 invierno: ${annualChillHours.toFixed(0)} h)`)
      return 100
    } else if (annualChillHours < variety.chillHoursMin) {
      const deficit = variety.chillHoursMin - annualChillHours
      concerns.push(`Déficit de horas frío (año desfavorable): ${deficit.toFixed(0)} h por debajo del mínimo`)
      return Math.max(0, 100 - (deficit / variety.chillHoursMin) * 100)
    } else {
      const excess = annualChillHours - variety.chillHoursMax
      concerns.push(`Exceso de horas frío: ${excess.toFixed(0)} h por encima del máximo`)
      return Math.max(50, 100 - (excess / variety.chillHoursMax) * 50)
    }
  }

  private evaluateHeatTolerance(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    if (climate.maxTemperature <= variety.maxSummerTemp) {
      matching.push(`Buena tolerancia al calor (máx. registrada ${climate.maxTemperature}°C)`)
      return 100
    } else {
      const excess = climate.maxTemperature - variety.maxSummerTemp
      if (excess <= 3) {
        concerns.push(`Temperaturas ocasionalmente altas (${climate.maxTemperature}°C)`)
        return 80
      } else {
        concerns.push(`Temperaturas excesivas (${climate.maxTemperature}°C vs máx. ${variety.maxSummerTemp}°C)`)
        return Math.max(20, 100 - excess * 10)
      }
    }
  }

  private evaluateColdTolerance(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    if (climate.minTemperature >= variety.minWinterTemp) {
      matching.push(`Buena tolerancia al frío (mín. registrada ${climate.minTemperature}°C)`)
      return 100
    } else {
      const deficit = variety.minWinterTemp - climate.minTemperature
      if (deficit <= 2) {
        concerns.push(`Heladas ocasionales severas (${climate.minTemperature}°C)`)
        return 70
      } else {
        concerns.push(`Temperaturas demasiado bajas (${climate.minTemperature}°C vs mín. ${variety.minWinterTemp}°C)`)
        return Math.max(10, 100 - deficit * 15)
      }
    }
  }

  private evaluateWaterRequirements(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    // ✅ Ya es P90 del déficit en Mar–Oct (año malo)
    const waterNeedRatio = (climate.waterDeficit || 0) / variety.annualWaterNeed

    if (waterNeedRatio <= 0.3) {
      matching.push("Requerimientos hídricos bien cubiertos (déficit bajo en temporada)")
      return 100
    } else if (waterNeedRatio <= 0.6) {
      concerns.push(`Déficit hídrico moderado en temporada (P90: ${climate.waterDeficit} mm)`)
      return 80
    } else {
      concerns.push(`Déficit hídrico significativo (P90: ${climate.waterDeficit} mm vs ${variety.annualWaterNeed} mm)`)
      return Math.max(30, 100 - waterNeedRatio * 50)
    }
  }

  private evaluateThermalAccumulation(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    // ✅ Ya es “anual conservador” (P10 Mar–Oct)
    const annualGDD = climate.totalGDD

    if (annualGDD >= 1500 && annualGDD <= 3000) {
      matching.push(`Acumulación térmica adecuada (P10 temporada: ${annualGDD.toFixed(0)} GDD)`)
      return 100
    } else if (annualGDD < 1500) {
      concerns.push(`Insuficiente acumulación térmica (año desfavorable): ${annualGDD.toFixed(0)} GDD`)
      return Math.max(20, (annualGDD / 1500) * 100)
    } else {
      concerns.push(`Exceso de calor acumulado: ${annualGDD.toFixed(0)} GDD`)
      return Math.max(60, 100 - ((annualGDD - 3000) / 1000) * 20)
    }
  }

  private evaluateClimateRisks(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    let riskScore = 100

    // ✅ Heladas en floración (Mar–Abr) P90
    if (climate.frostDays > 15) {
      concerns.push(`Alto riesgo de heladas en floración (P90: ${climate.frostDays} días Mar–Abr)`)
      riskScore -= 30
    } else if (climate.frostDays > 5) {
      concerns.push(`Riesgo moderado de heladas en floración (P90: ${climate.frostDays} días Mar–Abr)`)
      riskScore -= 15
    } else {
      matching.push(`Riesgo bajo de heladas en floración (P90: ${climate.frostDays} días Mar–Abr)`)
    }

    // ✅ Estrés térmico P90 (Jun–Ago)
    if (climate.heatStressDays > 30) {
      concerns.push(`Alto estrés térmico (P90: ${climate.heatStressDays} días >40°C en verano)`)
      riskScore -= 25
    } else if (climate.heatStressDays > 10) {
      concerns.push(`Estrés térmico moderado (P90: ${climate.heatStressDays} días >40°C en verano)`)
      riskScore -= 10
    } else {
      matching.push(`Estrés térmico bajo (P90: ${climate.heatStressDays} días >40°C en verano)`)
    }

    return Math.max(0, riskScore)
  }

  private generateSpecificRecommendations(
    variety: PistachioVariety,
    climate: ClimateProfile,
    recommendations: string[],
  ): void {
    if (climate.waterDeficit > variety.annualWaterNeed * 0.4) {
      recommendations.push("Implementar sistema de riego por goteo de alta eficiencia")
      recommendations.push("Programar riegos durante períodos críticos: " + variety.criticalWaterPeriods.join(", "))
    }

    // Ojo: ahora frostDays es Mar–Abr P90 (mucho más real)
    if (climate.frostDays > 5) {
      recommendations.push("Instalar sistema de protección contra heladas (aspersores, calentadores)")
      recommendations.push("Evitar plantación en zonas bajas propensas a heladas")
    }

    if (climate.heatStressDays > 15) {
      recommendations.push("Considerar sombreado parcial durante verano")
      recommendations.push("Aumentar frecuencia de riego en días de calor extremo")
    }

    if (variety.pollinizers.length > 0) {
      recommendations.push(`Plantar polinizadores: ${variety.pollinizers.join(", ")} (ratio 1:8-10)`)
    }

    if (variety.id === "kerman" && climate.minTemperature < -8) {
      recommendations.push("Considerar portainjertos resistentes al frío")
    }

    // Ajuste: ahora chillHours es P10 invierno -> condición más real
    if (variety.id === "sirora" && climate.totalChillHours < 600) {
      recommendations.push("Variedad ideal para zonas con pocas horas frío (año desfavorable)")
    }
  }

  /**
   * Genera reporte detallado de recomendaciones
   */
  generateDetailedReport(
    recommendations: VarietyRecommendation[],
    climateProfile: ClimateProfile,
    location: { latitude: number; longitude: number },
  ) {
    const topRecommendations = recommendations.slice(0, 3)
    const suitableVarieties = recommendations.filter((r) => r.suitabilityScore >= 70)
    const marginalVarieties = recommendations.filter((r) => r.suitabilityScore >= 50 && r.suitabilityScore < 70)
    const unsuitableVarieties = recommendations.filter((r) => r.suitabilityScore < 50)

    return {
      summary: {
        totalVarietiesEvaluated: recommendations.length,
        suitableCount: suitableVarieties.length,
        marginalCount: marginalVarieties.length,
        unsuitableCount: unsuitableVarieties.length,
        bestVariety: topRecommendations[0]?.variety.name || "Ninguna",
        bestScore: topRecommendations[0]?.suitabilityScore || 0,
      },
      climateProfile,
      topRecommendations,
      suitableVarieties,
      marginalVarieties,
      generalRecommendations: this.generateGeneralRecommendations(climateProfile, location),
      riskAssessment: this.assessOverallRisk(climateProfile),
      plantingStrategy: this.generatePlantingStrategy(topRecommendations, climateProfile),
    }
  }

  private generateGeneralRecommendations(
    climate: ClimateProfile,
    location: { latitude: number; longitude: number },
  ): string[] {
    const recommendations: string[] = []

    if (climate.waterDeficit > 400) {
      recommendations.push("Priorizar eficiencia hídrica: riego por goteo, mulching, variedades resistentes a sequía")
    }

    if (climate.frostDays > 10) {
      recommendations.push("Seleccionar sitios con buen drenaje de aire frío y considerar protección activa")
    }

    if (climate.heatStressDays > 20) {
      recommendations.push("Implementar estrategias de mitigación del calor: sombreado, riego de enfriamiento")
    }

    if (climate.totalChillHours < 800) {
      recommendations.push("Priorizar variedades de bajo requerimiento de frío como Sirora o Larnaka")
    }

    if (Math.abs(location.latitude) > 40) {
      recommendations.push("Zona de latitud alta: priorizar variedades resistentes al frío")
    } else if (Math.abs(location.latitude) < 30) {
      recommendations.push("Zona tropical/subtropical: seleccionar variedades de bajo requerimiento de frío")
    }

    return recommendations
  }

  private assessOverallRisk(climate: ClimateProfile): {
    level: "Bajo" | "Moderado" | "Alto" | "Muy Alto"
    factors: string[]
    mitigation: string[]
  } {
    let riskScore = 0
    const factors: string[] = []
    const mitigation: string[] = []

    if (climate.frostDays > 15) {
      riskScore += 25
      factors.push("Alto riesgo de heladas en floración (Mar–Abr)")
      mitigation.push("Sistema de protección contra heladas")
    }

    if (climate.heatStressDays > 25) {
      riskScore += 20
      factors.push("Estrés térmico frecuente (verano)")
      mitigation.push("Sombreado y riego de enfriamiento")
    }

    if (climate.waterDeficit > 500) {
      riskScore += 20
      factors.push("Alto déficit hídrico en temporada (Mar–Oct)")
      mitigation.push("Sistema de riego eficiente")
    }

    if (climate.extremeColdDays > 5) {
      riskScore += 15
      factors.push("Riesgo de frío extremo en invierno (Nov–Feb)")
      mitigation.push("Selección de portainjertos resistentes")
    }

    let level: "Bajo" | "Moderado" | "Alto" | "Muy Alto"
    if (riskScore <= 20) level = "Bajo"
    else if (riskScore <= 40) level = "Moderado"
    else if (riskScore <= 60) level = "Alto"
    else level = "Muy Alto"

    return { level, factors, mitigation }
  }

  private generatePlantingStrategy(
    topRecommendations: VarietyRecommendation[],
    climate: ClimateProfile,
  ): {
    primaryVariety: string
    pollinizers: string[]
    plantingRatio: string
    plantingDensity: string
    expectedProduction: string
    timeline: string[]
  } {
    const primary = topRecommendations[0]

    if (!primary) {
      return {
        primaryVariety: "No recomendada",
        pollinizers: [],
        plantingRatio: "N/A",
        plantingDensity: "N/A",
        expectedProduction: "N/A",
        timeline: ["Condiciones climáticas no adecuadas para pistacho"],
      }
    }

    return {
      primaryVariety: primary.variety.name,
      pollinizers: primary.pollinizers.map((p) => p.name),
      plantingRatio: "8-10 hembras : 1-2 machos",
      plantingDensity: "200-250 árboles/hectárea (6x8m o 7x7m)",
      expectedProduction: `Primera cosecha: año ${primary.variety.productionStart}, Producción plena: año ${primary.variety.peakProduction}`,
      timeline: [
        `Año 1-${primary.variety.productionStart - 1}: Establecimiento y crecimiento vegetativo`,
        `Año ${primary.variety.productionStart}-${primary.variety.peakProduction - 1}: Inicio de producción (0.5-2 kg/árbol)`,
        `Año ${primary.variety.peakProduction}+: Producción plena (3-8 kg/árbol)`,
        `Vida productiva: ${primary.variety.lifespan} años`,
      ],
    }
  }
}
