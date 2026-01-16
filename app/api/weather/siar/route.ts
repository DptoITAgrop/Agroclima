import { type NextRequest, NextResponse } from "next/server"

const SIAR_API_KEY = "_U2m6y-T8Xv6_SS-MBaU8do7znSD9fOX4vq4_sEz4JgV3OvaeB"

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude, startDate, endDate } = await request.json()

    console.log("[v0] SIAR API request:", { latitude, longitude, startDate, endDate })

    // Try the main SIAR API endpoint
    const baseUrl = "https://servicio.mapa.gob.es/websiar/api"

    // Get stations list
    const stationsUrl = `${baseUrl}/estaciones`

    const stationsResponse = await fetch(stationsUrl, {
      headers: {
        Authorization: `Bearer ${SIAR_API_KEY}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    console.log("[v0] SIAR stations response status:", stationsResponse.status)

    if (!stationsResponse.ok) {
      // Fallback to mock data if SIAR API is not accessible
      console.log("[v0] SIAR API not accessible, using mock data")

      const mockData = generateMockSiarData(startDate, endDate)

      return NextResponse.json({
        success: true,
        data: mockData,
        source: "SIAR (Mock)",
        note: "SIAR API not accessible, using simulated data",
      })
    }

    const stations = await stationsResponse.json()
    console.log("[v0] SIAR found stations:", stations.length)

    // Find closest station
    let closestStation = stations[0]
    let minDistance = Number.MAX_VALUE

    stations.forEach((station: any) => {
      if (station.latitud && station.longitud) {
        const distance = Math.sqrt(Math.pow(station.latitud - latitude, 2) + Math.pow(station.longitud - longitude, 2))
        if (distance < minDistance) {
          minDistance = distance
          closestStation = station
        }
      }
    })

    console.log("[v0] SIAR closest station:", closestStation.nombre)

    // Get climate data
    const dataUrl = `${baseUrl}/estaciones/${closestStation.codigo}/datos`
    const params = new URLSearchParams({
      fechaInicio: startDate,
      fechaFin: endDate,
      formato: "json",
    })

    const dataResponse = await fetch(`${dataUrl}?${params}`, {
      headers: {
        Authorization: `Bearer ${SIAR_API_KEY}`,
        Accept: "application/json",
      },
    })

    if (!dataResponse.ok) {
      throw new Error(`SIAR data API error: ${dataResponse.status}`)
    }

    const data = await dataResponse.json()
    console.log("[v0] SIAR data points:", data.length)

    const transformedData = data.map((item: any) => ({
      date: item.fecha,
      temperature_max: Number.parseFloat(item.temperaturaMaxima) || 0,
      temperature_min: Number.parseFloat(item.temperaturaMinima) || 0,
      temperature_avg: Number.parseFloat(item.temperaturaMedia) || 0,
      humidity: Number.parseFloat(item.humedadRelativa) || 0,
      precipitation: Number.parseFloat(item.precipitacion) || 0,
      wind_speed: Number.parseFloat(item.velocidadViento) || 0,
      solar_radiation: Number.parseFloat(item.radiacionSolar) || 0,
      eto: 0,
      etc: 0,
      frost_hours: 0,
      chill_hours: 0,
      gdd: 0,
    }))

    return NextResponse.json({
      success: true,
      data: transformedData,
      source: "SIAR",
      station: closestStation.nombre,
    })
  } catch (error) {
    console.error("[v0] SIAR API error:", error)

    // Return mock data as fallback
    const mockData = generateMockSiarData(
      request
        .json()
        .then((data) => data.startDate)
        .catch(() => "2024-01-01"),
      request
        .json()
        .then((data) => data.endDate)
        .catch(() => "2024-12-31"),
    )

    return NextResponse.json({
      success: true,
      data: mockData,
      source: "SIAR (Mock)",
      error: error instanceof Error ? error.message : "SIAR API error",
      note: "Using mock data due to API error",
    })
  }
}

function generateMockSiarData(startDate: string, endDate: string) {
  const data = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    data.push({
      date: d.toISOString().split("T")[0],
      temperature_max: 16 + Math.random() * 20,
      temperature_min: 4 + Math.random() * 10,
      temperature_avg: 10 + Math.random() * 15,
      humidity: 40 + Math.random() * 40,
      precipitation: Math.random() * 10,
      wind_speed: 2 + Math.random() * 8,
      solar_radiation: 10 + Math.random() * 15,
      eto: 0,
      etc: 0,
      frost_hours: 0,
      chill_hours: 0,
      gdd: 0,
    })
  }

  return data
}
