"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { useToast } from "@/components/Toast";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";

type ReceiptConfig = {
  storeName: string;
  address: string;
  footer: string;
  cashierName: string;
  fontSize: number;
  showLogo: boolean;
  showQR: boolean;
  showAddress: boolean;
  showCashier: boolean;
  showTableNo: boolean;
  showOrderNo: boolean;
  showDateTime: boolean;
  showPaymentMethod: boolean;
  showWatermark: boolean;
  logoBase64: string;
  qrText: string;
};

const DEFAULT_CONFIG: ReceiptConfig = {
  storeName: "RuniX",
  address: "",
  footer: "Terima kasih.",
  cashierName: "Kasir RuniX",
  fontSize: 13,
  showLogo: false,
  showQR: false,
  showAddress: true,
  showCashier: true,
  showTableNo: true,
  showOrderNo: true,
  showDateTime: true,
  showPaymentMethod: true,
  showWatermark: true,
  logoBase64: "",
  qrText: "",
};

const MAX_LOGO_SIZE = 150 * 1024; // 150KB max for base64 in Firestore

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export default function ReceiptSettingsPage() {
  const r = useRouter();
  const { tenantId, loading } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<ReceiptConfig>(DEFAULT_CONFIG);
  const [busy, setBusy] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string>("");

  const { canDisableWatermark } = useLevel();
  const isFreeUser = !canDisableWatermark();

  const canEdit = ["owner", "developer"].includes((role || "").toString().toLowerCase());

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/main`));
        if (snap.exists()) {
          const d: any = snap.data();
          const logoData = d.receiptLogoBase64 || "";
          setConfig({
            storeName: d.storeName || DEFAULT_CONFIG.storeName,
            address: d.address || DEFAULT_CONFIG.address,
            footer: d.footer || DEFAULT_CONFIG.footer,
            cashierName: d.cashierName || DEFAULT_CONFIG.cashierName,
            fontSize: d.receiptFontSize ?? DEFAULT_CONFIG.fontSize,
            showLogo: d.receiptShowLogo ?? DEFAULT_CONFIG.showLogo,
            showQR: d.receiptShowQR ?? DEFAULT_CONFIG.showQR,
            showAddress: d.receiptShowAddress ?? DEFAULT_CONFIG.showAddress,
            showCashier: d.receiptShowCashier ?? DEFAULT_CONFIG.showCashier,
            showTableNo: d.receiptShowTableNo ?? DEFAULT_CONFIG.showTableNo,
            showOrderNo: d.receiptShowOrderNo ?? DEFAULT_CONFIG.showOrderNo,
            showDateTime: d.receiptShowDateTime ?? DEFAULT_CONFIG.showDateTime,
            showPaymentMethod: d.receiptShowPaymentMethod ?? DEFAULT_CONFIG.showPaymentMethod,
            showWatermark: d.receiptShowWatermark ?? DEFAULT_CONFIG.showWatermark,
            logoBase64: logoData,
            qrText: d.receiptQrText || "",
          });
          if (logoData) setLogoPreview(logoData);
        }
      } catch (e: any) {
        toast.error(e?.message || "Gagal load settings");
      }
    })();
  }, [tenantId]);

  async function save() {
    if (!tenantId || !canEdit) return;
    setBusy(true);
    try {
      await setDoc(
        doc(db, `tenants/${tenantId}/settings/main`),
        {
          storeName: config.storeName.trim() || "RuniX",
          address: config.address.trim(),
          footer: config.footer.trim() || "Terima kasih.",
          cashierName: config.cashierName.trim() || "Kasir RuniX",
          receiptFontSize: config.fontSize,
          receiptShowLogo: config.showLogo,
          receiptShowQR: config.showQR,
          receiptShowAddress: config.showAddress,
          receiptShowCashier: config.showCashier,
          receiptShowTableNo: config.showTableNo,
          receiptShowOrderNo: config.showOrderNo,
          receiptShowDateTime: config.showDateTime,
          receiptShowPaymentMethod: config.showPaymentMethod,
          receiptShowWatermark: isFreeUser ? true : config.showWatermark,
          receiptLogoBase64: config.logoBase64 || "",
          receiptQrText: config.qrText.trim() || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success("Receipt settings tersimpan!");
    } catch (e: any) {
      toast.error(e?.message || "Gagal simpan");
    } finally {
      setBusy(false);
    }
  }

  function update<K extends keyof ReceiptConfig>(key: K, val: ReceiptConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar (PNG/JPG)");
      return;
    }

    if (file.size > 500 * 1024) {
      toast.error("Ukuran file maks 500KB. Kompres gambar terlebih dahulu.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;

      // Resize image to max 200x200 for receipt
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 200;
        let w = img.width;
        let h = img.height;

        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        const compressed = canvas.toDataURL("image/png", 0.8);

        if (compressed.length > MAX_LOGO_SIZE) {
          toast.error("Logo terlalu besar setelah diproses. Gunakan gambar yang lebih kecil.");
          return;
        }

        update("logoBase64", compressed);
        setLogoPreview(compressed);
        toast.success("Logo berhasil diupload!");
      };
      img.src = result;
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeLogo() {
    update("logoBase64", "");
    setLogoPreview("");
    toast.success("Logo dihapus");
  }

  if (loading || loadingRole)
    return (
      <TerraPage>
        <SkeletonStyles />
        <PageSkeleton cards={3} />
      </TerraPage>
    );

  if (!canEdit) {
    return (
      <TerraPage>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">Halaman ini hanya untuk owner.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/dashboard")}>
            Dashboard
          </button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage maxWidth={1100}>
      <style>{`
        .receipt-shell{
          display:grid;
          grid-template-columns: 1fr 320px;
          gap:16px;
          align-items:start;
        }
        @media (max-width: 860px){
          .receipt-shell{
            grid-template-columns: 1fr;
          }
        }
        .toggle-row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:10px 0;
          border-bottom:1px solid var(--border);
        }
        .toggle-row:last-child{ border-bottom:none; }
        .toggle-label{
          font-weight:700;
          font-size:13px;
          color:var(--text);
        }
        .toggle-desc{
          font-size:11px;
          color:var(--muted);
          margin-top:2px;
        }
        .toggle-switch{
          position:relative;
          width:44px;
          height:24px;
          border-radius:999px;
          background:var(--border);
          cursor:pointer;
          transition: background 0.2s ease;
          flex-shrink:0;
        }
        .toggle-switch.active{
          background:var(--brand);
        }
        .toggle-switch::after{
          content:'';
          position:absolute;
          top:3px;
          left:3px;
          width:18px;
          height:18px;
          border-radius:50%;
          background:#fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.2s ease;
        }
        .toggle-switch.active::after{
          transform:translateX(20px);
        }
        .preview-card{
          position:sticky;
          top:16px;
          border:1px solid var(--border);
          border-radius:var(--radius-lg);
          background:var(--panel);
          box-shadow:var(--shadow-card);
          overflow:hidden;
        }
        .preview-header{
          padding:14px 16px;
          border-bottom:1px solid var(--border);
          font-weight:900;
          font-size:13px;
          color:var(--text);
          text-transform:uppercase;
          letter-spacing:0.3px;
        }
        .preview-body{
          padding:16px;
          font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background:#fafafa;
          min-height:300px;
        }
        .preview-body .store-name{
          font-weight:900;
          text-align:center;
          font-size:1.4em;
        }
        .preview-body .center{
          text-align:center;
        }
        .preview-body .muted{
          color:var(--muted);
        }
        .preview-body .line{
          border-top:1px dashed var(--border);
          margin:8px 0;
        }
        .preview-body .item-row{
          display:flex;
          justify-content:space-between;
          padding:3px 0;
        }
        .preview-body .total-row{
          display:flex;
          justify-content:space-between;
          font-weight:900;
          padding:3px 0;
        }
        .font-slider{
          width:100%;
          margin-top:8px;
          accent-color:var(--brand);
        }
        .logo-upload-area{
          margin-top:10px;
          border:2px dashed var(--border);
          border-radius:var(--radius-sm);
          padding:16px;
          text-align:center;
          cursor:pointer;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .logo-upload-area:hover{
          border-color:var(--brand2);
          background:var(--brandSoft);
        }
        .logo-preview-box{
          margin-top:10px;
          display:flex;
          align-items:center;
          gap:12px;
          padding:12px;
          border:1px solid var(--border);
          border-radius:var(--radius-sm);
          background:var(--input-bg);
        }
        .logo-preview-box img{
          width:48px;
          height:48px;
          object-fit:contain;
          border-radius:8px;
          border:1px solid var(--border);
        }
        .qr-preview-box{
          width:64px;
          height:64px;
          border:1px solid var(--border);
          border-radius:4px;
          margin:0 auto;
          display:grid;
          place-items:center;
          background:#fff;
        }
      `}</style>

      <div className="card">
        <div className="row">
          <div>
            <div className="h1">Pengaturan Struk</div>
            <div className="small">Atur tampilan struk / bill belanja</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => r.push("/printer")}>Printer</button>
          <button className="btn" onClick={() => r.push("/dashboard")}>Dashboard</button>
        </div>
      </div>

      <div className="receipt-shell">
        {/* LEFT: SETTINGS */}
        <div style={{ display: "grid", gap: 14 }}>
          {/* Store Info */}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Informasi Toko</div>

            <div className="small">Nama Toko</div>
            <input
              className="input"
              value={config.storeName}
              onChange={(e) => update("storeName", e.target.value)}
              placeholder="Nama toko"
            />

            <div className="small" style={{ marginTop: 10 }}>Alamat</div>
            <input
              className="input"
              value={config.address}
              onChange={(e) => update("address", e.target.value)}
              placeholder="Jl. Contoh No. 123"
            />

            <div className="small" style={{ marginTop: 10 }}>Nama Kasir (default)</div>
            <input
              className="input"
              value={config.cashierName}
              onChange={(e) => update("cashierName", e.target.value)}
              placeholder="Kasir RuniX"
            />

            <div className="small" style={{ marginTop: 10 }}>Footer Struk</div>
            <input
              className="input"
              value={config.footer}
              onChange={(e) => update("footer", e.target.value)}
              placeholder="Terima kasih."
            />
          </div>

          {/* Logo Upload */}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14 }}>Logo Toko</div>
            <div className="small" style={{ marginTop: 4 }}>
              Upload logo toko (maks 500KB, akan di-resize ke 200x200px). Ditampilkan di bagian atas struk.
            </div>

            {logoPreview ? (
              <div className="logo-preview-box">
                <img src={logoPreview} alt="Logo" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>Logo tersimpan</div>
                  <div className="small">Klik hapus untuk ganti logo baru</div>
                </div>
                <button className="btn btn-danger" style={{ fontSize: 12, padding: "8px 12px" }} onClick={removeLogo}>
                  Hapus
                </button>
              </div>
            ) : (
              <div className="logo-upload-area" onClick={() => fileRef.current?.click()}>
                <div style={{ fontSize: 28, opacity: 0.4 }}>&#128247;</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 6 }}>Klik untuk upload logo</div>
                <div className="small">PNG atau JPG, maks 500KB</div>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              style={{ display: "none" }}
              onChange={handleLogoUpload}
            />

            {logoPreview && (
              <button
                className="btn"
                style={{ width: "100%", marginTop: 10, fontSize: 12 }}
                onClick={() => fileRef.current?.click()}
              >
                Ganti Logo
              </button>
            )}
          </div>

          {/* QR Code */}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14 }}>QR Code Struk</div>
            <div className="small" style={{ marginTop: 4 }}>
              Masukkan URL atau teks yang akan di-generate menjadi QR code di bagian bawah struk.
              Cocok untuk link pembayaran QRIS, website toko, atau nomor WhatsApp.
            </div>

            <div className="small" style={{ marginTop: 12 }}>URL / Teks untuk QR Code</div>
            <input
              className="input"
              value={config.qrText}
              onChange={(e) => update("qrText", e.target.value)}
              placeholder="https://wa.me/628xxx atau link QRIS"
            />

            {config.qrText && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                <div className="small" style={{ fontWeight: 700 }}>
                  QR akan di-generate otomatis dari:
                </div>
                <div style={{ fontSize: 12, marginTop: 4, wordBreak: "break-all", fontFamily: "var(--font-mono)" }}>
                  {config.qrText}
                </div>
              </div>
            )}
          </div>

          {/* Font Size */}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14 }}>Ukuran Font Struk</div>
            <div className="small" style={{ marginTop: 4 }}>
              {config.fontSize}px — {config.fontSize <= 11 ? "Kecil" : config.fontSize <= 13 ? "Normal" : config.fontSize <= 15 ? "Besar" : "Sangat Besar"}
            </div>
            <input
              type="range"
              className="font-slider"
              min={10}
              max={18}
              step={1}
              value={config.fontSize}
              onChange={(e) => update("fontSize", Number(e.target.value))}
            />
            <div className="row" style={{ marginTop: 4 }}>
              <span className="small">10px</span>
              <div className="spacer" />
              <span className="small">18px</span>
            </div>
          </div>

          {/* Show/Hide Fields */}
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 8 }}>Tampilkan / Sembunyikan</div>

            <ToggleItem
              label="Logo Toko"
              desc="Tampilkan logo di bagian atas struk"
              value={config.showLogo}
              onChange={(v) => update("showLogo", v)}
            />
            <ToggleItem
              label="QR Code"
              desc="QR code di bagian bawah struk"
              value={config.showQR}
              onChange={(v) => update("showQR", v)}
            />
            <ToggleItem
              label="Alamat"
              desc="Tampilkan alamat toko di struk"
              value={config.showAddress}
              onChange={(v) => update("showAddress", v)}
            />
            <ToggleItem
              label="Nama Kasir"
              desc="Tampilkan nama kasir yang melayani"
              value={config.showCashier}
              onChange={(v) => update("showCashier", v)}
            />
            <ToggleItem
              label="No. Meja"
              desc="Tampilkan nomor meja pelanggan"
              value={config.showTableNo}
              onChange={(v) => update("showTableNo", v)}
            />
            <ToggleItem
              label="No. Order"
              desc="Tampilkan nomor order"
              value={config.showOrderNo}
              onChange={(v) => update("showOrderNo", v)}
            />
            <ToggleItem
              label="Tanggal & Waktu"
              desc="Tampilkan waktu transaksi"
              value={config.showDateTime}
              onChange={(v) => update("showDateTime", v)}
            />
            <ToggleItem
              label="Metode Pembayaran"
              desc="Tampilkan metode bayar (CASH/QRIS)"
              value={config.showPaymentMethod}
              onChange={(v) => update("showPaymentMethod", v)}
            />
            <ToggleItem
              label="Watermark RuniX"
              desc={isFreeUser ? "Upgrade ke Seed atau lebih tinggi untuk menonaktifkan" : "Tampilkan 'Powered by RuniX' di bawah struk"}
              value={isFreeUser ? true : config.showWatermark}
              onChange={(v) => {
                if (isFreeUser) {
                  toast.warning("Upgrade ke Seed atau lebih tinggi untuk menonaktifkan watermark.");
                  return;
                }
                update("showWatermark", v);
              }}
              locked={isFreeUser}
            />
          </div>

          {/* Save */}
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: "14px 0", fontSize: 14 }}
            disabled={busy}
            onClick={save}
          >
            {busy ? "Menyimpan..." : "Simpan Pengaturan Struk"}
          </button>
        </div>

        {/* RIGHT: LIVE PREVIEW */}
        <div className="preview-card">
          <div className="preview-header">Preview Struk</div>
          <div className="preview-body" style={{ fontSize: config.fontSize }}>
            {config.showLogo && (
              <div className="center" style={{ marginBottom: 8 }}>
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo"
                    style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8, margin: "0 auto", display: "block" }}
                  />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 8, background: "var(--brandSoft)", border: "1px solid var(--brand2)", margin: "0 auto", display: "grid", placeItems: "center", fontSize: 20, fontWeight: 900, color: "var(--brand)" }}>
                    T
                  </div>
                )}
              </div>
            )}

            <div className="store-name">{config.storeName || "RuniX"}</div>

            {config.showAddress && config.address && (
              <div className="center muted" style={{ fontSize: config.fontSize - 2 }}>
                {config.address}
              </div>
            )}

            <div className="center" style={{ marginTop: 6 }}>
              <span style={{ display: "inline-block", padding: "2px 8px", border: "2px solid #111", borderRadius: 999, fontSize: config.fontSize - 2, fontWeight: 900, letterSpacing: 0.5 }}>
                STRUK
              </span>
            </div>

            <div className="line" />

            <div className="center">
              {config.showDateTime && (
                <div className="muted" style={{ fontSize: config.fontSize - 2 }}>
                  {new Date().toLocaleString("id-ID")}
                </div>
              )}
              {config.showOrderNo && (
                <div className="muted" style={{ fontSize: config.fontSize - 2 }}>
                  Order: <b>ORD-001</b>
                </div>
              )}
              {config.showTableNo && (
                <div className="muted" style={{ fontSize: config.fontSize - 2 }}>
                  Meja: <b>5</b>
                </div>
              )}
              {config.showCashier && (
                <div className="muted" style={{ fontSize: config.fontSize - 2 }}>
                  Kasir: {config.cashierName || "Kasir"}
                </div>
              )}
              {config.showPaymentMethod && (
                <div className="muted" style={{ fontSize: config.fontSize - 2 }}>
                  Metode: <b>CASH</b>
                </div>
              )}
            </div>

            <div className="line" />

            {/* Sample Items */}
            <div>
              <div style={{ fontWeight: 700 }}>Nasi Goreng</div>
              <div className="item-row">
                <span className="muted">2 x {rupiah(15000)}</span>
                <span style={{ fontWeight: 700 }}>{rupiah(30000)}</span>
              </div>
            </div>
            <div style={{ marginTop: 4 }}>
              <div style={{ fontWeight: 700 }}>Es Teh Manis</div>
              <div className="item-row">
                <span className="muted">1 x {rupiah(5000)}</span>
                <span style={{ fontWeight: 700 }}>{rupiah(5000)}</span>
              </div>
            </div>

            <div className="line" />

            <div className="item-row muted">
              <span>Subtotal</span>
              <span>{rupiah(35000)}</span>
            </div>
            <div className="item-row muted">
              <span>Diskon</span>
              <span>{rupiah(0)}</span>
            </div>
            <div className="total-row">
              <span>TOTAL</span>
              <span>{rupiah(35000)}</span>
            </div>

            {config.showPaymentMethod && (
              <>
                <div className="item-row muted">
                  <span>Bayar</span>
                  <span>{rupiah(50000)}</span>
                </div>
                <div className="item-row muted">
                  <span>Kembalian</span>
                  <span>{rupiah(15000)}</span>
                </div>
              </>
            )}

            <div className="line" />

            {config.showQR && config.qrText && (
              <div className="center" style={{ marginBottom: 8 }}>
                <div className="qr-preview-box">
                  <svg viewBox="0 0 100 100" width="48" height="48">
                    <rect x="10" y="10" width="25" height="25" fill="#111" rx="3"/>
                    <rect x="65" y="10" width="25" height="25" fill="#111" rx="3"/>
                    <rect x="10" y="65" width="25" height="25" fill="#111" rx="3"/>
                    <rect x="15" y="15" width="15" height="15" fill="#fff" rx="2"/>
                    <rect x="70" y="15" width="15" height="15" fill="#fff" rx="2"/>
                    <rect x="15" y="70" width="15" height="15" fill="#fff" rx="2"/>
                    <rect x="19" y="19" width="7" height="7" fill="#111"/>
                    <rect x="74" y="19" width="7" height="7" fill="#111"/>
                    <rect x="19" y="74" width="7" height="7" fill="#111"/>
                    <rect x="42" y="42" width="16" height="16" fill="#111" rx="2"/>
                    <rect x="40" y="10" width="5" height="5" fill="#111"/>
                    <rect x="50" y="15" width="5" height="5" fill="#111"/>
                    <rect x="40" y="25" width="5" height="5" fill="#111"/>
                    <rect x="65" y="45" width="5" height="5" fill="#111"/>
                    <rect x="75" y="50" width="5" height="5" fill="#111"/>
                    <rect x="85" y="45" width="5" height="5" fill="#111"/>
                    <rect x="65" y="65" width="5" height="5" fill="#111"/>
                    <rect x="75" y="75" width="5" height="5" fill="#111"/>
                    <rect x="85" y="85" width="5" height="5" fill="#111"/>
                  </svg>
                </div>
                <div className="muted" style={{ fontSize: 9, marginTop: 4 }}>Scan untuk bayar</div>
              </div>
            )}

            {config.showQR && !config.qrText && (
              <div className="center muted" style={{ fontSize: 10, marginBottom: 8 }}>
                (QR aktif tapi belum ada URL/teks)
              </div>
            )}

            <div className="center muted" style={{ fontSize: config.fontSize - 1 }}>
              {config.footer || "Terima kasih."}
            </div>

            {(isFreeUser || config.showWatermark) && (
              <div className="center" style={{ fontSize: config.fontSize - 3, opacity: 0.5, marginTop: 6 }}>
                Powered by RuniX
              </div>
            )}
          </div>
        </div>
      </div>
    </TerraPage>
  );
}

function ToggleItem({
  label,
  desc,
  value,
  onChange,
  locked,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-label">
          {label}
          {locked && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--brand)", fontWeight: 600 }}>🔒 FREE</span>}
        </div>
        <div className="toggle-desc">{desc}</div>
      </div>
      <div
        className={`toggle-switch ${value ? "active" : ""} ${locked ? "locked" : ""}`}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        style={locked ? { opacity: 0.5, cursor: "not-allowed" } : {}}
      />
    </div>
  );
}
