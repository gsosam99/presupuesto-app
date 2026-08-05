import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IENN Gastos App",
  description:
    "Consolidación, triaje y control presupuestario de gastos IENN a partir de reportes SAP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      {/*
        suppressHydrationWarning: extensiones del navegador (Grammarly y
        similares) inyectan atributos en <body> antes de que React hidrate
        (data-gr-ext-installed, data-new-gr-c-s-check-loaded). El aviso no
        corresponde a código propio y solo afecta a este nodo.
      */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
