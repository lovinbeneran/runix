"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";

export default function AdminBottomDock() {
  const r = useRouter();
  const pathname = usePathname();
  const { role } = useRole();
  const { canAccess } = useLevel();

  const roleLower = (role || "").toString().toLowerCase();
  const isDev = roleLower === "developer";

  function isActive(path: string) {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  }

  return (
    <>
      <style>{`
        /* ===== REFINED LUXURY BOTTOM NAVIGATION DOCK ===== */
        .dash-bottom-dock {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: linear-gradient(145deg, rgba(154, 0, 2, 0.94), rgba(95, 0, 1, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 26px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(154, 0, 2, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          max-width: 94vw;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .dash-bottom-dock::-webkit-scrollbar { display: none; }

        .dash-dock-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dash-dock-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.2);
          margin: 0 2px;
        }

        .dash-dock-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 18px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255, 255, 255, 0.88);
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          user-select: none;
        }
        .dash-dock-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }
        .dash-dock-btn:active { transform: scale(0.96); }

        .dash-dock-btn.active-tab {
          background: rgba(255, 255, 255, 0.22);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.45);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }

        .dash-dock-btn.primary {
          background: #ffffff;
          color: var(--brand, #9a0002);
          border-color: #ffffff;
          font-weight: 900;
          padding: 9px 18px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }
        .dash-dock-btn.primary:hover {
          background: #ffffff;
          color: #780002;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
        }

        .dash-dock-icon {
          width: 17px;
          height: 17px;
          flex-shrink: 0;
        }
      `}</style>

      <nav className="dash-bottom-dock">
        <div className="dash-dock-group">
          <button className={`dash-dock-btn primary ${isActive("/pos") ? "active-tab" : ""}`} onClick={() => r.push("/pos")} title="Buka Kasir POS">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Buka POS</span>
          </button>
          <button className={`dash-dock-btn ${isActive("/dashboard") ? "active-tab" : ""}`} onClick={() => r.push("/dashboard")} title="Dashboard Utama">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Dashboard</span>
          </button>
        </div>

        <div className="dash-dock-divider" />

        <div className="dash-dock-group">
          <button className={`dash-dock-btn ${isActive("/products") ? "active-tab" : ""}`} onClick={() => r.push("/products")} title="Katalog Produk">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <span>Products</span>
          </button>
          {canAccess("staff") && (
            <button className={`dash-dock-btn ${isActive("/staff-accounts") ? "active-tab" : ""}`} onClick={() => r.push("/staff-accounts")} title="Akun Staff & PIN">
              <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Staff PIN</span>
            </button>
          )}
          {canAccess("promos") && (
            <button className={`dash-dock-btn ${isActive("/promos") ? "active-tab" : ""}`} onClick={() => r.push("/promos")} title="Manajemen Promo">
              <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span>Promo</span>
            </button>
          )}
          <button className={`dash-dock-btn ${isActive("/reports") ? "active-tab" : ""}`} onClick={() => r.push("/reports")} title="Laporan Omset">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Reports</span>
          </button>
        </div>

        <div className="dash-dock-divider" />

        <div className="dash-dock-group">
          <button className={`dash-dock-btn ${isActive("/settings") ? "active-tab" : ""}`} onClick={() => r.push("/settings")} title="Pengaturan">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </button>
          <button className={`dash-dock-btn ${isActive("/printer") ? "active-tab" : ""}`} onClick={() => r.push("/printer")} title="Printer Struk">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Printer</span>
          </button>
          {isDev && (
            <button className={`dash-dock-btn ${isActive("/dev") ? "active-tab" : ""}`} onClick={() => r.push("/dev")} style={{ color: "#f3e8ff", background: "rgba(168, 85, 247, 0.22)", borderColor: "rgba(168, 85, 247, 0.4)" }} title="Dev Console">
              <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span>Dev Console</span>
            </button>
          )}
          <button className="dash-dock-btn" style={{ color: "#fca5a5", background: "rgba(239, 68, 68, 0.15)", borderColor: "rgba(239, 68, 68, 0.3)" }} onClick={() => signOut(auth).then(() => r.push("/login"))} title="Keluar Sesi">
            <svg className="dash-dock-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </>
  );
}
