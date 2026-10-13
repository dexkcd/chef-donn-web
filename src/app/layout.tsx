import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const archivo = localFont({ src: "../fonts/archivo_variable.ttf", variable: "--font-archivo", weight: "100 900", display: "swap" });
const barlow = localFont({
  src: [
    { path: "../fonts/barlow_regular.ttf", weight: "400" },
    { path: "../fonts/barlow_semibold.ttf", weight: "600" },
    { path: "../fonts/barlow_bold.ttf", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = localFont({
  src: [
    { path: "../fonts/barlowcondensed_semibold.ttf", weight: "600" },
    { path: "../fonts/barlowcondensed_bold.ttf", weight: "700" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const plexMono = localFont({
  src: [
    { path: "../fonts/ibmplexmono_regular.ttf", weight: "400" },
    { path: "../fonts/ibmplexmono_semibold.ttf", weight: "600" },
    { path: "../fonts/ibmplexmono_bold.ttf", weight: "700" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Chef Donn's", template: "%s · Chef Donn's" },
  description: "Opening budget, receipts and roadmap for a first restaurant.",
  applicationName: "Chef Donn's",
  appleWebApp: { capable: true, title: "Chef Donn's", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0f4d3a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
