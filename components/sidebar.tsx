// components/sidebar.tsx
"use client"

import { Clock, Droplets, Settings, Info, Snowflake, Layers } from "lucide-react"
import { DATA_SOURCES, type DataSource } from "@/lib/data-sources"

interface SidebarProps {
  selectedDataSources: DataSource[]
  onDataSourcesChange: (sources: DataSource[]) => void
}

export function Sidebar({ selectedDataSources, onDataSourcesChange }: SidebarProps) {
  const menuItems = [
    { icon: Snowflake, label: "Heladas", color: "text-sky-500", active: false },
    { icon: Clock, label: "Horas Frío", color: "text-cyan-500", active: false },
    { icon: Droplets, label: "ETO/ETC", color: "text-emerald-500", active: false },
    { icon: Settings, label: "Configuración", color: "text-muted-foreground", active: false },
    { icon: Info, label: "Ayuda", color: "text-muted-foreground", active: false },
  ]

  const dataSourceColors: Record<DataSource, string> = {
    SIAR: "bg-blue-500",
    AEMET: "bg-orange-500",
    NASA_POWER: "bg-green-500",
    ERA5: "bg-purple-500",
    OPEN_METEO: "bg-sky-500",
  }

  const toggleDataSource = (source: DataSource, enabled: boolean) => {
    if (!enabled) return
    // selección única: al clicar, se reemplaza la selección completa
    onDataSourcesChange([source])
  }

  return (
    <aside
      className={[
        "flex flex-col",
        "w-[92px] sm:w-80",
        "border-r border-border/60",
        "bg-background/70 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-background/60",
      ].join(" ")}
    >
      {/* línea superior futurista */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>

      {/* BLOQUE TOP: Selección de fuente */}
      <div className="p-3 sm:p-4 border-b border-border/60">
        <div className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-xl bg-muted/20 dark:bg-muted/10 ring-1 ring-border/60">
          <span className="grid place-items-center h-9 w-9 rounded-lg bg-muted/50 dark:bg-muted/30 ring-1 ring-border/60">
            <Layers className="h-4 w-4 text-primary" />
          </span>

          <div className="hidden sm:block min-w-0">
            <div className="text-sm font-semibold text-foreground/90">Selecciona el tipo de fuente</div>
            <div className="text-xs text-muted-foreground truncate">
              Elige una fuente para el análisis
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {DATA_SOURCES.map((cfg) => {
            const isSelected = selectedDataSources.includes(cfg.id)

            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => toggleDataSource(cfg.id, cfg.enabled)}
                className={[
                  "w-full flex items-center justify-between gap-2 rounded-xl",
                  "px-2.5 py-2",
                  "transition-all",
                  isSelected
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : "hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06] ring-1 ring-transparent",
                  !cfg.enabled ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                title={cfg.name}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`h-2.5 w-2.5 rounded-full ${dataSourceColors[cfg.id]}`} />
                  <span className="hidden sm:inline text-xs font-medium text-foreground/85 truncate">{cfg.name}</span>
                </div>

                {cfg.enabled ? (
                  isSelected ? (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      Activa
                    </span>
                  ) : (
                    <span className="hidden sm:inline text-[10px] font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                      —
                    </span>
                  )
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                    Próx.
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* MENÚ */}
      <nav className="flex-1 p-3 sm:p-4 space-y-1.5">
        {menuItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={[
              "group w-full flex items-center gap-3 rounded-xl",
              "px-2.5 sm:px-3 py-2.5",
              "text-sm font-medium transition-all",
              "hover:bg-primary/5 dark:hover:bg-primary/10",
              "hover:ring-1 hover:ring-primary/15",
              item.active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-foreground/80",
            ].join(" ")}
          >
            <span
              className={[
                "grid place-items-center rounded-lg",
                "h-9 w-9",
                "bg-muted/50 dark:bg-muted/30",
                "ring-1 ring-border/60",
                "group-hover:ring-primary/25 transition-all",
              ].join(" ")}
              aria-hidden="true"
            >
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </span>

            <span className="hidden sm:inline truncate">{item.label}</span>
            <span className="ml-auto hidden sm:block h-2 w-2 rounded-full bg-primary/0 group-hover:bg-primary/30 transition-colors" />
          </button>
        ))}
      </nav>

      {/* FOOTER sutil (opcional) */}
      <div className="p-3 sm:p-4 border-t border-border/60 text-[10px] text-muted-foreground">
        <div className="hidden sm:flex items-center justify-between">
          <span>Agroclima</span>
          <span className="opacity-70">v1</span>
        </div>
      </div>
    </aside>
  )
}
