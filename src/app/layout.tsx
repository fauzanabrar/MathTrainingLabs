import type { Metadata, Viewport } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Math Training Lab - Adaptive Math Practice Online",
  description:
    "Free adaptive math practice for addition, subtraction, multiplication, and division. Level-based drills with instant feedback, progress tracking, and customizable settings. Perfect for students.",
  keywords: [
    "math practice",
    "math drills",
    "addition",
    "subtraction",
    "multiplication",
    "division",
    "math training",
    "adaptive learning",
    "mental math",
  ],
  applicationName: "Math Training Lab",
  manifest: "/manifest.json",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://math-training.vercel.app"
  ),
  openGraph: {
    title: "Math Training Lab - Adaptive Math Practice Online",
    description:
      "Free adaptive math practice for addition, subtraction, multiplication, and division. Level-based drills with instant feedback, progress tracking, and customizable settings. Perfect for students.",
    url: "/",
    siteName: "Math Training Lab",
    images: [
      {
        url: "/icons/icon-512.png",
        width: 512,
        height: 512,
        alt: "Math Training Lab Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Math Training Lab - Adaptive Math Practice Online",
    description:
      "Free adaptive math practice for addition, subtraction, multiplication, and division.",
    images: ["/icons/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  verification: {
    google: "UROymNDYN_iCupa77i48MAviKpdv9jsuIuRBWmSplJ4",
  },
  authors: [
    {
      name: "Math Training Lab",
    },
  ],
  appleWebApp: {
    capable: true,
    title: "Math Training Lab",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff6b35",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalApplication",
    name: "Math Training Lab",
    description:
      "Free adaptive math practice for addition, subtraction, multiplication, and division",
    url: "https://math-training.vercel.app",
    applicationCategory: "EducationalApplication",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Organization",
      name: "Math Training Lab",
    },
    educationalLevel: "All",
    educationalAudience: "Students",
    inLanguage: "en-US",
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${outfit.variable} ${spaceGrotesk.variable}`}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
