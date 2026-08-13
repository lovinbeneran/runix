"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, collection, getDocs } from "firebase/firestore";
import TerraPage from "@/components/TerraPage";
import { auth, db, authReadyPromise } from "@/lib/firebase";
import { checkIsDeveloper } from "@/lib/developer";

export default function WaitingPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await authReadyPromise;
        if (!auth.currentUser) { r.push("/login"); return; }
        return;
      }

      setEmail(user.email || "");

      // Developer langsung ke /dev
      const isDev = await checkIsDeveloper(user.uid, user.email || "");
      if (isDev) {
        r.push("/dev");
        return;
      }

      // Cek apakah user sudah punya tenant membership
      try {
        const membershipsSnap = await getDocs(
          collection(db, `users/${user.uid}/tenantMemberships`)
        );
        if (!membershipsSnap.empty) {
          // Sudah punya tenant, redirect ke setup untuk pilih tenant
          r.push("/setup");
          return;
        }
      } catch {
        // Ignore error, tetap di waiting
      }

      setChecking(false);
    });

    return () => unsub();
  }, [r]);

  // Realtime listener: auto-redirect kalau developer assign tenant
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Listen ke user doc untuk perubahan (misalnya level di-update)
    const unsubUser = onSnapshot(doc(db, `users/${currentUser.uid}`), () => {});

    // Listen ke tenantMemberships - kalau ada doc baru, redirect
    const unsubMemberships = onSnapshot(
      collection(db, `users/${currentUser.uid}/tenantMemberships`),
      (snap) => {
        if (!snap.empty) {
          r.push("/setup");
        }
      }
    );

    return () => {
      unsubUser();
      unsubMemberships();
    };
  }, [r, checking]);

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

  if (checking) {
    return (
      <TerraPage maxWidth={500}>
        <div style={{ minHeight: "85dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card" style={{ padding: "20px 32px", borderRadius: 20, fontWeight: 800, color: "var(--brand)" }}>
            Memeriksa Hak Akses Outlet...
          </div>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage maxWidth={500}>
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
          text-align: center;
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
          margin-bottom: 20px;
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

        .wait-pulse-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--brandSoft);
          color: var(--brand);
          border: 1px solid var(--border);
          display: grid;
          place-items: center;
          font-size: 28px;
          margin: 0 auto 16px;
          box-shadow: 0 4px 20px rgba(154, 0, 2, 0.12);
        }

        .wait-email-card {
          margin-top: 18px;
          padding: 12px 18px;
          background: var(--brandSoft);
          border-radius: 16px;
          border: 1px solid var(--border);
          font-size: 13px;
          color: var(--text);
          font-weight: 700;
          word-break: break-all;
        }

        .wait-live-status {
          margin-top: 14px;
          padding: 12px 16px;
          background: var(--panel);
          border-radius: 16px;
          border: 1px solid var(--border);
          font-size: 12px;
          color: var(--brand);
          font-weight: 800;
          line-height: 1.6;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .wait-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--brand);
          animation: waitPulse 1.5s infinite ease-in-out;
        }
        @keyframes waitPulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 1; }
        }

        .auth-logout-btn {
          width: 100%;
          margin-top: 24px;
          padding: 14px 20px;
          border-radius: 18px;
          font-size: 14px;
          font-weight: 800;
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
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
          </div>

          <div className="wait-pulse-icon">&#9203;</div>

          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>
            Menunggu Akses Outlet
          </div>

          <div className="auth-subtitle" style={{ marginTop: 8, maxWidth: 380, margin: "8px auto 0" }}>
            Akun Anda berhasil terdaftar, namun belum dihubungkan ke outlet manapun. Silakan hubungi admin atau developer resto Anda.
          </div>

          <div className="wait-email-card">
            Login sebagai: <span style={{ color: "var(--brand)" }}>{email}</span>
          </div>

          <div className="wait-live-status">
            <span className="wait-live-dot" />
            <span>Sistem akan otomatis berpindah begitu akses Anda diaktifkan.</span>
          </div>

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
