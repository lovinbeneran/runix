"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import AdminBottomDock from "@/components/AdminBottomDock";
import { useTenant } from "@/hooks/useTenant";
import NotificationBell from "@/components/NotificationBell";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tenantId } = useTenant();

  const [printMode, setPrintMode] = useState<"browser" | "rawbt" | "bluetooth">("browser");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mode = localStorage.getItem("runix_print_mode");
      if (mode === "rawbt") setPrintMode("rawbt");
      else if (mode === "bluetooth") setPrintMode("bluetooth");
      else setPrintMode("browser");
    }
  }, []);

  // Title generator per page route
  function getPageMeta(path: string) {
    if (path.startsWith("/products")) return { title: "Katalog Produk", subtitle: "Kelola daftar makanan, minuman, dan kategori" };
    if (path.startsWith("/staff-accounts")) return { title: "Staff Account & PIN", subtitle: "Kelola akun kasir dan otorisasi PIN supervisor" };
    if (path.startsWith("/promos")) return { title: "Diskon & Promo", subtitle: "Atur promo otomatis yang berlaku di POS" };
    if (path.startsWith("/reports")) return { title: "Laporan Omset & Keuangan", subtitle: "Ringkasan grafik omset harian, bulanan, dan metode pembayaran" };
    if (path.startsWith("/settings")) return { title: "Pengaturan Umum", subtitle: "Konfigurasi identitas toko, pajak, dan cetak struk" };
    if (path.startsWith("/printer")) return { title: "Konfigurasi Printer Struk", subtitle: "Atur mode cetak Bluetooth, RawBT, atau Browser" };
    if (path.startsWith("/dev")) return { title: "Developer Console", subtitle: "Manajemen tenant, pengguna, dan lisensi sistem" };
    return { title: "Dashboard Analitik RuniX", subtitle: `Tenant ID: ${tenantId || "-"}` };
  }

  const pageMeta = getPageMeta(pathname);

  return (
    <>
      <style>{`
        .admin-shell-wrapper {
          min-height: 100vh;
          min-height: 100dvh;
          background: var(--bg);
          display: flex;
          flex-direction: column;
        }

        .admin-shell-sticky-header {
          position: sticky;
          top: 0;
          z-index: 90;
          background: var(--bg);
          padding: 14px 16px 6px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .admin-shell-body-container {
          max-width: 1440px;
          width: 100%;
          margin: 0 auto;
          padding: 10px 16px 115px;
          flex: 1;
        }

        @media (max-width: 768px) {
          .admin-shell-sticky-header {
            padding: 10px 12px 4px;
          }
          .admin-shell-body-container {
            padding: 8px 12px 105px;
          }
        }
      `}</style>

      <div className="admin-shell-wrapper">
        {/* GLOBAL PERSISTENT HEADER - FIXED AT TOP */}
        <header className="admin-shell-sticky-header">
          <div style={{ maxWidth: 1440, margin: "0 auto" }}>
            <PageHeader title={pageMeta.title} subtitle={pageMeta.subtitle} size="large">
              <NotificationBell tenantId={tenantId} />
              <span style={{ padding: "6px 14px", borderRadius: 999, background: "var(--input-bg)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                Print: <b>{printMode === "bluetooth" ? "Bluetooth" : printMode === "rawbt" ? "RawBT" : "Browser"}</b>
              </span>
            </PageHeader>
          </div>
        </header>

        {/* PAGE CONTENT CONTAINER (DASHBOARD / PRODUCTS / STAFF / REPORTS / SETTINGS / PRINTER) */}
        <main className="admin-shell-body-container">
          {children}
        </main>

        {/* GLOBAL PERSISTENT DOCK NAV - FLOATING AT BOTTOM */}
        <AdminBottomDock />
      </div>
    </>
  );
}
