import "server-only"
import type { ClimateData, ClimateRequest, ApiResponse } from "./types"
import { ClimateCalculator } from "./climate-calculations"
import * as XLSX from "xlsx"

// --------------------
// Helpers: UTAH + Dynamic base 7
// --------------------
const DYNAMIC_BASE_C = 7

function utahHourlyUnits(Tc: number): number {
  if (Tc < 1.4) return 0
  if (Tc < 2.4) return 0.5
  if (Tc < 9.1) return 1
  if (Tc < 12.4) return 0.5
  if (Tc < 15.9) return 0
  if (Tc < 18.0) return -0.5
  return -1
}

function utahDailyApproxUnits(tmin: number, tmax: number): number {
  const tavg = (tmin + tmax) / 2
  return utahHourlyUnits(tavg) * 24
}

function dynamicHeatDailyDD(tavg: number, base = DYNAMIC_BASE_C): number {
  return Math.max(0, tavg - base)
}

function dynamicHeatHourlyDH(Tc: number, base = DYNAMIC_BASE_C): number {
  return Math.max(0, Tc - base)
}

function kToC(k: number) {
  return k - 273.15
}

function rhFromT_Td(Tc: number, Tdc: number) {
  const es = 6.112 * Math.exp((17.67 * Tc) / (Tc + 243.5))
  const e = 6.112 * Math.exp((17.67 * Tdc) / (Tdc + 243.5))
  const rh = es > 0 ? (100 * e) / es : 0
  return Math.max(0, Math.min(100, rh))
}

function uniqSorted<T>(arr: T[]) {
  return Array.from(new Set(arr)).sort() as T[]
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

// CSV parser robusto (soporta comillas y líneas con #)
function parseCsv(csv: string): { header: string[]; rows: string[][] } {
  const lines = csv.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0)

  let headerLineIndex = 0
  while (headerLineIndex < lines.length && lines[headerLineIndex].trim().startsWith("#")) headerLineIndex++
  if (headerLineIndex >= lines.length) return { header: [], rows: [] }

  const header = parseCsvLine(lines[headerLineIndex]).map((s) => s.trim().replace(/^"|"$/g, ""))

  const rows: string[][] = []
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const ln = lines[i]
    if (!ln || ln.trim().startsWith("#")) continue
    rows.push(parseCsvLine(ln).map((s) => s.trim().replace(/^"|"$/g, "")))
  }

  return { header, rows }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === "," && !inQuotes) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function idxOf(header: string[], names: string[]): number {
  const lower = header.map((h) => h.toLowerCase())
  for (const n of names) {
    const i = lower.indexOf(n.toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// --------------------
// NASA POWER API Service
// --------------------
export class NasaPowerService {
  private baseUrl = "https://power.larc.nasa.gov/api/temporal/daily/point"

  async getClimateData(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    try {
      const parameters = ["T2M_MAX", "T2M_MIN", "T2M", "RH2M", "PRECTOTCORR", "WS2M", "ALLSKY_SFC_SW_DWN"].join(",")

      const start = request.startDate.replace(/-/g, "")
      const end = request.endDate.replace(/-/g, "")

      const url =
        `${this.baseUrl}` +
        `?parameters=${encodeURIComponent(parameters)}` +
        `&community=AG` +
        `&latitude=${request.latitude}` +
        `&longitude=${request.longitude}` +
        `&start=${start}` +
        `&end=${end}` +
        `&format=JSON`

      const response = await fetch(url, { cache: "no-store" })
      if (!response.ok) {
        const txt = await response.text().catch(() => "")
        throw new Error(`NASA POWER API error ${response.status}: ${txt}`)
      }

      const data: any = await response.json()

      const param = data?.properties?.parameter
      const tmaxMap = param?.T2M_MAX
      const tminMap = param?.T2M_MIN
      if (!tmaxMap || !tminMap) throw new Error("NASA POWER: respuesta inesperada (faltan T2M_MAX/T2M_MIN)")

      const dates = Object.keys(tmaxMap)

      const climateData: ClimateData[] = dates.map((date: string) => {
        const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
        const tmax = Number.isFinite(Number(tmaxMap[date])) ? Number(tmaxMap[date]) : 0
        const tmin = Number.isFinite(Number(tminMap[date])) ? Number(tminMap[date]) : 0

        const t2m = param?.T2M?.[date]
        const tavg = Number.isFinite(Number(t2m)) ? Number(t2m) : (tmax + tmin) / 2

        const utahUnits = utahDailyApproxUnits(tmin, tmax)
        const heatDD = dynamicHeatDailyDD(tavg, DYNAMIC_BASE_C)

        return {
          date: formattedDate,
          temperature_max: tmax,
          temperature_min: tmin,
          temperature_avg: tavg,
          humidity: Number.isFinite(Number(param?.RH2M?.[date])) ? Number(param.RH2M[date]) : 0,
          precipitation: Number.isFinite(Number(param?.PRECTOTCORR?.[date])) ? Number(param.PRECTOTCORR[date]) : 0,
          wind_speed: Number.isFinite(Number(param?.WS2M?.[date])) ? Number(param.WS2M[date]) : 0,
          solar_radiation: Number.isFinite(Number(param?.ALLSKY_SFC_SW_DWN?.[date]))
            ? Number(param.ALLSKY_SFC_SW_DWN[date])
            : 0,
          eto: 0,
          etc: 0,
          frost_hours: 0,
          chill_hours: Number(utahUnits.toFixed(2)),
          gdd: Number(heatDD.toFixed(2)),
          computedChillHeat: true,
          computedFromHourly: false,
        }
      })

      return { success: true, data: climateData, source: "NASA_POWER" }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error", source: "NASA_POWER" }
    }
  }
}

// --------------------
// AEMET API Service (proxy)
// --------------------

export class AemetService {
  constructor(private origin: string) {}

  async getClimateData(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    try {
      if (!request.postalCode || !/^\d{5}$/.test(String(request.postalCode).trim())) {
        return { success: false, error: "Código postal inválido (5 dígitos)", source: "AEMET" }
      }

      const response = await fetch(`${this.origin}/api/weather/aemet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          postalCode: request.postalCode,
          startDate: request.startDate,
          endDate: request.endDate,

          // 👇 si lo mandas, mejor; si no, tu endpoint decide
          municipio: request.municipio,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `AEMET error ${response.status}`)
      return payload
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "AEMET API error", source: "AEMET" }
    }
  }
}


// --------------------
// SIAR API Service (proxy)
// --------------------
export class SiarService {
  constructor(private origin: string) {}

  async getClimateData(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    try {
      const response = await fetch(`${this.origin}/api/weather/siar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(request),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || `SIAR API error: ${response.status}`)
      return payload
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "SIAR API error", source: "SIAR" }
    }
  }
}


// --------------------
// ERA5 API Service (CDS Retrieve API v1)
// ✅ Internamente pide CSV (para evitar Parquet/ZIP/NetCDF raros)
// ✅ Devuelve ClimateData[] (para análisis)
// ✅ También puede generar XLSX (para tu botón de descarga)
// --------------------
export class Era5Service {
  private cdsBaseUrl = process.env.CDS_BASE_URL || "https://cds.climate.copernicus.eu/api"

  // Primario (rápido, pensado para punto)
  private hourlyDataset =
    process.env.CDS_ERA5_DATASET || "reanalysis-era5-single-levels-timeseries"

  // Fallback (dataset clásico)
  private hourlyFallbackDataset =
    process.env.CDS_ERA5_FALLBACK_DATASET || "reanalysis-era5-single-levels"

  // Daily (histórico largo) si lo configuras más adelante
  private dailyDataset = process.env.CDS_ERA5_DAILY_DATASET || ""

  // Token (PAT) CDS
  private apiKey = process.env.COPERNICUS_API_KEY || ""

  private cdsHeaders(): Record<string, string> {
    if (!this.apiKey) return {}
    // CDS REST funciona con PRIVATE-TOKEN
    return {
      "PRIVATE-TOKEN": this.apiKey,
      Accept: "application/json",
    }
  }

  async getClimateData(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    try {
      if (!this.apiKey) {
        return { success: false, error: "Falta COPERNICUS_API_KEY (token CDS) en el servidor", source: "ERA5" }
      }

      const start = new Date(request.startDate)
      const end = new Date(request.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Fechas inválidas (YYYY-MM-DD)")
      if (end < start) throw new Error("endDate < startDate")

      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / 86400000)

      if (daysDiff <= 730) return await this.getClimateDataHourly(request)
      return await this.getClimateDataDaily(request)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "ERA5 API error", source: "ERA5" }
    }
  }

  // ============================================================
  // CDS Retrieve API v1 helpers
  // POST  {base}/retrieve/v1/processes/{processId}/execution
  // GET   {base}/retrieve/v1/jobs/{jobId}
  // ============================================================
  private async submitJob(processId: string, inputs: any): Promise<string> {
    const url = `${this.cdsBaseUrl}/retrieve/v1/processes/${processId}/execution`

    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...this.cdsHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs }),
    })

    const txt = await res.text().catch(() => "")
    if (!res.ok) throw new Error(`CDS submit error ${res.status}: ${txt}`)

    // 1) Location header suele traer .../jobs/{id}
    const loc = res.headers.get("location")
    if (loc) {
      const parts = loc.split("/").filter(Boolean)
      const maybeId = parts[parts.length - 1]
      if (maybeId) return maybeId
    }

    // 2) body
    const body: any = txt ? JSON.parse(txt) : {}
    const jobId = body?.jobID || body?.jobId || body?.id
    if (!jobId) throw new Error(`CDS: no JobID en respuesta: ${txt}`)
    return jobId
  }

  private async pollJob(jobId: string, maxPolls = 240, sleepMs = 2000): Promise<string> {
    const url = `${this.cdsBaseUrl}/retrieve/v1/jobs/${jobId}`

    for (let i = 0; i < maxPolls; i++) {
      const res = await fetch(url, { headers: { ...this.cdsHeaders() } })
      const txt = await res.text().catch(() => "")
      if (!res.ok) throw new Error(`CDS job status error ${res.status}: ${txt}`)

      const body: any = txt ? JSON.parse(txt) : {}
      const status = String(body?.status || body?.state || "").toLowerCase()

      // ✅ lo más estándar en este API:
      // outputs.asset.value.href
      const href =
        body?.outputs?.asset?.value?.href ||
        body?.outputs?.[0]?.value?.href ||
        body?.results?.[0]?.href ||
        body?.result?.href ||
        body?.links?.find?.((l: any) => l?.rel === "results")?.href

      if (status === "successful" || status === "completed") {
        if (!href) throw new Error(`CDS job successful pero sin href de descarga: ${txt}`)
        return href
      }

      if (status === "failed") {
        throw new Error(`CDS job failed: ${body?.message || body?.error || txt}`)
      }

      await new Promise((r) => setTimeout(r, sleepMs))
    }

    throw new Error("CDS: timeout esperando a que el job termine")
  }

  private async downloadText(url: string): Promise<string> {
    const res = await fetch(url, { headers: { ...this.cdsHeaders() } })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      throw new Error(`CDS download error ${res.status}: ${txt}`)
    }
    return await res.text()
  }

  private async submitAndDownloadCsv(processId: string, inputs: any): Promise<string> {
    const jobId = await this.submitJob(processId, inputs)
    const dlUrl = await this.pollJob(jobId)
    const txt = await this.downloadText(dlUrl)

    // si por lo que sea te devolviese JSON/asset, lo detectamos:
    if (txt.trim().startsWith("{") || txt.trim().startsWith("[")) {
      throw new Error(`CDS devolvió JSON en vez de CSV (revisa data_format). Respuesta: ${txt.slice(0, 300)}`)
    }
    if (!txt.includes(",") || txt.length < 20) {
      throw new Error(`CDS devolvió contenido no-CSV (revisa data_format). Preview: ${txt.slice(0, 300)}`)
    }
    return txt
  }

  // ============================================================
  // HOURLY (<= 2 años)
  // - timeseries (location) -> CSV
  // - fallback single-levels (area) -> CSV
  // ============================================================
  private async getClimateDataHourly(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    const start = new Date(request.startDate)
    const end = new Date(request.endDate)

    const days: string[] = []
    const months: string[] = []
    const years: string[] = []
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(pad2(d.getDate()))
      months.push(pad2(d.getMonth() + 1))
      years.push(String(d.getFullYear()))
    }
    const times = Array.from({ length: 24 }, (_, h) => `${pad2(h)}:00`)

    let csv: string | null = null
    let lastErr: any = null

    // ---------- 1) timeseries (punto) ----------
    // 👇 clave: data_format="csv"
    const inputsTimeseries = {
      variable: [
        "2m_temperature",
        "2m_dewpoint_temperature",
        "total_precipitation",
        "surface_solar_radiation_downwards",
        "10m_u_component_of_wind",
        "10m_v_component_of_wind",
      ],
      year: uniqSorted(years),
      month: uniqSorted(months),
      day: uniqSorted(days),
      time: times,
      data_format: "csv",
      // el process lo soporta aunque no salga en el recorte del schema
      location: { latitude: request.latitude, longitude: request.longitude },
      product_type: "reanalysis",
    }

    try {
      csv = await this.submitAndDownloadCsv(this.hourlyDataset, inputsTimeseries)
    } catch (e) {
      lastErr = e
      csv = null
    }

    // ---------- 2) fallback single-levels (area) ----------
    if (!csv) {
      const pad = 0.125
      const area = [
        request.latitude + pad, // N
        request.longitude - pad, // W
        request.latitude - pad, // S
        request.longitude + pad, // E
      ]

      const inputsSingleLevels = {
        product_type: "reanalysis",
        variable: [
          "2m_temperature",
          "2m_dewpoint_temperature",
          "total_precipitation",
          "surface_solar_radiation_downwards",
          "10m_u_component_of_wind",
          "10m_v_component_of_wind",
        ],
        year: uniqSorted(years),
        month: uniqSorted(months),
        day: uniqSorted(days),
        time: times,
        area,
        data_format: "csv",          // ✅ esto evita GRIB
        download_format: "unarchived" // ✅ si lo soporta el proceso
      }

      try {
        csv = await this.submitAndDownloadCsv(this.hourlyFallbackDataset, inputsSingleLevels)
      } catch (e2) {
        const msg1 = lastErr instanceof Error ? lastErr.message : String(lastErr || "")
        const msg2 = e2 instanceof Error ? e2.message : String(e2 || "")
        throw new Error(`ERA5 hourly falló (timeseries y fallback). Timeseries: ${msg1} | Fallback: ${msg2}`)
      }
    }

    // ✅ aquí ya usas TU parser robusto
    const { header, rows } = parseCsv(csv)

    const iTime = idxOf(header, ["time", "valid_time", "date", "datetime"])
    const iT = idxOf(header, ["2m_temperature", "t2m"])
    const iTd = idxOf(header, ["2m_dewpoint_temperature", "d2m"])
    const iTP = idxOf(header, ["total_precipitation", "tp"])
    const iSSRD = idxOf(header, ["surface_solar_radiation_downwards", "ssrd"])
    const iU10 = idxOf(header, ["10m_u_component_of_wind", "u10"])
    const iV10 = idxOf(header, ["10m_v_component_of_wind", "v10"])

    if (iTime < 0 || iT < 0) {
      throw new Error(`ERA5 CSV columnas inesperadas: ${header.join(", ")}`)
    }

    type Agg = {
      tmax: number
      tmin: number
      tsum: number
      n: number
      rhSum: number
      rhN: number
      tpMM: number
      ssrdKWh: number
      wsSum: number
      wsN: number
      frostH: number
      utah: number
      heatDH: number
    }

    const daily: Record<string, Agg> = {}

    for (const cols of rows) {
      const tStr = cols[iTime]
      if (!tStr) continue
      const dayKey = String(tStr).slice(0, 10)

      const Tk = Number(cols[iT])
      if (!Number.isFinite(Tk)) continue
      const Tc = kToC(Tk)

      const TdK = iTd >= 0 ? Number(cols[iTd]) : NaN
      const Tdc = Number.isFinite(TdK) ? kToC(TdK) : NaN

      const tpM = iTP >= 0 ? Number(cols[iTP]) : NaN
      const ssrdJ = iSSRD >= 0 ? Number(cols[iSSRD]) : NaN
      const u10 = iU10 >= 0 ? Number(cols[iU10]) : NaN
      const v10 = iV10 >= 0 ? Number(cols[iV10]) : NaN

      if (!daily[dayKey]) {
        daily[dayKey] = {
          tmax: Tc,
          tmin: Tc,
          tsum: 0,
          n: 0,
          rhSum: 0,
          rhN: 0,
          tpMM: 0,
          ssrdKWh: 0,
          wsSum: 0,
          wsN: 0,
          frostH: 0,
          utah: 0,
          heatDH: 0,
        }
      }

      const a = daily[dayKey]
      a.tmax = Math.max(a.tmax, Tc)
      a.tmin = Math.min(a.tmin, Tc)
      a.tsum += Tc
      a.n += 1

      if (Number.isFinite(Tdc)) {
        const rh = rhFromT_Td(Tc, Tdc)
        a.rhSum += rh
        a.rhN += 1
      }

      if (Number.isFinite(tpM)) a.tpMM += tpM * 1000
      if (Number.isFinite(ssrdJ)) a.ssrdKWh += ssrdJ / 3.6e6

      if (Number.isFinite(u10) && Number.isFinite(v10)) {
        const ws = Math.sqrt(u10 * u10 + v10 * v10)
        a.wsSum += ws
        a.wsN += 1
      }

      if (Tc < 0) a.frostH += 1
      a.utah += utahHourlyUnits(Tc)
      a.heatDH += dynamicHeatHourlyDH(Tc, DYNAMIC_BASE_C)
    }

    const out: ClimateData[] = Object.keys(daily)
      .sort()
      .map((d) => {
        const a = daily[d]
        const tavg = a.n ? a.tsum / a.n : 0
        const rh = a.rhN ? a.rhSum / a.rhN : 0
        const ws = a.wsN ? a.wsSum / a.wsN : 0
        const heatDD = a.heatDH / 24

        return {
          date: d,
          temperature_max: Number(a.tmax.toFixed(2)),
          temperature_min: Number(a.tmin.toFixed(2)),
          temperature_avg: Number(tavg.toFixed(2)),
          humidity: Number(rh.toFixed(2)),
          precipitation: Number(a.tpMM.toFixed(2)),
          wind_speed: Number(ws.toFixed(2)),
          solar_radiation: Number(a.ssrdKWh.toFixed(3)),
          eto: 0,
          etc: 0,
          frost_hours: a.frostH,
          chill_hours: Number(a.utah.toFixed(2)),
          gdd: Number(heatDD.toFixed(2)),
          computedChillHeat: true,
          computedFromHourly: true,
        }
      })

    return { success: true, data: out, source: "ERA5" }
  }

  // ============================================================
  // DAILY (>2 años)
  // ============================================================
  private async getClimateDataDaily(_request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    if (!this.dailyDataset) {
      return {
        success: false,
        source: "ERA5",
        error:
          "Para ERA5 histórico (>2 años) configura CDS_ERA5_DAILY_DATASET (daily statistics). Por ahora usa rangos <= 2 años.",
      }
    }
    return { success: false, source: "ERA5", error: "DAILY no implementado aún." }
  }
}


// --------------------
// Main Weather Servicea
// --------------------
export class WeatherService {
  private nasaPower = new NasaPowerService()
  private era5 = new Era5Service()
  private aemet: AemetService
  private siar: SiarService
  private calculator = new ClimateCalculator()

 constructor(origin: string) {
  const internalBase =
    process.env.INTERNAL_BASE_URL ||
    process.env.NEXT_INTERNAL_BASE_URL ||
    origin

  this.aemet = new AemetService(internalBase)
  this.siar = new SiarService(internalBase)
}


  async getClimateDataBySource(request: ClimateRequest): Promise<ApiResponse<ClimateData[]>> {
    const processData = (response: ApiResponse<ClimateData[]>) => {
      if (response.success && response.data) {
        return { ...response, data: this.calculator.processClimateData(response.data, request.latitude) }
      }
      return response
    }

    switch (request.source) {
      case "NASA_POWER":
        return processData(await this.nasaPower.getClimateData(request))
      case "ERA5":
        return processData(await this.era5.getClimateData(request))
      case "AEMET":
        return processData(await this.aemet.getClimateData(request))
      case "SIAR":
        return processData(await this.siar.getClimateData(request))
      default:
        return { success: false, error: `Invalid source: ${String(request.source)}`, source: "API" }
    }
  }
}