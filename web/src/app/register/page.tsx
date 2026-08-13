"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import TerraPage from "@/components/TerraPage";
import { auth, db } from "@/lib/firebase";

export default function RegisterPage() {
  const r = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Jika sudah login, redirect
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        r.push("/waiting");
      }
    });
    return () => unsub();
  }, [r]);

  function mapFirebaseError(message: string) {
    const m = (message || "").toLowerCase();
    if (m.includes("auth/email-already-in-use")) return "Email sudah terdaftar. Silakan login.";
    if (m.includes("auth/invalid-email")) return "Format email tidak valid.";
    if (m.includes("auth/weak-password")) return "Password minimal 6 karakter.";
    return message || "Terjadi kesalahan.";
  }

  async function handleRegister() {
    setLoading(true);
    setErr("");

    try {
      if (!name.trim()) throw new Error("Nama wajib diisi.");
      if (!email.trim()) throw new Error("Email wajib diisi.");
      if (!password.trim()) throw new Error("Password wajib diisi.");
      if (password.trim().length < 6) throw new Error("Password minimal 6 karakter.");
      if (password !== confirmPassword) throw new Error("Konfirmasi password tidak cocok.");

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      await updateProfile(user, { displayName: name.trim() });

      // Simpan user profile dengan level: "free"
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
    <TerraPage maxWidth={480}>
      <style>{`
        .reg-wrap{
          min-height:85vh;
          min-height:85dvh;
          display:grid;
          place-items:center;
          padding:16px 0;
        }
        .reg-card{
          width:100%;
          background:var(--panel);
          border:1px solid var(--border);
          border-radius: var(--radius-lg);
          padding:32px 24px;
          box-shadow: var(--shadow-lg);
        }
        @media (max-width: 540px){
          .reg-card{
            padding:24px 18px;
            border-radius: var(--radius);
          }
        }
        .reg-logo{
          font-size:28px;
          font-weight:900;
          font-family:var(--font-primary);
          line-height:1;
          margin-bottom:6px;
          color:var(--text);
        }
        .reg-field{
          margin-top:14px;
        }
        .reg-field .small{
          margin-bottom:6px;
          font-weight:600;
        }
        .reg-footer{
          margin-top:20px;
          text-align:center;
          font-size:13px;
          color:var(--muted);
        }
        .reg-footer a{
          color:var(--brand);
          text-decoration:none;
          font-weight:700;
        }
      `}</style>

      <div className="reg-wrap">
        <div className="reg-card">
          <div className="reg-logo"><img src="/logo-header.png" alt="RuniX" style={{ height: 36, width: "auto", objectFit: "contain" }} /></div>
          <div className="small" style={{ marginTop: 6 }}>
            Daftar akun baru. Setelah mendaftar, admin akan mengatur akses outlet untuk Anda.
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) handleRegister();
            }}
          >
            <div className="reg-field">
              <div className="small">Nama Lengkap</div>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama kamu"
                autoComplete="name"
              />
            </div>

            <div className="reg-field">
              <div className="small">Email</div>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@contoh.com"
                autoComplete="email"
              />
            </div>

            <div className="reg-field">
              <div className="small">Password</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                autoComplete="new-password"
              />
            </div>

            <div className="reg-field">
              <div className="small">Konfirmasi Password</div>
              <input
                className="input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password"
                autoComplete="new-password"
              />
            </div>

            {err && (
              <div style={{ marginTop: 12, color: "var(--danger)", fontWeight: 800 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 18 }}
              disabled={loading}
            >
              {loading ? "Mendaftar..." : "Daftar Akun"}
            </button>
          </form>

          <div className="reg-footer">
            Sudah punya akun? <a href="/login">Login di sini</a>
          </div>
        </div>
      </div>
    </TerraPage>
  );
}
