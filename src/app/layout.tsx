import type { Metadata } from "next";
import { Source_Sans_3, Instrument_Serif, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CS 323 — The AI Awakening",
  description: "Weekly reading discussion interviews for Stanford CS 323",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CS 323 — The AI Awakening",
    description: "Weekly reading discussion interviews for Stanford CS 323",
    images: [{ url: "/brynjolfsson.jpeg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CS 323 — The AI Awakening",
    description: "Weekly reading discussion interviews for Stanford CS 323",
    images: ["/brynjolfsson.jpeg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sourceSans.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster theme="dark" position="bottom-center" />
      </body>
    </html>
  );
}
