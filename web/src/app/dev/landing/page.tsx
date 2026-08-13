"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import TerraPage from "@/components/TerraPage";
import { auth, authReadyPromise } from "@/lib/firebase";
import { checkIsDeveloper } from "@/lib/developer";
import { useToast } from "@/components/Toast";
import {
  DEFAULT_LANDING_CONFIG,
  LandingConfig,
  FeatureItem,
  PricingPlan,
  subscribeLandingConfig,
  saveLandingConfig,
} from "@/lib/landing-config";

export default function DevLandingPage() {
  const r = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Config state
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_LANDING_CONFIG);
  const [activeTab, setActiveTab] = useState<"hero" | "features" | "pricing" | "misc">("hero");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { await authReadyPromise; if (!auth.currentUser) { r.push("/login"); return; } return; }
      const dev = await checkIsDeveloper(user.uid, user.email || "");
      if (!dev) { r.push("/dashboard"); return; }
      setIsDev(true);
      setEmail(user.email || "");
      setLoading(false);
    });
    return () => unsub();
  }, [r]);

  useEffect(() => {
    if (!isDev) return;
    const unsub = subscribeLandingConfig((c) => setConfig(c));
    return () => unsub();
  }, [isDev]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveLandingConfig(config, email);
      toast.success("Landing page berhasil disimpan!");
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig(DEFAULT_LANDING_CONFIG);
    toast.info("Reset ke default. Klik Simpan untuk menerapkan.");
  }

  // Hero handlers
  function updateHero(field: string, value: string) {
    setConfig((prev) => ({ ...prev, hero: { ...prev.hero, [field]: value } }));
  }

  // Features handlers
  function updateFeature(index: number, field: keyof FeatureItem, value: string) {
    setConfig((prev) => {
      const features = [...prev.features];
      features[index] = { ...features[index], [field]: value };
      return { ...prev, features };
    });
  }

  function addFeature() {
    setConfig((prev) => ({
      ...prev,
      features: [...prev.features, { icon: "✨", title: "Fitur Baru", description: "Deskripsi fitur" }],
    }));
  }

  function removeFeature(index: number) {
    setConfig((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  }

  // Pricing handlers
  function updatePlan(index: number, field: keyof PricingPlan, value: any) {
    setConfig((prev) => {
      const pricing = [...prev.pricing];
      pricing[index] = { ...pricing[index], [field]: value };
      return { ...prev, pricing };
    });
  }

  function updatePlanFeature(planIdx: number, featIdx: number, value: string) {
    setConfig((prev) => {
      const pricing = [...prev.pricing];
      const features = [...pricing[planIdx].features];
      features[featIdx] = value;
      pricing[planIdx] = { ...pricing[planIdx], features };
      return { ...prev, pricing };
    });
  }

  function addPlanFeature(planIdx: number) {
    setConfig((prev) => {
      const pricing = [...prev.pricing];
      pricing[planIdx] = {
        ...pricing[planIdx],
        features: [...pricing[planIdx].features, "Fitur baru"],
      };
      return { ...prev, pricing };
    });
  }

  function removePlanFeature(planIdx: number, featIdx: number) {
    setConfig((prev) => {
      const pricing = [...prev.pricing];
      pricing[planIdx] = {
        ...pricing[planIdx],
        features: pricing[planIdx].features.filter((_, i) => i !== featIdx),
      };
      return { ...prev, pricing };
    });
  }

  function addPlan() {
    setConfig((prev) => ({
      ...prev,
      pricing: [
        ...prev.pricing,
        { name: "New Plan", price: "Rp0", period: "/bulan", yearlyPrice: "Rp0", yearlyPeriod: "/tahun", description: "Deskripsi", features: ["Fitur 1"], highlighted: false, ctaText: "Pilih", ctaLink: "/setup" },
      ],
    }));
  }

  function removePlan(index: number) {
    setConfig((prev) => ({
      ...prev,
      pricing: prev.pricing.filter((_, i) => i !== index),
    }));
  }

  if (loading) {
    return <TerraPage><div className="card">Loading...</div></TerraPage>;
  }

  return (
    <TerraPage maxWidth={900}>
      <style>{`
        .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;}
        .tab{
          padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;
          border:1px solid var(--border);background:var(--panel);cursor:pointer;
          transition:all 0.15s;
        }
        .tab.active{background:var(--brand);color:#fff;border-color:var(--brand);}
        .field{margin-top:12px;}
        .field label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px;}
        .field input,.field textarea{
          width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);
          background:var(--input-bg);color:var(--text);font-size:14px;font-family:inherit;
        }
        .field textarea{min-height:60px;resize:vertical;}
        .item-card{
          border:1px solid var(--border);border-radius:12px;padding:14px;
          margin-top:10px;background:var(--panel);
        }
        .item-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
        .item-header .badge{font-size:11px;padding:3px 8px;}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;}
      `}</style>

      {/* HEADER */}
      <div className="card">
        <div className="row">
          <div>
            <div className="h1">Landing Page Editor</div>
            <div className="small">Kustomisasi halaman depan RuniX</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => r.push("/dev")}>← Dev Console</button>
        </div>
      </div>

      {/* TABS */}
      <div className="card">
        <div className="tabs">
          <button className={`tab ${activeTab === "hero" ? "active" : ""}`} onClick={() => setActiveTab("hero")}>Hero</button>
          <button className={`tab ${activeTab === "features" ? "active" : ""}`} onClick={() => setActiveTab("features")}>Fitur</button>
          <button className={`tab ${activeTab === "pricing" ? "active" : ""}`} onClick={() => setActiveTab("pricing")}>Pricing</button>
          <button className={`tab ${activeTab === "misc" ? "active" : ""}`} onClick={() => setActiveTab("misc")}>Lainnya</button>
        </div>

        {/* HERO TAB */}
        {activeTab === "hero" && (
          <div>
            <div className="field">
              <label>Badge Text</label>
              <input value={config.hero.badge} onChange={(e) => updateHero("badge", e.target.value)} />
            </div>
            <div className="field">
              <label>Headline</label>
              <input value={config.hero.headline} onChange={(e) => updateHero("headline", e.target.value)} />
            </div>
            <div className="field">
              <label>Headline Highlight (warna brand)</label>
              <input value={config.hero.headlineHighlight} onChange={(e) => updateHero("headlineHighlight", e.target.value)} />
            </div>
            <div className="field">
              <label>Subtitle</label>
              <textarea value={config.hero.subtitle} onChange={(e) => updateHero("subtitle", e.target.value)} />
            </div>
            <div className="field">
              <label>CTA Primer</label>
              <input value={config.hero.ctaPrimary} onChange={(e) => updateHero("ctaPrimary", e.target.value)} />
            </div>
            <div className="field">
              <label>CTA Sekunder</label>
              <input value={config.hero.ctaSecondary} onChange={(e) => updateHero("ctaSecondary", e.target.value)} />
            </div>
          </div>
        )}

        {/* FEATURES TAB */}
        {activeTab === "features" && (
          <div>
            <div className="field">
              <label>Judul Section Fitur</label>
              <input value={config.featuresTitle} onChange={(e) => setConfig((p) => ({ ...p, featuresTitle: e.target.value }))} />
            </div>

            {config.features.map((feat, i) => (
              <div key={i} className="item-card">
                <div className="item-header">
                  <span style={{ fontSize: 20 }}>{feat.icon}</span>
                  <b>{feat.title || `Fitur ${i + 1}`}</b>
                  <div className="spacer" />
                  <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeFeature(i)}>Hapus</button>
                </div>
                <div className="field">
                  <label>Icon (emoji)</label>
                  <input value={feat.icon} onChange={(e) => updateFeature(i, "icon", e.target.value)} style={{ maxWidth: 80 }} />
                </div>
                <div className="field">
                  <label>Judul</label>
                  <input value={feat.title} onChange={(e) => updateFeature(i, "title", e.target.value)} />
                </div>
                <div className="field">
                  <label>Deskripsi</label>
                  <input value={feat.description} onChange={(e) => updateFeature(i, "description", e.target.value)} />
                </div>
              </div>
            ))}

            <button className="btn" style={{ marginTop: 14 }} onClick={addFeature}>+ Tambah Fitur</button>
          </div>
        )}

        {/* PRICING TAB */}
        {activeTab === "pricing" && (
          <div>
            <div className="field">
              <label>Judul Section Pricing</label>
              <input value={config.pricingTitle} onChange={(e) => setConfig((p) => ({ ...p, pricingTitle: e.target.value }))} />
            </div>
            <div className="field">
              <label>Subtitle Pricing</label>
              <input value={config.pricingSubtitle} onChange={(e) => setConfig((p) => ({ ...p, pricingSubtitle: e.target.value }))} />
            </div>

            {config.pricing.map((plan, i) => (
              <div key={i} className="item-card">
                <div className="item-header">
                  <b>{plan.name}</b>
                  {plan.highlighted && <span className="badge">Highlighted</span>}
                  <div className="spacer" />
                  <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removePlan(i)}>Hapus</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Nama Paket</label>
                    <input value={plan.name} onChange={(e) => updatePlan(i, "name", e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Harga (Bulanan)</label>
                    <input value={plan.price} onChange={(e) => updatePlan(i, "price", e.target.value)} placeholder="Rp49.000" />
                  </div>
                  <div className="field">
                    <label>Periode Bulanan</label>
                    <input value={plan.period} onChange={(e) => updatePlan(i, "period", e.target.value)} placeholder="/bulan" />
                  </div>
                  <div className="field">
                    <label>Harga (Tahunan)</label>
                    <input value={plan.yearlyPrice || ""} onChange={(e) => updatePlan(i, "yearlyPrice", e.target.value)} placeholder="Rp490.000" />
                  </div>
                  <div className="field">
                    <label>Periode Tahunan</label>
                    <input value={plan.yearlyPeriod || ""} onChange={(e) => updatePlan(i, "yearlyPeriod", e.target.value)} placeholder="/tahun" />
                  </div>
                  <div className="field">
                    <label>CTA Button</label>
                    <input value={plan.ctaText} onChange={(e) => updatePlan(i, "ctaText", e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Deskripsi</label>
                  <input value={plan.description} onChange={(e) => updatePlan(i, "description", e.target.value)} />
                </div>
                <div className="field">
                  <label>CTA Link</label>
                  <input value={plan.ctaLink || ""} onChange={(e) => updatePlan(i, "ctaLink", e.target.value)} placeholder="/setup" />
                </div>
                <div className="field">
                  <label style={{ marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={plan.highlighted}
                      onChange={(e) => updatePlan(i, "highlighted", e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    Highlight paket ini (badge &ldquo;Populer&rdquo;)
                  </label>
                </div>
                <div className="field">
                  <label>Fitur Paket</label>
                  {plan.features.map((feat, j) => (
                    <div key={j} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
                      <input
                        value={feat}
                        onChange={(e) => updatePlanFeature(i, j, e.target.value)}
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--input-bg)", color: "var(--text)", fontSize: 13 }}
                      />
                      <button
                        onClick={() => removePlanFeature(i, j)}
                        style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 900, fontSize: 16 }}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                  <button className="btn" style={{ marginTop: 8, fontSize: 12, padding: "6px 12px" }} onClick={() => addPlanFeature(i)}>
                    + Tambah Fitur
                  </button>
                </div>
              </div>
            ))}

            <button className="btn" style={{ marginTop: 14 }} onClick={addPlan}>+ Tambah Paket</button>
          </div>
        )}

        {/* MISC TAB */}
        {activeTab === "misc" && (
          <div>
            <div className="field">
              <label>CTA Title (section bawah)</label>
              <input value={config.ctaTitle} onChange={(e) => setConfig((p) => ({ ...p, ctaTitle: e.target.value }))} />
            </div>
            <div className="field">
              <label>CTA Subtitle</label>
              <input value={config.ctaSubtitle} onChange={(e) => setConfig((p) => ({ ...p, ctaSubtitle: e.target.value }))} />
            </div>
            <div className="field">
              <label>Footer Text</label>
              <input value={config.footerText} onChange={(e) => setConfig((p) => ({ ...p, footerText: e.target.value }))} />
            </div>
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="card">
        <div className="actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
          <button className="btn" onClick={handleReset}>Reset ke Default</button>
          <button className="btn lp-btn-ghost" onClick={() => window.open("/", "_blank")}>Preview Landing Page ↗</button>
        </div>
        {config.updatedBy && (
          <div className="small" style={{ marginTop: 10 }}>
            Terakhir diubah oleh: <b>{config.updatedBy}</b>
          </div>
        )}
      </div>
    </TerraPage>
  );
}
