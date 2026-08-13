"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import { auth, db, functions } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { isShiftPermissionError, normalizeShift, ShiftRecord } from "@/lib/shifts";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/PageHeader";
import { LevelBadge } from "@/components/LevelBadge";
import NotificationBell from "@/components/NotificationBell";

type OrderItem = {
  name: string;
  price: number;
  qty: number;
  category?: string;
};

type Order = {
  id: string;
  orderNo?: string;
  status?: "OPEN" | "PAID" | "CANCELLED";
  mode?: "PAY_NOW" | "PAY_LATER";
  paymentMethod?: "CASH" | "QRIS" | null;
  tableNo?: string | null;
  total: number;
  discount?: number;
  subtotal?: number;
  items?: OrderItem[];
  createdAt?: any;
  paidAt?: any;
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
}

function last7Days() {
  const arr: Date[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    arr.push(d);
  }
  return arr;
}

type TopPeriodFilter = "today" | "7d" | "month";

export default function DashboardPage() {
  const r = useRouter();
  const toast = useToast();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const { canAccess, level } = useLevel();

  const roleLower = (role || "").toString().toLowerCase();
  const isOwner = roleLower === "zeta" || roleLower === "owner" || roleLower === "developer";
  const canView = roleLower === "zeta" || roleLower === "omega" || roleLower === "delta" || roleLower === "owner" || roleLower === "admin" || roleLower === "developer";
  const isDev = roleLower === "developer";

  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<{ id: string; total: number; refundedAt?: any }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [shiftAccessBlocked, setShiftAccessBlocked] = useState(false);

  const [storeName, setStoreName] = useState("RuniX");
  const [address, setAddress] = useState("");
  const [footer, setFooter] = useState("Terima kasih.");
  const [cashierName, setCashierName] = useState("Kasir RuniX");
  const [saving, setSaving] = useState(false);
  const [savingPin, setSavingPin] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [refundPinInput, setRefundPinInput] = useState("");
  const [confirmRefundPinInput, setConfirmRefundPinInput] = useState("");
  const [topPeriodFilter, setTopPeriodFilter] = useState<TopPeriodFilter>("month");
  const [topCategoryFilter, setTopCategoryFilter] = useState("Semua");

  const [printMode, setPrintMode] = useState<"browser" | "rawbt" | "bluetooth">("browser");

  const [sideOpen, setSideOpen] = useState<Record<string, boolean>>({
    operasional: true,
    management: true,
    laporan: false,
    settings: false,
  });

  function toggleSide(key: string) {
    setSideOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mode = localStorage.getItem("runix_print_mode");
      if (mode === "rawbt") setPrintMode("rawbt");
      else if (mode === "bluetooth") setPrintMode("bluetooth");
      else setPrintMode("browser");
    }
  }, []);

  useEffect(() => {
    if (!tenantId) return;

    const ref = collection(db, `tenants/${tenantId}/orders`);
    const qy = query(ref, orderBy("createdAt", "desc"), limit(500));

    return onSnapshot(
      qy,
      (snap) => {
        const arr: Order[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            orderNo: data.orderNo || d.id,
            status: data.status || "OPEN",
            mode: data.mode || "PAY_LATER",
            paymentMethod: data.paymentMethod ?? null,
            tableNo: data.tableNo ?? null,
            total: Number(data.total || 0),
            discount: Number(data.discount || 0),
            subtotal: Number(data.subtotal || 0),
            items: Array.isArray(data.items) ? data.items : [],
            createdAt: data.createdAt,
            paidAt: data.paidAt,
          };
        });
        setOrders(arr);
      },
      (e) => setErr(e.message)
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    const refundsRef = collection(db, `tenants/${tenantId}/refunds`);
    const refundsQuery = query(refundsRef, orderBy("refundedAt", "desc"), limit(200));

    return onSnapshot(
      refundsQuery,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            total: Number(data.total || 0),
            refundedAt: data.refundedAt,
          };
        });
        setRefunds(arr);
      },
      (e) => {
        // Silently ignore permission errors for refunds (staff may not have access)
        if (e.code !== "permission-denied") {
          console.warn("Refunds subscribe error:", e.message);
        }
      }
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const qy = query(collection(db, `tenants/${tenantId}/shifts`), orderBy("openedAt", "desc"), limit(20));
    return onSnapshot(
      qy,
      (snap) => {
        setShiftAccessBlocked(false);
        const items = snap.docs.map((item) => normalizeShift(item.id, item.data()));
        setActiveShift(items.find((item) => item.status === "OPEN") || null);
      },
      (e) => {
        if (isShiftPermissionError(e)) {
          setShiftAccessBlocked(true);
          setActiveShift(null);
          return;
        }
        setErr(e.message);
      }
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/main`));
        if (snap.exists()) {
          const d = snap.data() as any;
          setStoreName((d.storeName || "RuniX").toString());
          setAddress((d.address || "").toString());
          setFooter((d.footer || "Terima kasih.").toString());
          setCashierName((d.cashierName || "Kasir RuniX").toString());
        }
      } catch {}
    })();
  }, [tenantId]);

  const paidOrders = useMemo(
    () => orders.filter((o) => (o.status || "").toUpperCase() === "PAID"),
    [orders]
  );

  const openOrders = useMemo(
    () => orders.filter((o) => (o.status || "").toUpperCase() === "OPEN"),
    [orders]
  );

  const stats = useMemo(() => {
    const now = new Date();
    const sod = startOfDay(now);
    const som = startOfMonth(now);

    let todayRevenue = 0;
    let todayCount = 0;
    let monthRevenue = 0;
    let monthCount = 0;
    let cashRevenue = 0;
    let qrisRevenue = 0;

    for (const o of paidOrders) {
      const d: Date | null = o.paidAt?.toDate?.() ?? o.createdAt?.toDate?.() ?? null;
      if (!d) continue;

      if (d >= sod) {
        todayRevenue += o.total;
        todayCount += 1;
      }

      if (d >= som) {
        monthRevenue += o.total;
        monthCount += 1;

        if (o.paymentMethod === "CASH") cashRevenue += o.total;
        if (o.paymentMethod === "QRIS") qrisRevenue += o.total;

      }
    }

    const avgOrder = monthCount ? Math.round(monthRevenue / monthCount) : 0;

    return {
      todayRevenue,
      todayCount,
      monthRevenue,
      monthCount,
      avgOrder,
      cashRevenue,
      qrisRevenue,
    };
  }, [paidOrders]);

  const refundStats = useMemo(() => {
    const now = new Date();
    const sod = startOfDay(now);
    const som = startOfMonth(now);

    let refundToday = 0;
    let refundMonth = 0;

    for (const ref of refunds) {
      const d: Date | null = ref.refundedAt?.toDate?.() ?? null;
      if (!d) continue;

      if (d >= sod) {
        refundToday += ref.total;
      }
      if (d >= som) {
        refundMonth += ref.total;
      }
    }

    return {
      refundToday,
      refundMonth,
      netRevenueToday: stats.todayRevenue - refundToday,
      netRevenueMonth: stats.monthRevenue - refundMonth,
    };
  }, [refunds, stats.todayRevenue, stats.monthRevenue]);

  const topSellingStats = useMemo(() => {
    const now = new Date();
    const rangeStart =
      topPeriodFilter === "today"
        ? startOfDay(now)
        : topPeriodFilter === "7d"
          ? startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
          : startOfMonth(now);

    const topMap = new Map<string, { name: string; category: string; qty: number; revenue: number }>();

    for (const o of paidOrders) {
      const d: Date | null = o.paidAt?.toDate?.() ?? o.createdAt?.toDate?.() ?? null;
      if (!d || d < rangeStart) continue;

      for (const it of o.items || []) {
        const key = (it.name || "Unknown").toString();
        const category = (it.category || "Lainnya").toString();
        const qty = Number(it.qty || 0);
        const revenue = Number(it.price || 0) * qty;
        const prev = topMap.get(key) || { name: key, category, qty: 0, revenue: 0 };

        topMap.set(key, {
          name: key,
          category: prev.category || category,
          qty: prev.qty + qty,
          revenue: prev.revenue + revenue,
        });
      }
    }

    const topProducts = Array.from(topMap.values()).sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return b.revenue - a.revenue;
    });

    return {
      label:
        topPeriodFilter === "today"
          ? "hari ini"
          : topPeriodFilter === "7d"
            ? "7 hari terakhir"
            : "bulan ini",
      topProducts,
    };
  }, [paidOrders, topPeriodFilter]);

  const dailyChart = useMemo(() => {
    const days = last7Days();

    const values = days.map((day) => {
      const next = new Date(day);
      next.setDate(day.getDate() + 1);

      let revenue = 0;

      for (const o of paidOrders) {
        const d: Date | null = o.paidAt?.toDate?.() ?? o.createdAt?.toDate?.() ?? null;
        if (!d) continue;
        if (d >= day && d < next) {
          revenue += o.total;
        }
      }

      return {
        label: formatDayLabel(day),
        revenue,
      };
    });

    const maxRevenue = Math.max(...values.map((v) => v.revenue), 1);

    return values.map((v) => ({
      ...v,
      pct: Math.max(6, Math.round((v.revenue / maxRevenue) * 100)),
    }));
  }, [paidOrders]);

  const paymentChart = useMemo(() => {
    const total = stats.cashRevenue + stats.qrisRevenue;
    const cashPct = total ? Math.round((stats.cashRevenue / total) * 100) : 0;
    const qrisPct = total ? Math.round((stats.qrisRevenue / total) * 100) : 0;
    return { total, cashPct, qrisPct };
  }, [stats.cashRevenue, stats.qrisRevenue]);

  const topProductCategories = useMemo(() => {
    return [
      "Semua",
      ...Array.from(
        new Set(topSellingStats.topProducts.map((product) => (product.category || "Lainnya").toString()))
      ).sort((a, b) => a.localeCompare(b, "id-ID")),
    ];
  }, [topSellingStats.topProducts]);

  const filteredTopProducts = useMemo(() => {
    const filtered =
      topCategoryFilter === "Semua"
        ? topSellingStats.topProducts
        : topSellingStats.topProducts.filter((product) => product.category === topCategoryFilter);

    return filtered.slice(0, 12);
  }, [topSellingStats.topProducts, topCategoryFilter]);

  const topProductsByCategory = useMemo(() => {
    return topProductCategories
      .filter((category) => category !== "Semua")
      .map((category) => {
        const leader = topSellingStats.topProducts.find((product) => product.category === category);
        return {
          category,
          leader,
        };
      })
      .filter((entry) => entry.leader);
  }, [topSellingStats.topProducts, topProductCategories]);

  async function saveReceiptSettings() {
    if (!tenantId) return;

    setSaving(true);
    setSaveMsg("");

    try {
      await setDoc(
        doc(db, `tenants/${tenantId}/settings/main`),
        {
          storeName: storeName.trim() || "RuniX",
          address: address.trim(),
          footer: footer.trim() || "Terima kasih.",
          cashierName: cashierName.trim() || "Kasir RuniX",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setSaveMsg("Tersimpan. Perubahan dipakai untuk struk berikutnya.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e: any) {
      setSaveMsg("Gagal simpan: " + (e?.message || "unknown"));
    } finally {
      setSaving(false);
    }
  }

  async function saveRefundPin() {
    if (!tenantId) return;

    const nextPin = refundPinInput.trim();
    const confirmPin = confirmRefundPinInput.trim();

    if (!nextPin) {
      setSaveMsg("PIN refund baru wajib diisi.");
      return;
    }

    if (nextPin.length < 6) {
      setSaveMsg("PIN refund minimal 6 digit.");
      return;
    }

    if (nextPin !== confirmPin) {
      setSaveMsg("Konfirmasi PIN refund tidak cocok.");
      return;
    }

    setSavingPin(true);
    setSaveMsg("");

    try {
      const updateRefundPinFn = httpsCallable<
        { tenantId: string; refundPin: string },
        { ok: boolean }
      >(functions, "updateRefundPin");

      await updateRefundPinFn({
        tenantId,
        refundPin: nextPin,
      });

      setRefundPinInput("");
      setConfirmRefundPinInput("");
      setSaveMsg("PIN refund berhasil diperbarui secara aman di server.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch (e: any) {
      setSaveMsg("Gagal simpan PIN refund: " + (e?.message || "unknown"));
    } finally {
      setSavingPin(false);
    }
  }

  // Dashboard PIN Lock Protection (Session storage persistence agar tidak mengunci ulang saat navigasi antar menu admin)
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("runix_dash_unlocked") === "true";
    }
    return false;
  });
  const [dashPin, setDashPin] = useState("");
  const [dashPinError, setDashPinError] = useState("");
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinShake, setPinShake] = useState(false);

  // Auto-verify saat 6 digit PIN diinput
  const handleVerifyPin = async (enteredPin: string) => {
    if (!tenantId || enteredPin.length < 4) return;
    setVerifyingPin(true);
    setDashPinError("");

    try {
      // Ambil PIN terdaftar dari settings/refundPin
      const pinSnap = await getDoc(doc(db, `tenants/${tenantId}/settings/refundPin`));
      const targetPin = (pinSnap.exists() ? (pinSnap.data() as any).refundPin : "123456") || "123456";

      if (enteredPin === targetPin.toString()) {
        setIsUnlocked(true);
        if (typeof window !== "undefined") {
          sessionStorage.setItem("runix_dash_unlocked", "true");
        }
        toast.success("Akses Dashboard Terverifikasi");
      } else {
        setDashPinError("PIN Supervisor/Owner salah. Coba lagi.");
        setDashPin("");
        setPinShake(true);
        setTimeout(() => setPinShake(false), 500);
      }
    } catch (e: any) {
      setDashPinError("Gagal memverifikasi PIN: " + (e?.message || ""));
    } finally {
      setVerifyingPin(false);
    }
  };

  // Developer bypass otomatis
  useEffect(() => {
    if (isDev) {
      setIsUnlocked(true);
    }
  }, [isDev]);

  // Direct render without blocking loading screen for seamless page transition

  if (!canView) {
    return (
      <TerraPage maxWidth={1440}>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">Dashboard hanya untuk owner/admin.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/pos")}>
            Kembali ke POS
          </button>
        </div>
      </TerraPage>
    );
  }

  // Jika PIN belum terverifikasi, tampilkan Layar Kunci PIN Dashboard
  if (!isUnlocked) {
    return (
      <TerraPage maxWidth={500}>
        <style>{`
          .dash-lock-box {
            background: var(--panel);
            border: 1.5px solid var(--border);
            border-radius: 28px;
            padding: 32px 24px;
            text-align: center;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.08);
            margin: 40px auto;
          }
          .dash-pin-dots {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin: 24px 0 16px;
          }
          .dash-pin-dot {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid var(--border);
            transition: all 0.15s ease;
          }
          .dash-pin-dot.filled {
            background: var(--brand);
            border-color: var(--brand);
            transform: scale(1.15);
          }
          .dash-pin-dots.shake {
            animation: dashPinShake 0.4s ease;
          }
          @keyframes dashPinShake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
          }
          .dash-numpad {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            max-width: 280px;
            margin: 16px auto 0;
          }
          .dash-num-btn {
            height: 56px;
            border-radius: 16px;
            border: 1px solid var(--border);
            background: var(--brandSoft);
            color: var(--text);
            font-size: 22px;
            font-weight: 800;
            cursor: pointer;
            display: grid;
            place-items: center;
            transition: all 0.15s ease;
            user-select: none;
          }
          .dash-num-btn:active {
            transform: scale(0.92);
            background: var(--brand);
            color: #fff;
          }
          .dash-num-btn.action {
            font-size: 13px;
            font-weight: 800;
            color: var(--muted);
          }
        `}</style>

        <div className="dash-lock-box">
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "var(--brandSoft)", border: "1px solid var(--border)", display: "grid", placeItems: "center", fontSize: 28, margin: "0 auto 16px", color: "var(--brand)" }}>
            🔒
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Akses Terkunci</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
            Masukkan PIN 6-digit Supervisor/Owner untuk membuka Dashboard
          </div>

          {/* Dots Indicator */}
          <div className={`dash-pin-dots ${pinShake ? "shake" : ""}`}>
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className={`dash-pin-dot ${idx < dashPin.length ? "filled" : ""}`} />
            ))}
          </div>

          {/* Error Message */}
          {dashPinError && (
            <div style={{ color: "var(--danger)", fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
              {dashPinError}
            </div>
          )}

          {/* Numpad Controls */}
          <div className="dash-numpad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                className="dash-num-btn"
                disabled={verifyingPin}
                onClick={() => {
                  if (dashPin.length >= 6) return;
                  const next = dashPin + num;
                  setDashPin(next);
                  if (next.length === 6) {
                    handleVerifyPin(next);
                  }
                }}
              >
                {num}
              </button>
            ))}

            <button
              className="dash-num-btn action"
              disabled={verifyingPin}
              onClick={() => {
                setDashPin("");
                setDashPinError("");
              }}
            >
              Clear
            </button>

            <button
              className="dash-num-btn"
              disabled={verifyingPin}
              onClick={() => {
                if (dashPin.length >= 6) return;
                const next = dashPin + "0";
                setDashPin(next);
                if (next.length === 6) {
                  handleVerifyPin(next);
                }
              }}
            >
              0
            </button>

            <button
              className="dash-num-btn action"
              disabled={verifyingPin}
              onClick={() => {
                setDashPin((prev) => prev.slice(0, -1));
                setDashPinError("");
              }}
            >
              ⌫
            </button>
          </div>

          {/* Back Action */}
          <button
            className="btn"
            style={{ marginTop: 24, width: "100%", borderRadius: 14, padding: "12px 0", fontSize: 13, fontWeight: 800 }}
            onClick={() => r.push("/pos")}
          >
            ← Kembali ke Kasir POS
          </button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage maxWidth={1440}>
      <style>{`
        /* ===== PREMIUM REFINED DASHBOARD SPACING & LAYOUT ===== */
        .dash-single-shell {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Stats Cards 4-Columns Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        @media (max-width: 1080px){
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px){
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        }
        .stat-card {
          border: 1px solid var(--border);
          border-radius: 22px;
          padding: 22px;
          background: var(--panel);
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(0,0,0,0.06);
          border-color: var(--brand);
        }
        .stat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .stat-label {
          font-size: 11.5px;
          color: var(--muted);
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }
        .stat-icon-badge {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--brandSoft);
          display: grid;
          place-items: center;
          color: var(--brand);
          flex-shrink: 0;
        }
        .stat-value {
          margin-top: 12px;
          font-size: 25px;
          font-weight: 900;
          line-height: 1.1;
          color: var(--text);
          font-family: var(--font-mono);
          letter-spacing: -0.5px;
        }
        @media (max-width: 640px){ .stat-value{ font-size: 19px; } }
        .stat-note {
          margin-top: 8px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* Prominent Analytics Charts Layout */
        .analytics-charts-grid {
          display: grid;
          grid-template-columns: 1.65fr 1fr;
          gap: 20px;
        }
        @media (max-width: 1024px){
          .analytics-charts-grid { grid-template-columns: 1fr; }
        }

        .panel {
          border: 1px solid var(--border);
          border-radius: 24px;
          background: var(--panel);
          padding: 26px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }
        .panel-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        .panel-title {
          font-size: 18px;
          font-weight: 900;
          color: var(--text);
          letter-spacing: -0.3px;
        }
        .panel-sub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 500;
        }

        /* 7-Days Revenue Bar Chart Visuals */
        .chart-wrap { margin-top: 20px; }
        .bars {
          display: flex;
          align-items: flex-end;
          gap: 14px;
          height: 230px;
          padding: 24px 20px 14px;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--brandSoft);
        }
        .bar-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          height: 100%;
          min-width: 0;
        }
        .bar {
          width: 100%;
          max-width: 42px;
          border-radius: 12px 12px 6px 6px;
          background: linear-gradient(180deg, var(--brand2, #ff4d4f) 0%, var(--brand, #9a0002) 100%);
          box-shadow: 0 4px 14px rgba(154, 0, 2, 0.22);
          transition: height 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .bar-value { font-size: 11px; color: var(--muted); text-align: center; font-weight: 700; font-family: var(--font-mono); }
        .bar-label { font-size: 11.5px; font-weight: 800; color: var(--text); }

        /* Payment Method Distribution */
        .payment-box { margin-top: 20px; display: grid; gap: 20px; }
        .progress {
          width: 100%;
          height: 12px;
          border-radius: 999px;
          background: var(--input-bg);
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .progress-inner {
          height: 100%;
          background: linear-gradient(90deg, var(--brand2, #ff4d4f) 0%, var(--brand, #9a0002) 100%);
          border-radius: 999px;
          transition: width 0.4s ease;
        }
        .legend { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--text); font-weight: 800; }

        /* Product Leaderboard */
        .filter-row { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
        .category-chip {
          border: 1px solid var(--border);
          background: var(--panel);
          color: var(--text);
          border-radius: 999px;
          padding: 7px 16px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .category-chip.active {
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
          box-shadow: 0 4px 14px rgba(154, 0, 2, 0.25);
        }
        .category-leaders {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 14px;
        }
        .leader-card {
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px;
          background: var(--brandSoft);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .leader-card:hover {
          transform: translateY(-2px);
          border-color: var(--brand);
        }
        .leader-category { font-size: 10.5px; color: var(--muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        .leader-name { margin-top: 4px; font-size: 15px; font-weight: 900; color: var(--text); }
        .leader-meta { margin-top: 6px; font-size: 12px; color: var(--muted); font-weight: 600; }

        /* ===== REFINED LUXURY BOTTOM NAVIGATION DOCK ===== */
        .dash-bottom-dock {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          background: linear-gradient(145deg, rgba(154, 0, 2, 0.94), rgba(95, 0, 1, 0.98));
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 26px;
          padding: 8px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(154, 0, 2, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          max-width: 94vw;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .dash-bottom-dock::-webkit-scrollbar { display: none; }

        .dash-dock-group {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dash-dock-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.2);
          margin: 0 2px;
        }

        .dash-dock-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border-radius: 18px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(255, 255, 255, 0.88);
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          white-space: nowrap;
          user-select: none;
        }
        .dash-dock-btn:hover {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.25);
          transform: translateY(-1px);
        }
        .dash-dock-btn:active { transform: scale(0.96); }

        .dash-dock-btn.primary {
          background: #ffffff;
          color: var(--brand, #9a0002);
          border-color: #ffffff;
          font-weight: 900;
          padding: 9px 18px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }
        .dash-dock-btn.primary:hover {
          background: #ffffff;
          color: #780002;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
        }

        .dash-dock-icon {
          width: 17px;
          height: 17px;
          flex-shrink: 0;
        }

        .receipt-preview {
          margin-top: 12px;
          border: 1px dashed var(--border);
          border-radius: 18px;
          padding: 14px;
          background: var(--input-bg);
          font-family: var(--font-mono);
          white-space: pre-wrap;
          line-height: 1.5;
          font-size: 12px;
          color: var(--text);
        }
      `}</style>

        {err && (
          <div className="panel">
            <div style={{ color: "var(--danger)", fontWeight: 900 }}>{err}</div>
          </div>
        )}

        {/* 4 STATS OVERVIEW CARDS */}
        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Omzet Hari Ini</span>
              <div className="stat-icon-badge">
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 2v8m0 0v2m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="stat-value" style={{ color: "var(--brand)" }}>
              Rp {rupiah(stats.todayRevenue)}
            </div>
            <div className="stat-note">Total {stats.todayCount} transaksi paid</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Omzet Bulan Ini</span>
              <div className="stat-icon-badge">
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="stat-value" style={{ color: "var(--brand)" }}>
              Rp {rupiah(stats.monthRevenue)}
            </div>
            <div className="stat-note">Total {stats.monthCount} transaksi paid</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Net Revenue Hari Ini</span>
              <div className="stat-icon-badge" style={{ color: refundStats.netRevenueToday >= 0 ? "var(--brand)" : "var(--danger)" }}>
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="stat-value" style={{ color: refundStats.netRevenueToday >= 0 ? "var(--brand)" : "var(--danger)" }}>
              Rp {rupiah(refundStats.netRevenueToday)}
            </div>
            <div className="stat-note">Refund: Rp {rupiah(refundStats.refundToday)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-header">
              <span className="stat-label">Net Revenue Bulan Ini</span>
              <div className="stat-icon-badge" style={{ color: refundStats.netRevenueMonth >= 0 ? "var(--brand)" : "var(--danger)" }}>
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
            <div className="stat-value" style={{ color: refundStats.netRevenueMonth >= 0 ? "var(--brand)" : "var(--danger)" }}>
              Rp {rupiah(refundStats.netRevenueMonth)}
            </div>
            <div className="stat-note">Refund: Rp {rupiah(refundStats.refundMonth)}</div>
          </div>
        </section>

        {/* CHARTS SECTION (7-DAYS BAR CHART & PAYMENT METHOD DISTRIBUTION) */}
        <section className="analytics-charts-grid">
          {/* 1. GRAFIK OMSET 7 HARI TERAKHIR */}
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="panel-title">Grafik Omzet Penjualan (7 Hari Terakhir)</div>
                <div className="panel-sub">Visualisasi tren pendapatan kotor harian outlet Anda</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)" }}>
                Total: Rp {rupiah(dailyChart.reduce((a, b) => a + b.revenue, 0))}
              </div>
            </div>

            <div className="chart-wrap">
              <div className="bars">
                {dailyChart.map((d, idx) => (
                  <div key={idx} className="bar-col">
                    <div className="bar-value">
                      {d.revenue > 0 ? `${Math.round(d.revenue / 1000)}k` : "0"}
                    </div>
                    <div
                      className="bar"
                      style={{
                        height: `${d.pct}%`,
                      }}
                      title={`${d.label}: Rp ${rupiah(d.revenue)}`}
                    />
                    <div className="bar-label">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. DISTRIBUSI METODE PEMBAYARAN */}
          <div className="panel">
            <div className="panel-title">Distribusi Pembayaran</div>
            <div className="panel-sub">Perbandingan persentase Cash vs QRIS bulan ini</div>

            <div className="payment-box">
              <div>
                <div className="legend">
                  <span>Tunai (Cash)</span>
                  <b style={{ color: "var(--brand)" }}>{paymentChart.cashPct}%</b>
                </div>
                <div className="progress" style={{ marginTop: 8 }}>
                  <div className="progress-inner" style={{ width: `${paymentChart.cashPct}%` }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                  Rp {rupiah(stats.cashRevenue)}
                </div>
              </div>

              <div>
                <div className="legend">
                  <span>Non-Tunai (QRIS)</span>
                  <b style={{ color: "var(--brand)" }}>{paymentChart.qrisPct}%</b>
                </div>
                <div className="progress" style={{ marginTop: 8 }}>
                  <div className="progress-inner" style={{ width: `${paymentChart.qrisPct}%`, background: "linear-gradient(90deg, #3b82f6, #6366f1)" }} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 6, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
                  Rp {rupiah(stats.qrisRevenue)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TOP SELLING PRODUCTS LEADERBOARD */}
        <section className="panel">
          <div className="panel-title">Produk Paling Laris</div>
          <div className="panel-sub">Lihat produk terlaris berdasarkan periode waktu dan kategori menu</div>

          <div className="filter-row">
            <button className={`category-chip${topPeriodFilter === "today" ? " active" : ""}`} onClick={() => setTopPeriodFilter("today")}>
              Hari Ini
            </button>
            <button className={`category-chip${topPeriodFilter === "7d" ? " active" : ""}`} onClick={() => setTopPeriodFilter("7d")}>
              7 Hari Terakhir
            </button>
            <button className={`category-chip${topPeriodFilter === "month" ? " active" : ""}`} onClick={() => setTopPeriodFilter("month")}>
              Bulan Ini
            </button>
          </div>

          <div className="filter-row" style={{ marginTop: 8 }}>
            {topProductCategories.map((c) => (
              <button
                key={c}
                className={`category-chip${topCategoryFilter === c ? " active" : ""}`}
                onClick={() => setTopCategoryFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="category-leaders">
            {filteredTopProducts.length === 0 ? (
              <div style={{ padding: 20, color: "var(--muted)", fontSize: 13 }}>Belum ada data penjualan produk untuk filter ini.</div>
            ) : (
              filteredTopProducts.map((p, idx) => (
                <div key={p.name} className="leader-card">
                  <div className="leader-category"># {idx + 1} • {p.category}</div>
                  <div className="leader-name">{p.name}</div>
                  <div className="leader-meta">Terjual: <b>{p.qty}x</b> • Rp {rupiah(p.revenue)}</div>
                </div>
              ))
            )}
          </div>
        </section>
    </TerraPage>
  );
}
