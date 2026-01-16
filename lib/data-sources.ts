// Configuración de fuentes de datos disponibles
export type DataSource = "siar" | "aemet" | "nasa" | "era5" | "all"

export interface DataSourceConfig {
  id: DataSource
  name: string
  description: string
  database: string
  features: string[]
  resolution: string
  coverage: string
  enabled: boolean
}

export const DATA_SOURCES: DataSourceConfig[] = [
  {
    id: "siar",
    name: "SIAR",
    description: "Red de estaciones agrometeorológicas de España",
    database: "siar",
    features: ["Temperatura", "Humedad", "ETo", "Humedad del Suelo", "Temperatura del Suelo"],
    resolution: "Horaria",
    coverage: "España",
    enabled: true,
  },
  {
    id: "aemet",
    name: "AEMET",
    description: "Agencia Estatal de Meteorología de España",
    database: "PowerNasa", // Using PowerNasa structure for now
    features: ["Temperatura", "Precipitación", "Viento", "Presión", "Humedad"],
    resolution: "Horaria",
    coverage: "España",
    enabled: true,
  },
  {
    id: "nasa",
    name: "NASA POWER",
    description: "Datos globales de NASA con alta precisión",
    database: "PowerNasa",
    features: ["Temperatura", "Radiación Solar", "Precipitación", "Viento", "Evapotranspiración"],
    resolution: "Horaria / Diaria",
    coverage: "Global",
    enabled: true,
  },
  {
    id: "era5",
    name: "ERA5",
    description: "Reanálisis climático de alta resolución de Copernicus",
    database: "era5",
    features: ["Temperatura", "Presión", "Humedad", "Viento", "Radiación", "Nubosidad"],
    resolution: "Horaria",
    coverage: "Global",
    enabled: true,
  },
  {
    id: "all",
    name: "Todas las Fuentes",
    description: "Combinar datos de todas las fuentes disponibles",
    database: "public",
    features: ["Todos los parámetros disponibles"],
    resolution: "Variable",
    coverage: "Según disponibilidad",
    enabled: true,
  },
]

export function getDataSourceConfig(sourceId: DataSource): DataSourceConfig | undefined {
  return DATA_SOURCES.find((source) => source.id === sourceId)
}

export function getEnabledDataSources(): DataSourceConfig[] {
  return DATA_SOURCES.filter((source) => source.enabled && source.id !== "all")
}

export function getDatabaseName(sourceId: DataSource): string {
  const config = getDataSourceConfig(sourceId)
  return config?.database || "PowerNasa"
}
