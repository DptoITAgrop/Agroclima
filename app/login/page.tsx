"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const sp = useSearchParams()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextUrl = useMemo(() => {
    const n = sp.get("next")
    return n && n.startsWith("/") ? n : "/"
  }, [sp])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || "Credenciales inválidas")
      }

      router.replace(nextUrl)
    } catch (err: any) {
      setError(err?.message || "Error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
     {/* Fondo */}
<div
  className="absolute inset-0 bg-cover bg-center"
  style={{ backgroundImage: "url('/images/Hojas grandes.PNG')" }}
/>

      {/* Overlay oscuro + leve gradiente */}
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/70" />

      {/* Contenido */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-6 sm:p-8">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center overflow-hidden">
                {/* Si tienes logo en public/images/Vector.png */}
                <Image src="/images/Vector.png" alt="Agroptimum" width={28} height={28} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white">Agroclima</h1>
                <p className="text-sm text-white/70">Powered by Agroptimum</p>
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-2xl font-bold text-white	with tracking-tight">Iniciar sesión</h2>
              <p className="text-sm text-white/70 mt-1">
                Accede para ver análisis, exportaciones y recomendaciones.
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Usuario / Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="username"
                    placeholder="usuario@agroptimum.com"
                    className="w-full rounded-xl bg-white/10 border border-white/20 px-10 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/15"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-xl bg-white/10 border border-white/20 px-10 pr-12 py-3 text-white placeholder:text-white/40 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/15"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                    aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:hover:bg-emerald-500 text-white font-semibold py-3 transition shadow-lg shadow-emerald-500/20"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <p className="text-xs text-white/50 text-center">
                Acceso restringido. Si necesitas alta de usuario, contacta con soporte@agroptimum.com.
              </p>
            </form>
          </div>

          {/* Footer mini */}
          <div className="mt-4 text-center text-xs text-white/50">
            © {new Date().getFullYear()} Agroptimum · Agroclima
          </div>
        </div>
      </div>
    </div>
  )
}
