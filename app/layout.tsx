import type React from "react"
import type { Metadata } from "next"
import localFont from "next/font/local"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"

// ✅ Margem (desde /public/fonts)
// OJO: en next/font/local el path es RELATIVO al archivo actual (app/layout.tsx)
const margem = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    {
      path: "../public/fonts/Fabio Haag Type - Margem Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/Fabio Haag Type - Margem Light Italic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "../public/fonts/Fabio Haag Type - Margem Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/Fabio Haag Type - Margem Medium Italic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "../public/fonts/Fabio Haag Type - Margem Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
})

export const metadata: Metadata = {
  title: "AgroClima - Análisis Climático Agrícola",
  description: "Aplicación para análisis climático orientado al cultivo de pistacho con datos históricos de 20 años",
  generator: "v0.app",
  icons: {
    icon: [{ url: "/apple-icon.png" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={margem.variable}>
      <head>
        {/* ✅ Leaflet */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        {/* ✅ Favicon extra */}
        <link rel="icon" href="/arbol_agroptimum.svg" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  )
}
  