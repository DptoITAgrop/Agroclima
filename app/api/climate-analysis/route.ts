import { type NextRequest, NextResponse } from "next/server"
import { WeatherService } from "@/lib/weather-apis"
import type { ClimateRequest } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const body: ClimateRequest = await request.json()

    // Validate required fields
    if (
      body.latitude === undefined ||
      body.longitude === undefined ||
      !body.startDate ||
      !body.endDate
    ) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // Parse + validate dates
    const start = new Date(body.startDate)
    const end = new Date(body.endDate)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format (expected YYYY-MM-DD)" }, { status: 400 })
    }

    // Normalize to midnight UTC-ish (avoid hour offsets)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    if (start > end) {
      return NextResponse.json(
        { error: "Start date cannot be after end date" },
        { status: 400 },
      )
    }

    // Prevent future endDate (important for NASA POWER / most sources)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (end > today) {
      return NextResponse.json(
        { error: "End date cannot be in the future" },
        { status: 400 },
      )
    }

    // Inclusive day count
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1

    // Validate date range (max 2 years for performance)
    if (daysDiff > 730) {
      return NextResponse.json({ error: "Date range cannot exceed 2 years" }, { status: 400 })
    }

    // IMPORTANT: pass normalized dates (YYYY-MM-DD) to backend
    const normalizedRequest: ClimateRequest = {
      ...body,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    }

    const weatherService = new WeatherService()
    const results = await weatherService.getClimateAnalysis(normalizedRequest)

    return NextResponse.json({
      success: true,
      data: results,
      requestInfo: {
        latitude: body.latitude,
        longitude: body.longitude,
        startDate: normalizedRequest.startDate,
        endDate: normalizedRequest.endDate,
        dayCount: daysDiff,
      },
    })
  } catch (error) {
    console.error("Climate analysis API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
