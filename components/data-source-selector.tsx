"use client"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Database } from "lucide-react"

type SourceKey = "SIAR" | "AEMET" | "NASA_POWER" | "OPEN_METEO" | "ERA5"

interface SourceItem {
  key: SourceKey
  label: string
  color: string
  enabled: boolean
}

const SOURCES: SourceItem[] = [
  {
    key: "SIAR",
    label: "SIAR",
    color: "bg-blue-500",
    enabled: false,
  },
  {
    key: "AEMET",
    label: "AEMET",
    color: "bg-orange-500",
    enabled: true,
  },
  {
    key: "NASA_POWER",
    label: "NASA POWER",
    color: "bg-green-500",
    enabled: true,
  },
  {
    key: "OPEN_METEO",
    label: "OPEN METEO",
    color: "bg-cyan-500",
    enabled: true,
  },
  {
    key: "ERA5",
    label: "ERA5",
    color: "bg-purple-500",
    enabled: false,
  },
]

interface Props {
  selectedSource?: SourceKey
  onSelect: (source: SourceKey) => void
}

export function SourceSelector({ selectedSource, onSelect }: Props) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-2">
        Selecciona el tipo de fuente
      </div>

      {SOURCES.map((source) => {
        const isActive = selectedSource === source.key

        return (
          <button
            key={source.key}
            disabled={!source.enabled}
            onClick={() => source.enabled && onSelect(source.key)}
            className={cn(
              "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition",
              "hover:bg-muted/50",
              isActive && "bg-muted",
              !source.enabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", source.color)} />
              <span>{source.label}</span>
            </div>

            {!source.enabled ? (
              <Badge variant="secondary" className="text-[10px]">
                Próximamente
              </Badge>
            ) : isActive ? (
              <Badge className="text-[10px]">Activa</Badge>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
