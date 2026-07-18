import type { Metadata, Viewport } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import "./globals.css";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

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
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const body = (
    <html lang="en">
      <body className={`${outfit.variable} ${plexMono.variable} antialiased`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );

  if (!clerkEnabled) return body;

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#afff00",
          colorBackground: "#0a0a0a",
          colorForeground: "#f7f7f4",
          colorInput: "#141414",
          borderRadius: "0.75rem",
        },
      }}
    >
      {body}
    </ClerkProvider>
  );
}
