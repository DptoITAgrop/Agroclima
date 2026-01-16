import { NextRequest, NextResponse } from "next/server"

type Body = { email?: string; password?: string }

// ✅ Cambia estos 2 usuarios por los tuyos
const USERS = [
  { email: "dptocomercial@agroptimum.com", password: "Comerciales2026@" },
  { email: "dptotecnicos@agroptimum.com", password: "Tecnicos2026@" },
]

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body
  const email = String(body.email || "").trim().toLowerCase()
  const password = String(body.password || "")

  const ok = USERS.some((u) => u.email === email && u.password === password)
  if (!ok) return NextResponse.json({ success: false, error: "Credenciales inválidas" }, { status: 401 })

  const res = NextResponse.json({ success: true })
  res.cookies.set("agroclima_auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12h
  })

  return res
}
