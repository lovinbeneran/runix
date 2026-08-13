"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { auth, db, authReadyPromise } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { checkIsDeveloper } from "@/lib/developer";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  BrandColorConfig,
  DEFAULT_BRAND_COLORS,
  COLOR_PRESETS,
  getTenantBrandColors,
  saveTenantBrandColors,
  resetTenantBrandColors,
  saveBrandColorsToAllTenants,
} from "@/lib/brand-colors";

type TenantOption = { id: string; name: string };

export default function DevTenantBrandingPage() {
  const r = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [email, setEmail] = useState("");

  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenant, setSelectedTenant] = useState("");
  const [applyMode, setApplyMode] = useState<"single" | "all">("single");
  const [brandColors, setBrandColors] = useState<BrandColorConfig>(DEFAULT_BRAND_COLORS);
  const [saving, setSaving] = useState(false);
  const [loadingColors, setLoadingColors] = useState(false);
  const [hasCustom, setHasCustom] = useState(false);

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
    (async () => {
      try {
        const snap = await getDocs(collection(db, "tenants"));
        const arr = snap.docs.map((d) => { const data = d.data() as any; return { id: d.id, name: data.name || data.storeName || d.id }; });
        setTenants(arr);
        if (arr.length > 0) setSelectedTenant(arr[0].id);
      } catch {}
    })();
  }, [isDev]);

  // Load colors when tenant changes
  useEffect(() => {
    if (!selectedTenant || applyMode === "all") {
      setBrandColors(DEFAULT_BRAND_COLORS);
      setHasCustom(false);
      return;
    }
    setLoadingColors(true);
    (async () => {
      const colors = await getTenantBrandColors(selectedTenant);
      if (colors) {
        setBrandColors(colors);
        setHasCustom(true);
      } else {
        setBrandColors(DEFAULT_BRAND_COLORS);
        setHasCustom(false);
      }
      setLoadingColors(false);
    })();
  }, [selectedTenant, applyMode]);

  function updateColor(key: keyof BrandColorConfig, value: string) {
    setBrandColors((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (applyMode === "all") {
        const count = await saveBrandColorsToAllTenants(brandColors, email);
        toast.success(`Warna disimpan ke ${count} tenant!`);
      } else {
        await saveTenantBrandColors(selectedTenant, brandColors, email);
        const t = tenants.find((x) => x.id === selectedTenant);
        toast.success(`Warna "${t?.name || selectedTenant}" disimpan!`);
        setHasCustom(true);
      }
    } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if (applyMode === "all") {
      if (!confirm("Reset semua tenant ke warna default?")) return;
      setSaving(true);
      try {
        for (const t of tenants) { try { await resetTenantBrandColors(t.id); } catch {} }
        setBrandColors(DEFAULT_BRAND_COLORS);
        toast.success("Semua tenant di-reset ke default.");
      } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
      finally { setSaving(false); }
    } else {
      if (!confirm(`Reset warna tenant ini ke default (hapus custom branding)?`)) return;
      setSaving(true);
      try {
        await resetTenantBrandColors(selectedTenant);
        setBrandColors(DEFAULT_BRAND_COLORS);
        setHasCustom(false);
        toast.success("Custom branding dihapus. Tenant pakai warna default.");
      } catch (e: any) { toast.error("Gagal: " + (e?.message || "")); }
      finally { setSaving(false); }
    }
  }

  if (loading) return <TerraPage maxWidth={900}><SkeletonStyles /><PageSkeleton cards={2} /></TerraPage>;

  return (
    <TerraPage maxWidth={900}>
      <style>{`
        .tb-mode{display:flex;gap:6px;margin-top:12px;}
        .tb-mode button{padding:9px 18px;border-radius:8px;font-weight:700;font-size:13px;border:1px solid var(--border);background:var(--panel);cursor:pointer;transition:all 0.15s;}
        .tb-mode button.active{background:var(--brand);color:#fff;border-color:var(--brand);}
        .tb-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:10px;}
        .tb-preset{text-align:left;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--panel);cursor:pointer;transition:border-color 0.15s;}
        .tb-preset:hover{border-color:var(--brand);}
        .tb-colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:14px;}
        .tb-field{border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--panel);}
        .tb-field-label{font-size:11px;font-weight:700;color:var(--muted);margin-bottom:6px;}
        .tb-field-row{display:flex;align-items:center;gap:6px;}
        .tb-field-bar{margin-top:6px;height:5px;border-radius:999px;}
        .tb-status{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;}
        @media(max-width:640px){
          .tb-colors{grid-template-columns:1fr 1fr;}
          .tb-presets{grid-template-columns:1fr 1fr;}
        }
      `}</style>

      {/* HEADER */}
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
          <div>
            <div className="h1">Tenant Branding</div>
            <div className="small">Ubah warna per tenant. Landing page tetap pakai warna default RuniX.</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => r.push("/dev")}>← Dev Console</button>
        </div>
      </div>

      {/* MODE + TENANT SELECTOR */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Target</div>
        <div className="tb-mode">
          <button className={applyMode === "single" ? "active" : ""} onClick={() => setApplyMode("single")}>Satu Tenant</button>
          <button className={applyMode === "all" ? "active" : ""} onClick={() => setApplyMode("all")}>Semua Tenant</button>
        </div>

        {applyMode === "single" && (
          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Pilih Tenant</div>
            <select className="input" value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)} style={{ width: "100%" }}>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
              ))}
            </select>
            {selectedTenant && (
              <div style={{ marginTop: 8 }}>
                {loadingColors ? (
                  <span className="tb-status" style={{ background: "var(--input-bg)", color: "var(--muted)" }}>Loading...</span>
                ) : hasCustom ? (
                  <span className="tb-status" style={{ background: "#dcfce7", color: "#166534" }}>Custom branding aktif</span>
                ) : (
                  <span className="tb-status" style={{ background: "var(--input-bg)", color: "var(--muted)" }}>Pakai warna default (belum di-custom)</span>
                )}
              </div>
            )}
          </div>
        )}

        {applyMode === "all" && (
          <div className="small" style={{ marginTop: 10, padding: 10, background: "var(--input-bg)", borderRadius: 8 }}>
            Perubahan akan diterapkan ke <b>{tenants.length} tenant</b> sekaligus.
          </div>
        )}
      </div>

      {/* PRESETS */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Template Warna</div>
        <div className="small">Klik untuk apply, lalu "Simpan" untuk menerapkan.</div>
        <div className="tb-presets">
          {COLOR_PRESETS.map((preset) => (
            <button key={preset.id} className="tb-preset" onClick={() => setBrandColors(preset.colors)}>
              <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.colors.brand }} />
                <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.colors.brand2 }} />
                <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.colors.brandHover }} />
                <div style={{ width: 14, height: 14, borderRadius: 4, background: preset.colors.bgDark, border: "1px solid #444" }} />
              </div>
              <div style={{ fontWeight: 800, fontSize: 11 }}>{preset.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* COLOR EDITOR */}
      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Custom Colors</div>
        <div className="tb-colors">
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
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : applyMode === "all" ? `Simpan ke ${tenants.length} Tenant` : "Simpan"}
          </button>
          <button className="btn btn-danger" onClick={handleReset} disabled={saving}>
            {applyMode === "all" ? "Reset Semua" : "Reset"}
          </button>
        </div>
      </div>
    </TerraPage>
  );
}

function ColorField({ label, colorKey, value, onChange }: { label: string; colorKey: keyof BrandColorConfig; value: string; onChange: (k: keyof BrandColorConfig, v: string) => void }) {
  return (
    <div className="tb-field">
      <div className="tb-field-label">{label}</div>
      <div className="tb-field-row">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(colorKey, e.target.value)} style={{ width: 32, height: 32, border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: 2, background: "transparent" }} />
        <input className="input" value={value || ""} onChange={(e) => onChange(colorKey, e.target.value)} placeholder="#hex" style={{ flex: 1, fontFamily: "monospace", fontSize: 11, padding: "6px 8px" }} />
      </div>
      <div className="tb-field-bar" style={{ background: value || "#ccc" }} />
    </div>
  );
}
