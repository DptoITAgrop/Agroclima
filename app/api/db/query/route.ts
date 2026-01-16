import { NextResponse } from "next/server"
import { getDB } from "@/lib/database"

export async function POST(request: Request) {
  try {
    const { latitude, longitude, startDate, endDate, dataSources = ["PowerNasa"] } = await request.json()

    if (!latitude || !longitude || !startDate || !endDate) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 })
    }

    const dataSourcesList = Array.isArray(dataSources) ? dataSources : [dataSources]
    const dbNames = dataSourcesList.map((source: string) => {
      // Map source names to database names
      if (source === "siar") return "siar"
      if (source === "era5") return "era5"
      if (source === "nasa") return "PowerNasa"
      if (source === "aemet") return "PowerNasa" // AEMET uses same structure as PowerNasa for now
      return "PowerNasa"
    })

    const results = []

    // Query each selected database
    for (const dbName of dbNames) {
      try {
        const sql = getDB(dbName as "PowerNasa" | "era5" | "siar")

        // Primero buscar la estación más cercana a las coordenadas especificadas
        const estacionQuery = `
          SELECT 
            id,
            nombre,
            latitud,
            longitud,
            altitud,
            provincia
          FROM estaciones
          WHERE latitud IS NOT NULL 
            AND longitud IS NOT NULL
          ORDER BY 
            SQRT(POW(latitud - $1, 2) + POW(longitud - $2, 2))
          LIMIT 1
        `

        const estaciones = await sql(estacionQuery, [latitude, longitude])

        if (estaciones.length === 0) {
          continue // Skip if no station found
        }

        const estacion = estaciones[0]

        // Consultar datos diarios para el rango de fechas
        const datosQuery = `
          SELECT 
            d.fecha,
            d.temp_media,
            d.temp_maxima,
            d.temp_minima,
            d.precipitacion,
            d.humedad_media,
            d.radiacion_solar,
            d.eto,
            d.viento_velocidad,
            e.nombre as estacion_nombre,
            e.latitud,
            e.longitud
          FROM diarios d
          JOIN estaciones e ON d.estacion_id = e.id
          WHERE d.estacion_id = $1
            AND d.fecha BETWEEN $2 AND $3
          ORDER BY d.fecha DESC
        `

        const datos = await sql(datosQuery, [estacion.id, startDate, endDate])

        // Calcular estadísticas agregadas
        const estadisticas =
          datos.length > 0
            ? {
                temperatura_media: datos.reduce((sum: number, d: any) => sum + (d.temp_media || 0), 0) / datos.length,
                temperatura_maxima: Math.max(...datos.map((d: any) => d.temp_maxima || Number.NEGATIVE_INFINITY)),
                temperatura_minima: Math.min(...datos.map((d: any) => d.temp_minima || Number.POSITIVE_INFINITY)),
                precipitacion_total: datos.reduce((sum: number, d: any) => sum + (d.precipitacion || 0), 0),
                eto_total: datos.reduce((sum: number, d: any) => sum + (d.eto || 0), 0),
                humedad_media: datos.reduce((sum: number, d: any) => sum + (d.humedad_media || 0), 0) / datos.length,
                dias_con_helada: datos.filter((d: any) => (d.temp_minima || 0) < 0).length,
              }
            : null

        results.push({
          dataSource: dbName,
          estacion: {
            id: estacion.id,
            nombre: estacion.nombre,
            latitud: estacion.latitud,
            longitud: estacion.longitud,
            altitud: estacion.altitud,
            provincia: estacion.provincia,
          },
          count: datos.length,
          estadisticas,
          datos: datos.slice(0, 100),
        })
      } catch (dbError: any) {
        console.error(`[v0] Error querying ${dbName}:`, dbError)
        // Continue with other databases even if one fails
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        {
          error: "No se encontraron datos en ninguna de las fuentes seleccionadas",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      periodo: { inicio: startDate, fin: endDate },
      fuentes: results.length,
      dataSources: dataSourcesList,
      resultados: results,
    })
  } catch (error: any) {
    console.error("[v0] Database query error:", error)
    return NextResponse.json(
      {
        error: error.message || "Error al consultar la base de datos",
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}
