"use client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Globe, CheckCircle2, Info } from "lucide-react"
import { DATA_SOURCES, type DataSource } from "@/lib/data-sources"

interface DataSourceSelectorProps {
  value: DataSource
  onChange: (source: DataSource) => void
}

export function DataSourceSelector({ value, onChange }: DataSourceSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Database className="h-5 w-5 text-primary" />
          Seleccionar Fuente de Datos
        </CardTitle>
        <CardDescription>Elige la fuente de datos meteorológicos para el análisis climático</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DATA_SOURCES.map((source) => (
            <div
              key={source.id}
              className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all ${
                value === source.id
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-muted hover:border-primary/50 hover:shadow-sm"
              } ${!source.enabled && "opacity-50 cursor-not-allowed"}`}
              onClick={() => source.enabled && onChange(source.id)}
            >
              {value === source.id && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
              )}

              <div>
                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                  {source.name}
                  {source.id === "siar" && (
                    <Badge variant="default" className="text-xs">
                      España
                    </Badge>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mb-3">{source.description}</p>

                <div className="flex flex-wrap gap-2 mb-3">
                  <Badge variant="secondary" className="text-xs font-medium">
                    <Globe className="h-3 w-3 mr-1" />
                    {source.coverage}
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {source.resolution}
                  </Badge>
                  {source.database && (
                    <Badge variant="outline" className="text-xs">
                      {source.database}
                    </Badge>
                  )}
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Parámetros:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {source.features.slice(0, 4).map((feature, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs py-0.5">
                        {feature}
                      </Badge>
                    ))}
                    {source.features.length > 4 && (
                      <Badge variant="outline" className="text-xs py-0.5">
                        +{source.features.length - 4} más
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
