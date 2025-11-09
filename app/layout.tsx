import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Lookable: Instant, No-code Data Visualization for Student Research",
    template: "%s • Lookable",
  },
  description: "Open-source, hallucination-free charts from trusted public data.",
  icons: { icon: "/favicon.ico" },
  openGraph: {
    title: "Lookable",
    description: "Instant, no-code charts from open data.",
    url: "/",
    siteName: "Lookable",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Lookable preview" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lookable",
    description: "Instant, no-code charts from open data.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="theme-light">{/* force light theme */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <nav style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #eee" }}>
          <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
            <a href="/" className="page-title" style={{ fontSize: 16, textDecoration: "none" }}>Lookable</a>
            <div style={{ display: "flex", gap: 12 }}>
              <a href="/" className="chip">Home</a>
              <a href="/style" className="chip">Style from image</a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}

