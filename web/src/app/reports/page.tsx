"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query, where, Timestamp } from "firebase/firestore";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";

type Order = {
  id: string;
  orderNo: string;
  status: string;
  mode: string;
  paymentMethod: string | null;
  subtotal: number;
  discount: number;
  total: number;
  items: any[];
  createdAt: any;
  paidAt: any;
  shiftId?: string | null;
};

type Refund = {
  id: string;
  orderNo: string;
  total: number;
  reason: string;
  refundedBy: string;
  createdAt: any;
};

type ShiftData = {
  id: string;
  status: string;
  openedByEmail: string;
  openedAt: any;
  closedAt: any;
  openingCash: number;
  cashSales: number;
  qrisSales: number;
  totalSales: number;
  orderCount: number;
  closingCashExpected: number;
  closingCashActual: number;
  variance: number;
};

type TabType = "ringkasan" | "harian" | "refund" | "export" | "shift";


function rupiah(n: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(n);
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds) return new Date(ts.seconds * 1000);
  return new Date(ts);
}

function formatDate(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}


function formatDateTime(d: Date) {
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getStartOfDay(d: Date) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function getEndOfDay(d: Date) { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function getStartOfWeek(d: Date) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - day + (day === 0 ? -6 : 1)); r.setHours(0, 0, 0, 0); return r; }
function getEndOfWeek(d: Date) { const s = getStartOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59, 999); return e; }
function getStartOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0); }
function getEndOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }


export default function ReportsPage() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const { level, loadingLevel: loadingLvl, canAdvancedReports } = useLevel();
  const canAccess = ["owner", "developer"].includes((role || "").toString().toLowerCase());
  const isAdvanced = canAdvancedReports();

  const [tab, setTab] = useState<TabType>("ringkasan");
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [rangeMode, setRangeMode] = useState<"preset" | "custom">("preset");
  const [preset, setPreset] = useState<"daily" | "weekly" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().split("T")[0]);
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [shiftsData, setShiftsData] = useState<ShiftData[]>([]);
  const [fetching, setFetching] = useState(false);


  const dateRange = useMemo(() => {
    if (rangeMode === "custom") {
      return { start: getStartOfDay(new Date(customStart + "T00:00:00")), end: getEndOfDay(new Date(customEnd + "T00:00:00")) };
    }
    const d = new Date(selectedDate + "T00:00:00");
    if (preset === "daily") return { start: getStartOfDay(d), end: getEndOfDay(d) };
    if (preset === "weekly") return { start: getStartOfWeek(d), end: getEndOfWeek(d) };
    return { start: getStartOfMonth(d), end: getEndOfMonth(d) };
  }, [rangeMode, preset, selectedDate, customStart, customEnd]);

  // Reset page when date range changes
  useEffect(() => { setPage(1); }, [dateRange]);


  // Fetch orders
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const ref = collection(db, `tenants/${tenantId}/orders`);
        const qy = query(ref, where("createdAt", ">=", Timestamp.fromDate(dateRange.start)), where("createdAt", "<=", Timestamp.fromDate(dateRange.end)), orderBy("createdAt", "desc"));
        const snap = await getDocs(qy);
        if (cancelled) return;
        setOrders(snap.docs.map((d) => { const data = d.data() as any; return { id: d.id, orderNo: data.orderNo || "", status: data.status || "", mode: data.mode || "", paymentMethod: data.paymentMethod || null, subtotal: Number(data.subtotal || 0), discount: Number(data.discount || 0), total: Number(data.total || 0), items: Array.isArray(data.items) ? data.items : [], createdAt: data.createdAt, paidAt: data.paidAt, shiftId: data.shiftId || null }; }));
      } catch {} finally { if (!cancelled) setFetching(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, dateRange]);

  // Fetch refunds
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const ref = collection(db, `tenants/${tenantId}/refunds`);
        const qy = query(ref, where("refundedAt", ">=", Timestamp.fromDate(dateRange.start)), where("refundedAt", "<=", Timestamp.fromDate(dateRange.end)), orderBy("refundedAt", "desc"));
        const snap = await getDocs(qy);
        if (cancelled) return;
        setRefunds(snap.docs.map((d) => { const data = d.data() as any; return { id: d.id, orderNo: data.orderNo || "", total: Number(data.total || 0), reason: data.reason || data.description || "", refundedBy: data.refundedByEmail || data.refundedBy || data.userEmail || "", createdAt: data.refundedAt }; }));
      } catch { if (!cancelled) setRefunds([]); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, dateRange]);


  // Fetch shifts for Per Shift tab
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const ref = collection(db, `tenants/${tenantId}/shifts`);
        const qy = query(ref, where("openedAt", ">=", Timestamp.fromDate(dateRange.start)), where("openedAt", "<=", Timestamp.fromDate(dateRange.end)), orderBy("openedAt", "desc"));
        const snap = await getDocs(qy);
        if (cancelled) return;
        setShiftsData(snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            status: data.status || "OPEN",
            openedByEmail: data.openedByEmail || "",
            openedAt: data.openedAt,
            closedAt: data.closedAt,
            openingCash: Number(data.openingCash || 0),
            cashSales: Number(data.cashSales || 0),
            qrisSales: Number(data.qrisSales || 0),
            totalSales: Number(data.totalSales || 0),
            orderCount: Number(data.orderCount || 0),
            closingCashExpected: Number(data.closingCashExpected || 0),
            closingCashActual: Number(data.closingCashActual || 0),
            variance: Number(data.variance || 0),
          };
        }));
      } catch { if (!cancelled) setShiftsData([]); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, dateRange]);


  // Get products sold per shift from orders
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

  const stats = useMemo(() => {
    const paid = orders.filter((o) => o.status === "PAID");
    const cancelled = orders.filter((o) => o.status === "CANCELLED");
    const totalOmzet = paid.reduce((a, o) => a + o.total, 0);
    const totalDiscount = paid.reduce((a, o) => a + o.discount, 0);
    const cashOrders = paid.filter((o) => o.paymentMethod === "CASH");
    const qrisOrders = paid.filter((o) => o.paymentMethod === "QRIS");
    const cashTotal = cashOrders.reduce((a, o) => a + o.total, 0);
    const qrisTotal = qrisOrders.reduce((a, o) => a + o.total, 0);
    const totalRefund = refunds.reduce((a, r) => a + r.total, 0);
    const netRevenue = totalOmzet - totalRefund;

    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    paid.forEach((o) => { o.items.forEach((item: any) => { const key = (item.name || "").toString(); if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 }; productMap[key].qty += Number(item.qty || 0); productMap[key].revenue += Number(item.price || 0) * Number(item.qty || 0); }); });
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    const dailyMap: Record<string, { date: string; total: number; count: number; cash: number; qris: number }> = {};
    paid.forEach((o) => { const d = toDate(o.paidAt || o.createdAt); if (!d) return; const key = d.toISOString().split("T")[0]; if (!dailyMap[key]) dailyMap[key] = { date: key, total: 0, count: 0, cash: 0, qris: 0 }; dailyMap[key].total += o.total; dailyMap[key].count += 1; if (o.paymentMethod === "CASH") dailyMap[key].cash += o.total; if (o.paymentMethod === "QRIS") dailyMap[key].qris += o.total; });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    return { totalOrders: orders.length, paidCount: paid.length, cancelledCount: cancelled.length, totalOmzet, totalDiscount, cashCount: cashOrders.length, cashTotal, qrisCount: qrisOrders.length, qrisTotal, topProducts, dailyBreakdown, avgTransaction: paid.length > 0 ? Math.round(totalOmzet / paid.length) : 0, totalRefund, refundCount: refunds.length, netRevenue };
  }, [orders, refunds]);


  function exportCSV() {
    const paid = orders.filter((o) => o.status === "PAID");
    let csv = "No,Order No,Tanggal,Metode,Subtotal,Diskon,Total,Items\n";
    paid.forEach((o, i) => { const d = toDate(o.paidAt || o.createdAt); csv += `${i + 1},"${o.orderNo}","${d ? formatDateTime(d) : "-"}","${o.paymentMethod || "-"}",${o.subtotal},${o.discount},${o.total},"${o.items.map((it: any) => `${it.name}x${it.qty}`).join("; ")}"\n`; });
    csv += `\n\nRINGKASAN\nTotal Transaksi,${stats.paidCount}\nTotal Omzet,${stats.totalOmzet}\nTotal Diskon,${stats.totalDiscount}\nTotal Refund,${stats.totalRefund}\nNet Revenue,${stats.netRevenue}\nCASH,${stats.cashCount} trx,${stats.cashTotal}\nQRIS,${stats.qrisCount} trx,${stats.qrisTotal}\n`;
    if (refunds.length > 0) { csv += `\n\nLAPORAN REFUND\nNo,Order No,Tanggal,Total,Alasan,Oleh\n`; refunds.forEach((rf, i) => { const d = toDate(rf.createdAt); csv += `${i + 1},"${rf.orderNo}","${d ? formatDateTime(d) : "-"}",${rf.total},"${rf.reason}","${rf.refundedBy}"\n`; }); }
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `laporan-${rangeMode === "custom" ? customStart + "_" + customEnd : preset + "-" + selectedDate}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // Direct render for seamless page transition
  if (!canAccess) return (<TerraPage><div className="card"><div className="h1">Akses ditolak</div><div className="small">Halaman laporan hanya untuk owner.</div><button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/dashboard")}>Kembali ke Dashboard</button></div></TerraPage>);

  // === BASIC REPORTS (Free & Seed) ===
  if (!isAdvanced) {
    return (
      <TerraPage>
        <style>{`
          .rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px;}
          .rp-stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px;}
          .rp-stat-val{font-size:20px;font-weight:900;margin-top:6px;}
          .rp-stat-label{font-size:11px;color:var(--muted);font-weight:700;}
          .rp-upgrade{margin-top:20px;padding:20px;border:1px solid var(--brand);border-radius:14px;background:var(--brandSoft);text-align:center;}
        `}</style>

        <div className="card">
          {/* Simple date selector */}
          <div className="row" style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}>
            <button className={"rp-tab " + (preset === "daily" ? "active" : "")} style={{ padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "1px solid var(--border)", background: preset === "daily" ? "var(--brand)" : "var(--panel)", color: preset === "daily" ? "#fff" : "inherit", cursor: "pointer" }} onClick={() => { setRangeMode("preset"); setPreset("daily"); }}>Harian</button>
            <button className={"rp-tab " + (preset === "weekly" ? "active" : "")} style={{ padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "1px solid var(--border)", background: preset === "weekly" ? "var(--brand)" : "var(--panel)", color: preset === "weekly" ? "#fff" : "inherit", cursor: "pointer" }} onClick={() => { setRangeMode("preset"); setPreset("weekly"); }}>Mingguan</button>
            <button className={"rp-tab " + (preset === "monthly" ? "active" : "")} style={{ padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "1px solid var(--border)", background: preset === "monthly" ? "var(--brand)" : "var(--panel)", color: preset === "monthly" ? "#fff" : "inherit", cursor: "pointer" }} onClick={() => { setRangeMode("preset"); setPreset("monthly"); }}>Bulanan</button>
            <input type="date" className="input" style={{ width: 160 }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        </div>

        {fetching ? <div style={{ marginTop: 14 }}><SkeletonStyles /><PageSkeleton cards={2} /></div> : (
          <>
            <div className="rp-grid">
              <div className="rp-stat"><div className="rp-stat-label">Total Omzet</div><div className="rp-stat-val" style={{ color: "var(--brand)" }}>{rupiah(stats.totalOmzet)}</div></div>
              <div className="rp-stat"><div className="rp-stat-label">Transaksi Lunas</div><div className="rp-stat-val">{stats.paidCount}</div></div>
              <div className="rp-stat"><div className="rp-stat-label">Rata-rata / Trx</div><div className="rp-stat-val">{rupiah(stats.avgTransaction)}</div></div>
              <div className="rp-stat"><div className="rp-stat-label">CASH</div><div className="rp-stat-val">{rupiah(stats.cashTotal)}</div><div className="rp-stat-label">{stats.cashCount} trx</div></div>
              <div className="rp-stat"><div className="rp-stat-label">QRIS</div><div className="rp-stat-val">{rupiah(stats.qrisTotal)}</div><div className="rp-stat-label">{stats.qrisCount} trx</div></div>
              <div className="rp-stat"><div className="rp-stat-label">Dibatalkan</div><div className="rp-stat-val" style={{ color: "var(--danger)" }}>{stats.cancelledCount}</div></div>
            </div>

            {/* Top 5 Products (basic) */}
            {stats.topProducts.length > 0 && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="h1">Top 5 Produk</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
                  <thead><tr><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>#</th><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Produk</th><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Qty</th><th style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>Revenue</th></tr></thead>
                  <tbody>
                    {stats.topProducts.slice(0, 5).map((p, i) => (<tr key={p.name}><td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{i + 1}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{p.name}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{p.qty}</td><td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{rupiah(p.revenue)}</td></tr>))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Upgrade CTA */}
            <div className="rp-upgrade">
              <div style={{ fontSize: 18, fontWeight: 900 }}>Upgrade ke Core</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
                Dapatkan laporan lengkap: breakdown harian, laporan per shift,<br />
                riwayat refund, export CSV, dan custom date range.
              </div>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => r.push("/settings")}>Lihat Paket</button>
            </div>
          </>
        )}
      </TerraPage>
    );
  }

  // === ADVANCED REPORTS (Core & Orbit) ===
  return (
    <TerraPage>
      <style>{`
        .rp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;}
        .rp-tab{padding:9px 16px;border-radius:8px;font-weight:700;font-size:13px;border:1px solid var(--border);background:var(--panel);cursor:pointer;transition:all 0.15s;}
        .rp-tab.active{background:var(--brand);color:#fff;border-color:var(--brand);}
        .rp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px;}
        .rp-stat{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:14px;}
        .rp-stat-val{font-size:20px;font-weight:900;margin-top:6px;}
        .rp-stat-label{font-size:11px;color:var(--muted);font-weight:700;}
        .rp-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;}
        .rp-table th,.rp-table td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);}
        .rp-table th{font-weight:700;color:var(--muted);font-size:11px;text-transform:uppercase;}
        .rp-bar{height:8px;border-radius:4px;background:var(--brand);margin-top:4px;}
        .rp-refund-card{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--panel);margin-top:10px;}
        .rp-shift-card{border:1px solid var(--border);border-radius:12px;padding:16px;background:var(--panel);margin-top:12px;}
        .rp-shift-products{margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--brandSoft);}
        .rp-shift-products table{width:100%;font-size:12px;border-collapse:collapse;}
        .rp-shift-products th,.rp-shift-products td{padding:4px 8px;text-align:left;}
        .rp-shift-products th{font-weight:700;color:var(--muted);font-size:10px;text-transform:uppercase;}
      `}</style>



      {/* HEADER */}
      <PageHeader title="Laporan Keuangan" subtitle={`Periode: ${formatDate(dateRange.start)} — ${formatDate(dateRange.end)}`}>
        <button className="btn" onClick={() => r.push("/dashboard")}>Dashboard</button>
      </PageHeader>

      <div className="card">

        {/* RANGE SELECTOR */}
        <div className="row" style={{ marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <button className={"rp-tab " + (rangeMode === "preset" ? "active" : "")} onClick={() => setRangeMode("preset")}>Preset</button>
          <button className={"rp-tab " + (rangeMode === "custom" ? "active" : "")} onClick={() => setRangeMode("custom")}>Custom Range</button>
        </div>

        {rangeMode === "preset" ? (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className={"rp-tab " + (preset === "daily" ? "active" : "")} onClick={() => setPreset("daily")}>Harian</button>
            <button className={"rp-tab " + (preset === "weekly" ? "active" : "")} onClick={() => setPreset("weekly")}>Mingguan</button>
            <button className={"rp-tab " + (preset === "monthly" ? "active" : "")} onClick={() => setPreset("monthly")}>Bulanan</button>
            <input type="date" className="input" style={{ width: 160 }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
        ) : (
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <div><div className="small">Dari</div><input type="date" className="input" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
            <div><div className="small">Sampai</div><input type="date" className="input" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
          </div>
        )}

        {/* TABS */}
        <div className="rp-tabs">
          <button className={"rp-tab " + (tab === "ringkasan" ? "active" : "")} onClick={() => { setTab("ringkasan"); setPage(1); }}>Ringkasan</button>
          <button className={"rp-tab " + (tab === "harian" ? "active" : "")} onClick={() => { setTab("harian"); setPage(1); }}>Breakdown Harian</button>
          <button className={"rp-tab " + (tab === "shift" ? "active" : "")} onClick={() => { setTab("shift"); setPage(1); }}>Per Shift</button>
          <button className={"rp-tab " + (tab === "refund" ? "active" : "")} onClick={() => { setTab("refund"); setPage(1); }}>Refund ({stats.refundCount})</button>
          <button className={"rp-tab " + (tab === "export" ? "active" : "")} onClick={() => { setTab("export"); setPage(1); }}>Export</button>
        </div>
      </div>



      {fetching ? <div style={{ marginTop: 14 }}><SkeletonStyles /><PageSkeleton cards={2} /></div> : (<>

      {/* TAB: RINGKASAN */}
      {tab === "ringkasan" && (<>
        <div className="rp-grid">
          <div className="rp-stat"><div className="rp-stat-label">Total Omzet (Bruto)</div><div className="rp-stat-val" style={{ color: "var(--brand)" }}>{rupiah(stats.totalOmzet)}</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Total Refund</div><div className="rp-stat-val" style={{ color: "var(--danger)" }}>{rupiah(stats.totalRefund)}</div><div className="rp-stat-label">{stats.refundCount} refund</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Net Revenue</div><div className="rp-stat-val" style={{ color: "var(--success)" }}>{rupiah(stats.netRevenue)}</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Transaksi Lunas</div><div className="rp-stat-val">{stats.paidCount}</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Rata-rata / Transaksi</div><div className="rp-stat-val">{rupiah(stats.avgTransaction)}</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Total Diskon</div><div className="rp-stat-val">{rupiah(stats.totalDiscount)}</div></div>
          <div className="rp-stat"><div className="rp-stat-label">CASH</div><div className="rp-stat-val">{rupiah(stats.cashTotal)}</div><div className="rp-stat-label">{stats.cashCount} trx</div></div>
          <div className="rp-stat"><div className="rp-stat-label">QRIS</div><div className="rp-stat-val">{rupiah(stats.qrisTotal)}</div><div className="rp-stat-label">{stats.qrisCount} trx</div></div>
          <div className="rp-stat"><div className="rp-stat-label">Dibatalkan</div><div className="rp-stat-val" style={{ color: "var(--danger)" }}>{stats.cancelledCount}</div></div>
        </div>

        {stats.topProducts.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="h1">Top 10 Produk</div>
            <table className="rp-table"><thead><tr><th>#</th><th>Produk</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>
              {stats.topProducts.map((p, i) => (<tr key={p.name}><td>{i + 1}</td><td><b>{p.name}</b></td><td>{p.qty}</td><td>{rupiah(p.revenue)}</td></tr>))}
            </tbody></table>
          </div>
        )}
      </>)}



      {/* TAB: BREAKDOWN HARIAN */}
      {tab === "harian" && (<>
        {stats.dailyBreakdown.length > 0 ? (() => {
          const totalPages = Math.ceil(stats.dailyBreakdown.length / ITEMS_PER_PAGE);
          const paginatedDaily = stats.dailyBreakdown.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
          return (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="h1">Breakdown per Hari</div>
            <div className="small" style={{ marginTop: 4 }}>Merge semua transaksi dalam range yang dipilih, dikelompokkan per hari.</div>
            <table className="rp-table"><thead><tr><th>Tanggal</th><th>Trx</th><th>Cash</th><th>QRIS</th><th>Total</th><th>Grafik</th></tr></thead><tbody>
              {paginatedDaily.map((d) => { const max = Math.max(...stats.dailyBreakdown.map((x) => x.total), 1); return (
                <tr key={d.date}><td>{formatDate(new Date(d.date + "T00:00:00"))}</td><td>{d.count}</td><td>{rupiah(d.cash)}</td><td>{rupiah(d.qris)}</td><td><b>{rupiah(d.total)}</b></td><td><div className="rp-bar" style={{ width: `${Math.round((d.total / max) * 100)}%` }} /></td></tr>
              ); })}
              <tr style={{ fontWeight: 900 }}><td>TOTAL</td><td>{stats.dailyBreakdown.reduce((a, d) => a + d.count, 0)}</td><td>{rupiah(stats.dailyBreakdown.reduce((a, d) => a + d.cash, 0))}</td><td>{rupiah(stats.dailyBreakdown.reduce((a, d) => a + d.qris, 0))}</td><td>{rupiah(stats.totalOmzet)}</td><td></td></tr>
            </tbody></table>
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</button>
                <span style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Hal {page} / {totalPages}</span>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Selanjutnya</button>
              </div>
            )}
          </div>
          );
        })() : <div className="card" style={{ marginTop: 14 }}><div className="small">Tidak ada data di periode ini.</div></div>}
      </>)}


      {/* TAB: PER SHIFT */}
      {tab === "shift" && (<>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="h1">Laporan Per Shift</div>
          <div className="small" style={{ marginTop: 4 }}>Rekap penjualan per sesi shift dalam periode yang dipilih.</div>
        </div>

        {shiftsData.length > 0 ? (() => {
          const totalPages = Math.ceil(shiftsData.length / ITEMS_PER_PAGE);
          const paginatedShifts = shiftsData.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
          return (<>
            {paginatedShifts.map((shift) => {
          const shiftOpenedAt = toDate(shift.openedAt);
          const shiftClosedAt = toDate(shift.closedAt);
          const products = getShiftProducts(shift.id);
          return (
            <div key={shift.id} className="rp-shift-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{shift.openedByEmail || "-"}</div>
                  <div className="small" style={{ marginTop: 4 }}>
                    Buka: <b>{shiftOpenedAt ? formatDateTime(shiftOpenedAt) : "-"}</b> — Tutup: <b>{shiftClosedAt ? formatDateTime(shiftClosedAt) : "-"}</b>
                  </div>
                </div>
                <span style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 900, border: "1px solid var(--border)", background: shift.status === "CLOSED" ? "var(--input-bg)" : "var(--brandSoft)" }}>
                  {shift.status}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
                <div className="rp-stat" style={{ padding: 10 }}>
                  <div className="rp-stat-label">Total Sales</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: "var(--brand)" }}>{rupiah(shift.totalSales)}</div>
                </div>
                <div className="rp-stat" style={{ padding: 10 }}>
                  <div className="rp-stat-label">Order</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{shift.orderCount}</div>
                </div>
                <div className="rp-stat" style={{ padding: 10 }}>
                  <div className="rp-stat-label">Cash</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{rupiah(shift.cashSales)}</div>
                </div>
                <div className="rp-stat" style={{ padding: 10 }}>
                  <div className="rp-stat-label">QRIS</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{rupiah(shift.qrisSales)}</div>
                </div>
                <div className="rp-stat" style={{ padding: 10 }}>
                  <div className="rp-stat-label">Selisih (Variance)</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, color: shift.variance < 0 ? "var(--danger)" : "var(--success)" }}>{rupiah(shift.variance)}</div>
                </div>
              </div>

              {products.length > 0 && (
                <div className="rp-shift-products">
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Produk Terjual</div>
                  <table>
                    <thead><tr><th>Produk</th><th>Qty</th><th>Revenue</th></tr></thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{rupiah(p.revenue)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</button>
                <span style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Hal {page} / {totalPages}</span>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Selanjutnya</button>
              </div>
            )}
          </>);
        })() : (
          <div className="card" style={{ marginTop: 14 }}><div className="small">Tidak ada shift di periode ini.</div></div>
        )}
      </>)}


      {/* TAB: REFUND */}
      {tab === "refund" && (<>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="row">
            <div>
              <div className="h1">Laporan Refund</div>
              <div className="small">Riwayat refund dalam periode yang dipilih.</div>
            </div>
            <div className="spacer" />
            <div className="rp-stat" style={{ padding: "10px 16px" }}>
              <div className="rp-stat-label">Total Refund</div>
              <div className="rp-stat-val" style={{ color: "var(--danger)", fontSize: 18 }}>{rupiah(stats.totalRefund)}</div>
              <div className="rp-stat-label">{stats.refundCount} transaksi</div>
            </div>
          </div>

          {refunds.length > 0 ? (() => {
            const totalPages = Math.ceil(refunds.length / ITEMS_PER_PAGE);
            const paginatedRefunds = refunds.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
            return (<>
            <table className="rp-table"><thead><tr><th>#</th><th>Order</th><th>Tanggal</th><th>Total</th><th>Alasan</th><th>Oleh</th></tr></thead><tbody>
              {paginatedRefunds.map((rf, i) => { const d = toDate(rf.createdAt); return (
                <tr key={rf.id}><td>{(page - 1) * ITEMS_PER_PAGE + i + 1}</td><td><b>{rf.orderNo}</b></td><td>{d ? formatDateTime(d) : "-"}</td><td style={{ color: "var(--danger)", fontWeight: 800 }}>{rupiah(rf.total)}</td><td>{rf.reason || "-"}</td><td>{rf.refundedBy || "-"}</td></tr>
              ); })}
            </tbody></table>
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</button>
                <span style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>Hal {page} / {totalPages}</span>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Selanjutnya</button>
              </div>
            )}
            </>);
          })() : <div className="small" style={{ marginTop: 14 }}>Tidak ada refund di periode ini.</div>}
        </div>
      </>)}


      {/* TAB: EXPORT */}
      {tab === "export" && (<>
        <div className="card" style={{ marginTop: 14 }}>
          <div className="h1">Export Laporan</div>
          <div className="small" style={{ marginTop: 6 }}>Download laporan lengkap dalam format CSV (bisa dibuka di Excel/Google Sheets).</div>
          <div className="small" style={{ marginTop: 4 }}>Periode: <b>{formatDate(dateRange.start)} — {formatDate(dateRange.end)}</b></div>

          <div style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--brandSoft)" }}>
            <div style={{ fontWeight: 800 }}>Isi Export:</div>
            <ul style={{ margin: "8px 0 0 16px", fontSize: 13, lineHeight: 1.8, color: "var(--muted)" }}>
              <li>Daftar semua transaksi lunas (detail items)</li>
              <li>Ringkasan: omzet, diskon, CASH/QRIS, net revenue</li>
              <li>Laporan refund (jika ada)</li>
            </ul>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={exportCSV}>
            Download CSV ({stats.paidCount} transaksi + {stats.refundCount} refund)
          </button>
        </div>
      </>)}

      </>)}
    </TerraPage>
  );
}
