"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { auth, db, authReadyPromise } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { checkIsDeveloper, MaintenanceStatus, subscribeMaintenanceStatus } from "@/lib/developer";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

const PRESET_MESSAGES = [
  "Sistem RuniX sedang dalam pemeliharaan rutin. Kami akan kembali secepatnya!",
  "Pembaruan server & peningkatan performa database sedang berlangsung.",
  "Perbaikan fitur sistem & sinkronisasi data sedang dilakukan. Harap tunggu beberapa saat.",
  "Sistem dikunci sementara untuk upgrade versi terbaru. Terima kasih atas kesabaran Anda.",
];

export default function DevMaintenancePage() {
  const r = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [email, setEmail] = useState("");
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({ enabled: false, message: "", enabledAt: null, enabledBy: "" });
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { await authReadyPromise; if (!auth.currentUser) { r.push("/login"); return; } return; }
      setEmail(user.email || "");
      const dev = await checkIsDeveloper(user.uid, user.email || "");
      if (!dev) { r.push("/dev"); return; }
      setIsDev(true);
      setLoading(false);
    });
    return () => unsub();
  }, [r]);

  useEffect(() => {
    if (!isDev) return;
    let unsub: (() => void) | null = null;
    const timer = setTimeout(() => {
      unsub = subscribeMaintenanceStatus((status) => { 
        setMaintenance(status); 
        setMaintenanceMsg(status.message); 
      });
    }, 300);
    return () => {
      clearTimeout(timer);
      if (unsub) unsub();
    };
  }, [isDev]);

  async function toggleMaintenance() {
    setSaving(true);
    try {
      const newEnabled = !maintenance.enabled;
      await setDoc(doc(db, "system/maintenance"), {
        enabled: newEnabled,
        message: newEnabled ? (maintenanceMsg.trim() || "Sistem sedang dalam maintenance.") : "",
        enabledAt: newEnabled ? serverTimestamp() : null,
        enabledBy: newEnabled ? email : "",
        updatedAt: serverTimestamp(),
      });
      toast.success(newEnabled ? "Maintenance mode AKTIF" : "Maintenance mode NONAKTIF");
    } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
    finally { setSaving(false); }
  }

  async function updateMessageOnly() {
    if (!maintenance.enabled) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "system/maintenance"), {
        ...maintenance,
        message: maintenanceMsg.trim() || "Sistem sedang dalam maintenance.",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Pesan maintenance berhasil diperbarui!");
    } catch (e: any) { toast.error("Gagal update pesan: " + (e?.message || "")); }
    finally { setSaving(false); }
  }

  if (loading) return <TerraPage maxWidth={720}><SkeletonStyles /><PageSkeleton cards={2} /></TerraPage>;

  return (
    <TerraPage maxWidth={760}>
      <style>{`
        /* Maintenance Master Control Panel */
        .maint-header-bar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 18px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.04);
        }

        .maint-status-banner {
          border-radius: 26px;
          padding: 26px;
          margin-top: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          border: 1.5px solid var(--border);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .maint-status-banner.active {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(20, 20, 25, 0.6) 100%);
          border-color: var(--danger);
          box-shadow: 0 12px 40px rgba(239, 68, 68, 0.12);
        }

        .maint-status-banner.normal {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(20, 20, 25, 0.6) 100%);
          border-color: #10b981;
          box-shadow: 0 12px 40px rgba(16, 185, 129, 0.1);
        }

        /* Pulse Radar Indicator */
        .maint-pulse-ring {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: inline-block;
          position: relative;
        }

        .maint-pulse-ring.active {
          background: #ef4444;
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          animation: pulse-red 1.6s infinite;
        }

        .maint-pulse-ring.normal {
          background: #10b981;
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse-green 1.6s infinite;
        }

        @keyframes pulse-red {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        @keyframes pulse-green {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        /* Toggle Switcher */
        .maint-switch-box {
          background: var(--panel);
          border: 1.5px solid var(--border);
          border-radius: 24px;
          padding: 24px;
          margin-top: 16px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.03);
        }

        .maint-preset-chip {
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }

        .maint-preset-chip:hover {
          border-color: var(--brand);
          color: var(--brand);
        }

        @media (max-width: 640px) {
          .maint-status-banner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      {/* HEADER BAR */}
      <div className="maint-header-bar">
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>Maintenance Mode Control</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Kelola penguncian akses sistem secara global & pesan peringatan pengguna</div>
        </div>
        <button className="btn" style={{ borderRadius: 14, padding: "8px 16px", fontWeight: 800, fontSize: 13 }} onClick={() => r.push("/dev")}>
          ← Dev Console
        </button>
      </div>

      {/* LIVE STATUS BANNER */}
      <div className={`maint-status-banner ${maintenance.enabled ? "active" : "normal"}`}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`maint-pulse-ring ${maintenance.enabled ? "active" : "normal"}`} />
            <b style={{ color: maintenance.enabled ? "var(--danger)" : "#10b981", fontSize: 18, fontWeight: 900, letterSpacing: "-0.3px" }}>
              {maintenance.enabled ? "SYSTEM LOCKED (MAINTENANCE AKTIF)" : "SYSTEM OPERATIONAL (SISTEM NORMAL)"}
            </b>
          </div>

          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
            {maintenance.enabled 
              ? "Akses pengguna umum & kasir diblokir total. Hanya akun Developer terverifikasi yang dapat masuk." 
              : "Seluruh pengguna kasir, pelanggan, dan admin dapat mengakses sistem tanpa hambatan."
            }
          </div>

          {maintenance.enabled && maintenance.enabledBy && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, fontFamily: "var(--font-mono)" }}>
              Diaktifkan oleh: <b>{maintenance.enabledBy}</b>
            </div>
          )}
        </div>

        {/* Master Switch Button */}
        <button
          className={`btn ${maintenance.enabled ? "btn-primary" : "btn-danger"}`}
          style={{ padding: "14px 24px", borderRadius: 18, fontWeight: 900, fontSize: 14, flexShrink: 0 }}
          onClick={toggleMaintenance}
          disabled={saving}
        >
          {saving 
            ? "Memproses..." 
            : maintenance.enabled 
              ? "Buka Kunci Sistem (Matikan)" 
              : "Kunci Sistem (Aktifkan Maintenance)"
          }
        </button>
      </div>

      {/* MAINTENANCE MESSAGE CONFIGURATOR */}
      <div className="maint-switch-box">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>Pesan Peringatan Pengguna</div>
          <button
            className="btn"
            style={{ fontSize: 12, padding: "6px 12px", borderRadius: 10, fontWeight: 800 }}
            onClick={() => setShowPreviewModal(true)}
          >
            👁 Preview Tampilan User
          </button>
        </div>

        <textarea
          className="input"
          value={maintenanceMsg}
          onChange={(e) => setMaintenanceMsg(e.target.value)}
          placeholder="Tuliskan pesan penjelas alasan maintenance..."
          rows={3}
          style={{ width: "100%", resize: "vertical", borderRadius: 16, padding: 14, fontSize: 13, lineHeight: 1.6 }}
        />

        {/* Quick Presets Chips */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8 }}>
            Preset Pesan Cepat:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PRESET_MESSAGES.map((msg, idx) => (
              <button
                key={idx}
                className="maint-preset-chip"
                onClick={() => setMaintenanceMsg(msg)}
              >
                "{msg}"
              </button>
            ))}
          </div>
        </div>

        {/* Save Message Only Button (if maintenance enabled) */}
        {maintenance.enabled && (
          <button
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 18, padding: "12px 0", borderRadius: 14, fontWeight: 800 }}
            onClick={updateMessageOnly}
            disabled={saving}
          >
            {saving ? "Menyimpan..." : "Update Pesan Maintenance Saja"}
          </button>
        )}
      </div>

      {/* LIVE PREVIEW MODAL */}
      {showPreviewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999, backdropFilter: "blur(6px)" }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", borderRadius: 28, padding: 32, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Sistem Dalam Maintenance</div>
            <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 12, lineHeight: 1.6, background: "var(--brandSoft)", padding: 16, borderRadius: 18, border: "1px solid var(--border)" }}>
              {maintenanceMsg.trim() || "Sistem sedang dalam maintenance."}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 14 }}>
              *Ini adalah simulasi pesan yang dilihat pengguna umum saat maintenance aktif.
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 20, padding: "12px 0", borderRadius: 14, fontWeight: 800 }}
              onClick={() => setShowPreviewModal(false)}
            >
              Tutup Preview
            </button>
          </div>
        </div>
      )}
    </TerraPage>
  );
}
