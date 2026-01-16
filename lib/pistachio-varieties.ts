export interface PistachioVariety {
  id: string
  name: string
  commonName: string
  origin: string
  type: "female" | "male" | "pollinizer"

  // Requerimientos climáticos
  chillHoursMin: number
  chillHoursMax: number
  heatTolerance: number // 1-10 scale
  droughtTolerance: number // 1-10 scale
  frostTolerance: number // 1-10 scale

  // Temperaturas críticas
  minWinterTemp: number // °C
  maxSummerTemp: number // °C
  optimalTempRange: [number, number] // [min, max] °C

  // Requerimientos de agua
  annualWaterNeed: number // mm
  criticalWaterPeriods: string[]

  // Características agronómicas
  harvestPeriod: { start: number; end: number } // día del año
  productionStart: number // años hasta primera producción
  peakProduction: number // años hasta producción máxima
  lifespan: number // años de vida productiva

  // Compatibilidad
  pollinizers: string[] // IDs de polinizadores compatibles

  // Características del fruto
  nutSize: "small" | "medium" | "large"
  nutWeight: number // gramos
  kernelPercentage: number // %

  // Resistencias
  diseaseResistance: {
    verticillium: number // 1-10
    botryosphaeria: number // 1-10
    alternaria: number // 1-10
  }

  // Descripción y notas
  description: string
  advantages: string[]
  disadvantages: string[]
  recommendedRegions: string[]
}

export const PISTACHIO_VARIETIES: PistachioVariety[] = [
  {
    id: "kerman",
    name: "Kerman",
    commonName: "Kerman",
    origin: "Irán",
    type: "female",
    chillHoursMin: 800,
    chillHoursMax: 1200,
    heatTolerance: 8,
    droughtTolerance: 9,
    frostTolerance: 6,
    minWinterTemp: -12,
    maxSummerTemp: 45,
    optimalTempRange: [15, 35],
    annualWaterNeed: 800,
    criticalWaterPeriods: ["Floración (Abril)", "Desarrollo fruto (Junio-Agosto)"],
    harvestPeriod: { start: 260, end: 280 },
    productionStart: 5,
    peakProduction: 10,
    lifespan: 80,
    pollinizers: ["peters", "randy"],
    nutSize: "large",
    nutWeight: 1.2,
    kernelPercentage: 56,
    diseaseResistance: {
      verticillium: 7,
      botryosphaeria: 6,
      alternaria: 8,
    },
    description: "Variedad principal comercial, fruto grande y alta calidad",
    advantages: [
      "Alto rendimiento comercial",
      "Fruto grande y atractivo",
      "Excelente resistencia a sequía",
      "Buena vida de almacenamiento",
    ],
    disadvantages: ["Susceptible a heladas tardías", "Requiere polinizador específico", "Sensible a exceso de humedad"],
    recommendedRegions: ["Mediterráneo", "California", "Australia", "España"],
  },
  {
    id: "peters",
    name: "Peters",
    commonName: "Peters",
    origin: "Estados Unidos",
    type: "male",
    chillHoursMin: 700,
    chillHoursMax: 1100,
    heatTolerance: 8,
    droughtTolerance: 8,
    frostTolerance: 7,
    minWinterTemp: -10,
    maxSummerTemp: 43,
    optimalTempRange: [12, 33],
    annualWaterNeed: 700,
    criticalWaterPeriods: ["Floración (Marzo-Abril)"],
    harvestPeriod: { start: 0, end: 0 }, // No produce fruto
    productionStart: 3,
    peakProduction: 6,
    lifespan: 80,
    pollinizers: [],
    nutSize: "medium",
    nutWeight: 0,
    kernelPercentage: 0,
    diseaseResistance: {
      verticillium: 8,
      botryosphaeria: 7,
      alternaria: 8,
    },
    description: "Polinizador principal para Kerman, floración sincronizada",
    advantages: [
      "Excelente polinizador",
      "Floración sincronizada con Kerman",
      "Resistente a enfermedades",
      "Adaptable a diferentes climas",
    ],
    disadvantages: ["No produce fruto comercial", "Requiere espacio sin retorno económico directo"],
    recommendedRegions: ["Mediterráneo", "California", "Australia", "España"],
  },
  {
    id: "sirora",
    name: "Sirora",
    commonName: "Sirora",
    origin: "Australia",
    type: "female",
    chillHoursMin: 600,
    chillHoursMax: 1000,
    heatTolerance: 9,
    droughtTolerance: 8,
    frostTolerance: 5,
    minWinterTemp: -8,
    maxSummerTemp: 48,
    optimalTempRange: [18, 38],
    annualWaterNeed: 750,
    criticalWaterPeriods: ["Floración (Abril)", "Llenado fruto (Julio-Agosto)"],
    harvestPeriod: { start: 250, end: 270 },
    productionStart: 4,
    peakProduction: 8,
    lifespan: 75,
    pollinizers: ["peters", "randy"],
    nutSize: "medium",
    nutWeight: 1.0,
    kernelPercentage: 58,
    diseaseResistance: {
      verticillium: 6,
      botryosphaeria: 8,
      alternaria: 7,
    },
    description: "Variedad australiana adaptada a climas cálidos",
    advantages: [
      "Excelente tolerancia al calor",
      "Menor requerimiento de horas frío",
      "Cosecha temprana",
      "Buena resistencia a Botryosphaeria",
    ],
    disadvantages: ["Menor tolerancia a heladas", "Fruto más pequeño que Kerman", "Menor vida de almacenamiento"],
    recommendedRegions: ["Australia", "Zonas cálidas del Mediterráneo", "California Sur"],
  },
  {
    id: "larnaka",
    name: "Larnaka",
    commonName: "Larnaka",
    origin: "Chipre",
    type: "female",
    chillHoursMin: 500,
    chillHoursMax: 900,
    heatTolerance: 9,
    droughtTolerance: 9,
    frostTolerance: 4,
    minWinterTemp: -5,
    maxSummerTemp: 50,
    optimalTempRange: [20, 40],
    annualWaterNeed: 650,
    criticalWaterPeriods: ["Floración (Abril-Mayo)", "Desarrollo inicial (Junio)"],
    harvestPeriod: { start: 245, end: 265 },
    productionStart: 4,
    peakProduction: 9,
    lifespan: 70,
    pollinizers: ["peters", "c-special"],
    nutSize: "medium",
    nutWeight: 0.9,
    kernelPercentage: 54,
    diseaseResistance: {
      verticillium: 5,
      botryosphaeria: 7,
      alternaria: 6,
    },
    description: "Variedad mediterránea para climas muy cálidos y secos",
    advantages: [
      "Muy bajo requerimiento de frío",
      "Extrema tolerancia al calor y sequía",
      "Adaptada a climas áridos",
      "Cosecha muy temprana",
    ],
    disadvantages: ["Muy sensible a heladas", "Menor tamaño de fruto", "Susceptible a Verticillium"],
    recommendedRegions: ["Chipre", "Sur de España", "Norte de África", "Zonas áridas"],
  },
  {
    id: "aegina",
    name: "Aegina",
    commonName: "Aegina",
    origin: "Grecia",
    type: "female",
    chillHoursMin: 700,
    chillHoursMax: 1100,
    heatTolerance: 7,
    droughtTolerance: 8,
    frostTolerance: 7,
    minWinterTemp: -10,
    maxSummerTemp: 42,
    optimalTempRange: [14, 32],
    annualWaterNeed: 750,
    criticalWaterPeriods: ["Floración (Abril)", "Desarrollo fruto (Junio-Julio)"],
    harvestPeriod: { start: 265, end: 285 },
    productionStart: 5,
    peakProduction: 12,
    lifespan: 85,
    pollinizers: ["peters", "male-aegina"],
    nutSize: "small",
    nutWeight: 0.7,
    kernelPercentage: 60,
    diseaseResistance: {
      verticillium: 8,
      botryosphaeria: 6,
      alternaria: 9,
    },
    description: "Variedad griega tradicional, fruto pequeño pero muy sabroso",
    advantages: [
      "Sabor excepcional",
      "Alto porcentaje de almendra",
      "Muy resistente a enfermedades",
      "Larga vida productiva",
    ],
    disadvantages: ["Fruto muy pequeño", "Menor rendimiento por árbol", "Cosecha tardía"],
    recommendedRegions: ["Grecia", "Islas mediterráneas", "Zonas costeras"],
  },
  {
    id: "randy",
    name: "Randy",
    commonName: "Randy",
    origin: "Estados Unidos",
    type: "male",
    chillHoursMin: 750,
    chillHoursMax: 1150,
    heatTolerance: 8,
    droughtTolerance: 8,
    frostTolerance: 8,
    minWinterTemp: -12,
    maxSummerTemp: 44,
    optimalTempRange: [13, 34],
    annualWaterNeed: 700,
    criticalWaterPeriods: ["Floración (Marzo-Abril)"],
    harvestPeriod: { start: 0, end: 0 },
    productionStart: 3,
    peakProduction: 6,
    lifespan: 80,
    pollinizers: [],
    nutSize: "medium",
    nutWeight: 0,
    kernelPercentage: 0,
    diseaseResistance: {
      verticillium: 9,
      botryosphaeria: 8,
      alternaria: 8,
    },
    description: "Polinizador alternativo, floración extendida",
    advantages: [
      "Floración prolongada",
      "Muy resistente a enfermedades",
      "Buena tolerancia a heladas",
      "Compatible con múltiples variedades",
    ],
    disadvantages: ["No produce fruto comercial", "Floración a veces demasiado temprana"],
    recommendedRegions: ["California", "Australia", "España", "Turquía"],
  },
]

export function getVarietyById(id: string): PistachioVariety | undefined {
  return PISTACHIO_VARIETIES.find((variety) => variety.id === id)
}

export function getFemaleVarieties(): PistachioVariety[] {
  return PISTACHIO_VARIETIES.filter((variety) => variety.type === "female")
}

export function getMaleVarieties(): PistachioVariety[] {
  return PISTACHIO_VARIETIES.filter((variety) => variety.type === "male")
}

export function getPollinizersForVariety(varietyId: string): PistachioVariety[] {
  const variety = getVarietyById(varietyId)
  if (!variety) return []

  return variety.pollinizers.map((pollinizerId) => getVarietyById(pollinizerId)).filter(Boolean) as PistachioVariety[]
}
