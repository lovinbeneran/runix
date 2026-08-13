"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { receiptHTML } from "@/lib/receipt";
import { buildPlainReceipt, getPrintMode, sendToRawBT, setPrintMode } from "@/lib/rawbt";
import * as NativePrinter from "@/lib/native-printer";
import * as WebBluetooth from "@/lib/bluetooth-printer";
import { useToast } from "@/components/Toast";
import { usePrinting } from "@/components/PrintingOverlay";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";

type ReceiptSettings = { storeName: string; address: string; footer: string; cashierName: string };
type PairedDevice = { name: string; address: string };

export default function PrinterPage() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();
  const { showPrinting, hidePrinting } = usePrinting();
  const canEdit = ["owner", "admin", "developer"].includes((role || "").toString().toLowerCase());

  const [settings, setSettings] = useState<ReceiptSettings>({ storeName: "RuniX", address: "", footer: "Terima kasih.", cashierName: "Kasir RuniX" });
  const [customText, setCustomText] = useState("Tes Printer RuniX\nTerima kasih");
  const [msg, setMsg] = useState<string | null>(null);
  const [printMode, setPrintModeState] = useState<"browser" | "rawbt" | "bluetooth">("browser");

  // Printer system toggle
  const [printerEnabled, setPrinterEnabled] = useState(true);

  // Bluetooth state
  const [isNative, setIsNative] = useState(false);
  const [btConnected, setBtConnected] = useState(false);
  const [btPrinterName, setBtPrinterName] = useState("");
  const [btLoading, setBtLoading] = useState(false);
  const [btConnecting, setBtConnecting] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [showDevices, setShowDevices] = useState(false);

  useEffect(() => {
    setPrintModeState(getPrintMode());
    setIsNative(NativePrinter.isNative());
    // Load printer enabled state
    const stored = localStorage.getItem("runix_printer_enabled");
    if (stored !== null) setPrinterEnabled(stored === "true");
  }, []);

  // Auto-reconnect & check status
  useEffect(() => {
    if (!isNative) return;
    NativePrinter.autoReconnect().then((ok) => {
      if (ok) {
        NativePrinter.isConnected().then((s) => {
          setBtConnected(s.connected);
          setBtPrinterName(s.name);
        });
      }
    });
  }, [isNative]);

  // Poll status
  useEffect(() => {
    if (!isNative) return;
    const interval = setInterval(() => {
      NativePrinter.isConnected().then((s) => {
        setBtConnected(s.connected);
        setBtPrinterName(s.name);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [isNative]);

  // Web Bluetooth fallback polling
  useEffect(() => {
    if (isNative || printMode !== "bluetooth") return;
    const interval = setInterval(() => {
      setBtConnected(WebBluetooth.isPrinterConnected());
      setBtPrinterName(WebBluetooth.getConnectedPrinterName());
    }, 2000);
    return () => clearInterval(interval);
  }, [isNative, printMode]);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/main`));
        if (snap.exists()) {
          const d = snap.data() as any;
          setSettings({
            storeName: (d.storeName || "RuniX").toString(),
            address: (d.address || "").toString(),
            footer: (d.footer || "Terima kasih.").toString(),
            cashierName: (d.cashierName || "Kasir RuniX").toString(),
          });
          if (d.printerEnabled !== undefined) {
            setPrinterEnabled(d.printerEnabled);
          }
        }
      } catch (e: any) {
        setMsg(e?.message ?? "Gagal load settings");
      }
    })();
  }, [tenantId]);

  async function togglePrinterSystem(enabled: boolean) {
    setPrinterEnabled(enabled);
    localStorage.setItem("runix_printer_enabled", String(enabled));
    if (tenantId) {
      try {
        await setDoc(
          doc(db, `tenants/${tenantId}/settings/main`),
          { printerEnabled: enabled, updatedAt: serverTimestamp() },
          { merge: true }
        );
        toast.success(enabled ? "Sistem printer diaktifkan" : "Sistem printer dinonaktifkan");
      } catch (e: any) {
        toast.error(e?.message || "Gagal simpan");
      }
    }
  }

  async function handleListDevices() {
    setBtLoading(true);
    setBtConnecting(true);
    setMsg(null);
    try {
      if (isNative) {
        const devices = await NativePrinter.listDevices();
        setPairedDevices(devices);
        setShowDevices(true);
        if (devices.length === 0) setMsg("Tidak ada printer paired. Pair dulu di Settings Bluetooth HP.");
      } else {
        const name = await WebBluetooth.connectPrinter();
        setBtConnected(true);
        setBtPrinterName(name);
        setMsg(`Printer "${name}" terhubung.`);
      }
    } catch (e: any) {
      setMsg(e?.message || "Gagal.");
    } finally {
      setBtLoading(false);
      setBtConnecting(false);
    }
  }

  async function handleConnectDevice(device: PairedDevice) {
    setBtLoading(true);
    setBtConnecting(true);
    setMsg(null);
    try {
      const result = await NativePrinter.connect(device.address);
      setBtConnected(true);
      setBtPrinterName(result.name || device.name);
      setShowDevices(false);
      setMsg(`Terhubung ke "${result.name || device.name}"`);
    } catch (e: any) {
      setMsg(e?.message || "Gagal konek.");
    } finally {
      setBtLoading(false);
      setBtConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      if (isNative) await NativePrinter.disconnect();
      else WebBluetooth.disconnectPrinter();
      setBtConnected(false);
      setBtPrinterName("");
      setMsg("Printer disconnected.");
    } catch {}
  }

  async function testPrint() {
    if (!printerEnabled) {
      toast.warning("Sistem printer sedang nonaktif.");
      return;
    }
    setMsg(null);
    const testData = {
      title: "TEST PRINT",
      storeName: settings.storeName || "RuniX",
      address: settings.address || "",
      footer: settings.footer || "Terima kasih.",
      orderNo: `TEST-${Date.now().toString().slice(-6)}`,
      dateText: new Date().toLocaleString("id-ID"),
      tableNo: "1",
      cashierName: settings.cashierName || email || "",
      cashierEmail: settings.cashierName || email || "",
      paymentMethod: "CASH" as const,
      subtotal: 25000,
      discount: 0,
      total: 25000,
      paidAmount: 30000,
      items: [
        { name: "Nasi Goreng", qty: 1, price: 15000 },
        { name: "Kopi Susu", qty: 1, price: 10000 },
      ],
    };

    try {
      if (printMode === "bluetooth") {
        if (!btConnected) {
          setMsg("Printer belum terkonek.");
          return;
        }
        showPrinting("Test print via Bluetooth...");
        if (isNative) await NativePrinter.printReceipt(testData);
        else await WebBluetooth.printReceipt(testData);
        hidePrinting();
        setMsg("Test print berhasil!");
        toast.success("Test print berhasil!");
      } else if (printMode === "rawbt") {
        sendToRawBT(buildPlainReceipt(testData));
        toast.success("Dikirim ke RawBT.");
      } else {
        const html = receiptHTML(testData);
        localStorage.setItem("runix_last_receipt_html", html);
        const w = window.open("", "_blank", "width=420,height=800");
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
        }
      }
    } catch (e: any) {
      hidePrinting();
      setMsg(e?.message || "Gagal print.");
      toast.error(e?.message || "Gagal print.");
    }
  }

  async function printCustom() {
    if (!printerEnabled) {
      toast.warning("Sistem printer sedang nonaktif.");
      return;
    }
    const safe = (customText || "").trim();
    if (!safe) {
      toast.warning("Teks kosong.");
      return;
    }
    setMsg(null);
    try {
      if (printMode === "bluetooth") {
        if (!btConnected) {
          setMsg("Printer belum terkonek.");
          return;
        }
        showPrinting("Mencetak via Bluetooth...");
        if (isNative) await NativePrinter.printText(safe);
        else await WebBluetooth.printText(safe);
        hidePrinting();
        setMsg("Print berhasil!");
        toast.success("Print berhasil!");
      } else if (printMode === "rawbt") {
        sendToRawBT(safe);
        toast.success("Dikirim ke RawBT.");
      } else {
        const html = `<!doctype html><html><head><meta charset="utf-8"/><style>@page{margin:10mm}body{font-family:monospace;white-space:pre-wrap;max-width:320px;margin:0 auto}</style></head><body>${escapeHtml(safe)}<script>window.onload=()=>window.print()</script></body></html>`;
        const w = window.open("", "_blank", "width=420,height=800");
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
        }
      }
    } catch (e: any) {
      hidePrinting();
      setMsg(e?.message || "Gagal print.");
      toast.error(e?.message || "Gagal print.");
    }
  }

  function changeMode(mode: "rawbt" | "bluetooth") {
    setPrintModeState(mode);
    setPrintMode(mode);
    toast.success(`Mode: ${mode === "bluetooth" ? "Bluetooth" : "RawBT"}`);
  }

  function getStatusColor() {
    if (!printerEnabled) return "#9ca3af";
    if (printMode === "bluetooth") return btConnected ? "#22c55e" : "#ef4444";
    return "#22c55e"; // rawbt always "ready"
  }

  function getStatusText() {
    if (!printerEnabled) return "Sistem Printer Nonaktif";
    if (printMode === "bluetooth") return btConnected ? `Terhubung: ${btPrinterName}` : "Bluetooth — Belum Terhubung";
    return "RawBT — Siap";
  }

  // Direct render for seamless page transition

  return (
    <TerraPage maxWidth={860}>
      <style>{`
        .printer-grid{ margin-top:14px; display:grid; grid-template-columns: 1fr 1fr; gap:14px; }
        @media (max-width: 780px){ .printer-grid{ grid-template-columns: 1fr; } }
        textarea{ width:100%; min-height:120px; }
        .bt-panel{ margin-top:12px; padding:14px; border-radius:14px; border:1px solid var(--border); background:#fffaf5; }
        .device-list{ margin-top:10px; display:grid; gap:8px; }
        .device-item{ display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:#fff; }
        .status-bar{
          display:flex;
          align-items:center;
          gap:10px;
          padding:14px 16px;
          border-radius:var(--radius);
          border:1px solid var(--border);
          background:var(--panel);
          margin-top:14px;
        }
        .status-dot{
          width:12px;
          height:12px;
          border-radius:50%;
          flex-shrink:0;
          animation: pulse 2s ease-in-out infinite;
        }
        .status-text{
          font-weight:800;
          font-size:13px;
          color:var(--text);
        }
        .status-sub{
          font-size:11px;
          color:var(--muted);
          margin-top:2px;
        }
        .toggle-master{
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:16px;
          border-radius:var(--radius);
          border:1px solid var(--border);
          background:var(--panel);
          box-shadow:var(--shadow-card);
        }
        .toggle-switch{
          position:relative;
          width:48px;
          height:26px;
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
          width:20px;
          height:20px;
          border-radius:50%;
          background:#fff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.2s ease;
        }
        .toggle-switch.active::after{
          transform:translateX(22px);
        }
        .mode-card{
          display:flex;
          flex-direction:column;
          align-items:center;
          padding:14px 12px;
          border-radius:var(--radius-sm);
          border:2px solid var(--border);
          cursor:pointer;
          transition:all 0.15s ease;
          flex:1;
          text-align:center;
        }
        .mode-card:hover{
          border-color:var(--brand2);
          background:var(--brandSoft);
        }
        .mode-card.selected{
          border-color:var(--brand);
          background:var(--brandSoft);
          box-shadow:0 0 0 3px rgba(213,149,103,0.15);
        }
        .mode-icon{
          width:36px;
          height:36px;
          border-radius:10px;
          display:grid;
          place-items:center;
          font-size:18px;
          margin-bottom:8px;
          background:var(--brandSoft);
          border:1px solid var(--brand2);
        }
        .mode-card.selected .mode-icon{
          background:var(--brand);
          border-color:var(--brand);
          color:#fff;
        }
        .mode-title{
          font-weight:800;
          font-size:13px;
          color:var(--text);
        }
        .mode-desc{
          font-size:10px;
          color:var(--muted);
          margin-top:3px;
          line-height:1.3;
        }
      `}</style>

      {/* HEADER */}
      <div className="card">
        <div className="row">
          <div>
            <div className="h1">Printer</div>
            <div className="small">Kelola printer & mode cetak struk</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => r.push("/settings/receipt")}>Pengaturan Struk</button>
          <button className="btn" onClick={() => r.push("/dashboard")}>Dashboard</button>
        </div>
      </div>

      {/* MASTER TOGGLE */}
      <div className="toggle-master" style={{ marginTop: 14 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14 }}>Sistem Printer</div>
          <div className="small" style={{ marginTop: 2 }}>
            {printerEnabled ? "Printer aktif — struk akan dicetak otomatis setelah transaksi" : "Printer nonaktif — tidak ada cetak otomatis"}
          </div>
        </div>
        <div
          className={`toggle-switch ${printerEnabled ? "active" : ""}`}
          onClick={() => togglePrinterSystem(!printerEnabled)}
          role="switch"
          aria-checked={printerEnabled}
        />
      </div>

      {/* STATUS BAR */}
      <div className="status-bar">
        <div className="status-dot" style={{ background: getStatusColor() }} />
        <div>
          <div className="status-text">{getStatusText()}</div>
          <div className="status-sub">
            {!printerEnabled
              ? "Aktifkan sistem printer untuk mulai cetak"
              : printMode === "bluetooth"
              ? isNative
                ? "APK mode — Bluetooth Classic (SPP)"
                : "Browser mode — Web Bluetooth BLE"
              : "Memerlukan aplikasi RawBT terinstall"}
          </div>
        </div>
      </div>

      {/* MODE SELECTION */}
      {printerEnabled && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Mode Cetak</div>
          <div style={{ display: "flex", gap: 10 }}>
            <div
              className={`mode-card ${printMode === "bluetooth" ? "selected" : ""}`}
              onClick={() => changeMode("bluetooth")}
            >
              <div className="mode-icon">&#128424;</div>
              <div className="mode-title">Bluetooth</div>
              <div className="mode-desc">Printer thermal langsung</div>
            </div>
            <div
              className={`mode-card ${printMode === "rawbt" ? "selected" : ""}`}
              onClick={() => changeMode("rawbt")}
            >
              <div className="mode-icon">&#128196;</div>
              <div className="mode-title">RawBT</div>
              <div className="mode-desc">Via app RawBT</div>
            </div>
          </div>
        </div>
      )}

      {/* BLUETOOTH PANEL */}
      {printerEnabled && printMode === "bluetooth" && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>Koneksi Bluetooth</div>
          <div className="bt-panel">
            <div className="row" style={{ gap: 12 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                background: btConnected ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                border: `2px solid ${btConnected ? "#22c55e" : "#ef4444"}`,
                flexShrink: 0,
              }}>
                {btConnected ? "\u2713" : "\u2022"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>
                  {btConnected ? `Terhubung: ${btPrinterName}` : "Belum terhubung"}
                </div>
                <div className="small">
                  {btConnected
                    ? "Siap cetak."
                    : isNative
                    ? "Pilih printer dari daftar paired devices."
                    : "Klik konek untuk pilih printer."}
                </div>
              </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
              {!btConnected ? (
                <button
                  className="btn btn-primary"
                  onClick={handleListDevices}
                  disabled={btLoading}
                >
                  {btLoading ? "Loading..." : isNative ? "Pilih Printer" : "Konek Printer"}
                </button>
              ) : (
                <button className="btn btn-danger" onClick={handleDisconnect}>
                  Disconnect
                </button>
              )}
            </div>

            {/* PAIRED DEVICES LIST (Native only) */}
            {showDevices && pairedDevices.length > 0 && (
              <div className="device-list">
                <div className="small" style={{ fontWeight: 800 }}>Pilih printer:</div>
                {pairedDevices.map((d) => (
                  <div key={d.address} className="device-item">
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{d.name}</div>
                      <div className="small">{d.address}</div>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleConnectDevice(d)}
                      disabled={btLoading}
                    >
                      Konek
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MESSAGE */}
      {msg && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900 }}>{msg}</div>
        </div>
      )}

      {/* TEST PRINT & CUSTOM */}
      {printerEnabled && (
        <div className="printer-grid">
          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14 }}>Test Print</div>
            <div className="small" style={{ marginTop: 4 }}>
              Cetak struk contoh untuk memastikan printer berfungsi
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 14 }}
              onClick={testPrint}
            >
              Test Print Struk
            </button>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900, fontSize: 14 }}>Cetak Teks Custom</div>
            <div className="small" style={{ marginTop: 4 }}>
              Kirim teks bebas ke printer untuk testing
            </div>
            <div style={{ marginTop: 12 }}>
              <textarea
                className="input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Teks yang akan dicetak..."
              />
            </div>
            <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={printCustom}>
              Print Teks Custom
            </button>
          </div>
        </div>
      )}

      {btConnecting && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 90 }}>
          <div className="card" style={{ width: 360, maxWidth: "100%", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 36, marginBottom: 12, animation: "pulse 1.5s ease-in-out infinite" }}>&#128246;</div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Menghubungkan Printer...</div>
            <div className="small" style={{ marginTop: 8 }}>Pastikan printer dalam keadaan menyala dan berada dalam jangkauan.</div>
          </div>
        </div>
      )}
    </TerraPage>
  );
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("\n", "<br/>");
}
