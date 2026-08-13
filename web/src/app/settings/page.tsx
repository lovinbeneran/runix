"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import TerraPage from "@/components/TerraPage";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useToast } from "@/components/Toast";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";

export default function SettingsPage() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();

  // Store info
  const [storeName, setStoreName] = useState("RuniX");
  const [address, setAddress] = useState("");
  const [footer, setFooter] = useState("Terima kasih.");
  const [phone, setPhone] = useState("");
  const [openHours, setOpenHours] = useState("");

  // Tax
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxPercent, setTaxPercent] = useState("10");
  const [taxLabel, setTaxLabel] = useState("PB1");

  // State
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/main`));
        if (snap.exists()) {
          const d: any = snap.data();
          setStoreName(d.storeName || "RuniX");
          setAddress(d.address || "");
          setFooter(d.footer || "Terima kasih.");
          setPhone(d.phone || "");
          setOpenHours(d.openHours || "");
          setTaxEnabled(d.taxEnabled ?? false);
          setTaxPercent(d.taxPercent?.toString() || "10");
          setTaxLabel(d.taxLabel || "PB1");
        }
      } catch (e: any) {
        setErr(e?.message || "Gagal load settings");
      }
    })();
  }, [tenantId]);

  async function save() {
    if (!tenantId) return;
    setBusy(true); setErr(null);
    try {
      await setDoc(doc(db, `tenants/${tenantId}/settings/main`), {
        storeName: storeName.trim(),
        address: address.trim(),
        footer: footer.trim(),
        phone: phone.trim(),
        openHours: openHours.trim(),
        taxEnabled,
        taxPercent: Number(taxPercent) || 10,
        taxLabel: taxLabel.trim() || "PB1",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success("Settings tersimpan!");
    } catch (e: any) {
      setErr(e?.message || "Gagal simpan");
      toast.error(e?.message || "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  // Direct render for seamless page transition

  if (role !== "owner" && role !== "developer") {
    return (
      <TerraPage>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">Halaman Settings hanya untuk owner.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/dashboard")}>Kembali</button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage maxWidth={760}>
      <style>{`
        .settings-section {
          margin-top: 14px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
        }
        .settings-section-title {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 4px;
        }
        .settings-section-desc {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 16px;
          line-height: 1.5;
        }
        .settings-field {
          margin-bottom: 14px;
        }
        .settings-label {
          display: block;
          font-size: 12px;
          font-weight: 800;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
          margin-bottom: 6px;
        }
        .settings-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .settings-row { grid-template-columns: 1fr; }
        }
        .settings-check {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          padding: 10px 0;
        }
        .settings-check input {
          width: 20px;
          height: 20px;
          accent-color: var(--brand);
        }
      `}</style>

      {/* Section: Info Toko */}
      <div className="settings-section">
        <div className="settings-section-title">🏪 Informasi Toko</div>
        <div className="settings-section-desc">Data dasar outlet yang tampil di struk, menu customer, dan laporan.</div>

        <div className="settings-field">
          <label className="settings-label">Nama Toko / Outlet</label>
          <input className="input" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Contoh: Warung Kopi Nusantara" />
        </div>

        <div className="settings-row">
          <div className="settings-field">
            <label className="settings-label">Alamat</label>
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. Merdeka No. 123" />
          </div>
          <div className="settings-field">
            <label className="settings-label">No. Telepon</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08123456789" />
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-field">
            <label className="settings-label">Jam Buka</label>
            <input className="input" value={openHours} onChange={(e) => setOpenHours(e.target.value)} placeholder="08:00 - 22:00" />
          </div>
          <div className="settings-field">
            <label className="settings-label">Footer Struk</label>
            <input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Terima kasih atas kunjungan Anda!" />
          </div>
        </div>
      </div>

      {/* Section: Tax/Pajak */}
      <div className="settings-section">
        <div className="settings-section-title">💰 Pajak</div>
        <div className="settings-section-desc">Atur pajak yang ditampilkan di struk (PB1, Service Charge, dll).</div>

        <label className="settings-check">
          <input type="checkbox" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
          Aktifkan Pajak
        </label>

        {taxEnabled && (
          <div className="settings-row">
            <div className="settings-field">
              <label className="settings-label">Label Pajak</label>
              <input className="input" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="PB1" />
            </div>
            <div className="settings-field">
              <label className="settings-label">Persentase (%)</label>
              <input className="input" type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} placeholder="10" />
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ marginTop: 14 }}>
        {err && <div style={{ marginBottom: 10, color: "var(--danger)", fontWeight: 800, fontSize: 13 }}>{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 16, fontSize: 15 }} disabled={busy} onClick={save}>
          {busy ? "Menyimpan..." : "💾 Simpan Semua Pengaturan"}
        </button>
      </div>
    </TerraPage>
  );
}
