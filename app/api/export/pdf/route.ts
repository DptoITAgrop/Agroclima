import { NextRequest, NextResponse } from "next/server"
import { chromium } from "playwright"
import fs from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Payload = {
  source?: string
  isHistorical?: boolean
  coordinates?: { lat: number; lon: number }
  period?: { start: string; end: string }
  kpis?: { tavg: number; precip: number; eto: number; etc: number; chill: number }
  highlights?: {
    summerHumidity?: { avg: number; note: string }
    chillByYear?: Array<{ year: number; chill: number }>
    frostMarMayByYear?: Array<{ year: number; frost: number }>
  }
  recommendations?: string[]
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function buildHtml(p: Payload, logoDataUrl?: string) {
  const source = escapeHtml(p.source || "NASA_POWER")
  const mode = p.isHistorical ? "Histórico (20 años)" : "Actual"
  const lat = p.coordinates?.lat?.toFixed?.(4) ?? "0.0000"
  const lon = p.coordinates?.lon?.toFixed?.(4) ?? "0.0000"
  const start = escapeHtml(p.period?.start || "")
  const end = escapeHtml(p.period?.end || "")
  const generated = new Date().toLocaleString("es-ES")

  const k = p.kpis || { tavg: 0, precip: 0, eto: 0, etc: 0, chill: 0 }

  const recs = (p.recommendations || []).slice(0, 12)

  const chillRows =
    p.highlights?.chillByYear?.map((r) => `<tr><td>${r.year}</td><td>${Math.round(Math.max(0, r.chill))} h</td></tr>`).join("") ||
    `<tr><td colspan="2" class="muted">Sin datos por año</td></tr>`

  const frostRows =
    p.highlights?.frostMarMayByYear
      ?.map((r) => `<tr><td>${r.year}</td><td>${Math.round(Math.max(0, r.frost))} h</td></tr>`)
      .join("") || `<tr><td colspan="2" class="muted">Sin datos por año</td></tr>`

  const summer = p.highlights?.summerHumidity
  const summerBox = summer
    ? `<div class="callout">
         <div class="callout-title">Humedad relativa (verano)</div>
         <div class="callout-value">${Math.round(summer.avg)}%</div>
         <div class="muted">${escapeHtml(summer.note)}</div>
       </div>`
    : ""

  const logoSrc = logoDataUrl || "" // ✅ dataURL

  return `
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Informe Agroclima</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      color: #111;
      background: #fff;
    }
    .header {
      background: #0a8f4a;
      color: #fff;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .logo {
      width: 46px;
      height: 46px;
      opacity: 0.22;
      object-fit: contain;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.1;
    }
    .subtitle { font-size: 12px; opacity: .95; margin-top: 4px; }
    .metaR { text-align: right; font-size: 12px; line-height: 1.6; opacity: .98; }
    .wrap { padding: 22px 24px 28px; }
    h1 {
      font-size: 18px;
      margin: 0 0 10px;
      font-weight: 700;
    }
    .meta {
      color: #666;
      font-size: 12.5px;
      line-height: 1.7;
      margin-bottom: 14px;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 12px 0 18px;
    }
    .kpi {
      border: 1px solid #e8e8e8;
      border-radius: 10px;
      padding: 12px 12px;
    }
    .kpi .k { font-size: 11px; color: #777; margin-bottom: 6px; }
    .kpi .v { font-size: 16px; font-weight: 800; }
    .grid2 {
      display: grid;
      grid-template-columns: 1.25fr 0.75fr;
      gap: 18px;
      align-items: start;
      margin-top: 10px;
    }
    .sectionTitle { font-size: 15px; font-weight: 800; margin: 10px 0 8px; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { margin: 6px 0; font-size: 13px; }
    .muted { color:#777; font-size: 12px; }
    .card {
      border: 1px solid #e8e8e8;
      border-radius: 12px;
      padding: 12px 12px;
      margin-bottom: 12px;
    }
    .callout {
      border: 1px solid #dff4e7;
      background: #f3fbf6;
      border-radius: 12px;
      padding: 12px;
    }
    .callout-title { font-weight: 800; font-size: 13px; margin-bottom: 6px; }
    .callout-value { font-weight: 900; font-size: 22px; margin-bottom: 2px; color: #0a8f4a; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    th, td {
      border-bottom: 1px solid #eee;
      padding: 8px 6px;
      text-align: left;
    }
    th { color:#555; font-weight: 800; }
    .footer {
      margin-top: 18px;
      color: #888;
      font-size: 10.5px;
      border-top: 1px solid #eee;
      padding-top: 10px;
    }
    @page { margin: 0; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="logo" />` : ""}
      <div>
        <div class="title">Agroclima</div>
        <div class="subtitle">Powered by Agroptimum</div>
      </div>
    </div>
    <div class="metaR">
      <div><b>Fuente:</b> ${source}</div>
      <div><b>Modo:</b> ${mode}</div>
    </div>
  </div>

  <div class="wrap">
    <h1>Informe de Recomendaciones de Riego (Pistacho)</h1>

    <div class="meta">
      <div><b>Ubicación:</b> ${lat}, ${lon}</div>
      <div><b>Coordenadas:</b> ${lat} , ${lon}</div>
      <div><b>Período:</b> ${start} → ${end}</div>
      <div><b>Generado:</b> ${generated}</div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k">Temp media</div><div class="v">${Number(k.tavg || 0).toFixed(1)} °C</div></div>
      <div class="kpi"><div class="k">Precip total</div><div class="v">${Math.round(Math.max(0, k.precip || 0))} mm</div></div>
      <div class="kpi"><div class="k">ETO/ETC (avg)</div><div class="v">${Number(k.eto || 0).toFixed(2)}/${Number(k.etc || 0).toFixed(2)} mm/d</div></div>
      <div class="kpi"><div class="k">Horas frío</div><div class="v">${Math.round(Math.max(0, k.chill || 0))} h</div></div>
    </div>

    <div class="grid2">
      <div>
        <div class="sectionTitle">Resumen ejecutivo</div>
        <ul>
          ${recs.map((r) => `<li>${escapeHtml(r)}</li>`).join("") || `<li class="muted">Sin recomendaciones</li>`}
        </ul>

        <div class="sectionTitle" style="margin-top:16px;">Recomendaciones de riego</div>
        <div class="card">
          <ul>
            <li>Priorizar momentos críticos y recalcular con previsión y sensores (si disponibles)</li>
            <li>Floración (mar–abr): evitar estrés hídrico y cambios bruscos</li>
            <li>Llenado fruto (may–ago): máxima demanda (planificar dotación)</li>
            <li>Maduración (sep): reducir progresivamente para mejorar calidad</li>
          </ul>
        </div>
      </div>

      <div>
        ${summerBox}

        <div class="sectionTitle" style="margin-top:12px;">Horas frío por año</div>
        <div class="card">
          <table>
            <thead><tr><th>Año</th><th>Horas frío</th></tr></thead>
            <tbody>${chillRows}</tbody>
          </table>
        </div>

        <div class="sectionTitle">Heladas (15 Mar – 15 May)</div>
        <div class="card">
          <table>
            <thead><tr><th>Año</th><th>Horas helada</th></tr></thead>
            <tbody>${frostRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="footer">
      Informe generado automáticamente por Agroclima (Agroptimum). Revisión recomendada antes de decisiones agronómicas.
    </div>
  </div>
</body>
</html>
`
}

async function readLogoDataUrl() {
  try {
    // ✅ public/images/Vector.png
    const logoPath = path.join(process.cwd(), "public", "images", "Vector.png")
    const buf = await fs.readFile(logoPath)
    const b64 = buf.toString("base64")
    return `data:image/png;base64,${b64}`
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = (await req.json()) as Payload

    const logoDataUrl = await readLogoDataUrl()
    const html = buildHtml(payload, logoDataUrl || undefined)

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    await page.setContent(html, { waitUntil: "load" })

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    })

    await browser.close()

    return new NextResponse(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Agroclima_recomendaciones.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "PDF error" }, { status: 500 })
  }
}
