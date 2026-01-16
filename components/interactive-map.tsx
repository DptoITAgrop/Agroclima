"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, Loader2 } from "lucide-react"

interface InteractiveMapProps {
  latitude?: number
  longitude?: number
  onLocationSelect?: (lat: number, lng: number) => void
}

export function InteractiveMap({ latitude, longitude, onLocationSelect }: InteractiveMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const tileLayersRef = useRef<any[]>([])
  const leafletRef = useRef<any>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)

  const isValidCoord = (lat?: number, lon?: number) =>
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180

  // 1) Inicialización del mapa (solo una vez)
  useEffect(() => {
    if (typeof window === "undefined") return

    const initMap = async () => {
      try {
        setIsLoading(true)

        const L = (await import("leaflet")).default
        leafletRef.current = L

        // Fix markers Leaflet (CDN)
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
          iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
          shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        })

        if (mapRef.current && !mapInstanceRef.current) {
          // Centro inicial: si llegan coords válidas, arranca ahí. Si no, España.
          const initialCenter = isValidCoord(latitude, longitude) ? [latitude!, longitude!] : [37.8882, -4.7794]
          const initialZoom = isValidCoord(latitude, longitude) ? 12 : 6

          mapInstanceRef.current = L.map(mapRef.current, {
            center: initialCenter,
            zoom: initialZoom,
            zoomControl: true,
            attributionControl: true,
          })

          const satelliteLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=s&hl=es&x={x}&y={y}&z={z}", {
            attribution: "© Google",
            maxZoom: 21,
            minZoom: 3,
            subdomains: ["mt0", "mt1", "mt2", "mt3"],
          })

          const labelsLayer = L.tileLayer("https://mt1.google.com/vt/lyrs=h&hl=es&x={x}&y={y}&z={z}", {
            attribution: "",
            maxZoom: 21,
            minZoom: 3,
            subdomains: ["mt0", "mt1", "mt2", "mt3"],
          })

          satelliteLayer.addTo(mapInstanceRef.current)
          labelsLayer.addTo(mapInstanceRef.current)
          tileLayersRef.current = [satelliteLayer, labelsLayer]

          if (onLocationSelect) {
            mapInstanceRef.current.on("click", (e: any) => {
              const { lat, lng } = e.latlng
              onLocationSelect(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
            })
          }

          // Pequeña espera para evitar “pantalla gris”
          await new Promise((resolve) => setTimeout(resolve, 300))
          setIsLoading(false)
        }
      } catch (error) {
        console.error("Error initializing map:", error)
        setMapError("Error al cargar el mapa")
        setIsLoading(false)
      }
    }

    const timer = setTimeout(initMap, 100)

    return () => {
      clearTimeout(timer)

      // Marker
      if (markerRef.current && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(markerRef.current)
        } catch {}
        markerRef.current = null
      }

      // Layers
      tileLayersRef.current.forEach((layer) => {
        try {
          mapInstanceRef.current?.removeLayer(layer)
        } catch {}
      })
      tileLayersRef.current = []

      // Map
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove()
        } catch {}
        mapInstanceRef.current = null
      }
    }
    // OJO: no metemos latitude/longitude aquí para no reiniciar el mapa
  }, [onLocationSelect])

  // 2) Cuando cambian las coords -> mover marker + flyTo
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = leafletRef.current

    if (!map || !L) return
    if (!isValidCoord(latitude, longitude)) return

    // Quitar marker anterior
    if (markerRef.current) {
      try {
        map.removeLayer(markerRef.current)
      } catch {}
      markerRef.current = null
    }

    try {
      markerRef.current = L.marker([latitude!, longitude!])
        .addTo(map)
        .bindPopup(`
          <div style="font-family: ui-sans-serif, system-ui; padding: 8px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="font-size:18px;">🌱</span>
              <strong>Análisis Climático Pistacho</strong>
            </div>
            <div style="font-size:12px; color:#4b5563; line-height:1.35;">
              <div><strong>Latitud:</strong> ${latitude!.toFixed(6)}°</div>
              <div><strong>Longitud:</strong> ${longitude!.toFixed(6)}°</div>
              <div style="margin-top:8px; color:#16a34a;">
                <strong>📍 Ubicación seleccionada para análisis</strong>
              </div>
            </div>
          </div>
        `)

      map.flyTo([latitude!, longitude!], 14, {
        animate: true,
        duration: 1.2,
      })

      setTimeout(() => {
        try {
          markerRef.current?.openPopup()
        } catch {}
      }, 1300)
    } catch (error) {
      console.error("Error adding marker:", error)
    }
  }, [latitude, longitude])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Ubicación en el Mapa</h3>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground px-1">
          {isValidCoord(latitude, longitude)
            ? `📍 Ubicación: ${latitude!.toFixed(4)}°, ${longitude!.toFixed(4)}°. Haz clic en el mapa para cambiar.`
            : "Introduce coordenadas GPS o haz clic en el mapa para seleccionar una ubicación."}
        </p>

        <div className="relative w-full">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 rounded-lg z-10">
              <div className="flex items-center gap-2 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando mapa satélite...
              </div>
            </div>
          )}

          {mapError && (
            <div className="h-[320px] w-full rounded-lg border flex items-center justify-center bg-muted">
              <p className="text-xs text-muted-foreground">{mapError}</p>
            </div>
          )}

          <div
            ref={mapRef}
            className="h-[320px] w-full rounded-lg border border-border shadow-sm"
            style={{ minHeight: "320px", maxWidth: "100%" }}
          />
        </div>
      </div>
    </div>
  )
}
