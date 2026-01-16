import { type NextRequest, NextResponse } from "next/server"
import type { HourlyClimateRequest, HourlyClimateData, ApiResponse } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const body: HourlyClimateRequest = await request.json()

    // Validate request
    if (!body.latitude || !body.longitude || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // Validate date range (max 1 year for hourly data)
    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)
    const hoursDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60))

    const maxHours = body.maxHours || 8760 // 1 year default
    if (hoursDiff > maxHours) {
      return NextResponse.json(
        {
          error: `Date range too large. Maximum ${maxHours} hours (${Math.floor(maxHours / 24)} days)`,
        },
        { status: 400 },
      )
    }

    // Generate mock hourly data (in production, this would call real APIs)
    const hourlyData: HourlyClimateData[] = []

    for (let hour = 0; hour < hoursDiff; hour++) {
      const currentTime = new Date(startDate.getTime() + hour * 60 * 60 * 1000)
      const hourOfDay = currentTime.getHours()

      // Simulate daily temperature cycle
      const baseTemp = 15 + Math.sin((currentTime.getTime() / (1000 * 60 * 60 * 24 * 365)) * 2 * Math.PI) * 10
      const dailyVariation = Math.sin((hourOfDay / 24) * 2 * Math.PI - Math.PI / 2) * 8
      const temperature = baseTemp + dailyVariation + (Math.random() - 0.5) * 3

      // Simulate humidity (inverse relationship with temperature)
      const humidity = Math.max(20, Math.min(95, 80 - (temperature - 15) * 1.5 + (Math.random() - 0.5) * 20))

      // Simulate solar radiation (peak at noon)
      const solarFactor = Math.max(0, Math.sin(((hourOfDay - 6) / 12) * Math.PI))
      const solar_radiation = solarFactor * (800 + Math.random() * 200)

      // Simulate precipitation (random events)
      const precipitation = Math.random() < 0.05 ? Math.random() * 5 : 0

      // Simulate wind speed
      const wind_speed = 2 + Math.random() * 8

      hourlyData.push({
        datetime: currentTime.toISOString(),
        temperature: Number.parseFloat(temperature.toFixed(1)),
        humidity: Number.parseFloat(humidity.toFixed(1)),
        wind_speed: Number.parseFloat(wind_speed.toFixed(1)),
        precipitation: Number.parseFloat(precipitation.toFixed(1)),
        solar_radiation: Number.parseFloat(solar_radiation.toFixed(1)),
        pressure: Number.parseFloat((1013 + (Math.random() - 0.5) * 20).toFixed(1)),
        dew_point: Number.parseFloat((temperature - (100 - humidity) / 5).toFixed(1)),
      })
    }

    const response: ApiResponse<HourlyClimateData[]> = {
      success: true,
      data: hourlyData,
      source: "HOURLY_MOCK",
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Hourly weather API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        source: "HOURLY_API",
      },
      { status: 500 },
    )
  }
}
