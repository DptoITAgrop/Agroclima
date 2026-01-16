// app/api/weather/aemet/route.ts
import "server-only"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  postalCode?: string
  startDate?: string // YYYY-MM-DD o ISO
  endDate?: string // YYYY-MM-DD o ISO
  municipio?: string // INE 5 dígitos (opcional)
}

const MAX_FORECAST_DAYS = 7
const AEMET_API_KEY = process.env.AEMET_API_KEY || ""
const AEMET_BASE = "https://opendata.aemet.es/opendata/api"

// ---------- utils fecha ----------
function isYYYYMMDD(s?: string) {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}
function normalizeToYYYYMMDD(input?: string) {
  const s = String(input || "").trim()
  if (!s) return ""
  return s.slice(0, 10) // acepta YYYY-MM-DD y ISO
}
function toDateOrNull(s?: string) {
  const x = normalizeToYYYYMMDD(s)
  if (!isYYYYMMDD(x)) return null
  const d = new Date(`${x}T00:00:00`)
  return Number.isFinite(d.getTime()) ? d : null
}
function diffDaysInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}
function addDaysYYYYMMDD(baseYYYYMMDD: string, days: number) {
  const d = toDateOrNull(baseYYYYMMDD)
  if (!d) return ""
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function filterByRange<T extends { date: string }>(rows: T[], start?: string, end?: string) {
  const s = normalizeToYYYYMMDD(start)
  const e = normalizeToYYYYMMDD(end)
  if (!isYYYYMMDD(s) || !isYYYYMMDD(e)) return rows
  return rows.filter((r) => r.date >= s && r.date <= e)
}

// ---------- AEMET (2 pasos) ----------
async function aemetGetDatosUrl(endpointUrl: string) {
  const res = await fetch(endpointUrl, {
    method: "GET",
    headers: { api_key: AEMET_API_KEY, accept: "application/json" },
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)

  if (!json?.datos) {
    const estado = json?.estado
    const descripcion = json?.descripcion
    throw new Error(`AEMET: sin datos (estado=${estado}) ${descripcion || ""}`.trim())
  }
  return String(json.datos)
}

async function aemetDownloadFinalJson(datosUrl: string) {
  const res = await fetch(datosUrl, { headers: { accept: "application/json" }, cache: "no-store" })
  return await res.json()
}

// ---------- helpers parse ----------
function avgFromDato(dato: any[] | undefined): number | null {
  if (!Array.isArray(dato) || dato.length === 0) return null
  const vals = dato.map((x) => Number(x?.value)).filter((n) => Number.isFinite(n))
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function pickProb00_24(list: any[] | undefined): number {
  if (!Array.isArray(list)) return 0
  const day = list.find((x) => String(x?.periodo) === "00-24")
  const v = Number(day?.value)
  return Number.isFinite(v) ? v : 0
}

function maxWindMs(viento: any[] | undefined): number {
  if (!Array.isArray(viento) || viento.length === 0) return 0
  const speeds = viento.map((v) => Number(v?.velocidad)).filter((n) => Number.isFinite(n))
  const maxKmh = speeds.length ? Math.max(...speeds) : 0
  return maxKmh / 3.6
}

// ---------- map AEMET -> ClimateData-like[] ----------
function mapAemetMunicipioDaily(predJson: any) {
  const root = Array.isArray(predJson) ? predJson[0] : predJson
  const dias = root?.prediccion?.dia
  if (!Array.isArray(dias)) return []

  return dias.map((d: any) => {
    const date = String(d?.fecha ?? "").slice(0, 10)

    const tmax = Number(d?.temperatura?.maxima ?? 0)
    const tmin = Number(d?.temperatura?.minima ?? 0)
    const tavg = Number.isFinite(tmax) && Number.isFinite(tmin) ? (tmax + tmin) / 2 : 0

    const rhDatoAvg = avgFromDato(d?.humedadRelativa?.dato)
    const rhMax = Number(d?.humedadRelativa?.maxima ?? 0)
    const rhMin = Number(d?.humedadRelativa?.minima ?? 0)
    const rhAvg =
      rhDatoAvg ??
      (Number.isFinite(rhMax) && Number.isFinite(rhMin) ? (rhMax + rhMin) / 2 : 0)

    const windMs = maxWindMs(d?.viento)
    const probPrecip = pickProb00_24(d?.probPrecipitacion)
    const uv = Number(d?.uvMax ?? 0)

    return {
      date,
      temperature_max: Number.isFinite(tmax) ? tmax : 0,
      temperature_min: Number.isFinite(tmin) ? tmin : 0,
      temperature_avg: Number.isFinite(tavg) ? tavg : 0,
      humidity: Number.isFinite(rhAvg) ? rhAvg : 0,
      precipitation: Number.isFinite(probPrecip) ? probPrecip : 0,
      wind_speed: Number.isFinite(windMs) ? windMs : 0,
      solar_radiation: 0,
      eto: 0,
      etc: 0,
      frost_hours: 0,
      chill_hours: 0,
      gdd: 0,
      uv_max: Number.isFinite(uv) ? uv : 0,
      sky: String(d?.estadoCielo?.find((x: any) => x?.periodo === "00-24")?.descripcion || ""),
    }
  })
}

// ---------- CP -> coords -> INE municipio ----------
type AemetMunicipio = { id: string; nombre: string; latitud: string; longitud: string }

const MUNICIPIOS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const municipiosCache: { ts: number; data: AemetMunicipio[] | null } =
  (globalThis as any).__aemet_municipios_cache ??
  ((globalThis as any).__aemet_municipios_cache = { ts: 0, data: null })

function parseAemetCoordToNumber(s: string): number | null {
  if (!s) return null
  const m = String(s).trim().match(/^(\d+(?:[.,]\d+)?)([NSEW])?$/i)
  if (!m) return null
  const num = Number(m[1].replace(",", "."))
  if (!Number.isFinite(num)) return null
  const hemi = (m[2] || "").toUpperCase()
  if (hemi === "S" || hemi === "W") return -num
  return num
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function getAemetMunicipios(): Promise<AemetMunicipio[]> {
  const now = Date.now()
  if (municipiosCache.data && now - municipiosCache.ts < MUNICIPIOS_CACHE_TTL_MS) return municipiosCache.data

  const endpoint = `${AEMET_BASE}/maestro/municipios`
  const datosUrl = await aemetGetDatosUrl(endpoint)
  const list = await aemetDownloadFinalJson(datosUrl)

  if (!Array.isArray(list)) throw new Error("AEMET: maestro/municipios no devolvió array")

  municipiosCache.data = list as AemetMunicipio[]
  municipiosCache.ts = now
  return municipiosCache.data
}

async function geocodePostalCode(req: NextRequest, postalCode: string): Promise<{ lat: number; lon: number }> {
  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/geocode/postalcode`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ postalCode }),
    cache: "no-store",
  })

  const j = await res.json().catch(() => null)

  // ✅ tu geocoder devuelve success:true ya (si lo cambiaste)
  if (!res.ok || !j?.success || typeof j?.latitude !== "number" || typeof j?.longitude !== "number") {
    throw new Error("No se pudieron obtener coordenadas para el código postal.")
  }
  return { lat: j.latitude, lon: j.longitude }
}

async function resolveMunicipioIneFromPostalCode(req: NextRequest, postalCode: string) {
  const { lat, lon } = await geocodePostalCode(req, postalCode)
  const municipios = await getAemetMunicipios()

  let best: { id: string; nombre: string; distKm: number } | null = null
  for (const m of municipios) {
    const mlat = parseAemetCoordToNumber(m.latitud)
    const mlon = parseAemetCoordToNumber(m.longitud)
    if (mlat == null || mlon == null) continue
    const d = haversineKm(lat, lon, mlat, mlon)
    if (!best || d < best.distKm) best = { id: String(m.id), nombre: String(m.nombre), distKm: d }
  }
  if (!best) throw new Error("No se pudo resolver municipio AEMET cercano.")
  return best
}

// ---------- handler ----------
export async function POST(req: NextRequest) {
  try {
    if (!AEMET_API_KEY) {
      return NextResponse.json({ success: false, error: "Falta AEMET_API_KEY", source: "AEMET" }, { status: 500 })
    }

    const body = (await req.json()) as Body
    const cp = String(body.postalCode || "").trim()
    if (!/^\d{5}$/.test(cp)) {
      return NextResponse.json({ success: false, error: "Código postal inválido (5 dígitos)", source: "AEMET" }, { status: 400 })
    }

    // ✅ fechas opcionales: por defecto hoy -> hoy+6
    const todayStr = new Date().toISOString().slice(0, 10)
    const startStr = normalizeToYYYYMMDD(body.startDate) || todayStr
    const endStr = normalizeToYYYYMMDD(body.endDate) || addDaysYYYYMMDD(startStr, 6)

    const startD = toDateOrNull(startStr)
    const endD = toDateOrNull(endStr)
    if (!startD || !endD) {
      return NextResponse.json(
        { success: false, error: "startDate/endDate inválidas (YYYY-MM-DD)", source: "AEMET", debug: { startStr, endStr } },
        { status: 400 },
      )
    }

    if (startStr < todayStr) {
      return NextResponse.json(
        { success: false, error: "AEMET solo permite previsión futura (desde hoy).", source: "AEMET", debug: { startStr, todayStr } },
        { status: 400 },
      )
    }

    if (endD.getTime() < startD.getTime()) {
      return NextResponse.json({ success: false, error: "La fecha de fin debe ser posterior a la de inicio.", source: "AEMET" }, { status: 400 })
    }

    const requestedDays = diffDaysInclusive(startD, endD)
    if (requestedDays > MAX_FORECAST_DAYS) {
      return NextResponse.json({ success: false, error: `Rango de fechas excedido (máx ${MAX_FORECAST_DAYS} días)`, source: "AEMET" }, { status: 400 })
    }

    // ✅ INE municipio
// ✅ INE municipio:
// 1) primero: como Postman -> usa el CP como municipio (muchos CP coinciden)
// 2) si falla, fallback: CP -> coords -> municipio AEMET más cercano

let muni = String(body.municipio || "").trim()
let muniNombre: string | undefined
let muniDistKm: number | undefined

if (!/^\d{5}$/.test(muni)) muni = cp

let predJson: any = null

try {
  // 1) Intento directo (igual que Postman)
  const endpointDirect = `${AEMET_BASE}/prediccion/especifica/municipio/diaria/${muni}`
  const datosUrlDirect = await aemetGetDatosUrl(endpointDirect)
  predJson = await aemetDownloadFinalJson(datosUrlDirect)
} catch (err) {
  // 2) Fallback: resolver municipio cercano
  const r = await resolveMunicipioIneFromPostalCode(req, cp)
  muni = r.id
  muniNombre = r.nombre
  muniDistKm = r.distKm

  const endpoint = `${AEMET_BASE}/prediccion/especifica/municipio/diaria/${muni}`
  const datosUrl = await aemetGetDatosUrl(endpoint)
  predJson = await aemetDownloadFinalJson(datosUrl)
}

// ✅ map + filtro rango
let data = mapAemetMunicipioDaily(predJson)
data = filterByRange(data, startStr, endStr)

if (data.length === 0) {
  return NextResponse.json(
    { success: false, error: "Sin datos en el rango solicitado", source: "AEMET", municipio: muni, debug: { startStr, endStr } },
    { status: 400 },
  )
}

return NextResponse.json({
  success: true,
  source: "AEMET",
  data,
  postalCode: cp,
  municipio: muni,
  municipioNombre: muniNombre,
  municipioDistanceKm: muniDistKm,
  requestRange: { startDate: startStr, endDate: endStr },
})

  } catch (e) {
    // ✅ aquí verás el motivo real del 500
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "AEMET error", source: "AEMET" },
      { status: 500 },
    )
  }
}
