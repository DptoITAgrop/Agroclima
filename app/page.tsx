"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Sidebar } from "@/components/sidebar"
import { DataInputForm } from "@/components/data-input-form"
import { ClimateMetrics } from "@/components/climate-metrics"
import { ClimateDashboard } from "@/components/climate-dashboard"
import type { DataSource } from "@/lib/data-sources"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Activity, Moon, Sun, Sparkles, Cpu } from "lucide-react"

type ThemeMode = "light" | "dark"

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light"
  const saved = window.localStorage.getItem("theme") as ThemeMode | null
  if (saved === "light" || saved === "dark") return saved
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches
  return prefersDark ? "dark" : "light"
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (mode === "dark") root.classList.add("dark")
  else root.classList.remove("dark")
}

export default function HomePage() {
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [requestInfo, setRequestInfo] = useState<any>(null)
  const [isHistoricalMode, setIsHistoricalMode] = useState(false)
  const [selectedDataSources, setSelectedDataSources] = useState<DataSource[]>(["siar"])

  const [theme, setTheme] = useState<ThemeMode>("light")

  useEffect(() => {
    const t = getInitialTheme()
    setTheme(t)
    applyTheme(t)
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (typeof window !== "undefined") window.localStorage.setItem("theme", theme)
  }, [theme])

  const modeLabel = useMemo(() => {
    if (!analysisData) return "Modo consulta · listo"
    return isHistoricalMode ? "Informe histórico · 20 años" : "Modo análisis · resultados"
  }, [analysisData, isHistoricalMode])

  const subtitle = useMemo(() => {
    return isHistoricalMode
      ? "Análisis climático histórico de 20 años para el cultivo de pistacho"
      : "Análisis climático avanzado para el cultivo de pistacho"
  }, [isHistoricalMode])

  /**
   * ✅ Normal (climate-data)
   * - payload puede ser:
   *   - { data, requestInfo }
   *   - { analyses, rawData } (ya "plano")
   * - request viene desde el form (source, postalCode, lat/lon, fechas, etc.)
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

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Fondo “futurista / premium” */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {/* blobs */}
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/18 blur-3xl animate-blob" />
        <div className="absolute top-40 -right-24 h-80 w-80 rounded-full bg-emerald-400/12 blur-3xl animate-blob animation-delay-2000" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-sky-400/12 blur-3xl animate-blob animation-delay-4000" />

        {/* glow band */}
        <div className="absolute left-0 right-0 top-0 h-44 bg-gradient-to-b from-primary/8 via-transparent to-transparent" />

        {/* grid */}
        <div className="absolute inset-0 opacity-[0.07] dark:opacity-[0.14] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.35)_1px,transparent_0)] [background-size:22px_22px]" />

        {/* vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-background/70" />
      </div>

      <div className="flex min-h-screen">
        {/* Sidebar (no toco funcionalidad) */}
        <Sidebar selectedDataSources={selectedDataSources} onDataSourcesChange={setSelectedDataSources} />

        <main className="min-w-0 flex-1 overflow-auto">
          {/* Header glass + responsive */}
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
            <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Left: brand */}
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="absolute -inset-2 rounded-2xl bg-primary/10 blur-md" />
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-background/80 ring-1 ring-border/60 shadow-sm">
                      <Image
                        src="/images/agroptimum-logo.png"
                        alt="Agroptimum"
                        width={32}
                        height={32}
                        className="object-contain"
                        priority
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-lg sm:text-xl font-extrabold tracking-tight">
                        Agroclima
                        <span className="ml-2 inline-flex align-middle text-primary/80">
                          <Sparkles className="h-4 w-4" />
                        </span>
                      </h1>

                      {/* ✅ Powered en verde */}
                      <Badge
                        variant="secondary"
                        className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                      >
                        Powered by Agroptimum
                      </Badge>
                    </div>

                    <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
                  </div>
                </div>

                {/* Right: status + theme */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 shadow-sm">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{modeLabel}</span>
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>

                  <div className="hidden sm:flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 shadow-sm">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Agro AI-ready</span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-xl border-border/60 bg-background/60 hover:bg-background/80 backdrop-blur"
                    onClick={toggleTheme}
                    aria-label="Cambiar tema"
                    title="Cambiar tema"
                  >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    <span className="ml-2 text-xs font-semibold">{theme === "dark" ? "Claro" : "Oscuro"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Contenido */}
          <div className="mx-auto max-w-[1400px] px-3 sm:px-6 py-4 sm:py-6">
            {!analysisData ? (
              <div className="space-y-5 sm:space-y-6">
                {/* “Hero” compacto para que no se vea vacío en desktop */}
                <div className="rounded-2xl border border-border/60 bg-background/70 backdrop-blur shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
                  <div className="p-4 sm:p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold tracking-tight">Panel de Consulta</p>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          Selecciona fuente, ubicación y rango de fechas. Obtén métricas y recomendaciones para pistacho.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="rounded-full">
                          Multi-fuente
                        </Badge>
                        <Badge variant="outline" className="rounded-full">
                          Histórico 20 años
                        </Badge>
                        <Badge variant="outline" className="rounded-full">
                          ETo/ETc
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4">
                      <DataInputForm
                        onDataFetched={handleDataFetched}
                        onHistoricalAnalysis={(payload) => handleHistoricalAnalysis(payload)}
                        selectedDataSources={selectedDataSources}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-background/70 backdrop-blur shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] dark:shadow-none">
                  <div className="p-4 sm:p-6">
                    <ClimateMetrics />
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-fadeInUp">
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
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Animaciones CSS (sin framer-motion) */}
      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0);
          }
          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
        .animate-fadeInUp {
          animation: fadeInUp 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }

        @keyframes blob {
          0% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          33% {
            transform: translate3d(20px, -10px, 0) scale(1.05);
          }
          66% {
            transform: translate3d(-10px, 18px, 0) scale(0.98);
          }
          100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        .animate-blob {
          animation: blob 10s ease-in-out infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  )
}
