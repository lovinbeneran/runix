"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  DEFAULT_LANDING_CONFIG,
  getCachedLandingConfig,
  subscribeLandingConfig,
  LandingConfig,
} from "@/lib/landing-config";

export default function HomePage() {
  const r = useRouter();
  const [config, setConfig] = useState<LandingConfig>(
    getCachedLandingConfig() || DEFAULT_LANDING_CONFIG
  );

  // APK: langsung ke login, skip landing page
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      r.replace("/login");
    }
  }, [r]);

  // Subscribe to landing config from Firestore
  useEffect(() => {
    try {
      const unsub = subscribeLandingConfig((c) => setConfig(c));
      return () => unsub();
    } catch {
      return () => {};
    }
  }, []);

  const { hero, features, featuresTitle, pricing, pricingTitle, pricingSubtitle, ctaTitle, ctaSubtitle, footerText } = config;
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [activeTabPreview, setActiveTabPreview] = useState<"pos" | "reports" | "stock">("pos");
  
  // Custom Device Slider State for Pricing
  const [deviceSlider, setDeviceSlider] = useState<number>(1);
  
  // Interactive Calculator State
  const [dailyOrders, setDailyOrders] = useState<number>(45);
  const [avgTicketPrice, setAvgTicketPrice] = useState<number>(25000);

  // Calculated estimates
  const monthlyRevenue = dailyOrders * avgTicketPrice * 30;
  const estimatedTimeSavedHours = Math.round((dailyOrders * 2.5 * 30) / 60);
  const estimatedLeakagePrevented = Math.round(monthlyRevenue * 0.08);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: "Apakah RuniX POS bisa digunakan secara offline?",
      a: "Ya! RuniX dilengkapi dengan arsitektur hibrid lokal. Transaksi kasir tetap berjalan lancar tanpa koneksi internet dan otomatis tersinkron saat terhubung kembali."
    },
    {
      q: "Printer thermal jenis apa saja yang didukung RuniX?",
      a: "RuniX mendukung printer Bluetooth Thermal 58mm & 80mm, USB Thermal, serta integrasi pencetakan langsung melalui RawBT Android."
    },
    {
      q: "Apakah ada biaya tambahan atau royalti penjualan?",
      a: "Sama sekali tidak ada. Semua paket RuniX berlaku flat bulanan/tahunan tanpa potong komisi penjualan outlet Anda."
    },
    {
      q: "Berapa lama proses setup awal sampai kasir siap pakai?",
      a: "Hanya butuh waktu kurang dari 3 menit! Cukup daftar, masukkan nama menu & harga, lalu kasir langsung siap digunakan."
    }
  ];

  return (
    <main>
      <style>{`
        /* MODERN EDITORIAL SPLIT LANDING PAGE SYSTEM */
        .rn-landing {
          min-height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          font-family: var(--font-primary, ui-sans-serif, system-ui, -apple-system, sans-serif);
          overflow-x: hidden;
        }

        /* Top Bar Navigation */
        .rn-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid #e2e8f0;
          padding: 14px 28px;
        }
        .rn-nav-container {
          max-width: 1280px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .rn-logo-img {
          height: 38px;
          width: auto;
          object-fit: contain;
        }
        .rn-nav-links {
          display: flex;
          align-items: center;
          gap: 28px;
        }
        .rn-nav-link {
          color: #475569;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .rn-nav-link:hover {
          color: var(--brand, #d59567);
        }

        /* Hero Split Screen Section */
        .rn-hero-section {
          padding: 70px 28px 90px;
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1.05fr;
          gap: 50px;
          align-items: center;
        }
        @media (max-width: 1024px) {
          .rn-hero-section {
            grid-template-columns: 1fr;
            padding: 40px 20px 60px;
            gap: 40px;
          }
        }
        .rn-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 999px;
          background: rgba(213, 149, 103, 0.12);
          border: 1px solid rgba(213, 149, 103, 0.3);
          color: var(--brand, #d59567);
          font-size: 13px;
          font-weight: 800;
          margin-bottom: 20px;
        }
        .rn-hero-title {
          font-size: 52px;
          font-weight: 900;
          line-height: 1.12;
          letter-spacing: -0.04em;
          color: #0f172a;
          margin-bottom: 20px;
        }
        @media (max-width: 640px) {
          .rn-hero-title { font-size: 36px; }
        }
        .rn-hero-title em {
          font-style: normal;
          background: linear-gradient(135deg, #0f172a 0%, var(--brand, #d59567) 50%, #9a0002 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .rn-hero-sub {
          font-size: 17px;
          color: #475569;
          line-height: 1.6;
          margin-bottom: 32px;
          max-width: 540px;
        }
        .rn-hero-btns {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 36px;
        }

        .btn-rn-primary {
          padding: 14px 30px;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--brand, #d59567) 0%, #9a0002 100%);
          color: #ffffff;
          font-weight: 900;
          font-size: 15px;
          border: none;
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(154, 0, 2, 0.25);
          transition: all 0.2s ease;
        }
        .btn-rn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(154, 0, 2, 0.35);
        }
        .btn-rn-secondary {
          padding: 14px 28px;
          border-radius: 16px;
          background: #ffffff;
          color: #0f172a;
          font-weight: 800;
          font-size: 15px;
          border: 1px solid #cbd5e1;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s ease;
        }
        .btn-rn-secondary:hover {
          background: #f1f5f9;
          border-color: var(--brand, #d59567);
          transform: translateY(-2px);
        }

        .rn-trust-proof {
          display: flex;
          align-items: center;
          gap: 16px;
          padding-top: 20px;
          border-top: 1px dashed #cbd5e1;
        }
        .rn-avatar-group {
          display: flex;
        }
        .rn-avatar-circle {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 2px solid #ffffff;
          margin-left: -10px;
          background: var(--brand, #d59567);
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          display: grid;
          place-items: center;
        }
        .rn-avatar-circle:first-child { margin-left: 0; }

        /* Right Column Showcase Card */
        .rn-showcase-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 32px;
          padding: 24px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
          position: relative;
        }
        .rn-showcase-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 20px;
        }
        .rn-tab-pill {
          padding: 8px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 800;
          border: 1px solid transparent;
          background: #f1f5f9;
          color: #64748b;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .rn-tab-pill.active {
          background: rgba(213, 149, 103, 0.15);
          color: var(--brand, #d59567);
          border-color: rgba(213, 149, 103, 0.4);
        }

        /* Key Metrics Row (4 Cards) */
        .rn-metrics-strip {
          background: #ffffff;
          border-y: 1px solid #e2e8f0;
          padding: 40px 28px;
        }
        .rn-metrics-grid {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) {
          .rn-metrics-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .rn-metrics-grid { grid-template-columns: 1fr; }
        }
        .rn-metric-item {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 24px;
          text-align: center;
        }
        .rn-metric-val {
          font-size: 36px;
          font-weight: 900;
          color: var(--brand, #d59567);
          font-family: monospace;
          margin-bottom: 6px;
        }
        .rn-metric-lbl {
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
        }

        /* Calculator Section */
        .rn-calc-section {
          padding: 90px 28px;
          max-width: 1100px;
          margin: 0 auto;
        }
        .rn-calc-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 32px;
          padding: 40px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 40px;
        }
        @media (max-width: 860px) {
          .rn-calc-card { grid-template-columns: 1fr; padding: 28px; }
        }

        /* Feature Stories (Zig-Zag) */
        .rn-zigzag-section {
          padding: 90px 28px;
          max-width: 1280px;
          margin: 0 auto;
        }
        .rn-zigzag-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
          margin-bottom: 80px;
        }
        @media (max-width: 900px) {
          .rn-zigzag-row { grid-template-columns: 1fr; gap: 30px; }
          .rn-zigzag-row.reverse { display: flex; flex-direction: column-reverse; }
        }
        .rn-zigzag-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 28px;
          padding: 32px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04);
        }

        /* Testimonials */
        .rn-testimonials-section {
          background: #ffffff;
          padding: 90px 28px;
          border-t: 1px solid #e2e8f0;
        }
        .rn-testi-grid {
          max-width: 1280px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) {
          .rn-testi-grid { grid-template-columns: 1fr; }
        }
        .rn-testi-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 24px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        /* FAQ Accordion */
        .rn-faq-section {
          padding: 90px 28px;
          max-width: 840px;
          margin: 0 auto;
        }
        .rn-faq-item {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          margin-bottom: 14px;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .rn-faq-header {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 800;
          font-size: 16px;
          color: #0f172a;
          cursor: pointer;
        }
        .rn-faq-body {
          padding: 0 24px 20px;
          color: #475569;
          font-size: 14px;
          line-height: 1.6;
        }

        /* Bottom Banner & Footer */
        .rn-cta-banner {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #ffffff;
          padding: 70px 28px;
          text-align: center;
        }
        .rn-footer {
          background: #0f172a;
          color: #94a3b8;
          padding: 40px 28px;
          text-align: center;
          font-size: 14px;
          border-top: 1px solid #1e293b;
        }
      `}</style>

      <div className="rn-landing">
        {/* Top Sticky Navigation */}
        <nav className="rn-nav">
          <div className="rn-nav-container">
            <img src="/logo-header.png" alt="RuniX POS" className="rn-logo-img" />

            <div className="rn-nav-links">
              <a href="#solusi" className="rn-nav-link">Fitur Solusi</a>
              <a href="#kalkulator" className="rn-nav-link">Kalkulator Profit</a>
              <a href="#harga" className="rn-nav-link">Paket Harga</a>
              <a href="#testimoni" className="rn-nav-link">Testimoni</a>
              <a href="#faq" className="rn-nav-link">FAQ</a>
              <button className="btn-rn-secondary" style={{ padding: "8px 18px", fontSize: 13 }} onClick={() => r.push("/login")}>
                Masuk Kasir
              </button>
              <button className="btn-rn-primary" style={{ padding: "8px 18px", fontSize: 13 }} onClick={() => r.push("/setup")}>
                Daftar Outlet
              </button>
            </div>
          </div>
        </nav>

        {/* SECTION 1: Split Screen Hero */}
        <section className="rn-hero-section">
          <div>
            <div className="rn-hero-badge">
              ⚡ POS Kasir Hibrid Multi-Tenant Terdepan
            </div>
            <h1 className="rn-hero-title">
              Sistem Kasir Warkop & Kafe Yang <em>Cepat, Akurat, & Bebas Ribet</em>
            </h1>
            <p className="rn-hero-sub">
              Didesain khusus untuk mempercepat antrean transaksi kasir, otomatisasi rekap stok bahan baku, dan pemantauan omset bisnis Anda kapan saja & di mana saja.
            </p>

            <div className="rn-hero-btns">
              <button className="btn-rn-primary" onClick={() => r.push("/setup")}>
                🚀 Mulai Registrasi Outlet
              </button>
              <button className="btn-rn-secondary" onClick={() => r.push("/login")}>
                🔑 Masuk Sistem Kasir
              </button>
            </div>

            <div className="rn-trust-proof">
              <div className="rn-avatar-group">
                <div className="rn-avatar-circle">☕</div>
                <div className="rn-avatar-circle">🍵</div>
                <div className="rn-avatar-circle">🥐</div>
                <div className="rn-avatar-circle">+99</div>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>
                Dipercaya <strong style={{ color: "#0f172a" }}>150+ Warkop & Resto</strong> di Seluruh Indonesia
              </div>
            </div>
          </div>

          {/* Right Column Interactive POS Card */}
          <div className="rn-showcase-card">
            <div className="rn-showcase-header">
              <div style={{ display: "flex", gap: 6 }}>
                <div className="rn-tab-pill active">📱 Live POS Screen</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "4px 10px", borderRadius: 999 }}>
                🟢 Kasir Online Active
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: 16 }}>
              <div style={{ background: "#f8fafc", padding: 16, borderRadius: 16, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--brand, #d59567)", marginBottom: 10 }}>
                  📁 KATALOG MENU KASIR
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#ffffff", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>Es Kopi Gula Aren</div>
                    <div style={{ fontSize: 11, color: "var(--brand, #d59567)", fontWeight: 800 }}>Rp 18.000</div>
                  </div>
                  <div style={{ background: "#ffffff", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>Roti Bakar Cokelat</div>
                    <div style={{ fontSize: 11, color: "var(--brand, #d59567)", fontWeight: 800 }}>Rp 15.000</div>
                  </div>
                </div>
              </div>

              <div style={{ background: "rgba(213, 149, 103, 0.08)", padding: 16, borderRadius: 16, border: "1.5px solid var(--brand, #d59567)" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>🛒 Billing Nota</div>
                <div style={{ marginTop: 10, fontSize: 11, color: "#475569", display: "flex", justifyContent: "space-between" }}>
                  <span>1x Kopi Aren</span>
                  <span>18k</span>
                </div>
                <div style={{ marginTop: 20, paddingTop: 8, borderTop: "1px solid #cbd5e1", display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 14 }}>
                  <span>Total</span>
                  <span style={{ color: "var(--brand, #d59567)" }}>Rp 18.000</span>
                </div>
                <button className="btn-rn-primary" style={{ width: "100%", marginTop: 12, padding: "8px", fontSize: 12 }}>
                  Bayar (Cetak Struk)
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Key Metrics Strip */}
        <section className="rn-metrics-strip">
          <div className="rn-metrics-grid">
            <div className="rn-metric-item">
              <div className="rn-metric-val">0.1s</div>
              <div className="rn-metric-lbl">Respon Transaksi Kasir Instan</div>
            </div>
            <div className="rn-metric-item">
              <div className="rn-metric-val">100%</div>
              <div className="rn-metric-lbl">Dukungan Thermal Bluetooth</div>
            </div>
            <div className="rn-metric-item">
              <div className="rn-metric-val">3x</div>
              <div className="rn-metric-lbl">Lebih Cepat Dari Pencatatan Manual</div>
            </div>
            <div className="rn-metric-item">
              <div className="rn-metric-val">0%</div>
              <div className="rn-metric-lbl">Risiko Kebocoran Omset Resto</div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Interactive Profit & Time Saved Calculator */}
        <section className="rn-calc-section" id="kalkulator">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: "#0f172a" }}>Hitung Potensi Efisiensi Warkop Anda</h2>
            <p style={{ fontSize: 15, color: "#64748b", marginTop: 8 }}>Simulasi penghematan waktu dan perlindungan omset harian bersama RuniX POS.</p>
          </div>

          <div className="rn-calc-card">
            <div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", display: "block", marginBottom: 8 }}>
                  Jumlah Transaksi Harian: <span style={{ color: "var(--brand, #d59567)" }}>{dailyOrders} Pesanan/hari</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="300"
                  value={dailyOrders}
                  onChange={(e) => setDailyOrders(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--brand, #d59567)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", display: "block", marginBottom: 8 }}>
                  Rata-rata Nilai Transaksi: <span style={{ color: "var(--brand, #d59567)" }}>Rp {avgTicketPrice.toLocaleString("id-ID")}</span>
                </label>
                <input
                  type="range"
                  min="10000"
                  max="150000"
                  step="5000"
                  value={avgTicketPrice}
                  onChange={(e) => setAvgTicketPrice(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--brand, #d59567)" }}
                />
              </div>
            </div>

            <div style={{ background: "#f8fafc", padding: 24, borderRadius: 20, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Estimasi Omset Bulanan:</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", fontFamily: "monospace" }}>
                  Rp {monthlyRevenue.toLocaleString("id-ID")}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Waktu Operasional Dihemat:</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#10b981" }}>
                  ⏱️ ~{estimatedTimeSavedHours} Jam / Bulan
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Potensi Mencegah Kebocoran Stok:</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--brand, #d59567)", fontFamily: "monospace" }}>
                  🛡️ Rp {estimatedLeakagePrevented.toLocaleString("id-ID")} / bulan
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: Zig-Zag Asymmetric Features */}
        <section className="rn-zigzag-section" id="solusi">
          <div className="rn-zigzag-row">
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--brand, #d59567)", marginBottom: 8 }}>01. PEMROSESAN TRANSAKSI CANGGIH</div>
              <h2 style={{ fontSize: 34, fontWeight: 900, color: "#0f172a", marginBottom: 16 }}>Kasir Kilat Tanpa Hambatan Antrean</h2>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6 }}>
                Antarmuka kasir didesain khusus agar penginputan pesanan dapat dilakukan dalam hitungan detik. Mendukung cetak struk otomatis dan integrasi dapur.
              </p>
            </div>
            <div className="rn-zigzag-card">
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", marginBottom: 12 }}>⚡ Keunggulan Modul Kasir:</div>
              <ul style={{ paddingLeft: 20, color: "#475569", fontSize: 14, display: "grid", gap: 10 }}>
                <li>Pencarian produk instan dengan dukungan filter kategori menu.</li>
                <li>Mendukung varian topping, kustom tingkat manis & es.</li>
                <li>Pilihan pembayaran Cash, QRIS, & Transfer Instan.</li>
              </ul>
            </div>
          </div>

          <div className="rn-zigzag-row reverse">
            <div className="rn-zigzag-card">
              <div style={{ fontSize: 14, fontWeight: 900, color: "#0f172a", marginBottom: 12 }}>📊 Keunggulan Laporan Analytics:</div>
              <ul style={{ paddingLeft: 20, color: "#475569", fontSize: 14, display: "grid", gap: 10 }}>
                <li>Kalkulator HPP & Laba Bersih otomatis setiap hari.</li>
                <li>Rekap laporan shift kasir tanpa selisih kas.</li>
                <li>Grafik jam teramai penjualan resto/warkop.</li>
              </ul>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--brand, #d59567)", marginBottom: 8 }}>02. LAPORAN & KALKULASI AUTOMATIS</div>
              <h2 style={{ fontSize: 34, fontWeight: 900, color: "#0f172a", marginBottom: 16 }}>Pantau Omset Real-time Kapan Saja</h2>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6 }}>
                Dapatkan rekapitulasi penjualan harian, mingguan, hingga bulanan secara transparan. Tahu persis keuntungan bersih bisnis Anda.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 4.5: Interactive Modular Slider & Pricing Matrix */}
        <section className="rn-calc-section" id="harga" style={{ paddingTop: 60, paddingBottom: 60 }}>
          <div style={{ textAlign: "center", marginBottom: 45 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 999, background: "rgba(213, 149, 103, 0.12)", color: "var(--brand, #d59567)", fontSize: 13, fontWeight: 900, marginBottom: 12 }}>
              💎 PILIHAN PAKET BERGANSI TANPA KOMISI
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 900, color: "#0f172a" }}>Paket Harga Transparan Sesuai Skala Usaha</h2>
            <p style={{ fontSize: 15, color: "#64748b", marginTop: 8 }}>Pilih paket tetap atau gunakan kalkulator kustom perangkat di bawah ini.</p>

            {/* Toggle Billing Cycle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 24 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: billingCycle === "monthly" ? "#0f172a" : "#94a3b8" }}>Billing Bulanan</span>
              <div
                onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
                style={{
                  width: 54,
                  height: 28,
                  borderRadius: 999,
                  background: billingCycle === "yearly" ? "var(--brand, #d59567)" : "#cbd5e1",
                  padding: 3,
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#ffffff",
                  transform: billingCycle === "yearly" ? "translateX(26px)" : "translateX(0)",
                  transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: billingCycle === "yearly" ? "#0f172a" : "#94a3b8" }}>
                Billing Tahunan <span style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900 }}>Hemat 20%</span>
              </span>
            </div>
          </div>

          {/* 3 Main Pricing Cards (Delta, Omega, Zeta) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 24, marginBottom: 36 }}>
            {/* Tier 1: Delta */}
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 28, padding: 32, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>☕ Delta</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Cocok untuk kedai kopi & warkop skala 1 kasir utama.</div>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: "var(--brand, #d59567)", fontFamily: "monospace" }}>
                  Rp {billingCycle === "yearly" ? "69.000" : "89.000"}
                </span>
                <span style={{ fontSize: 13, color: "#64748b", marginLeft: 6 }}>/ bulan</span>
              </div>

              <div style={{ display: "grid", gap: 12, marginBottom: 28, flex: 1 }}>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> 1 Lisensi Kasir POS Utama
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Cetak Struk Bluetooth Thermal
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Rekap Penjualan Shift Kasir
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Mode Kasir Hibrid Offline
                </div>
              </div>

              <button className="btn-rn-secondary" style={{ width: "100%", padding: 12 }} onClick={() => r.push("/setup")}>
                Pilih Paket Delta
              </button>
            </div>

            {/* Tier 2: Omega (Popular Highlight) */}
            <div style={{ background: "#ffffff", border: "2.5px solid var(--brand, #d59567)", borderRadius: 28, padding: 32, display: "flex", flexDirection: "column", position: "relative", boxShadow: "0 15px 40px rgba(213,149,103,0.18)" }}>
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, var(--brand, #d59567) 0%, #9a0002 100%)", color: "#fff", padding: "4px 16px", borderRadius: 999, fontSize: 12, fontWeight: 900 }}>
                🔥 PALING DIREKOMENDASIKAN
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>🍽️ Omega</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Untuk kafe & resto dengan layar kasir & layar dapur terpisah.</div>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: "var(--brand, #d59567)", fontFamily: "monospace" }}>
                  Rp {billingCycle === "yearly" ? "149.000" : "189.000"}
                </span>
                <span style={{ fontSize: 13, color: "#64748b", marginLeft: 6 }}>/ bulan</span>
              </div>

              <div style={{ display: "grid", gap: 12, marginBottom: 28, flex: 1 }}>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--brand, #d59567)", fontWeight: 900 }}>✓</span> <strong>Hingga 3 Lisensi Kasir & Dapur</strong>
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--brand, #d59567)", fontWeight: 900 }}>✓</span> Kalkulator HPP & Laba Bersih Otomatis
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--brand, #d59567)", fontWeight: 900 }}>✓</span> Monitor Stok & Low Stock Alert
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--brand, #d59567)", fontWeight: 900 }}>✓</span> Manajemen PIN Staff & Otorisasi Refund
                </div>
              </div>

              <button className="btn-rn-primary" style={{ width: "100%", padding: 12 }} onClick={() => r.push("/setup")}>
                Pilih Paket Omega
              </button>
            </div>

            {/* Tier 3: Zeta */}
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 28, padding: 32, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.03)" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginBottom: 6 }}>🏢 Zeta</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>Solusi franchise & jaringan cabang resto multi-tenant.</div>

              <div style={{ marginBottom: 24 }}>
                <span style={{ fontSize: 36, fontWeight: 900, color: "var(--brand, #d59567)", fontFamily: "monospace" }}>
                  Rp {billingCycle === "yearly" ? "299.000" : "369.000"}
                </span>
                <span style={{ fontSize: 13, color: "#64748b", marginLeft: 6 }}>/ bulan</span>
              </div>

              <div style={{ display: "grid", gap: 12, marginBottom: 28, flex: 1 }}>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Unlimited Kasir & Perangkat Dapur
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Laporan Konsolidasi Multi-Cabang
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Custom Branding Struk & Staging API
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 8 }}>
                  <span style={{ color: "#10b981", fontWeight: 900 }}>✓</span> Support Prioritas 24/7 Dedicated Manager
                </div>
              </div>

              <button className="btn-rn-secondary" style={{ width: "100%", padding: 12 }} onClick={() => r.push("/setup")}>
                Pilih Paket Zeta
              </button>
            </div>
          </div>

          {/* Custom Contact Us Banner Below Pricing Cards */}
          <div style={{ background: "#ffffff", border: "1.5px dashed var(--brand, #d59567)", borderRadius: 24, padding: "24px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}>
                💬 Butuh Fitur Kustom atau Paket Jaringan Cabang Khusus?
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Tim engineer RuniX siap membantu penyesuaian integrasi POS khusus sesuai alur operasional outlet Anda.
              </div>
            </div>

            <button
              className="btn-rn-primary"
              style={{ padding: "10px 24px", fontSize: 14, whiteSpace: "nowrap" }}
              onClick={() => {
                const msg = encodeURIComponent("Halo Tim RuniX, saya ingin berkonsultasi mengenai paket kustom POS / multi-outlet khusus.");
                window.open(`https://wa.me/?text=${msg}`, "_blank");
              }}
            >
              Custom?? Hubungi Kami ➔
            </button>
          </div>
        </section>

        {/* SECTION 5: Customer Testimonials */}
        <section className="rn-testimonials-section" id="testimoni">
          <div style={{ textAlign: "center", marginBottom: 50 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: "#0f172a" }}>Kata Pengusaha Resto & Warkop</h2>
            <p style={{ fontSize: 15, color: "#64748b", marginTop: 8 }}>Pengalaman langsung pengguna RuniX POS di lapangan.</p>
          </div>

          <div className="rn-testi-grid">
            <div className="rn-testi-card">
              <p style={{ fontSize: 14, color: "#334155", fontStyle: "italic", lineHeight: 1.6 }}>
                "Sejak pakai RuniX POS, antrean kasir warkop pas jam ramai malam minggu jadi lancar banget. Struk Bluetooth cetak instan tanpa patah-patah!"
              </p>
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }}>Mas Dimas</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Owner Warkop Sudut Kopi</div>
              </div>
            </div>

            <div className="rn-testi-card">
              <p style={{ fontSize: 14, color: "#334155", fontStyle: "italic", lineHeight: 1.6 }}>
                "Fitur laporan omset dan hitungan HPP nya benar-benar membantu saya tahu mana menu terlaris dan berapa margin untung bersih bulanan."
              </p>
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }}>Mbak Rina</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Manager Kafe Senja Utama</div>
              </div>
            </div>

            <div className="rn-testi-card">
              <p style={{ fontSize: 14, color: "#334155", fontStyle: "italic", lineHeight: 1.6 }}>
                "Sistem lock kategori dan edit produk langsung di halaman tanpa popup sangat praktis! Staff baru langsung ngerti cara pakainya."
              </p>
              <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: "#0f172a" }}>Ko Hendra</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Owner Resto Bento Express</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: FAQ Accordion */}
        <section className="rn-faq-section" id="faq">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: "#0f172a" }}>Pertanyaan Sering Diajukan (FAQ)</h2>
          </div>

          <div>
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="rn-faq-item">
                  <div
                    className="rn-faq-header"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                  >
                    <span>{faq.q}</span>
                    <span>{isOpen ? "➖" : "➕"}</span>
                  </div>
                  {isOpen && <div className="rn-faq-body">{faq.a}</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 7: Closing CTA Banner */}
        <section className="rn-cta-banner">
          <h2 style={{ fontSize: 38, fontWeight: 900, marginBottom: 12 }}>
            Siap Tingkatkan Operasional Warkop & Kafe Anda?
          </h2>
          <p style={{ fontSize: 16, color: "#cbd5e1", maxWidth: 600, margin: "0 auto 28px" }}>
            Bergabunglah sekarang dan nikmati kemudahan mengelola kasir tanpa ribet.
          </p>
          <button className="btn-rn-primary" style={{ padding: "16px 40px", fontSize: 16 }} onClick={() => r.push("/setup")}>
            🚀 Registrasi Outlet Sekarang
          </button>
        </section>

        {/* Footer */}
        <footer className="rn-footer">
          <div style={{ marginBottom: 12 }}>
            <a href="/terms" style={{ color: "#94a3b8", textDecoration: "underline", marginRight: 20 }}>Syarat & Ketentuan</a>
            <a href="/privacy" style={{ color: "#94a3b8", textDecoration: "underline" }}>Kebijakan Privasi</a>
          </div>
          &copy; {new Date().getFullYear()} {footerText || "RuniX POS. Hak Cipta Dilindungi."}
        </footer>
      </div>
    </main>
  );
}
