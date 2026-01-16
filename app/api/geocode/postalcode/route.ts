import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { postalCode } = await req.json()
    const cp = String(postalCode || "").trim()

    if (!/^\d{5}$/.test(cp)) {
      return NextResponse.json({ success: false, error: "Código postal inválido (5 dígitos)" }, { status: 400 })
    }

    const q = encodeURIComponent(`${cp}, Spain`)
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Agroclima/1.0 (contact: support@agroptimum.com)",
        Accept: "application/json",
      },
      cache: "no-store",
    })

    const data: any[] = await res.json().catch(() => [])
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ success: false, error: "No se encontró ese código postal" }, { status: 404 })
    }

    const lat = Number(data[0].lat)
    const lon = Number(data[0].lon)

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ success: false, error: "Respuesta inválida del geocoder" }, { status: 500 })
    }

    return NextResponse.json({ success: true, latitude: lat, longitude: lon })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Geocoding error" }, { status: 500 })
  }
}
