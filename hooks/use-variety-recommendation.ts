"use client"

import { useState } from "react"
import type { ClimateData, VarietyRecommendationRequest } from "@/lib/types"
import type { VarietyRecommendation } from "@/lib/variety-recommendation"

interface VarietyRecommendationResults {
  recommendations: VarietyRecommendation[]
  detailedReport: any
  climateProfile: any
  metadata: {
    dataPoints: number
    location: { latitude: number; longitude: number }
    generatedAt: string
  }
}

export function useVarietyRecommendation() {
  const [data, setData] = useState<VarietyRecommendationResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecommendations = async (
    latitude: number,
    longitude: number,
    climateData: ClimateData[],
    includeHourlyAnalysis = false,
  ) => {
    setLoading(true)
    setError(null)

    try {
      const request: VarietyRecommendationRequest = {
        latitude,
        longitude,
        climateData,
        includeHourlyAnalysis,
      }

      const response = await fetch("/api/variety-recommendation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to fetch variety recommendations")
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || "API returned unsuccessful response")
      }

      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setData(null)
    setError(null)
  }

  return {
    data,
    loading,
    error,
    fetchRecommendations,
    reset,
  }
}
