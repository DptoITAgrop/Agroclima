import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Temporal = "hourly" | "daily";

function toYYYYMMDD(d: string) {
  // Acepta "YYYY-MM-DD" o "YYYYMMDD" y devuelve "YYYYMMDD"
  if (/^\d{8}$/.test(d)) return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replaceAll("-", "");
  throw new Error(`Invalid date format: ${d}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const temporal: Temporal = body.temporal ?? "daily";
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const start = toYYYYMMDD(body.start);
    const end = toYYYYMMDD(body.end);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "Invalid latitude/longitude" }, { status: 400 });
    }

    // Parámetros por defecto (puedes permitir que te los pasen desde el body)
    const parameters =
      body.parameters ??
      (temporal === "hourly"
        ? "T2M,RH2M,WS2M,ALLSKY_SFC_SW_DWN"
        : "T2M_MAX,T2M_MIN,T2M,PRECTOTCORR,WS2M,RH2M,ALLSKY_SFC_SW_DWN");

    const community = body.community ?? "AG"; // NASA recomienda AG (mayúsculas) y a veces ag funciona igual

    const url =
      `https://power.larc.nasa.gov/api/temporal/${temporal}/point` +
      `?parameters=${encodeURIComponent(parameters)}` +
      `&community=${encodeURIComponent(community)}` +
      `&latitude=${encodeURIComponent(String(latitude))}` +
      `&longitude=${encodeURIComponent(String(longitude))}` +
      `&start=${encodeURIComponent(start)}` +
      `&end=${encodeURIComponent(end)}` +
      `&format=JSON`;

    const r = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      // opcional: cache: "no-store"
    });

    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json(
        { error: "NASA POWER request failed", status: r.status, details: text.slice(0, 1000) },
        { status: 502 }
      );
    }

    const data = await r.json();
    return NextResponse.json({ url, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
