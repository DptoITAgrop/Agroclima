"use client"

import { Thermometer, Snowflake, Clock, Droplets, Settings, Info } from "lucide-react"
import type { DataSource } from "@/lib/data-sources"

interface SidebarProps {
  selectedDataSources: DataSource[]
  onDataSourcesChange: (sources: DataSource[]) => void
}

export function Sidebar({ selectedDataSources, onDataSourcesChange }: SidebarProps) {
  const menuItems = [
    { icon: Snowflake, label: "Heladas", color: "text-blue-500", active: false },
    { icon: Clock, label: "Horas Frío", color: "text-cyan-500", active: false },
    { icon: Droplets, label: "ETO/ETC", color: "text-green-500", active: false },
    { icon: Settings, label: "Configuración", color: "text-gray-500", active: false },
    { icon: Info, label: "Ayuda", color: "text-gray-500", active: false },
  ]

  const dataSourceColors: Record<DataSource, string> = {
    siar: "bg-blue-500",
    aemet: "bg-orange-500",
    nasa: "bg-green-500",
    era5: "bg-purple-500",
    all: "bg-gray-500",
  }

  const dataSourceLabels: Record<DataSource, string> = {
    siar: "SIAR",
    aemet: "AEMET",
    nasa: "NASA POWER",
    era5: "ERA5",
    all: "Todas",
  }

  // ✅ Fuentes deshabilitadas (capadas)
  const DISABLED_SOURCES = new Set<DataSource>(["siar", "era5"])

  const toggleDataSource = (source: DataSource) => {
    // ✅ si está deshabilitada, no hacemos nada
    if (DISABLED_SOURCES.has(source)) return

    // selección única: al clicar, se reemplaza la selección completa
    onDataSourcesChange([source])
  }

  // ✅ Seguridad extra: si por lo que sea vienen seleccionadas, las limpiamos
  // (opcional, pero muy recomendable)
  const safeSelected =
    selectedDataSources?.filter((s) => !DISABLED_SOURCES.has(s)) ?? []

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-5 border-b">
        <div className="flex items-center gap-2 mb-1">
          <Thermometer className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-gray-900">Parámetros Climáticos</h2>
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              item.active ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <item.icon className={`h-4 w-4 ${item.color}`} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t bg-gray-50">
        <h3 className="font-semibold text-gray-900 mb-3 text-xs uppercase tracking-wide">Fuentes de Datos</h3>

        <div className="space-y-2.5">
          {(["siar", "aemet", "nasa", "era5"] as DataSource[]).map((source) => {
            const isSelected = safeSelected.includes(source)
            const isDisabled = DISABLED_SOURCES.has(source)

            return (
              <button
                key={source}
                type="button"
                disabled={isDisabled}
                onClick={() => toggleDataSource(source)}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors
                  ${
                    isDisabled
                      ? "opacity-50 cursor-not-allowed bg-gray-50"
                      : isSelected
                        ? "bg-primary/10"
                        : "hover:bg-gray-100"
                  }`}
                title={isDisabled ? "Próximamente" : undefined}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 ${dataSourceColors[source]} rounded-full`}></div>
                  <span className="text-xs font-medium text-gray-700">{dataSourceLabels[source]}</span>
                </div>

                {isDisabled ? (
                  <span className="text-[10px] font-semibold text-gray-600 bg-gray-200/70 px-2 py-0.5 rounded-full">
                    Próximamente
                  </span>
                ) : isSelected ? (
                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Activa
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {safeSelected.length > 1 && (
          <p className="text-[10px] text-gray-500 mt-2">{safeSelected.length} fuentes seleccionadas</p>
        )}
      </div>
    </aside>
  )
}
