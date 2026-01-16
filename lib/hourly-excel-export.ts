import ExcelJS from "exceljs";
import type { HourlyClimateData } from "./hourly-data-service";

export async function generateHourlyExcel(
  hourlyData: HourlyClimateData[],
  meta: {
    latitude: number;
    longitude: number;
    startDate: string;
    endDate: string;
  }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  // Hoja 1: Horario
  const sh = wb.addWorksheet("Datos Horarios");
  sh.columns = [
    { header: "FechaHora", key: "datetime", width: 22 },
    { header: "Temp (°C)", key: "temperature", width: 12 },
    { header: "HR (%)", key: "humidity", width: 10 },
    { header: "Viento (m/s)", key: "wind_speed", width: 12 },
    { header: "Radiación", key: "solar_radiation", width: 12 },
    { header: "Precip (mm)", key: "precipitation", width: 12 },

    // Calculadas
    { header: "Chill (<=7.2)", key: "chill", width: 12 },
    { header: "GDD base 7 (hora)", key: "gdd7h", width: 16 },
  ];

  sh.getRow(1).font = { bold: true };
  sh.views = [{ state: "frozen", ySplit: 1 }];

  hourlyData.forEach((h) => {
    sh.addRow({
      datetime: h.datetime,
      temperature: h.temperature,
      humidity: h.humidity,
      wind_speed: h.wind_speed,
      solar_radiation: h.solar_radiation,
      precipitation: h.precipitation,
      chill: h.temperature <= 7.2 ? 1 : 0,
      gdd7h: h.temperature > 7 ? (h.temperature - 7) / 24 : 0,
    });
  });

  // Hoja 2: Resumen
  const s = wb.addWorksheet("Resumen");
  s.getColumn(1).font = { bold: true };
  s.addRows([
    ["Latitud", meta.latitude],
    ["Longitud", meta.longitude],
    ["Inicio", meta.startDate],
    ["Fin", meta.endDate],
    [],
    ["Horas", hourlyData.length],
    ["Horas Frío", { formula: `SUM('Datos Horarios'!G2:G${hourlyData.length + 1})` }],
    ["GDD base 7 acumulado", { formula: `SUM('Datos Horarios'!H2:H${hourlyData.length + 1})` }],
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
