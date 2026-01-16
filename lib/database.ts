import { neon } from "@neondatabase/serverless"

// Conexión a PostgreSQL local con las bases de datos: PowerNasa, era5, siar
export function getDB(dbName: "PowerNasa" | "era5" | "siar" = "PowerNasa") {
  // URL base de conexión (sin especificar base de datos)
  const baseUrl = process.env.DATABASE_URL || "postgresql://adminit:ITadmin2025%40@localhost:5432"

  // Construir URL completa con el nombre de la base de datos
  const dbUrl = `${baseUrl}/${dbName}`

  return neon(dbUrl)
}

// Tipos para las tablas reales de tu base de datos
export interface Estacion {
  id: number
  nombre: string
  latitud: number
  longitud: number
  altitud?: number
  provincia?: string
  fuente?: string
}

export interface DatoDiario {
  id?: number
  estacion_id: number
  fecha: Date
  temp_media?: number
  temp_maxima?: number
  temp_minima?: number
  precipitacion?: number
  humedad_media?: number
  radiacion_solar?: number
  eto?: number
  viento_velocidad?: number
}

export interface DatoHorario {
  id?: number
  estacion_id: number
  fecha_hora: Date
  temperatura?: number
  humedad?: number
  precipitacion?: number
  radiacion?: number
  viento?: number
  presion?: number
}

export interface Progreso {
  id?: number
  tarea: string
  fecha_inicio?: Date
  fecha_fin?: Date
  estado: string
  registros_procesados?: number
  errores?: number
}
