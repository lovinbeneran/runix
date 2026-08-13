"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import TerraPage from "@/components/TerraPage";
import { auth, db } from "@/lib/firebase";
import {
  isRememberMeEnabled,
  saveCredentials,
  loadCredentials,
} from "@/lib/saved-credentials";

export default function LoginPage() {
  const r = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Partikel melayang berbasis logo favicon
  const [particles, setParticles] = useState<
    { id: number; left: number; top: number; size: number; duration: number; delay: number; rotate: number; opacity: number }[]
  >([]);

  useEffect(() => {
    const saved = loadCredentials();
    if (saved) {
      setEmail(saved.email);
      setPassword(saved.password);
    }

    // Generate 20 partikel favicon acak
    const generated = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 95, // 0 - 95%
      top: Math.random() * 95, // 0 - 95%
      size: Math.floor(Math.random() * 24) + 24, // 24px - 48px
      duration: Math.floor(Math.random() * 12) + 14, // 14s - 26s
      delay: Math.random() * 6, // 0s - 6s
      rotate: Math.floor(Math.random() * 360),
      opacity: Math.random() * 0.4 + 0.3, // 0.3 - 0.7
    }));
    setParticles(generated);

    // Auto-redirect jika user sudah login / membuka halaman /login dalam keadaan login
    const { onAuthStateChanged } = require("firebase/auth");
    const { authReadyPromise } = require("@/lib/firebase");
    const { checkIsDeveloper } = require("@/lib/developer");
    const { collection, getDocs } = require("firebase/firestore");

    const unsub = onAuthStateChanged(auth, async (user: any) => {
      if (!user) {
        await authReadyPromise;
        if (!auth.currentUser) return;
      }
      const activeUser = auth.currentUser || user;
      if (!activeUser) return;

      try {
        const isDev = await checkIsDeveloper(activeUser.uid, activeUser.email || "");
        if (isDev) {
          r.push("/dev");
          return;
        }
        const membershipsSnap = await getDocs(
          collection(db, `users/${activeUser.uid}/tenantMemberships`)
        );
        if (membershipsSnap.empty) {
          r.push("/waiting");
          return;
        }
        r.push("/pos");
      } catch {
        r.push("/waiting");
      }
    });

    return () => unsub();
  }, [r]);

  function mapFirebaseError(message: string) {
    const m = (message || "").toLowerCase();

    if (m.includes("auth/email-already-in-use")) return "Email sudah terdaftar.";
    if (m.includes("auth/invalid-email")) return "Format email tidak valid.";
    if (m.includes("auth/weak-password")) return "Password minimal 6 karakter.";
    if (m.includes("auth/invalid-credential")) return "Email atau password salah.";
    if (m.includes("auth/user-not-found")) return "Akun tidak ditemukan.";
    if (m.includes("auth/wrong-password")) return "Password salah.";

    return message || "Terjadi kesalahan.";
  }

  async function handleLogin() {
    setLoading(true);
    setErr("");

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error("Email dan password wajib diisi.");
      }

      await signInWithEmailAndPassword(auth, email.trim(), password);

      // Selalu simpan credentials agar tetap login walaupun app di-kill
      saveCredentials(email.trim(), password);

      // Developer langsung ke /dev, user biasa cek tenant membership
      const { checkIsDeveloper } = await import("@/lib/developer");
      const user = auth.currentUser;
      if (user) {
        const isDev = await checkIsDeveloper(user.uid, user.email || "");
        if (isDev) {
          r.push("/dev");
          return;
        }

        // Cek apakah user punya tenant membership
        try {
          const membershipsSnap = await getDocs(
            collection(db, `users/${user.uid}/tenantMemberships`)
          );
          if (membershipsSnap.empty) {
            r.push("/waiting");
            return;
          }
        } catch {
          // Jika gagal cek, arahkan ke waiting (safe default)
          r.push("/waiting");
          return;
        }
      }

      r.push("/setup");
    } catch (e: any) {
      setErr(mapFirebaseError(e?.message || "Gagal login"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    setLoading(true);
    setErr("");

    try {
      if (!name.trim()) {
        throw new Error("Nama wajib diisi.");
      }
      if (!email.trim()) {
        throw new Error("Email wajib diisi.");
      }
      if (!password.trim()) {
        throw new Error("Password wajib diisi.");
      }
      if (password.trim().length < 6) {
        throw new Error("Password minimal 6 karakter.");
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      // simpan display name di auth
      await updateProfile(user, {
        displayName: name.trim(),
      });

      // simpan user profile dasar
      await setDoc(
        doc(db, `users/${user.uid}`),
        {
          uid: user.uid,
          name: name.trim(),
          email: user.email || email.trim(),
          level: "free",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      r.push("/waiting");
    } catch (e: any) {
      setErr(mapFirebaseError(e?.message || "Gagal daftar akun"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <TerraPage maxWidth={500}>
      <style>{`
        .auth-wrap {
          min-height: 100vh;
          min-height: 100dvh;
          display: grid;
          place-items: center;
          padding: 20px 16px;
          position: relative;
          width: 100%;
          box-sizing: border-box;
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
          filter: blur(2px);
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
          max-width: 440px;
          margin: 0 auto;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 32px;
          padding: 36px 30px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.1);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          position: relative;
          z-index: 1;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @media (max-width: 540px) {
          .auth-card-v2 {
            padding: 28px 22px;
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

        /* Segmented Mode Switcher */
        .auth-segmented-dock {
          display: flex;
          background: var(--brandSoft);
          padding: 5px;
          border-radius: 20px;
          border: 1px solid var(--border);
          margin-bottom: 24px;
        }
        .auth-dock-pill {
          flex: 1;
          padding: 10px 16px;
          border-radius: 15px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-weight: 800;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: center;
        }
        .auth-dock-pill.active {
          background: var(--panel);
          color: var(--brand);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }

        /* Input Form Fields */
        .auth-form-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .auth-input-label {
          font-size: 12px;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .auth-input-v2 {
          width: 100%;
          border-radius: 16px;
          padding: 12px 18px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .auth-input-v2:focus {
          outline: none;
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 0 0 4px rgba(154, 0, 2, 0.12);
        }

        /* Error Box */
        .auth-error-box {
          margin-top: 14px;
          padding: 12px 16px;
          border-radius: 14px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          animation: authShake 0.3s ease;
        }
        @keyframes authShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }

        /* Submit Button */
        .auth-submit-btn {
          width: 100%;
          margin-top: 24px;
          padding: 14px 20px;
          border-radius: 18px;
          font-size: 15px;
          font-weight: 900;
          background: linear-gradient(135deg, var(--brand), #780002);
          color: #ffffff;
          border: none;
          cursor: pointer;
          box-shadow: 0 8px 25px rgba(154, 0, 2, 0.3);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .auth-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(154, 0, 2, 0.4);
        }
        .auth-submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .auth-submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-footer-note {
          margin-top: 24px;
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
            <div className="auth-subtitle">
              {mode === "login"
                ? "Selamat datang kembali! Silakan login ke sistem Kasir RuniX."
                : "Buat akun baru untuk mulai kelola bisnis resto Anda bersama RuniX."}
            </div>
          </div>

          {/* Segmented Mode Switcher Dock */}
          <div className="auth-segmented-dock">
            <button
              type="button"
              className={`auth-dock-pill ${mode === "login" ? "active" : ""}`}
              onClick={() => {
                setMode("login");
                setErr("");
              }}
            >
              Masuk (Login)
            </button>

            <button
              type="button"
              disabled={true}
              className="auth-dock-pill"
              title="Pendaftaran akun baru saat ini ditutup"
              style={{
                opacity: 0.5,
                cursor: "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <span>🔒</span>
              <span>Daftar Akun</span>
            </button>
          </div>

          {/* Form Group */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (loading) return;
              if (mode === "login") {
                handleLogin();
              } else {
                handleRegister();
              }
            }}
            className="auth-form-group"
          >
            {mode === "register" && (
              <div>
                <div className="auth-input-label">Nama Lengkap</div>
                <input
                  className="auth-input-v2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Masukkan nama Anda"
                />
              </div>
            )}

            <div>
              <div className="auth-input-label">Email</div>
              <input
                className="auth-input-v2"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="auth-input-label">Password</div>
              <input
                className="auth-input-v2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>

            {/* Error Message */}
            {err && <div className="auth-error-box">{err}</div>}

            {/* Submit Button */}
            {mode === "login" ? (
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? "Memproses Masuk..." : "Masuk ke System →"}
              </button>
            ) : (
              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
              >
                {loading ? "Memproses Pendaftaran..." : "Daftar Akun Sekarang →"}
              </button>
            )}
          </form>

          {/* Footer Note */}
          <div className="auth-footer-note">
            RuniX Point of Sale System &copy; {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </TerraPage>
  );
}