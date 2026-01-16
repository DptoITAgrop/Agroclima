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
  avgTemperature: number
  minTemperature: number
  maxTemperature: number
  totalChillHours: number
  totalFrostHours: number
  frostDays: number
  totalPrecipitation: number
  waterDeficit: number
  totalGDD: number
  heatStressDays: number // días > 40°C
  extremeColdDays: number // días < -5°C
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
    // Crear perfil climático
    const climateProfile = this.createClimateProfile(climateData)

    // Evaluar cada variedad
    const recommendations = PISTACHIO_VARIETIES.filter((variety) => variety.type === "female") // Solo variedades productoras
      .map((variety) => this.evaluateVariety(variety, climateProfile, location))
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore)

    return recommendations
  }

  /**
   * Crea un perfil climático a partir de los datos históricos
   */
  private createClimateProfile(climateData: ClimateData[]): ClimateProfile {
    const totalDays = climateData.length

    const avgTemperature = climateData.reduce((sum, day) => sum + day.temperature_avg, 0) / totalDays
    const minTemperature = Math.min(...climateData.map((day) => day.temperature_min))
    const maxTemperature = Math.max(...climateData.map((day) => day.temperature_max))

    const totalChillHours = climateData.reduce((sum, day) => sum + day.chill_hours, 0)
    const totalFrostHours = climateData.reduce((sum, day) => sum + day.frost_hours, 0)
    const frostDays = climateData.filter((day) => day.frost_hours > 0).length

    const totalPrecipitation = climateData.reduce((sum, day) => sum + day.precipitation, 0)
    const totalETC = climateData.reduce((sum, day) => sum + day.etc, 0)
    const waterDeficit = Math.max(0, totalETC - totalPrecipitation)

    const totalGDD = climateData.reduce((sum, day) => sum + day.gdd, 0)

    const heatStressDays = climateData.filter((day) => day.temperature_max > 40).length
    const extremeColdDays = climateData.filter((day) => day.temperature_min < -5).length

    return {
      avgTemperature: Number.parseFloat(avgTemperature.toFixed(1)),
      minTemperature: Number.parseFloat(minTemperature.toFixed(1)),
      maxTemperature: Number.parseFloat(maxTemperature.toFixed(1)),
      totalChillHours: Number.parseFloat(totalChillHours.toFixed(0)),
      totalFrostHours: Number.parseFloat(totalFrostHours.toFixed(0)),
      frostDays,
      totalPrecipitation: Number.parseFloat(totalPrecipitation.toFixed(0)),
      waterDeficit: Number.parseFloat(waterDeficit.toFixed(0)),
      totalGDD: Number.parseFloat(totalGDD.toFixed(0)),
      heatStressDays,
      extremeColdDays,
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

    // Evaluación de horas frío (peso: 25%)
    const chillScore = this.evaluateChillHours(variety, climate, matchingFactors, concerns)
    score = score * 0.75 + chillScore * 0.25

    // Evaluación de tolerancia al calor (peso: 20%)
    const heatScore = this.evaluateHeatTolerance(variety, climate, matchingFactors, concerns)
    score = score * 0.8 + heatScore * 0.2

    // Evaluación de tolerancia al frío (peso: 15%)
    const coldScore = this.evaluateColdTolerance(variety, climate, matchingFactors, concerns)
    score = score * 0.85 + coldScore * 0.15

    // Evaluación de requerimientos hídricos (peso: 20%)
    const waterScore = this.evaluateWaterRequirements(variety, climate, matchingFactors, concerns)
    score = score * 0.8 + waterScore * 0.2

    // Evaluación de acumulación térmica (peso: 10%)
    const thermalScore = this.evaluateThermalAccumulation(variety, climate, matchingFactors, concerns)
    score = score * 0.9 + thermalScore * 0.1

    // Evaluación de riesgos climáticos (peso: 10%)
    const riskScore = this.evaluateClimateRisks(variety, climate, matchingFactors, concerns)
    score = score * 0.9 + riskScore * 0.1

    // Generar recomendaciones específicas
    this.generateSpecificRecommendations(variety, climate, recommendations)

    // Obtener polinizadores compatibles
    const pollinizers = variety.pollinizers
      .map((id) => PISTACHIO_VARIETIES.find((v) => v.id === id))
      .filter(Boolean) as PistachioVariety[]

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
    const annualChillHours = climate.totalChillHours / (climate.totalChillHours > 3000 ? 20 : 1) // Ajuste para datos de 20 años

    if (annualChillHours >= variety.chillHoursMin && annualChillHours <= variety.chillHoursMax) {
      matching.push(`Horas frío óptimas (${annualChillHours.toFixed(0)} horas anuales)`)
      return 100
    } else if (annualChillHours < variety.chillHoursMin) {
      const deficit = variety.chillHoursMin - annualChillHours
      concerns.push(`Déficit de horas frío: ${deficit.toFixed(0)} horas por debajo del mínimo`)
      return Math.max(0, 100 - (deficit / variety.chillHoursMin) * 100)
    } else {
      const excess = annualChillHours - variety.chillHoursMax
      concerns.push(`Exceso de horas frío: ${excess.toFixed(0)} horas por encima del máximo`)
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
      matching.push(`Buena tolerancia al calor (máx. ${climate.maxTemperature}°C)`)
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
      matching.push(`Buena tolerancia al frío (mín. ${climate.minTemperature}°C)`)
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
    const waterNeedRatio = climate.waterDeficit / variety.annualWaterNeed

    if (waterNeedRatio <= 0.3) {
      matching.push(`Requerimientos hídricos bien cubiertos`)
      return 100
    } else if (waterNeedRatio <= 0.6) {
      concerns.push(`Déficit hídrico moderado (${climate.waterDeficit}mm)`)
      return 80
    } else {
      concerns.push(
        `Déficit hídrico significativo (${climate.waterDeficit}mm vs ${variety.annualWaterNeed}mm necesarios)`,
      )
      return Math.max(30, 100 - waterNeedRatio * 50)
    }
  }

  private evaluateThermalAccumulation(
    variety: PistachioVariety,
    climate: ClimateProfile,
    matching: string[],
    concerns: string[],
  ): number {
    const annualGDD = climate.totalGDD / (climate.totalGDD > 10000 ? 20 : 1) // Ajuste para datos de 20 años

    if (annualGDD >= 1500 && annualGDD <= 3000) {
      matching.push(`Acumulación térmica adecuada (${annualGDD.toFixed(0)} GDD)`)
      return 100
    } else if (annualGDD < 1500) {
      concerns.push(`Insuficiente acumulación térmica (${annualGDD.toFixed(0)} GDD)`)
      return Math.max(20, (annualGDD / 1500) * 100)
    } else {
      concerns.push(`Exceso de calor acumulado (${annualGDD.toFixed(0)} GDD)`)
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

    // Riesgo de heladas durante floración
    if (climate.frostDays > 15) {
      concerns.push(`Alto riesgo de heladas (${climate.frostDays} días con heladas)`)
      riskScore -= 30
    } else if (climate.frostDays > 5) {
      concerns.push(`Riesgo moderado de heladas (${climate.frostDays} días)`)
      riskScore -= 15
    }

    // Riesgo de estrés térmico
    if (climate.heatStressDays > 30) {
      concerns.push(`Alto estrés térmico (${climate.heatStressDays} días >40°C)`)
      riskScore -= 25
    } else if (climate.heatStressDays > 10) {
      concerns.push(`Estrés térmico moderado (${climate.heatStressDays} días >40°C)`)
      riskScore -= 10
    }

    return Math.max(0, riskScore)
  }

  private generateSpecificRecommendations(
    variety: PistachioVariety,
    climate: ClimateProfile,
    recommendations: string[],
  ): void {
    // Recomendaciones de riego
    if (climate.waterDeficit > variety.annualWaterNeed * 0.4) {
      recommendations.push("Implementar sistema de riego por goteo de alta eficiencia")
      recommendations.push("Programar riegos durante períodos críticos: " + variety.criticalWaterPeriods.join(", "))
    }

    // Recomendaciones de protección
    if (climate.frostDays > 5) {
      recommendations.push("Instalar sistema de protección contra heladas (aspersores, calentadores)")
      recommendations.push("Evitar plantación en zonas bajas propensas a heladas")
    }

    // Recomendaciones de manejo
    if (climate.heatStressDays > 15) {
      recommendations.push("Considerar sombreado parcial durante verano")
      recommendations.push("Aumentar frecuencia de riego en días de calor extremo")
    }

    // Recomendaciones de polinización
    if (variety.pollinizers.length > 0) {
      recommendations.push(`Plantar polinizadores: ${variety.pollinizers.join(", ")} (ratio 1:8-10)`)
    }

    // Recomendaciones específicas por variedad
    if (variety.id === "kerman" && climate.minTemperature < -8) {
      recommendations.push("Considerar portainjertos resistentes al frío")
    }

    if (variety.id === "sirora" && climate.totalChillHours < 600) {
      recommendations.push("Variedad ideal para zonas con pocas horas frío")
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

    // Recomendaciones generales basadas en el clima
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

    // Recomendaciones por latitud
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

    // Evaluar factores de riesgo
    if (climate.frostDays > 15) {
      riskScore += 25
      factors.push("Alto riesgo de heladas")
      mitigation.push("Sistema de protección contra heladas")
    }

    if (climate.heatStressDays > 25) {
      riskScore += 20
      factors.push("Estrés térmico frecuente")
      mitigation.push("Sombreado y riego de enfriamiento")
    }

    if (climate.waterDeficit > 500) {
      riskScore += 20
      factors.push("Alto déficit hídrico")
      mitigation.push("Sistema de riego eficiente")
    }

    if (climate.extremeColdDays > 5) {
      riskScore += 15
      factors.push("Temperaturas extremadamente bajas")
      mitigation.push("Selección de portainjertos resistentes")
    }

    // Determinar nivel de riesgo
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
