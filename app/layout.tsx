import type { Metadata, Viewport } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "GOLAZO. Every tick is a matchday",
  description:
    "The World Cup fan game built on the TxLINE feed. Call the next stat, build a streak, run a squad sweepstake, and let PunditBot narrate every twist.",
  openGraph: {
    title: "GOLAZO. Every tick is a matchday",
    description:
      "Hi-Lo streaks on live World Cup data, squad sweepstakes, and a pundit in your pocket.",
    images: ["/assets/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#081231",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${plexMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
