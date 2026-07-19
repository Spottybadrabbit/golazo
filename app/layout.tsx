import type { Metadata, Viewport } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import LiveDataProvider from "@/components/LiveDataProvider";
import PlayerSync from "@/components/PlayerSync";
import CelebrationProvider from "@/components/celebrate/Celebration";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
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
        <ConvexClientProvider>
          <LiveDataProvider>
            <PlayerSync>
              <CelebrationProvider>
                {children}
                <OnboardingGate />
              </CelebrationProvider>
            </PlayerSync>
          </LiveDataProvider>
        </ConvexClientProvider>
        <Analytics />
      </body>
    </html>
  );

  if (!clerkEnabled) return body;

  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#afff00",
          colorPrimaryForeground: "#0a0a0a",
          // Card sits one step above pure black so the wallet buttons on top
          // of it read as distinct surfaces instead of vanishing into the bg.
          colorBackground: "#151515",
          colorForeground: "#f7f7f4",
          colorMuted: "#1c1c1c",
          colorMutedForeground: "#b8b8b0",
          colorInput: "#1f1f1f",
          colorInputForeground: "#f7f7f4",
          colorNeutral: "#f7f7f4",
          // A clearly visible border — the old config left this at the faint
          // default, which is why the Phantom / MetaMask buttons disappeared.
          colorBorder: "rgba(247, 247, 244, 0.32)",
          colorRing: "#afff00",
          borderRadius: "0.75rem",
        },
        elements: {
          // Give the wallet / social connection buttons a solid, high-contrast
          // surface with a bright border and light label so they're obvious.
          socialButtonsBlockButton:
            "border border-[rgba(247,247,244,0.32)] bg-[#1f1f1f] text-[#f7f7f4] transition-colors hover:bg-[#2a2a2a] hover:border-[#afff00]",
          socialButtonsBlockButtonText: "text-[#f7f7f4] font-semibold",
          socialButtonsProviderIcon: "opacity-100",
          dividerLine: "bg-[rgba(247,247,244,0.18)]",
          dividerText: "text-[#b8b8b0]",
          formFieldInput:
            "border border-[rgba(247,247,244,0.32)] bg-[#1f1f1f] text-[#f7f7f4]",
          headerTitle: "text-[#f7f7f4]",
          headerSubtitle: "text-[#b8b8b0]",
          formButtonPrimary:
            "bg-[#afff00] text-[#0a0a0a] font-bold hover:bg-[#86cc00]",
          footerActionLink: "text-[#afff00] hover:text-[#86cc00]",
          backLink: "text-[#afff00] hover:text-[#86cc00]",
        },
      }}
    >
      {body}
    </ClerkProvider>
  );
}
