"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { calculateShiftTotals, isShiftPermissionError, normalizeShift, ShiftRecord, toDateSafe } from "@/lib/shifts";
import { getPrintMode, sendToRawBT } from "@/lib/rawbt";
import { useToast } from "@/components/Toast";
import { usePrinting } from "@/components/PrintingOverlay";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

type Order = {
  id: string;
  status?: string;
  total?: number;
  paymentMethod?: "CASH" | "QRIS" | null;
  shiftId?: string | null;
  items?: { name: string; qty: number; price: number }[];
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function formatDateTime(d: Date | null) {
  if (!d) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ShiftsContent() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();
  const { showPrinting, hidePrinting } = usePrinting();

  const canUse = true; // Halaman shift bisa diakses oleh semua role (Delta, Omega, Zeta, Staff, Kasir, dll)

  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [shiftAccessBlocked, setShiftAccessBlocked] = useState(false);
  const [showProductBreakdown, setShowProductBreakdown] = useState(true);

  const [openingCash, setOpeningCash] = useState("0");
  const [openingNote, setOpeningNote] = useState("");
  const [closingCashActual, setClosingCashActual] = useState("0");
  const [closingNote, setClosingNote] = useState("");

  // Confirmation dialogs & Navigation layout state
  const [filterTab, setFilterTab] = useState<"ACTIVE" | "HISTORY">("ACTIVE");
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [showOpenConfirm, setShowOpenConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closeSuccessDialog, setCloseSuccessDialog] = useState<{ shiftId: string } | null>(null);
  const [pendingPrintData, setPendingPrintData] = useState<{ data: any; products: any } | null>(null);

  const [cashMovements, setCashMovements] = useState<import("@/lib/shifts").CashMovement[]>([]);
  const [showMovementModal, setShowMovementModal] = useState<"IN" | "OUT" | null>(null);
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);

  // Filter Tanggal & Kalender Custom RuniX State untuk Shift
  const [shiftDateFilter, setShiftDateFilter] = useState<string>(""); // YYYY-MM-DD
  const [shiftQuickDatePreset, setShiftQuickDatePreset] = useState<"ALL" | "TODAY" | "YESTERDAY" | "THIS_WEEK" | "CUSTOM">("ALL");
  const [calendarPickerDate, setCalendarPickerDate] = useState<Date>(new Date());
  const [showShiftDatePickerPopup, setShowShiftDatePickerPopup] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    const qy = query(collection(db, `tenants/${tenantId}/shifts`), orderBy("openedAt", "desc"), limit(20));
    return onSnapshot(
      qy,
      (snap) => {
        setShiftAccessBlocked(false);
        setShifts(snap.docs.map((item) => normalizeShift(item.id, item.data())));
      },
      (e) => {
        if (isShiftPermissionError(e)) {
          setShiftAccessBlocked(true);
          setErr(null);
          return;
        }
        setErr(e.message);
      }
    );
  }, [tenantId]);

  const activeShift = useMemo(() => {
    return shifts.find((shift) => shift.status === "OPEN") || null;
  }, [shifts]);

  const filteredShifts = useMemo(() => {
    if (shiftQuickDatePreset === "ALL" && !shiftDateFilter) return shifts;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    return shifts.filter((shift) => {
      const rawDate = shift.openedAt;
      if (!rawDate) return false;
      const d = toDateSafe(rawDate);
      if (!d) return false;
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      if (shiftQuickDatePreset === "TODAY") return dateStr === todayStr;
      if (shiftQuickDatePreset === "YESTERDAY") {
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
        return dateStr === yestStr;
      }
      if (shiftQuickDatePreset === "THIS_WEEK") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return d >= sevenDaysAgo && d <= now;
      }
      if (shiftDateFilter) return dateStr === shiftDateFilter;
      return true;
    });
  }, [shifts, shiftQuickDatePreset, shiftDateFilter]);

  // Realtime listener untuk Cash Movements pada Active Shift
  useEffect(() => {
    if (!tenantId || !activeShift) {
      setCashMovements([]);
      return;
    }
    const qy = query(
      collection(db, `tenants/${tenantId}/shifts/${activeShift.id}/movements`),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(
      qy,
      (snap) => {
        setCashMovements(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              type: data.type || "IN",
              amount: Number(data.amount || 0),
              reason: data.reason || "",
              createdByEmail: data.createdByEmail || "",
              createdAt: data.createdAt,
            };
          })
        );
      },
      () => setCashMovements([])
    );
  }, [tenantId, activeShift]);

  useEffect(() => {
    if (!tenantId) return;
    const qy = query(collection(db, `tenants/${tenantId}/orders`), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(
      qy,
      (snap) => {
        setOrders(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              status: data.status || "OPEN",
              total: Number(data.total || 0),
              discountAmount: Number(data.discountAmount || 0),
              paymentMethod: data.paymentMethod ?? null,
              shiftId: data.shiftId ?? null,
              items: Array.isArray(data.items) ? data.items : [],
            };
          })
        );
      },
      (e) => setErr(e.message)
    );
  }, [tenantId]);

  const activeSummary = useMemo(() => {
    if (!activeShift) return null;
    const totals = calculateShiftTotals(orders, activeShift.id, cashMovements);
    // Formula Presisi Expected Cash di Laci Fisik:
    // Kas Awal + Penjualan Cash + Kas Masuk (Paid In) - Kas Keluar (Paid Out) - Refund Cash
    const expectedCash =
      Number(activeShift.openingCash || 0) +
      totals.cashSales +
      totals.totalCashIn -
      totals.totalCashOut -
      totals.totalRefunds;

    return {
      ...totals,
      expectedCash,
    };
  }, [activeShift, orders, cashMovements]);

  async function handleAddCashMovement() {
    if (!tenantId || !activeShift || !showMovementModal) return;
    const amt = Number(movementAmount);
    if (!amt || amt <= 0) {
      toast.error("Jumlah kas harus lebih besar dari 0");
      return;
    }
    if (!movementReason.trim()) {
      toast.error("Alasan / Catatan wajib diisi");
      return;
    }

    try {
      setSavingMovement(true);
      await addDoc(collection(db, `tenants/${tenantId}/shifts/${activeShift.id}/movements`), {
        type: showMovementModal,
        amount: amt,
        reason: movementReason.trim(),
        createdByEmail: email || "",
        createdAt: serverTimestamp(),
      });

      logAudit(tenantId, {
        action: showMovementModal === "IN" ? "SHIFT_CASH_IN" : "SHIFT_CASH_OUT",
        userEmail: email || "",
        description: `Kas ${showMovementModal === "IN" ? "Masuk" : "Keluar"}: Rp ${amt.toLocaleString("id-ID")} (${movementReason.trim()})`,
        metadata: { amount: amt, reason: movementReason.trim() },
      });

      toast.success(`Berhasil mencatat Uang Kas ${showMovementModal === "IN" ? "Masuk" : "Keluar"}`);
      setMovementAmount("");
      setMovementReason("");
      setShowMovementModal(null);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan transaksi kas");
    } finally {
      setSavingMovement(false);
    }
  }

  function getShiftProducts(shiftId: string): { name: string; qty: number; revenue: number }[] {
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const order of orders) {
      if ((order.status || "").toUpperCase() !== "PAID") continue;
      if ((order.shiftId || "") !== shiftId) continue;
      if (!order.items) continue;
      for (const item of order.items) {
        const key = (item.name || "").toString();
        if (!key) continue;
        if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 };
        productMap[key].qty += Number(item.qty || 0);
        productMap[key].revenue += Number(item.price || 0) * Number(item.qty || 0);
      }
    }
    return Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
  }

  async function openShift() {
    try {
      if (!tenantId) return;
      if (activeShift) {
        setMsg("Masih ada shift yang OPEN. Tutup dulu shift aktif sebelum buka shift baru.");
        return;
      }

      setSaving(true);
      setMsg("");

      await addDoc(collection(db, `tenants/${tenantId}/shifts`), {
        status: "OPEN",
        openedByUid: auth.currentUser?.uid || "",
        openedByEmail: email || "",
        openingCash: Number(openingCash || 0),
        noteOpen: openingNote.trim(),
        cashSales: 0,
        qrisSales: 0,
        totalSales: 0,
        orderCount: 0,
        openedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setOpeningCash("0");
      setOpeningNote("");
      setMsg("Shift berhasil dibuka.");

      logAudit(tenantId, {
        action: "SHIFT_OPEN",
        userEmail: email || "",
        description: `Buka shift baru (kas awal: Rp ${Number(openingCash || 0).toLocaleString("id-ID")})`,
        metadata: { openingCash: Number(openingCash || 0) },
      });
    } catch (e: any) {
      setMsg(e?.message || "Gagal buka shift.");
    } finally {
      setSaving(false);
    }
  }

  async function closeShift() {
    try {
      if (!tenantId || !activeShift || !activeSummary) return;

      setSaving(true);
      setMsg("");

      const actual = Number(closingCashActual || 0);
      const expected = activeSummary.expectedCash;

      await updateDoc(doc(db, `tenants/${tenantId}/shifts/${activeShift.id}`), {
        status: "CLOSED",
        closedByUid: auth.currentUser?.uid || "",
        closedByEmail: email || "",
        closingCashExpected: expected,
        closingCashActual: actual,
        variance: actual - expected,
        cashSales: activeSummary.cashSales,
        qrisSales: activeSummary.qrisSales,
        transferSales: activeSummary.transferSales,
        cardSales: activeSummary.cardSales,
        totalSales: activeSummary.totalSales,
        orderCount: activeSummary.orderCount,
        totalCashIn: activeSummary.totalCashIn,
        totalCashOut: activeSummary.totalCashOut,
        totalDiscounts: activeSummary.totalDiscounts,
        totalRefunds: activeSummary.totalRefunds,
        noteClose: closingNote.trim(),
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setClosingCashActual("0");
      setClosingNote("");
      setMsg("Shift berhasil ditutup.");

      logAudit(tenantId, {
        action: "SHIFT_CLOSE",
        userEmail: email || "",
        description: `Tutup shift (omzet: Rp ${activeSummary.totalSales.toLocaleString("id-ID")}, ${activeSummary.orderCount} transaksi)`,
        metadata: {
          shiftId: activeShift.id,
          totalSales: activeSummary.totalSales,
          orderCount: activeSummary.orderCount,
          variance: actual - expected,
        },
      });

      const products = showProductBreakdown ? getShiftProducts(activeShift.id) : undefined;
      setPendingPrintData({
        data: {
          openedByEmail: activeShift.openedByEmail || "-",
          openedAt: toDateSafe(activeShift.openedAt),
          closedAt: new Date(),
          openingCash: Number(activeShift.openingCash || 0),
          cashSales: activeSummary.cashSales,
          qrisSales: activeSummary.qrisSales,
          transferSales: activeSummary.transferSales,
          cardSales: activeSummary.cardSales,
          totalCashIn: activeSummary.totalCashIn,
          totalCashOut: activeSummary.totalCashOut,
          totalDiscounts: activeSummary.totalDiscounts,
          totalRefunds: activeSummary.totalRefunds,
          totalSales: activeSummary.totalSales,
          orderCount: activeSummary.orderCount,
          expectedCash: expected,
          actualCash: actual,
          variance: actual - expected,
          closingNote: closingNote.trim(),
        },
        products,
      });
      setCloseSuccessDialog({ shiftId: activeShift.id });
    } catch (e: any) {
      setMsg(e?.message || "Gagal tutup shift.");
    } finally {
      setSaving(false);
    }
  }

  function printShiftReport(
    data: {
      openedByEmail: string;
      openedAt: Date | null;
      closedAt: Date | null;
      openingCash: number;
      cashSales: number;
      qrisSales: number;
      transferSales?: number;
      cardSales?: number;
      totalCashIn?: number;
      totalCashOut?: number;
      totalDiscounts?: number;
      totalRefunds?: number;
      totalSales: number;
      orderCount: number;
      expectedCash: number;
      actualCash: number;
      variance: number;
      closingNote: string;
    },
    products?: { name: string; qty: number; revenue: number }[]
  ) {
    const lines: string[] = [];
    lines.push("================================");
    lines.push("     LAPORAN TUTUP SHIFT");
    lines.push("================================");
    lines.push("");
    lines.push(`Kasir    : ${data.openedByEmail}`);
    lines.push(`Buka     : ${data.openedAt ? data.openedAt.toLocaleString("id-ID") : "-"}`);
    lines.push(`Tutup    : ${data.closedAt ? data.closedAt.toLocaleString("id-ID") : "-"}`);
    lines.push("--------------------------------");
    lines.push(`Kas Awal       : Rp ${rupiah(data.openingCash)}`);
    lines.push(`Cash Sales     : Rp ${rupiah(data.cashSales)}`);
    lines.push(`QRIS Sales     : Rp ${rupiah(data.qrisSales)}`);
    if (data.transferSales) lines.push(`Transfer Sales : Rp ${rupiah(data.transferSales)}`);
    if (data.cardSales) lines.push(`Card Sales     : Rp ${rupiah(data.cardSales)}`);
    lines.push("--------------------------------");
    if (data.totalCashIn) lines.push(`+ Paid In (Kas)  : Rp ${rupiah(data.totalCashIn)}`);
    if (data.totalCashOut) lines.push(`- Paid Out (Kas) : Rp ${rupiah(data.totalCashOut)}`);
    if (data.totalDiscounts) lines.push(`Disc Diberikan   : Rp ${rupiah(data.totalDiscounts)}`);
    if (data.totalRefunds) lines.push(`Refund Dikeluar  : Rp ${rupiah(data.totalRefunds)}`);
    lines.push("--------------------------------");
    lines.push(`Total Sales    : Rp ${rupiah(data.totalSales)}`);
    lines.push(`Jumlah Order   : ${data.orderCount}`);
    lines.push("--------------------------------");
    lines.push(`Expected Kas   : Rp ${rupiah(data.expectedCash)}`);
    lines.push(`Kas Aktual     : Rp ${rupiah(data.actualCash)}`);
    lines.push(`Selisih        : Rp ${rupiah(data.variance)}`);
    if (data.closingNote) {
      lines.push("--------------------------------");
      lines.push(`Catatan: ${data.closingNote}`);
    }
    if (products && products.length > 0) {
      lines.push("================================");
      lines.push("       PRODUK TERJUAL");
      lines.push("================================");
      for (const p of products) {
        lines.push(`${p.name}`);
        lines.push(`  ${p.qty}x  Rp ${rupiah(p.revenue)}`);
      }
    }
    lines.push("================================");
    lines.push("");

    const text = lines.join("\n");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Laporan Tutup Shift</title>
<style>@page{margin:10mm}body{font-family:ui-monospace,Menlo,Consolas,monospace;max-width:320px;margin:0 auto;white-space:pre-wrap;line-height:1.6;font-size:13px;}</style>
</head><body>${text.replace(/\n/g, "<br>")}<script>window.onload=()=>{window.print()}</script></body></html>`;

    const mode = getPrintMode();

    if (mode === "bluetooth") {
      (async () => {
        try {
          showPrinting("Mencetak laporan shift...");
          const NativePrinter = await import("@/lib/native-printer");
          if (NativePrinter.isNative()) {
            const status = await NativePrinter.isConnected();
            if (!status.connected) await NativePrinter.autoReconnect();
            await NativePrinter.printText(text);
            toast.success("Laporan shift berhasil dicetak!");
          } else {
            const WebBT = await import("@/lib/bluetooth-printer");
            if (!WebBT.isPrinterConnected()) {
              toast.error("Printer belum terkonek.");
              hidePrinting();
              return;
            }
            await WebBT.printText(text);
            toast.success("Laporan shift berhasil dicetak!");
          }
        } catch (e: any) {
          toast.error("Gagal print: " + (e?.message || ""));
        } finally {
          hidePrinting();
        }
      })();
      return;
    }

    if (mode === "rawbt") {
      sendToRawBT(text);
      toast.success("Laporan shift dikirim ke RawBT.");
      return;
    }

    const w = window.open("", "_blank", "width=420,height=600");
    if (!w) {
      toast.error("Pop-up print diblokir browser.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function printHistoryShiftReport(shift: ShiftRecord) {
    const products = showProductBreakdown ? getShiftProducts(shift.id) : undefined;
    printShiftReport(
      {
        openedByEmail: shift.openedByEmail || "-",
        openedAt: toDateSafe(shift.openedAt),
        closedAt: toDateSafe(shift.closedAt),
        openingCash: Number(shift.openingCash || 0),
        cashSales: Number(shift.cashSales || 0),
        qrisSales: Number(shift.qrisSales || 0),
        transferSales: Number(shift.transferSales || 0),
        cardSales: Number(shift.cardSales || 0),
        totalCashIn: Number(shift.totalCashIn || 0),
        totalCashOut: Number(shift.totalCashOut || 0),
        totalDiscounts: Number(shift.totalDiscounts || 0),
        totalRefunds: Number(shift.totalRefunds || 0),
        totalSales: Number(shift.totalSales || 0),
        orderCount: Number(shift.orderCount || 0),
        expectedCash: Number(shift.closingCashExpected || 0),
        actualCash: Number(shift.closingCashActual || 0),
        variance: Number(shift.variance || 0),
        closingNote: shift.noteClose || "",
      },
      products
    );
  }

  if (loading || loadingRole) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 800 }}>
        Memuat Data Shift Kasir...
      </div>
    );
  }

  if (!canUse) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "var(--danger)" }}>Akses Ditolak</div>
        <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>Halaman shift hanya untuk owner/admin.</div>
        <button className="btn" style={{ marginTop: 16 }} onClick={() => r.push("/dashboard")}>
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="shifts-adv-container">
      <style>{`
        .shifts-adv-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: var(--text);
          font-family: var(--font-primary);
          height: calc(100vh - 100px);
          overflow: hidden;
        }

        /* Prominent Filter Bar Header for Shifts */
        .shifts-segmented-dock-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 16px 24px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.06);
          flex-shrink: 0;
        }
        .shifts-dock-track {
          display: flex;
          align-items: center;
          background: var(--brandSoft);
          padding: 6px;
          border-radius: 20px;
          border: 1px solid var(--border);
          gap: 6px;
        }
        .shifts-dock-pill {
          padding: 12px 24px;
          border-radius: 16px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-weight: 900;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .shifts-dock-pill.active {
          background: var(--panel);
          color: var(--brand);
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }

        /* Master-Detail Split Container */
        .shifts-master-detail-container {
          display: flex;
          gap: 16px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        @media (max-width: 980px) {
          .shifts-master-detail-container {
            flex-direction: column;
            overflow-y: auto;
          }
        }

        /* Master Pane (Left List) */
        .shifts-master-pane {
          width: 380px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
          flex-shrink: 0;
        }
        @media (max-width: 980px) {
          .shifts-master-pane {
            width: 100%;
            height: 320px;
          }
        }
        .shifts-master-list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Master Item Card */
        .shifts-master-card {
          padding: 14px 16px;
          border-radius: 18px;
          border: 1.5px solid var(--border);
          background: var(--brandSoft);
          cursor: pointer;
          transition: all 0.25s ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .shifts-master-card:hover {
          border-color: var(--brand);
          background: var(--panel);
          transform: translateY(-1px);
        }
        .shifts-master-card.selected {
          border-color: var(--brand);
          background: var(--panel);
          box-shadow: 0 6px 20px rgba(154, 0, 2, 0.08);
        }

        /* Detail Inspector Pane (Right Detail) */
        .shifts-detail-pane {
          flex: 1;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
          min-width: 0;
        }

        /* Stats Grid 6-Box */
        .shifts-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        @media (max-width: 640px) {
          .shifts-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .shifts-stat-box {
          background: var(--brandSoft);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .shifts-stat-label {
          font-size: 11px;
          font-weight: 800;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .shifts-stat-val {
          font-size: 18px;
          font-weight: 900;
          font-family: var(--font-mono);
          margin-top: 4px;
        }

        /* Form Controls & Inputs */
        .shifts-input-field {
          width: 100%;
          border-radius: 16px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 700;
          font-family: var(--font-mono);
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          transition: all 0.2s ease;
        }
        .shifts-input-field:focus {
          outline: none;
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 0 0 3.5px rgba(154, 0, 2, 0.12);
        }

        .shifts-textarea-field {
          width: 100%;
          border-radius: 16px;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          min-height: 70px;
          transition: all 0.2s ease;
        }
        .shifts-textarea-field:focus {
          outline: none;
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 0 0 3.5px rgba(154, 0, 2, 0.12);
        }

        /* Status Badges */
        .shifts-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.4px;
        }
        .shifts-badge-open {
          background: rgba(245, 158, 11, 0.15);
          color: #d97706;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .shifts-badge-closed {
          background: rgba(16, 185, 129, 0.15);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
      `}</style>

      {/* ERROR & NOTIFICATION BANNER */}
      {shiftAccessBlocked && (
        <div style={{ padding: 14, borderRadius: 16, background: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#d97706", fontWeight: 800, fontSize: 13 }}>
          Fitur shift belum bisa dipakai karena akses Firestore untuk koleksi shift belum diizinkan di project Firebase ini.
        </div>
      )}
      {err && <div style={{ padding: 14, borderRadius: 16, background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", fontWeight: 900, fontSize: 13 }}>{err}</div>}
      {msg && <div style={{ padding: 14, borderRadius: 16, background: "var(--brandSoft)", border: "1px solid var(--border)", color: "var(--brand)", fontWeight: 800, fontSize: 13 }}>{msg}</div>}

      {!shiftAccessBlocked && (
        <>
          {/* SEGMENTED FLOATING FILTER DOCK */}
          <div className="shifts-segmented-dock-wrap">
            <div className="shifts-dock-track">
              <button
                className={`shifts-dock-pill ${filterTab === "ACTIVE" ? "active" : ""}`}
                onClick={() => setFilterTab("ACTIVE")}
              >
                <span>Shift Aktif Operasional</span>
                {activeShift && (
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "#d97706" }} />
                )}
              </button>
              <button
                className={`shifts-dock-pill ${filterTab === "HISTORY" ? "active" : ""}`}
                onClick={() => setFilterTab("HISTORY")}
              >
                <span>Riwayat Sesi Shift ({filteredShifts.length})</span>
              </button>
            </div>

            {/* Quick Date Presets & Custom Calendar Trigger */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", background: "var(--brandSoft)", padding: 4, borderRadius: 16, border: "1px solid var(--border)", gap: 4 }}>
                <button
                  className={`btn ${shiftQuickDatePreset === "ALL" && !shiftDateFilter ? "btn-primary" : ""}`}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "none" }}
                  onClick={() => { setShiftQuickDatePreset("ALL"); setShiftDateFilter(""); }}
                >
                  Semua
                </button>
                <button
                  className={`btn ${shiftQuickDatePreset === "TODAY" ? "btn-primary" : ""}`}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "none" }}
                  onClick={() => { setShiftQuickDatePreset("TODAY"); setShiftDateFilter(""); }}
                >
                  Hari Ini
                </button>
                <button
                  className={`btn ${shiftQuickDatePreset === "YESTERDAY" ? "btn-primary" : ""}`}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "none" }}
                  onClick={() => { setShiftQuickDatePreset("YESTERDAY"); setShiftDateFilter(""); }}
                >
                  Kemarin
                </button>
                <button
                  className={`btn ${shiftQuickDatePreset === "THIS_WEEK" ? "btn-primary" : ""}`}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "none" }}
                  onClick={() => { setShiftQuickDatePreset("THIS_WEEK"); setShiftDateFilter(""); }}
                >
                  7 Hari
                </button>
              </div>

              {/* RuniX Calendar Popup Trigger Button */}
              <button
                className={`btn ${shiftDateFilter ? "btn-primary" : ""}`}
                style={{ padding: "10px 16px", borderRadius: 16, fontSize: 13, fontWeight: 800, gap: 6, display: "flex", alignItems: "center" }}
                onClick={() => setShowShiftDatePickerPopup(true)}
              >
                <span>{shiftDateFilter ? (() => {
                  const [y, m, d] = shiftDateFilter.split("-");
                  return `${d} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"][Number(m) - 1]}`;
                })() : "Kalender"}</span>
              </button>
            </div>
          </div>

          {/* MASTER-DETAIL SPLIT INSPECTOR */}
          <div className="shifts-master-detail-container">
            {/* MASTER PANE (LEFT LIST) */}
            <div className="shifts-master-pane">
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", fontWeight: 900, fontSize: 14 }}>
                {filterTab === "ACTIVE" ? "Sesi Aktif" : "Daftar Riwayat Shift"}
              </div>

              <div className="shifts-master-list">
                {filterTab === "ACTIVE" ? (
                  activeShift ? (
                    <div
                      className={`shifts-master-card ${(!selectedShiftId || selectedShiftId === activeShift.id) ? "selected" : ""}`}
                      onClick={() => setSelectedShiftId(activeShift.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 900, fontSize: 14 }}>{activeShift.openedByEmail || "Kasir"}</span>
                        <span className="shifts-badge shifts-badge-open">OPEN</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Buka: {formatDateTime(toDateSafe(activeShift.openedAt))}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand)", marginTop: 2 }}>
                        Omset: Rp {rupiah(activeSummary?.totalSales || 0)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontWeight: 700, fontSize: 13 }}>
                      Tidak ada shift yang sedang terbuka.
                    </div>
                  )
                ) : (
                  filteredShifts.map((shift) => {
                    const isSelected = selectedShiftId === shift.id;
                    return (
                      <div
                        key={shift.id}
                        className={`shifts-master-card ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedShiftId(shift.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: 900, fontSize: 14 }}>{shift.openedByEmail || "Kasir"}</span>
                          <span className={`shifts-badge ${shift.status === "OPEN" ? "shifts-badge-open" : "shifts-badge-closed"}`}>
                            {shift.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          Tutup: {formatDateTime(toDateSafe(shift.closedAt || shift.openedAt))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand)" }}>
                            Rp {rupiah(shift.totalSales || 0)}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: Number(shift.variance || 0) < 0 ? "#ef4444" : "#059669" }}>
                            Selisih: Rp {rupiah(shift.variance || 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                {filterTab === "HISTORY" && filteredShifts.length === 0 && (
                  <div style={{ padding: 30, textAlign: "center", color: "var(--muted)", fontWeight: 700, fontSize: 13 }}>
                    Tidak ada riwayat shift pada periode tanggal ini.
                  </div>
                )}
              </div>
            </div>

            {/* DETAIL INSPECTOR PANE (RIGHT) */}
            <div className="shifts-detail-pane">
              {filterTab === "ACTIVE" ? (
                activeShift && activeSummary ? (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Detail Sesi Shift Aktif</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Informasi kasir, mutasi kas, & penutupan shift</div>
                      </div>
                      <span className="shifts-badge shifts-badge-open">● OPERASIONAL OPEN</span>
                    </div>

                    <div style={{ padding: 14, borderRadius: 16, background: "var(--brandSoft)", border: "1px solid var(--border)", fontSize: 13, color: "var(--text)" }}>
                      Dibuka oleh <b style={{ color: "var(--brand)" }}>{activeShift.openedByEmail || "-"}</b> pada <b>{formatDateTime(toDateSafe(activeShift.openedAt))}</b>
                      {(activeShift.noteOpen || "").trim() && (
                        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 12 }}>
                          Catatan Buka: <i>{activeShift.noteOpen}</i>
                        </div>
                      )}
                    </div>

                    {/* QUICK CASH MOVEMENT BUTTONS */}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        className="btn"
                        style={{ flex: 1, padding: "10px 0", background: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "1px solid rgba(16, 185, 129, 0.3)", fontWeight: 800, borderRadius: 14 }}
                        onClick={() => setShowMovementModal("IN")}
                      >
                        + Kas Masuk (Paid In)
                      </button>
                      <button
                        className="btn"
                        style={{ flex: 1, padding: "10px 0", background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", fontWeight: 800, borderRadius: 14 }}
                        onClick={() => setShowMovementModal("OUT")}
                      >
                        - Kas Keluar (Paid Out)
                      </button>
                    </div>

                    {/* ADVANCED STATS 6-BOX GRID */}
                    <div className="shifts-stats-grid">
                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Kas Awal Laci</span>
                        <span className="shifts-stat-val" style={{ color: "var(--text)" }}>Rp {rupiah(activeShift.openingCash || 0)}</span>
                      </div>

                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Penjualan Cash</span>
                        <span className="shifts-stat-val" style={{ color: "#059669" }}>Rp {rupiah(activeSummary.cashSales)}</span>
                      </div>

                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Penjualan QRIS</span>
                        <span className="shifts-stat-val" style={{ color: "#2563eb" }}>Rp {rupiah(activeSummary.qrisSales)}</span>
                      </div>

                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Transfer / Card</span>
                        <span className="shifts-stat-val" style={{ color: "#9333ea" }}>
                          Rp {rupiah(activeSummary.transferSales + activeSummary.cardSales)}
                        </span>
                      </div>

                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Kas Masuk / Keluar</span>
                        <span className="shifts-stat-val" style={{ fontSize: 16 }}>
                          <span style={{ color: "#059669" }}>+{rupiah(activeSummary.totalCashIn)}</span> /{" "}
                          <span style={{ color: "#ef4444" }}>-{rupiah(activeSummary.totalCashOut)}</span>
                        </span>
                      </div>

                      <div className="shifts-stat-box">
                        <span className="shifts-stat-label">Total Omset ({activeSummary.orderCount} Order)</span>
                        <span className="shifts-stat-val" style={{ color: "var(--brand)" }}>Rp {rupiah(activeSummary.totalSales)}</span>
                      </div>
                    </div>

                    {/* CASH MOVEMENTS LOG */}
                    {cashMovements.length > 0 && (
                      <div style={{ background: "var(--brandSoft)", border: "1px solid var(--border)", borderRadius: 16, padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "var(--text)", marginBottom: 8 }}>Riwayat Mutasi Kas Sesi Ini</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflowY: "auto" }}>
                          {cashMovements.map((m) => (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, padding: "4px 8px", background: "var(--panel)", borderRadius: 8 }}>
                              <div>
                                <span style={{ fontWeight: 800, color: m.type === "IN" ? "#059669" : "#ef4444", marginRight: 6 }}>
                                  [{m.type === "IN" ? "MASUK" : "KELUAR"}]
                                </span>
                                <span>{m.reason}</span>
                              </div>
                              <b style={{ color: m.type === "IN" ? "#059669" : "#ef4444" }}>
                                {m.type === "IN" ? "+" : "-"}Rp {rupiah(m.amount)}
                              </b>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* EXPECTED CASH & CLOSE FORM CARD */}
                    <div style={{ background: "var(--brandSoft)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Expected Kas Akhir di Laci</div>
                        <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)", marginTop: 4 }}>
                          Rp {rupiah(activeSummary.expectedCash)}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Kas Aktual Saat Tutup Shift (Hitung Fisik)</div>
                        <input
                          className="shifts-input-field"
                          type="number"
                          value={closingCashActual}
                          onChange={(e) => setClosingCashActual(e.target.value)}
                          placeholder="Masukkan jumlah fisik uang kas..."
                        />
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Catatan Tutup Shift</div>
                        <textarea
                          className="shifts-textarea-field"
                          value={closingNote}
                          onChange={(e) => setClosingNote(e.target.value)}
                          placeholder="Catatan serah terima kasir, selisih kas, dll..."
                        />
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          id="productBreakdownToggle"
                          checked={showProductBreakdown}
                          onChange={(e) => setShowProductBreakdown(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: "var(--brand)" }}
                        />
                        <label htmlFor="productBreakdownToggle" style={{ cursor: "pointer" }}>Sertakan rincian produk terjual di laporan cetak</label>
                      </div>

                      <button
                        className="btn btn-primary"
                        style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 900, borderRadius: 16 }}
                        onClick={() => setShowCloseConfirm(true)}
                        disabled={saving}
                      >
                        Tutup Shift Kasir
                      </button>
                    </div>
                  </>
                ) : (
                  /* OPEN SHIFT FORM */
                  <div style={{ background: "var(--brandSoft)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 22, display: "flex", flexDirection: "column", gap: 16, margin: "auto 0" }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)" }}>Buka Shift Baru</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                      Belum ada shift kasir yang aktif. Masukkan modal kas awal untuk membuka sesi shift baru.
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Kas Awal Laci Kasir (Rp)</div>
                      <input
                        className="shifts-input-field"
                        type="number"
                        value={openingCash}
                        onChange={(e) => setOpeningCash(e.target.value)}
                        placeholder="Masukkan jumlah modal kas awal..."
                      />
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Catatan Buka Shift</div>
                      <textarea
                        className="shifts-textarea-field"
                        value={openingNote}
                        onChange={(e) => setOpeningNote(e.target.value)}
                        placeholder="Contoh: Modal kas kecil, shift pagi operator..."
                      />
                    </div>

                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 900, borderRadius: 16 }}
                      onClick={() => setShowOpenConfirm(true)}
                      disabled={saving}
                    >
                      {saving ? "Menyiapkan Shift..." : "Buka Shift Baru"}
                    </button>
                  </div>
                )
              ) : (
                /* HISTORY DETAIL VIEW */
                (() => {
                  const targetShift = shifts.find((s) => s.id === selectedShiftId) || shifts[0];
                  if (!targetShift) {
                    return (
                      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>
                        Pilih salah satu riwayat shift di sebelah kiri untuk melihat rincian laporan.
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Inspector Riwayat Shift</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>ID: {targetShift.id}</div>
                        </div>
                        <span className={`shifts-badge ${targetShift.status === "OPEN" ? "shifts-badge-open" : "shifts-badge-closed"}`}>
                          {targetShift.status}
                        </span>
                      </div>

                      <div className="shifts-stats-grid">
                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Operator Buka / Tutup</span>
                          <span className="shifts-stat-val" style={{ fontSize: 13, wordBreak: "break-all" }}>
                            {targetShift.openedByEmail || "-"}
                          </span>
                        </div>

                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Waktu Operasional</span>
                          <span className="shifts-stat-val" style={{ fontSize: 12 }}>
                            {formatDateTime(toDateSafe(targetShift.openedAt))} &rarr; {formatDateTime(toDateSafe(targetShift.closedAt))}
                          </span>
                        </div>

                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Total Omset Penjualan</span>
                          <span className="shifts-stat-val" style={{ color: "var(--brand)" }}>
                            Rp {rupiah(targetShift.totalSales || 0)} ({targetShift.orderCount || 0} Order)
                          </span>
                        </div>

                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Rincian Sales Cash / QRIS</span>
                          <span className="shifts-stat-val" style={{ fontSize: 14 }}>
                            Cash: Rp {rupiah(targetShift.cashSales || 0)} <br />
                            QRIS: Rp {rupiah(targetShift.qrisSales || 0)}
                          </span>
                        </div>

                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Expected Kas vs Fisik</span>
                          <span className="shifts-stat-val" style={{ fontSize: 13 }}>
                            Expected: Rp {rupiah(targetShift.closingCashExpected || 0)} <br />
                            Aktual: Rp {rupiah(targetShift.closingCashActual || 0)}
                          </span>
                        </div>

                        <div className="shifts-stat-box">
                          <span className="shifts-stat-label">Selisih Kas (Variance)</span>
                          <span className="shifts-stat-val" style={{ color: Number(targetShift.variance || 0) < 0 ? "#ef4444" : "#059669" }}>
                            Rp {rupiah(targetShift.variance || 0)}
                          </span>
                        </div>
                      </div>

                      {targetShift.noteClose && (
                        <div style={{ padding: 14, borderRadius: 16, background: "var(--brandSoft)", border: "1px solid var(--border)", fontSize: 13 }}>
                          <b>Catatan Tutup Shift:</b> {targetShift.noteClose}
                        </div>
                      )}

                      {targetShift.status === "CLOSED" && (
                        <button
                          className="btn btn-primary"
                          style={{ width: "100%", padding: "14px 0", fontSize: 14, fontWeight: 900, borderRadius: 16, marginTop: 8 }}
                          onClick={() => printHistoryShiftReport(targetShift)}
                        >
                          🖨️ Cetak Ulang Laporan Shift Thermal
                        </button>
                      )}
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal: Input Uang Kas Masuk / Keluar (Paid In / Paid Out) */}
      {showMovementModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%", borderRadius: 24, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: showMovementModal === "IN" ? "#059669" : "#ef4444", marginBottom: 12 }}>
              Catat Uang Kas {showMovementModal === "IN" ? "Masuk (+ Paid In)" : "Keluar (- Paid Out)"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Jumlah Uang (Rp)</div>
                <input
                  className="shifts-input-field"
                  type="number"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  placeholder="Contoh: 50000"
                  autoFocus
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>Alasan / Catatan Keperluan</div>
                <input
                  className="shifts-input-field"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  placeholder={showMovementModal === "IN" ? "Contoh: Tambah kembalian laci" : "Contoh: Beli es batu / bahan darurat"}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: "12px 0", fontWeight: 800, background: showMovementModal === "IN" ? "#059669" : "#ef4444" }}
                onClick={handleAddCashMovement}
                disabled={savingMovement}
              >
                {savingMovement ? "Menyimpan..." : "Simpan Transaksi Kas"}
              </button>
              <button className="btn" style={{ flex: 1, padding: "12px 0" }} onClick={() => setShowMovementModal(null)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Buka Shift */}
      {showOpenConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999 }}>
          <div className="card" style={{ maxWidth: 420, width: "100%", borderRadius: 24, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 12 }}>Konfirmasi Buka Shift</div>
            <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              <div><b>Kas Awal Modal:</b> <span style={{ color: "var(--brand)", fontWeight: 900 }}>Rp {rupiah(Number(openingCash || 0))}</span></div>
              {openingNote.trim() && <div style={{ marginTop: 6 }}><b>Catatan:</b> {openingNote.trim()}</div>}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "12px 0", fontWeight: 800 }} onClick={() => { setShowOpenConfirm(false); openShift(); }} disabled={saving}>
                Konfirmasi
              </button>
              <button className="btn" style={{ flex: 1, padding: "12px 0" }} onClick={() => setShowOpenConfirm(false)}>
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Tutup Shift Kasir */}
      {showCloseConfirm && activeShift && activeSummary && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999, backdropFilter: "blur(4px)" }}>
          <div className="card" style={{ maxWidth: 460, width: "100%", borderRadius: 28, padding: 26, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", marginBottom: 4 }}>Konfirmasi Penutupan Shift</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Periksa rincian data transaksi sesi shift sebelum melakukan penutupan</div>

            <div style={{ background: "var(--brandSoft)", border: "1.5px solid var(--border)", borderRadius: 18, padding: 16, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Kasir Sesi:</span>
                <b style={{ color: "var(--brand)" }}>{activeShift.openedByEmail || "-"}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Waktu Buka Shift:</span>
                <b>{formatDateTime(toDateSafe(activeShift.openedAt))}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Kas Awal Laci:</span>
                <b style={{ fontFamily: "var(--font-mono)" }}>Rp {rupiah(activeShift.openingCash || 0)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Total Omset ({activeSummary.orderCount} Order):</span>
                <b style={{ color: "#059669", fontFamily: "var(--font-mono)" }}>Rp {rupiah(activeSummary.totalSales)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Expected Kas Laci:</span>
                <b style={{ color: "var(--brand)", fontFamily: "var(--font-mono)" }}>Rp {rupiah(activeSummary.expectedCash)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--muted)" }}>Kas Fisik Aktual:</span>
                <b style={{ fontFamily: "var(--font-mono)" }}>Rp {rupiah(Number(closingCashActual || 0))}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
                <span style={{ fontWeight: 800 }}>Estimasi Selisih (Variance):</span>
                {(() => {
                  const varVal = Number(closingCashActual || 0) - activeSummary.expectedCash;
                  return (
                    <b style={{ color: varVal < 0 ? "#ef4444" : "#059669", fontFamily: "var(--font-mono)", fontSize: 14 }}>
                      Rp {rupiah(varVal)}
                    </b>
                  );
                })()}
              </div>
              {closingNote.trim() && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  <b>Catatan:</b> <i>{closingNote.trim()}</i>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: "14px 0", fontWeight: 900, borderRadius: 14, fontSize: 14 }}
                onClick={() => {
                  setShowCloseConfirm(false);
                  closeShift();
                }}
                disabled={saving}
              >
                {saving ? "Menyimpan..." : "Ya, Tutup Shift"}
              </button>
              <button
                className="btn"
                style={{ flex: 1, padding: "14px 0", borderRadius: 14, fontSize: 14 }}
                onClick={() => setShowCloseConfirm(false)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Shift Berhasil Ditutup */}
      {closeSuccessDialog && pendingPrintData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999 }}>
          <div className="card" style={{ maxWidth: 440, width: "100%", borderRadius: 24, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 48, color: "#10b981", marginBottom: 6 }}>&#10003;</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Shift Berhasil Ditutup</div>
            <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.8, background: "var(--brandSoft)", padding: 14, borderRadius: 16, border: "1px solid var(--border)", textAlign: "left" }}>
              <div><b>Total Sales Omset:</b> Rp {rupiah(pendingPrintData.data.totalSales)}</div>
              <div><b>Jumlah Transaksi:</b> {pendingPrintData.data.orderCount} Order</div>
              <div><b>Selisih Kas (Variance):</b> <span style={{ color: pendingPrintData.data.variance < 0 ? "#ef4444" : "#059669", fontWeight: 900 }}>Rp {rupiah(pendingPrintData.data.variance)}</span></div>
            </div>
            <div style={{ marginTop: 16, fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>Cetak laporan rincian tutup shift sekarang?</div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: "12px 0", fontWeight: 800 }} onClick={() => { printShiftReport(pendingPrintData.data, pendingPrintData.products); setCloseSuccessDialog(null); setPendingPrintData(null); }}>
                Cetak Laporan
              </button>
              <button className="btn" style={{ flex: 1, padding: "12px 0" }} onClick={() => { setCloseSuccessDialog(null); setPendingPrintData(null); }}>
                Lewati
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP KALENDER REMAJA RUNIX UNTUK SHIFT */}
      {showShiftDatePickerPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", padding: 16, zIndex: 10000, backdropFilter: "blur(6px)" }}>
          <div className="card" style={{ maxWidth: 400, width: "100%", borderRadius: 28, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
            {/* Navigasi Bulan & Tahun */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <button
                className="btn"
                style={{ padding: "6px 12px", borderRadius: 12, fontWeight: 900, fontSize: 14 }}
                onClick={() => {
                  const d = new Date(calendarPickerDate);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarPickerDate(d);
                }}
              >
                &larr;
              </button>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)" }}>
                  {["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][calendarPickerDate.getMonth()]} {calendarPickerDate.getFullYear()}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>Filter Shift RuniX</div>
              </div>

              <button
                className="btn"
                style={{ padding: "6px 12px", borderRadius: 12, fontWeight: 900, fontSize: 14 }}
                onClick={() => {
                  const d = new Date(calendarPickerDate);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarPickerDate(d);
                }}
              >
                &rarr;
              </button>
            </div>

            {/* Grid Header 7 Hari */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", marginBottom: 8 }}>
              {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 900, color: "var(--muted)", padding: "4px 0" }}>
                  {h}
                </div>
              ))}
            </div>

            {/* Grid Tabel Tanggal Kalender */}
            {(() => {
              const year = calendarPickerDate.getFullYear();
              const month = calendarPickerDate.getMonth();

              const firstDayIndex = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();

              const slots: (number | null)[] = [];
              for (let i = 0; i < firstDayIndex; i++) {
                slots.push(null);
              }
              for (let d = 1; d <= daysInMonth; d++) {
                slots.push(d);
              }

              const now = new Date();
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {slots.map((dayNum, index) => {
                    if (!dayNum) {
                      return <div key={`empty-${index}`} style={{ height: 38 }} />;
                    }

                    const mmStr = String(month + 1).padStart(2, "0");
                    const ddStr = String(dayNum).padStart(2, "0");
                    const dateStr = `${year}-${mmStr}-${ddStr}`;

                    const isSelected = shiftDateFilter === dateStr;
                    const isToday = todayStr === dateStr;

                    return (
                      <button
                        key={dateStr}
                        style={{
                          height: 38,
                          borderRadius: 12,
                          border: isSelected ? "2px solid var(--brand)" : isToday ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                          background: isSelected ? "var(--brand)" : isToday ? "var(--brandSoft)" : "var(--panel)",
                          color: isSelected ? "#ffffff" : isToday ? "var(--brand)" : "var(--text)",
                          fontWeight: isSelected || isToday ? 900 : 700,
                          fontSize: 13,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          display: "grid",
                          placeItems: "center",
                          fontFamily: "var(--font-mono)",
                        }}
                        onClick={() => {
                          setShiftDateFilter(dateStr);
                          setShiftQuickDatePreset("CUSTOM");
                          setShowShiftDatePickerPopup(false);
                        }}
                      >
                        {dayNum}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Quick Actions Footer Kalender */}
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 12 }}
                onClick={() => {
                  const now = new Date();
                  const yyyy = now.getFullYear();
                  const mm = String(now.getMonth() + 1).padStart(2, "0");
                  const dd = String(now.getDate()).padStart(2, "0");
                  setShiftDateFilter(`${yyyy}-${mm}-${dd}`);
                  setCalendarPickerDate(now);
                  setShiftQuickDatePreset("TODAY");
                  setShowShiftDatePickerPopup(false);
                }}
              >
                Hari Ini
              </button>
              <button
                className="btn"
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, color: "#ef4444" }}
                onClick={() => {
                  setShiftDateFilter("");
                  setShiftQuickDatePreset("ALL");
                  setShowShiftDatePickerPopup(false);
                }}
              >
                Reset Tanggal
              </button>
              <button
                className="btn"
                style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12 }}
                onClick={() => setShowShiftDatePickerPopup(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
