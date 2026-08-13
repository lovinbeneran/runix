"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { auth, authReadyPromise } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { checkIsDeveloper, APP_VERSION, BUILD_ENV } from "@/lib/developer";
import { getStoredTenantId } from "@/lib/tenant";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";

type DevItem = {
  id: string;
  category: "SYSTEM" | "BRANDING" | "MANAGEMENT";
  title: string;
  desc: string;
  href: string;
  badge: string;
  detailInfo: string[];
};

const DEV_ITEMS: DevItem[] = [
  { id: "sys", category: "SYSTEM", title: "System Info", desc: "Monitor versi aplikasi, environment, build markers & runtime state.", href: "/dev/system", badge: "v1.0 ONLINE", detailInfo: ["Build Version: v1.0.0", "Runtime Environment: " + BUILD_ENV, "Firebase Status: Connected", "Cache State: Ready"] },
  { id: "maint", category: "SYSTEM", title: "Maintenance", desc: "Saklar sakral untuk mengunci sistem dan mode pemeliharaan global.", href: "/dev/maintenance", badge: "LOCK SWITCH", detailInfo: ["Global Lock Status: Normal", "Maintenance Message Customizer", "Bypass Key Override Active"] },
  { id: "brand", category: "BRANDING", title: "Brand Colors", desc: "Pengaturan tema warna RuniX global, CSS variables & force sync.", href: "/dev/brand-colors", badge: "GLOBAL THEME", detailInfo: ["Active Primary Color: #9A0002", "CSS Tokens Auto Sync Enabled", "Realtime Dark/Light Mode Theme Switcher"] },
  { id: "tbrand", category: "BRANDING", title: "Tenant Branding", desc: "Kustomisasi palet warna visual spesifik per tenant / gerai.", href: "/dev/tenant-branding", badge: "STORE ACCENT", detailInfo: ["Per-Outlet Branding Engine", "Tenant Logo & Custom Palette Override", "Live Tenant Color Preview"] },
  { id: "tenants", category: "MANAGEMENT", title: "Tenants Matrix", desc: "Kelola, buat tenant baru, assign switcher & pantau seluruh gerai.", href: "/dev/tenants", badge: "MULTI-STORE", detailInfo: ["Tenant Switcher Controller", "Add / Deactivate Tenant Outlets", "Data Store Quota & Tier Inspector"] },
  { id: "users", category: "MANAGEMENT", title: "Users & Roles", desc: "Manajemen akun pengguna, penetapan role (Seed, Core, Orbit) & akses.", href: "/dev/users", badge: "IAM CONTROL", detailInfo: ["Role Assignment Engine (Seed, Core, Orbit)", "User Access Permission Audit", "Staff PIN Security Reset"] },
  { id: "landing", category: "SYSTEM", title: "Landing CMS", desc: "Pengaturan teks marketing landing page, hero section, pricing & footer.", href: "/dev/landing", badge: "MARKETING", detailInfo: ["Hero Headline Editor", "Feature Highlights CMS", "Subscription Tier Pricing Configurator"] },
  { id: "notif", category: "SYSTEM", title: "Notifikasi", desc: "Kirim notifikasi pesan in-app secara serentak ke seluruh kasir.", href: "/dev/notifications", badge: "BROADCAST", detailInfo: ["Global In-App Notification Sender", "Broadcast Target Selector", "Realtime Toast Alert Dispatcher"] },
];

export default function DevConsolePage() {
  const r = useRouter();
  const [loading, setLoading] = useState(true);
  const [isDeveloper, setIsDeveloper] = useState(false);
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [activeItemId, setActiveItemId] = useState<string>("sys");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { await authReadyPromise; if (!auth.currentUser) { r.push("/login"); return; } return; }
      setEmail(user.email || "");
      setTenantId(getStoredTenantId() || "");
      const devStatus = await checkIsDeveloper(user.uid, user.email || "");
      setIsDeveloper(devStatus);
      setLoading(false);
    });
    return () => unsub();
  }, [r]);

  if (loading) return <TerraPage maxWidth={1180}><SkeletonStyles /><PageSkeleton cards={4} /></TerraPage>;

  if (!isDeveloper) {
    return (
      <TerraPage maxWidth={500}>
        <div className="card" style={{ textAlign: "center", padding: 36, borderRadius: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--danger)", marginBottom: 6 }}>Akses Ditolak</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Halaman Dev Console ini khusus untuk Developer.</div>
          <button className="btn btn-primary" style={{ marginTop: 18, padding: "10px 20px", borderRadius: 12 }} onClick={() => r.push("/dashboard")}>
            Kembali ke Dashboard
          </button>
        </div>
      </TerraPage>
    );
  }

  const filteredItems = selectedCategory === "ALL" 
    ? DEV_ITEMS 
    : DEV_ITEMS.filter((it) => it.category === selectedCategory);

  const activeModule = DEV_ITEMS.find((it) => it.id === activeItemId) || filteredItems[0] || DEV_ITEMS[0];

  return (
    <TerraPage maxWidth={1200}>
      <style>{`
        /* LAYOUT OPTION A: 2-COLUMN SPLIT INSPECTOR */
        .dev-split-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          height: calc(100vh - 100px);
          overflow: hidden;
        }

        /* Top Header Control Dock */
        .dev-top-dock-bar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 26px;
          padding: 14px 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);
          flex-shrink: 0;
        }

        .dev-dock-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dev-category-pills {
          display: flex;
          align-items: center;
          background: var(--brandSoft);
          padding: 4px;
          border-radius: 18px;
          border: 1px solid var(--border);
          gap: 4px;
        }

        .dev-cat-pill {
          padding: 8px 16px;
          border-radius: 14px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .dev-cat-pill.active {
          background: var(--panel);
          color: var(--brand);
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }

        /* 2-Column Main Split Workspace */
        .dev-inspector-split {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 16px;
          flex: 1;
          min-height: 0;
        }

        /* Left Master Pane (Rapat List Scrollable) */
        .dev-master-pane {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .dev-master-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--brandSoft);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .dev-master-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .dev-master-item-card {
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--panel);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dev-master-item-card:hover {
          background: var(--brandSoft);
          border-color: var(--brand);
        }

        .dev-master-item-card.selected {
          border-color: var(--brand);
          background: var(--brandSoft);
          box-shadow: 0 4px 16px rgba(154, 0, 2, 0.08);
        }

        /* Right Detail Inspector Pane (Kanvas Penuh) */
        .dev-detail-pane {
          background: var(--panel);
          border: 1.5px solid var(--border);
          border-radius: 24px;
          padding: 28px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow-y: auto;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.04);
        }

        .dev-inspector-hero {
          background: var(--brandSoft);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 22px;
          margin-top: 16px;
        }

        .dev-info-tag-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 14px;
        }

        .dev-info-tag-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border-radius: 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          font-size: 13px;
          font-weight: 700;
        }

        .dev-pintas-dock {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px dashed var(--border);
        }

        .dev-pintas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .dev-pintas-btn {
          padding: 10px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }

        .dev-pintas-btn:hover {
          border-color: var(--brand);
          color: var(--brand);
          background: var(--panel);
        }

        @media (max-width: 900px) {
          .dev-split-container { height: auto; overflow: visible; }
          .dev-inspector-split { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="dev-split-container">
        {/* TOP CONTROL DOCK BAR */}
        <div className="dev-top-dock-bar">
          <div className="dev-dock-left">
            <div style={{ fontWeight: 900, fontSize: 18, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
              <span>Developer Console</span>
              <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: "var(--brandSoft)", color: "var(--brand)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>
                v{APP_VERSION}
              </span>
            </div>

            {/* Category Filter Pills */}
            <div className="dev-category-pills">
              <button className={`dev-cat-pill ${selectedCategory === "ALL" ? "active" : ""}`} onClick={() => setSelectedCategory("ALL")}>
                Semua ({DEV_ITEMS.length})
              </button>
              <button className={`dev-cat-pill ${selectedCategory === "SYSTEM" ? "active" : ""}`} onClick={() => setSelectedCategory("SYSTEM")}>
                System
              </button>
              <button className={`dev-cat-pill ${selectedCategory === "BRANDING" ? "active" : ""}`} onClick={() => setSelectedCategory("BRANDING")}>
                Branding
              </button>
              <button className={`dev-cat-pill ${selectedCategory === "MANAGEMENT" ? "active" : ""}`} onClick={() => setSelectedCategory("MANAGEMENT")}>
                Management
              </button>
            </div>
          </div>

          {/* User Meta & Action Shortcuts */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
              {email.split("@")[0]} • Tenant: <b>{tenantId || "-"}</b>
            </div>
            <button className="btn" style={{ padding: "8px 14px", borderRadius: 12, fontSize: 12, fontWeight: 800 }} onClick={() => r.push("/pos")}>
              Kasir POS
            </button>
            <button className="btn" style={{ padding: "8px 14px", borderRadius: 12, fontSize: 12, fontWeight: 800 }} onClick={() => r.push("/dashboard")}>
              Dashboard
            </button>
            <button className="btn btn-danger" style={{ padding: "8px 14px", borderRadius: 12, fontSize: 12, fontWeight: 800 }} onClick={() => signOut(auth).then(() => r.push("/login"))}>
              Logout
            </button>
          </div>
        </div>

        {/* 2-COLUMN SPLIT WORKSPACE */}
        <div className="dev-inspector-split">
          {/* MASTER LIST (SISI KIRI) */}
          <div className="dev-master-pane">
            <div className="dev-master-header">
              <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>Daftar Modul Developer</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)" }}>{filteredItems.length} Modul</span>
            </div>

            <div className="dev-master-list">
              {filteredItems.map((item) => {
                const isSelected = item.id === activeModule.id;
                return (
                  <div
                    key={item.id}
                    className={`dev-master-item-card ${isSelected ? "selected" : ""}`}
                    onClick={() => setActiveItemId(item.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <b style={{ fontSize: 14, color: isSelected ? "var(--brand)" : "var(--text)" }}>{item.title}</b>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "var(--panel)", color: "var(--brand)", fontWeight: 900, border: "1px solid var(--border)", fontFamily: "var(--font-mono)" }}>
                        {item.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                      {item.desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* DETAIL INSPECTOR PANE (SISI KANAN) */}
          <div className="dev-detail-pane">
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Inspector Modul Active: {activeModule.category}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text)", marginTop: 2 }}>
                    {activeModule.title}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: "12px 24px", borderRadius: 16, fontWeight: 900, fontSize: 14 }}
                  onClick={() => r.push(activeModule.href)}
                >
                  Eksekusi / Buka Modul &rarr;
                </button>
              </div>

              {/* Deskripsi & Specs Banner */}
              <div className="dev-inspector-hero">
                <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 700, lineHeight: 1.6 }}>
                  {activeModule.desc}
                </div>

                <div className="dev-info-tag-list">
                  {activeModule.detailInfo.map((info, idx) => (
                    <div key={idx} className="dev-info-tag-item">
                      <span>{info}</span>
                      <span style={{ color: "#10b981", fontSize: 11, fontFamily: "var(--font-mono)" }}>READY</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Operational Shortcuts */}
            <div className="dev-pintas-dock">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--muted)", textTransform: "uppercase" }}>Pintas Navigasi Operasional</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => { if (typeof window !== "undefined") window.location.reload(); }}>
                    Reload
                  </button>
                  <button className="btn" style={{ padding: "4px 10px", fontSize: 11, color: "#ef4444" }} onClick={() => { if (typeof window !== "undefined") { caches.keys().then((n) => n.forEach((k) => caches.delete(k))); } }}>
                    Clear Cache
                  </button>
                </div>
              </div>

              <div className="dev-pintas-grid">
                <button className="dev-pintas-btn" onClick={() => r.push("/setup")}>Setup Toko</button>
                <button className="dev-pintas-btn" onClick={() => r.push("/orders")}>Orders</button>
                <button className="dev-pintas-btn" onClick={() => r.push("/products")}>Products</button>
                <button className="dev-pintas-btn" onClick={() => r.push("/shifts")}>Shifts</button>
                <button className="dev-pintas-btn" onClick={() => r.push("/reports")}>Reports</button>
                <button className="dev-pintas-btn" onClick={() => r.push("/settings")}>Settings</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TerraPage>
  );
}
