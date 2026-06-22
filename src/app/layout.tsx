import type { Metadata, Viewport } from "next";
import { Playfair_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AuthProvider } from "@/components/providers/AuthProvider";
import { FeedbackButton } from "@/components/ui/FeedbackButton";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

// Audit item 7: dropped "Curated" (banned per BRAND_VOICE) from
// title/OG title and rewrote both descriptions. Em dashes were never
// in the meta — kept simple sentences.
export const metadata: Metadata = {
  metadataBase: new URL("https://composer.onpalate.com"),
  title: "Composer - nights out in NYC",
  description:
    "A night out in New York City, planned for you in under a minute.",
  openGraph: {
    title: "Composer - nights out in NYC",
    description:
      "A night out in New York City, planned for you in under a minute.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pt-[env(safe-area-inset-top)]">
        <AuthProvider>
          {children}
          <FeedbackButton />
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
