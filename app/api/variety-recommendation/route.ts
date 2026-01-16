import { type NextRequest, NextResponse } from "next/server"
import { VarietyRecommendationEngine } from "@/lib/variety-recommendation"
import type { VarietyRecommendationRequest } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const body: VarietyRecommendationRequest = await request.json()

    // Validate request
    if (!body.latitude || !body.longitude || !body.climateData || !Array.isArray(body.climateData)) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    if (body.climateData.length === 0) {
      return NextResponse.json({ error: "No climate data provided" }, { status: 400 })
    }

    const engine = new VarietyRecommendationEngine()

    // Generate variety recommendations
    const recommendations = engine.recommendVarieties(body.climateData, {
      latitude: body.latitude,
      longitude: body.longitude,
    })

    // Create climate profile for detailed report
    const climateProfile = {
      avgTemperature: body.climateData.reduce((sum, day) => sum + day.temperature_avg, 0) / body.climateData.length,
      minTemperature: Math.min(...body.climateData.map((day) => day.temperature_min)),
      maxTemperature: Math.max(...body.climateData.map((day) => day.temperature_max)),
      totalChillHours: body.climateData.reduce((sum, day) => sum + day.chill_hours, 0),
      totalFrostHours: body.climateData.reduce((sum, day) => sum + day.frost_hours, 0),
      frostDays: body.climateData.filter((day) => day.frost_hours > 0).length,
      totalPrecipitation: body.climateData.reduce((sum, day) => sum + day.precipitation, 0),
      waterDeficit: Math.max(
        0,
        body.climateData.reduce((sum, day) => sum + day.etc - day.precipitation, 0),
      ),
      totalGDD: body.climateData.reduce((sum, day) => sum + day.gdd, 0),
      heatStressDays: body.climateData.filter((day) => day.temperature_max > 40).length,
      extremeColdDays: body.climateData.filter((day) => day.temperature_min < -5).length,
    }

    // Generate detailed report
    const detailedReport = engine.generateDetailedReport(recommendations, climateProfile, {
      latitude: body.latitude,
      longitude: body.longitude,
    })

    return NextResponse.json({
      success: true,
      data: {
        recommendations,
        detailedReport,
        climateProfile,
        metadata: {
          dataPoints: body.climateData.length,
          location: { latitude: body.latitude, longitude: body.longitude },
          generatedAt: new Date().toISOString(),
        },
      },
    })
  } catch (error) {
    console.error("Variety recommendation API error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
