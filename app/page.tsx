"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { DataInputForm } from "@/components/data-input-form"
import { ClimateMetrics } from "@/components/climate-metrics"
import { ClimateDashboard } from "@/components/climate-dashboard"
import type { DataSource } from "@/lib/data-sources"
import Image from "next/image"


export default function HomePage() {
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [requestInfo, setRequestInfo] = useState<any>(null)
  const [isHistoricalMode, setIsHistoricalMode] = useState(false)
  const [selectedDataSources, setSelectedDataSources] = useState<DataSource[]>(["siar"])

  /**
   * ✅ Normal (climate-data)
   * - payload puede ser:
   *   - { data, requestInfo }
   *   - { analyses, rawData } (ya "plano")
   * - request viene desde el form (source, postalCode, lat/lon, fechas, etc.)
   *
   * ✅ Clave: hacemos MERGE para no perder postalCode/source
   */
  const handleDataFetched = (payload: any, request?: any) => {
    const normalizedData = payload?.data ?? payload ?? null
    const payloadRequestInfo = payload?.requestInfo ?? null

    setAnalysisData(normalizedData)

    const mergedRequestInfo = {
      ...(request ?? {}),
      ...(payloadRequestInfo ?? {}),
    }

    setRequestInfo(mergedRequestInfo)

    setIsHistoricalMode(Boolean(mergedRequestInfo?.isHistorical))
  }

  /**
   * ✅ Histórico (historical-analysis)
   * endpoint devuelve normalmente:
   * { success, data:{analyses,rawData}, requestInfo }
   */
  const handleHistoricalAnalysis = (payload: any) => {
    setAnalysisData(payload?.data ?? null)
    setRequestInfo(payload?.requestInfo ?? null)
    setIsHistoricalMode(true)
  }

  const handleBackToRegular = () => {
    setAnalysisData(null)
    setRequestInfo(null)
    setIsHistoricalMode(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar selectedDataSources={selectedDataSources} onDataSourcesChange={setSelectedDataSources} />

      <main className="flex-1 overflow-auto">
        <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
          <div className="px-6 py-4">
            <div className="flex items-center gap-3">
              <Image
                src="/images/agroptimum-logo.png"
                alt="Agroptimum"
                width={50}
                height={50}
                className="object-contain"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Agroclima</h1>
                <p className="text-xs text-green-600 font-medium">Powered by Agroptimum</p>
              </div>
            </div>

            <p className="text-gray-600 mt-2 text-sm">
              {isHistoricalMode
                ? "Análisis climático histórico de 20 años para el cultivo de pistacho"
                : "Análisis climático avanzado para el cultivo de pistacho"}
            </p>
          </div>
        </header>

        <div className="p-6">
          {!analysisData ? (
            <div className="space-y-6">
              <DataInputForm
                onDataFetched={handleDataFetched}
                onHistoricalAnalysis={(payload) => handleHistoricalAnalysis(payload)}
                selectedDataSources={selectedDataSources}
              />
              <ClimateMetrics />
            </div>
          ) : (
            <ClimateDashboard
              data={analysisData}
              requestInfo={
                requestInfo || {
                  latitude: 0,
                  longitude: 0,
                  startDate: "",
                  endDate: "",
                  dayCount: 0,
                  source: "",
                  postalCode: "",
                }
              }
              onBackToForm={handleBackToRegular}
            />
          )}
        </div>
      </main>
    </div>
  )
}
