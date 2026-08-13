"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { auth, authReadyPromise } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { checkIsDeveloper } from "@/lib/developer";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  BrandColorConfig,
  DEFAULT_BRAND_COLORS,
  COLOR_PRESETS,
  saveBrandColors,
  resetBrandColors,
  subscribeBrandColors,
  triggerForceReload,
} from "@/lib/brand-colors";

export default function DevBrandColorsPage() {
  const r = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [email, setEmail] = useState("");
  const [brandColors, setBrandColors] = useState<BrandColorConfig>(DEFAULT_BRAND_COLORS);
  const [savingColors, setSavingColors] = useState(false);
  const [reloading, setReloading] = useState(false);

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
    const unsub = subscribeBrandColors((colors) => setBrandColors(colors));
    return () => unsub();
  }, [isDev]);

  function updateColor(key: keyof BrandColorConfig, value: string) {
    setBrandColors((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSavingColors(true);
    try {
      await saveBrandColors(brandColors, email);
      toast.success("Warna brand tersimpan! Semua client akan sync otomatis.");
    } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
    finally { setSavingColors(false); }
  }

  async function handleReset() {
    if (!confirm("Reset semua warna ke default?")) return;
    setSavingColors(true);
    try {
      await resetBrandColors(email);
      setBrandColors(DEFAULT_BRAND_COLORS);
      toast.success("Warna di-reset ke default.");
    } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
    finally { setSavingColors(false); }
  }

  async function handleForceReload() {
    if (!confirm("Reload SEMUA client yang sedang membuka RuniX?")) return;
    setReloading(true);
    try {
      await triggerForceReload(email);
      toast.success("Signal reload dikirim!");
    } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
    finally { setReloading(false); }
  }

  if (loading) return <TerraPage maxWidth={900}><SkeletonStyles /><PageSkeleton cards={2} /></TerraPage>;

  return (
    <TerraPage maxWidth={900}>
      <style>{`
        .bc-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-top:10px;}
        .bc-preset{text-align:left;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--panel);cursor:pointer;transition:border-color 0.15s;}
        .bc-preset:hover{border-color:var(--brand);}
        .bc-colors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:16px;}
        .bc-field{border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--panel);}
        .bc-field-label{font-size:12px;font-weight:700;color:var(--muted);margin-bottom:8px;}
        .bc-field-row{display:flex;align-items:center;gap:8px;}
        .bc-field-bar{margin-top:8px;height:6px;border-radius:999px;}
      `}</style>

      <div className="card">
        <div className="row">
          <div>
            <div className="h1">Brand Colors</div>
            <div className="small">Ubah warna seluruh app. Sync realtime ke semua client.</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => r.push("/dev")}>← Dev Console</button>
        </div>
      </div>

      {/* PRESETS */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Template Warna</div>
        <div className="small">Klik untuk apply, lalu "Simpan" untuk menerapkan.</div>
        <div className="bc-presets">
          {COLOR_PRESETS.map((preset) => (
            <button key={preset.id} className="bc-preset" onClick={() => setBrandColors(preset.colors)}>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: preset.colors.brand }} />
                <div style={{ width: 18, height: 18, borderRadius: 5, background: preset.colors.brand2 }} />
                <div style={{ width: 18, height: 18, borderRadius: 5, background: preset.colors.brandHover }} />
                <div style={{ width: 18, height: 18, borderRadius: 5, background: preset.colors.bgDark, border: "1px solid #444" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 12 }}>{preset.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* COLOR FIELDS */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Custom Colors</div>
        <div className="bc-colors-grid">
          <ColorField label="Brand Primary" colorKey="brand" value={brandColors.brand} onChange={updateColor} />
          <ColorField label="Brand Secondary" colorKey="brand2" value={brandColors.brand2} onChange={updateColor} />
          <ColorField label="Brand Soft" colorKey="brandSoft" value={brandColors.brandSoft} onChange={updateColor} />
          <ColorField label="Brand Hover" colorKey="brandHover" value={brandColors.brandHover} onChange={updateColor} />
          <ColorField label="Danger" colorKey="danger" value={brandColors.danger} onChange={updateColor} />
          <ColorField label="Success" colorKey="success" value={brandColors.success} onChange={updateColor} />
          <ColorField label="Warning" colorKey="warning" value={brandColors.warning} onChange={updateColor} />
          <ColorField label="BG Light" colorKey="bgLight" value={brandColors.bgLight} onChange={updateColor} />
          <ColorField label="Panel Light" colorKey="panelLight" value={brandColors.panelLight} onChange={updateColor} />
          <ColorField label="Border Light" colorKey="borderLight" value={brandColors.borderLight} onChange={updateColor} />
          <ColorField label="Text Light" colorKey="textLight" value={brandColors.textLight} onChange={updateColor} />
          <ColorField label="Muted Light" colorKey="mutedLight" value={brandColors.mutedLight} onChange={updateColor} />
          <ColorField label="Input BG Light" colorKey="inputBgLight" value={brandColors.inputBgLight} onChange={updateColor} />
          <ColorField label="BG Dark" colorKey="bgDark" value={brandColors.bgDark} onChange={updateColor} />
          <ColorField label="Panel Dark" colorKey="panelDark" value={brandColors.panelDark} onChange={updateColor} />
          <ColorField label="Border Dark" colorKey="borderDark" value={brandColors.borderDark} onChange={updateColor} />
          <ColorField label="Text Dark" colorKey="textDark" value={brandColors.textDark} onChange={updateColor} />
          <ColorField label="Muted Dark" colorKey="mutedDark" value={brandColors.mutedDark} onChange={updateColor} />
          <ColorField label="Input BG Dark" colorKey="inputBgDark" value={brandColors.inputBgDark} onChange={updateColor} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={savingColors}>{savingColors ? "Menyimpan..." : "Simpan Warna"}</button>
          <button className="btn btn-danger" onClick={handleReset} disabled={savingColors}>Reset</button>
        </div>
      </div>

      {/* FORCE RELOAD */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Force Reload All Clients</div>
        <div className="small" style={{ marginTop: 4 }}>Paksa semua browser/HP yang membuka RuniX untuk reload. Gunakan dengan hati-hati.</div>
        <button className="btn btn-danger" style={{ width: "100%", marginTop: 14 }} onClick={handleForceReload} disabled={reloading}>
          {reloading ? "Mengirim..." : "Reload Semua Client Sekarang"}
        </button>
      </div>
    </TerraPage>
  );
}

function ColorField({ label, colorKey, value, onChange }: { label: string; colorKey: keyof BrandColorConfig; value: string; onChange: (k: keyof BrandColorConfig, v: string) => void }) {
  return (
    <div className="bc-field">
      <div className="bc-field-label">{label}</div>
      <div className="bc-field-row">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(colorKey, e.target.value)} style={{ width: 36, height: 36, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", padding: 2, background: "transparent" }} />
        <input className="input" value={value || ""} onChange={(e) => onChange(colorKey, e.target.value)} placeholder="#hex" style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }} />
      </div>
      <div className="bc-field-bar" style={{ background: value || "#ccc" }} />
    </div>
  );
}
