"use client"

import type React from "react"
import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, MapPin, Search, AlertCircle, History, TrendingUp } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { useClimateData } from "@/hooks/use-climate-data"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { InteractiveMap } from "./interactive-map"
import type { DataSource as UIDataSource } from "@/lib/data-sources"
import type { DataSource as ApiDataSource } from "@/lib/types"

interface DataInputFormProps {
  onDataFetched?: (data: any, requestInfo?: any) => void
  onHistoricalAnalysis?: (payload: any) => void
  selectedDataSources: UIDataSource[]
}

function mapUiSourceToApi(source: UIDataSource): ApiDataSource | null {
  switch (source) {
    case "siar":
      return "SIAR"
    case "aemet":
      return "AEMET"
    case "nasa":
      return "NASA_POWER"
    case "era5":
      return "ERA5"
    case "all":
      return null
    default:
      return null
  }
}

export function DataInputForm({ onDataFetched, onHistoricalAnalysis, selectedDataSources }: DataInputFormProps) {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [latitude, setLatitude] = useState("37.8882")
  const [longitude, setLongitude] = useState("-4.7794")

  const [postalCode, setPostalCode] = useState("")

  const [historicalLoading, setHistoricalLoading] = useState(false)
  const { loading, error, fetchClimateAnalysis } = useClimateData()

  const apiSource: ApiDataSource | null = useMemo(() => {
    if (selectedDataSources.includes("all")) return null
    const first = selectedDataSources[0]
    return first ? mapUiSourceToApi(first) : null
  }, [selectedDataSources])

  const isAemet = apiSource === "AEMET"
  const isSiar = apiSource === "SIAR"

  const usesPostalCode = isAemet || isSiar
  const showDates = !isAemet

  const handleLocationSelect = (lat: number, lng: number) => {
    setLatitude(lat.toFixed(6))
    setLongitude(lng.toFixed(6))
  }

  const resolveLatLonFromPostalCode = async (cp: string): Promise<{ lat: number; lon: number }> => {
    const clean = cp.trim()
    if (!/^\d{5}$/.test(clean)) throw new Error("Código postal inválido (debe tener 5 dígitos)")

    const res = await fetch("/api/geocode/postalcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postalCode: clean }),
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(payload?.error || "No se pudo resolver el código postal")

    const lat = Number(payload?.latitude)
    const lon = Number(payload?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Geocoding devolvió coordenadas inválidas")

    return { lat, lon }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!apiSource) return
    if (showDates && (!startDate || !endDate)) return

    let latNum: number
    let lonNum: number

    try {
      if (usesPostalCode) {
        if (postalCode.trim().length !== 5) return
        const r = await resolveLatLonFromPostalCode(postalCode)
        latNum = r.lat
        lonNum = r.lon
        setLatitude(String(latNum))
        setLongitude(String(lonNum))
      } else {
        if (!latitude || !longitude) return
        latNum = Number.parseFloat(latitude)
        lonNum = Number.parseFloat(longitude)
      }

      if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return

      // ✅ requestInfo para dashboard + export
      const requestInfo: any = {
        latitude: latNum,
        longitude: lonNum,
        source: apiSource,
      }

      // ✅ CLAVE: guardar CP si aplica (AEMET/SIAR)
      if (usesPostalCode) requestInfo.postalCode = postalCode.trim()

      if (showDates) {
        requestInfo.startDate = startDate!.toISOString().split("T")[0]
        requestInfo.endDate = endDate!.toISOString().split("T")[0]
        requestInfo.dayCount = Math.ceil((endDate!.getTime() - startDate!.getTime()) / (1000 * 60 * 60 * 24))
      }

      // ✅ Payload al hook
      const payload: any = {
        latitude: latNum,
        longitude: lonNum,
        source: apiSource,
        parameters: ["temperature", "humidity", "precipitation", "wind", "solar_radiation"],
      }

      if (usesPostalCode) payload.postalCode = postalCode.trim()
      if (showDates) {
        payload.startDate = requestInfo.startDate
        payload.endDate = requestInfo.endDate
      }

      const result = await fetchClimateAnalysis(payload)
      if (result && onDataFetched) onDataFetched(result, requestInfo)
    } catch (err) {
      console.error(err)
    }
  }

  const handleHistoricalAnalysisClick = async () => {
    if (!apiSource) return
    if (isAemet) return

    setHistoricalLoading(true)
    try {
      let latNum: number
      let lonNum: number

      if (usesPostalCode) {
        const r = await resolveLatLonFromPostalCode(postalCode)
        latNum = r.lat
        lonNum = r.lon
        setLatitude(String(latNum))
        setLongitude(String(lonNum))
      } else {
        if (!latitude || !longitude) return
        latNum = Number.parseFloat(latitude)
        lonNum = Number.parseFloat(longitude)
      }

      const response = await fetch("/api/historical-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: latNum,
          longitude: lonNum,
          source: apiSource,
        }),
      })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || "Error al obtener análisis histórico")

      onHistoricalAnalysis?.(payload)
    } catch (err) {
      console.error("Historical analysis error:", err)
    } finally {
      setHistoricalLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" />
              Parámetros de Consulta
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {usesPostalCode ? (
              <div className="space-y-1">
                <Label htmlFor="postalCode" className="text-xs font-medium">
                  Código Postal
                </Label>
                <Input
                  id="postalCode"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
                  placeholder="Ej: 28001"
                  className="h-8 text-sm"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  {isAemet
                    ? "Introduce un código postal de España. Se mostrará la previsión automática de los próximos 7 días."
                    : "Introduce tu código postal en España."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="latitude" className="text-xs font-medium">
                    Latitud
                  </Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="0.000001"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="h-8 text-sm"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="longitude" className="text-xs font-medium">
                    Longitud
                  </Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="0.000001"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="h-8 text-sm"
                    required
                  />
                </div>
              </div>
            )}

            {showDates && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Fecha de Inicio</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left font-normal h-8 text-xs bg-transparent"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {startDate ? format(startDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(d) => {
                          setStartDate(d ?? undefined)
                          if (d && endDate && d > endDate) setEndDate(undefined)
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium">Fecha de Fin</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left font-normal h-8 text-xs bg-transparent"
                      >
                        <CalendarIcon className="mr-2 h-3 w-3" />
                        {endDate ? format(endDate, "PPP", { locale: es }) : "Seleccionar fecha"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        disabled={(date) => (startDate ? date < startDate : false)}
                        onSelect={(d) => setEndDate(d ?? undefined)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive" className="py-1.5">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-9 font-medium text-sm"
              disabled={
                loading ||
                !apiSource ||
                (usesPostalCode ? postalCode.trim().length !== 5 : !latitude || !longitude) ||
                (showDates ? !startDate || !endDate : false)
              }
            >
              <Search className="mr-2 h-3.5 w-3.5" />
              {loading ? "Analizando datos..." : "Obtener Análisis Climático"}
            </Button>

            {!isAemet && (
              <div className="border-t pt-2 mt-2">
                <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <History className="h-3 w-3" />
                  Análisis Histórico (20 años)
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-8 border-orange-200 hover:bg-orange-50 text-orange-700 font-medium text-xs bg-transparent"
                  onClick={handleHistoricalAnalysisClick}
                  disabled={
                    historicalLoading ||
                    !apiSource ||
                    (usesPostalCode ? postalCode.trim().length !== 5 : !latitude || !longitude)
                  }
                >
                  <TrendingUp className="mr-2 h-3 w-3" />
                  {historicalLoading ? "Generando informe..." : "Generar Informe Histórico 20 Años"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>

      {!usesPostalCode && (
        <InteractiveMap
          latitude={latitude ? Number.parseFloat(latitude) : undefined}
          longitude={longitude ? Number.parseFloat(longitude) : undefined}
          onLocationSelect={handleLocationSelect}
        />
      )}
    </div>
  )
}
