import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Thermometer, Snowflake, Clock, Droplets } from "lucide-react"

export function ClimateMetrics() {
  const metrics = [
    {
      title: "Temperatura Media",
      value: "18.5°C",
      change: "+2.1°C vs año anterior",
      icon: Thermometer,
      color: "text-chart-1",
    },
    {
      title: "Días de Helada",
      value: "45 días",
      change: "-8 días vs promedio",
      icon: Snowflake,
      color: "text-chart-5",
    },
    {
      title: "Horas Frío",
      value: "1,250 h",
      change: "+150h vs necesario",
      icon: Clock,
      color: "text-chart-3",
    },
    {
      title: "ETO Acumulada",
      value: "1,450 mm",
      change: "KC promedio: 0.85",
      icon: Droplets,
      color: "text-chart-2",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {metrics.map((metric) => (
        <Card key={metric.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-4 pt-4">
            <CardTitle className="text-xs font-medium">{metric.title}</CardTitle>
            <metric.icon className={`h-3.5 w-3.5 ${metric.color}`} />
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl font-bold">{metric.value}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{metric.change}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
