"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
} from "firebase/firestore";
import TerraPage from "@/components/TerraPage";
import { auth, db, authReadyPromise } from "@/lib/firebase";
import { setActiveTenantId } from "@/lib/tenant";

type TenantRow = {
  id: string;
  name: string;
  role?: string;
};

export default function SetupPage() {
  const r = useRouter();

  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [tenants, setTenants] = useState<TenantRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          await authReadyPromise;
          if (!auth.currentUser) { r.push("/login"); return; }
          return;
        }

        setUid(user.uid);
        setEmail(user.email || "");
        await loadMyTenants(user.uid);
      } catch (e: any) {
        setErr(e?.message || "Gagal load setup");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [r]);

  async function loadMyTenants(userUid: string) {
    const membershipsSnap = await getDocs(
      query(collection(db, `users/${userUid}/tenantMemberships`))
    );

    const arr: TenantRow[] = [];
    const deletePromises: Promise<void>[] = [];

    for (const d of membershipsSnap.docs) {
      const x = d.data() as any;
      const tenantId = d.id;

      // Verifikasi apakah tenant masih ada di Firestore
      try {
        const tenantDoc = await getDoc(doc(db, `tenants/${tenantId}`));
        if (!tenantDoc.exists()) {
          // Tenant sudah dihapus — hapus membership stale ini
          deletePromises.push(
            deleteDoc(doc(db, `users/${userUid}/tenantMemberships/${tenantId}`))
          );
          continue;
        }

        // Tenant masih ada, ambil nama terbaru dari tenant doc
        const tenantData = tenantDoc.data() as any;
        arr.push({
          id: tenantId,
          name: tenantData.name || x.name || tenantId,
          role: x.role || "",
        });
      } catch {
        // Jika permission denied (bukan member), skip tapi tetap tampilkan dari cache
        arr.push({
          id: tenantId,
          name: x.name || tenantId,
          role: x.role || "",
        });
      }
    }

    // Cleanup stale memberships in background
    if (deletePromises.length > 0) {
      Promise.all(deletePromises).catch(() => {});
    }

    setTenants(arr);

    // Jika tidak punya tenant sama sekali, redirect ke waiting
    if (arr.length === 0) {
      r.push("/waiting");
    }
  }

  async function openTenant(t: TenantRow) {
    try {
      // Double-check tenant masih ada sebelum masuk
      const tenantDoc = await getDoc(doc(db, `tenants/${t.id}`));
      if (!tenantDoc.exists()) {
        // Tenant sudah dihapus, cleanup & refresh list
        await deleteDoc(doc(db, `users/${uid}/tenantMemberships/${t.id}`));
        setTenants((prev) => prev.filter((x) => x.id !== t.id));
        setErr("Tenant ini sudah dihapus. Daftar telah diperbarui.");
        return;
      }

      await setActiveTenantId(uid, t.id);
      r.push("/dashboard");
    } catch {
      await setActiveTenantId(uid, t.id);
      r.push("/dashboard");
    }
  }

  // Partikel melayang berbasis logo favicon
  const [particles, setParticles] = useState<
    { id: number; left: number; top: number; size: number; duration: number; delay: number; rotate: number; opacity: number }[]
  >([]);

  useEffect(() => {
    // Generate 20 partikel favicon acak
    const generated = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 95,
      top: Math.random() * 95,
      size: Math.floor(Math.random() * 24) + 24,
      duration: Math.floor(Math.random() * 12) + 14,
      delay: Math.random() * 6,
      rotate: Math.floor(Math.random() * 360),
      opacity: Math.random() * 0.4 + 0.3,
    }));
    setParticles(generated);
  }, []);

  if (loading) {
    return (
      <TerraPage maxWidth={540}>
        <div style={{ minHeight: "85dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: "20px 32px", borderRadius: 20, fontWeight: 800, color: "var(--brand)" }}>
            Memuat Daftar Outlet...
          </div>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage maxWidth={540}>
      <style>{`
        .auth-wrap {
          min-height: 85vh;
          min-height: 85dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 0;
          position: relative;
        }

        /* Floating Favicon Particle Layer */
        .auth-bg-particles {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }
        .auth-favicon-particle {
          position: absolute;
          object-fit: contain;
          filter: blur(2.5px);
          animation: floatParticle linear infinite;
          user-select: none;
          will-change: transform;
        }
        @keyframes floatParticle {
          0% {
            transform: translateY(0px) rotate(0deg) scale(0.95);
          }
          50% {
            transform: translateY(-28px) rotate(180deg) scale(1.1);
          }
          100% {
            transform: translateY(0px) rotate(360deg) scale(0.95);
          }
        }

        .auth-card-v2 {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 36px 32px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.06);
          position: relative;
          z-index: 1;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @media (max-width: 540px) {
          .auth-card-v2 {
            padding: 28px 20px;
            border-radius: 24px;
          }
        }

        /* Decorative Background Glows */
        .auth-glow-1 {
          position: absolute;
          top: -60px;
          right: -60px;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: var(--brand);
          opacity: 0.08;
          filter: blur(40px);
          pointer-events: none;
        }
        .auth-glow-2 {
          position: absolute;
          bottom: -60px;
          left: -60px;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: var(--brand);
          opacity: 0.06;
          filter: blur(40px);
          pointer-events: none;
        }

        /* Header & Brand */
        .auth-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .auth-logo-img {
          height: 44px;
          width: auto;
          object-fit: contain;
          margin: 0 auto 12px;
          display: block;
        }
        .auth-subtitle {
          font-size: 13px;
          color: var(--muted);
          font-weight: 600;
          line-height: 1.5;
        }

        /* Outlet List Card Item */
        .setup-tenant-card {
          background: var(--brandSoft);
          border: 1.5px solid var(--border);
          border-radius: 22px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .setup-tenant-card:hover {
          border-color: var(--brand);
          transform: translateY(-3px);
          box-shadow: 0 8px 24px rgba(154, 0, 2, 0.1);
          background: var(--panel);
        }
        .setup-role-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: rgba(154, 0, 2, 0.12);
          color: var(--brand);
          margin-top: 4px;
        }

        .auth-error-box {
          margin-bottom: 16px;
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
        }

        .auth-logout-btn {
          width: 100%;
          margin-top: 24px;
          padding: 13px 20px;
          border-radius: 18px;
          font-size: 13px;
          font-weight: 800;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.22);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .auth-logout-btn:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        .auth-footer-note {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
        }
      `}</style>

      <div className="auth-wrap">
        {/* Floating Favicon Particle Layer */}
        <div className="auth-bg-particles">
          {particles.map((p) => (
            <img
              key={p.id}
              src="/favicon.png"
              alt="particle"
              className="auth-favicon-particle"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                transform: `rotate(${p.rotate}deg)`,
              }}
            />
          ))}
        </div>

        <div className="auth-card-v2">
          <div className="auth-glow-1" />
          <div className="auth-glow-2" />

          {/* Header & Logo */}
          <div className="auth-header">
            <img src="/logo-header.png" alt="RuniX POS" className="auth-logo-img" />
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>
              Pilih Outlet Operasional
            </div>
            <div className="auth-subtitle" style={{ marginTop: 4 }}>
              Masuk sebagai: <b style={{ color: "var(--brand)" }}>{email || "-"}</b>
            </div>
          </div>

          {err && <div className="auth-error-box">{err}</div>}

          {/* List Kartu Outlet */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {tenants.map((t) => (
              <div key={t.id} className="setup-tenant-card">
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16, color: "var(--text)" }}>{t.name}</div>
                  <div>
                    <span className="setup-role-badge">{t.role || "member"}</span>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: "10px 20px", borderRadius: 14, fontWeight: 900, fontSize: 13 }}
                  onClick={() => openTenant(t)}
                >
                  Masuk Outlet &rarr;
                </button>
              </div>
            ))}

            {tenants.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontWeight: 700, fontSize: 13 }}>
                Belum ada outlet yang terhubung dengan akun Anda. Hubungi admin toko/restoran.
              </div>
            )}
          </div>

          {/* Tombol Logout */}
          <button
            className="auth-logout-btn"
            onClick={() => {
              const { clearCredentials } = require("@/lib/saved-credentials");
              clearCredentials();
              signOut(auth).then(() => r.push("/login"));
            }}
          >
            Keluar dari Akun (Logout)
          </button>

          <div className="auth-footer-note">
            RuniX Point of Sale System &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </TerraPage>
  );
}
