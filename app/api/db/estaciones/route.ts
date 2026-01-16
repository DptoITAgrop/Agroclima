import { NextResponse } from "next/server"
import { getDB } from "@/lib/database"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dataSource = searchParams.get("dataSource") || "PowerNasa"
    const dbName = dataSource as "PowerNasa" | "era5" | "siar"

    const sql = getDB(dbName)

    const query = `
      SELECT 
        id,
        nombre,
        latitud,
        longitud,
        altitud,
        provincia,
        fuente
      FROM estaciones
      WHERE latitud IS NOT NULL 
        AND longitud IS NOT NULL
      ORDER BY nombre
    `

    const estaciones = await sql(query)

    return NextResponse.json({
      success: true,
      dataSource: dbName,
      count: estaciones.length,
      estaciones,
    })
  } catch (error: any) {
    console.error("[v0] Error al obtener estaciones:", error)
    return NextResponse.json(
      {
        error: error.message || "Error al obtener estaciones",
      },
      { status: 500 },
    )
  }
}
