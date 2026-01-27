// lib/data-sources.ts
import type { DataSource } from "./types"

export interface DataSourceConfig {
  id: DataSource
  name: string
  description: string
  database: string
  features: string[]
  resolution: string
  coverage: string
  enabled: boolean

  // flags para UI
  supportsCoordinates?: boolean
  supportsPostalCode?: boolean
  supportsDaily?: boolean
  supportsHourly?: boolean
  supportsHistoric20y?: boolean
}

export const DATA_SOURCES: DataSourceConfig[] = [
  {
    id: "SIAR",
    name: "SIAR",
    description: "Red de estaciones agrometeorológicas de España",
    database: "siar",
    features: ["Temperatura", "Humedad", "ETo", "Humedad del Suelo", "Temperatura del Suelo"],
    resolution: "Horaria",
    coverage: "España",
    enabled: false,
    supportsCoordinates: true,
    supportsHourly: true,
  },
  {
    id: "AEMET",
    name: "AEMET",
    description: "Agencia Estatal de Meteorología de España (previsión)",
    database: "aemet",
    features: ["Temperatura", "Precipitación", "Viento", "Humedad"],
    resolution: "Diaria",
    coverage: "España",
    enabled: true,
    supportsPostalCode: true,
    supportsDaily: true,
  },
  {
    id: "NASA_POWER",
    name: "NASA POWER",
    description: "Datos globales de NASA",
    database: "PowerNasa",
    features: ["Temperatura", "Radiación Solar", "Precipitación", "Viento", "Evapotranspiración"],
    resolution: "Diaria",
    coverage: "Global",
    enabled: true,
    supportsCoordinates: true,
    supportsDaily: true,
    supportsHistoric20y: true,
  },
  {
    id: "OPEN_METEO",
    name: "OPEN METEO",
    description: "Open-Meteo Archive (histórico global). Similar a NASA POWER.",
    database: "open_meteo",
    features: ["Temperatura", "Precipitación", "ETo FAO-56"],
    resolution: "Diaria / Horaria",
    coverage: "Global",
    enabled: true,
    supportsCoordinates: true,
    supportsDaily: true,
    supportsHourly: true,
    supportsHistoric20y: true,
  },
  {
    id: "ERA5",
    name: "ERA5",
    description: "Reanálisis Copernicus (alta resolución)",
    database: "era5",
    features: ["Temperatura", "Presión", "Humedad", "Viento", "Radiación"],
    resolution: "Horaria",
    coverage: "Global",
    enabled: false,
    supportsCoordinates: true,
    supportsHourly: true,
    supportsHistoric20y: true,
  },
]

export function getDataSourceConfig(sourceId: DataSource) {
  return DATA_SOURCES.find((s) => s.id === sourceId)
}

export function getEnabledDataSources() {
  return DATA_SOURCES.filter((s) => s.enabled)
}
