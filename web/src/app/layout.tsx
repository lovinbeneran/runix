import type { Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import PWARegister from "@/components/PWARegister";
import OfflineBanner from "@/components/OfflineBanner";
import BrandColorProvider from "@/components/BrandColorProvider";
import { ToastProvider } from "@/components/Toast";
import { PrintingOverlayProvider } from "@/components/PrintingOverlay";
import MaintenanceGuard from "@/components/MaintenanceGuard";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata = {
  title: "RuniX",
  description: "POS warkop multi-tenant",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#d59567",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        {/* Preconnect to font CDNs for faster loading */}
        <link rel="preconnect" href="https://db.onlinewebfonts.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ErrorBoundary>
          <ToastProvider>
            <PrintingOverlayProvider>
              <MaintenanceGuard>
                <BrandColorProvider />
                <Suspense fallback={null}>
                  <OfflineBanner />
                  <PWARegister />
                </Suspense>
                {children}
              </MaintenanceGuard>
            </PrintingOverlayProvider>
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
