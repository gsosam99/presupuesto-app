import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV === "development";

// React usa eval() en desarrollo para reconstruir stacks y para el fast refresh.
// En producción nunca lo hace, así que 'unsafe-eval' se habilita solo en dev.
const scriptSrc = esDesarrollo
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  // El indicador de ruta de Next (botón circular) va en bottom-right: en
  // bottom-left (default) tapa los controles inferiores del sidebar
  // (Configuración / cerrar sesión). Solo afecta a desarrollo.
  devIndicators: {
    position: "bottom-right",
  },

  // El exportador del Flujo E lee la plantilla y Chart.js desde disco en
  // runtime; sin esto no viajan al bundle serverless de Vercel.
  outputFileTracingIncludes: {
    "/api/exportar/dashboard": [
      "./src/lib/export/plantilla-dashboard.html",
      "./node_modules/chart.js/dist/chart.umd.js",
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc, // unsafe-inline: hidratación de Next
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
