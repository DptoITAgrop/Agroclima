import { NextRequest, NextResponse } from "next/server"

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ✅ NO proteger nunca /api (AEMET y exports dependen de esto)
  if (pathname.startsWith("/api")) return NextResponse.next()

  // Rutas públicas (web)
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg")

  if (isPublic) return NextResponse.next()

  // Auth por cookie
  const auth = req.cookies.get("agroclima_auth")?.value
  if (auth === "1") return NextResponse.next()

  // Redirigir a login y guardar "next"
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.searchParams.set("next", pathname)
  return NextResponse.redirect(url)
}

export const config = {
  // ✅ aplica a todo MENOS /api y assets internos
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
