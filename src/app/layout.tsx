import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SPANDANA – AI Cardiac Intelligence",
  description:
    "See Beyond the Heartbeat. Screening 10-second, 12-lead ECG recordings for Left Ventricular Hypertrophy (LVH) — comparing traditional voltage criteria (Sokolow-Lyon, Cornell) with Perceptron and CNN models. Not a medical device.",
  keywords: [
    "SPANDANA",
    "ECG",
    "LVH",
    "Left Ventricular Hypertrophy",
    "Sokolow-Lyon",
    "Cornell criteria",
    "cardiac AI research",
    "PTB-XL",
  ],
  icons: {
    icon: "/spandana-icon.svg",
  },
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#0B1728",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
