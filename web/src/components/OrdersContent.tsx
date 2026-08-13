"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { auth, db } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { receiptHTML } from "@/lib/receipt";
import { buildPlainReceipt, getPrintMode, sendToRawBT } from "@/lib/rawbt";
import { isShiftPermissionError, normalizeShift, ShiftRecord } from "@/lib/shifts";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { usePrinting } from "@/components/PrintingOverlay";
import { logAudit } from "@/lib/audit";
import { playOrderNotificationRepeat } from "@/lib/order-notification";

type Order = {
  id: string;
  orderNo: string;
  status: "OPEN" | "PAID" | "CANCELLED";
  mode?: "PAY_NOW" | "PAY_LATER";
  tableNo?: string | null;
  paymentMethod?: "CASH" | "QRIS" | null;
  paidAmount?: number | null;
  subtotal: number;
  discount: number;
  total: number;
  items: { name: string; qty: number; price: number; notes?: string }[];
  createdAt?: any;
  updatedAt?: any;
  paidAt?: any;
  source?: string | null;
  customerName?: string | null;
  customerNote?: string | null;
  staffName?: string | null;
  orderType?: "DINE_IN" | "TAKEAWAY" | null;
};

type RefundLog = {
  id: string;
  orderNo: string;
  tableNo?: string | null;
  total: number;
  paymentMethod?: string | null;
  refundedByEmail?: string;
  refundedAt?: any;
  items: { name: string; qty: number; price: number; notes?: string }[];
};

type ReceiptSettings = {
  storeName: string;
  address: string;
  footer: string;
  cashierName: string;
  logoBase64?: string;
  qrText?: string;
  showLogo?: boolean;
  showQR?: boolean;
};

type ReceiptTitle = "STRUK" | "BILL";
type ReceiptPaymentMethod = "CASH" | "QRIS" | null;

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

function toDateSafe(v: any): Date | null {
  try {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function formatDateFull(d: Date | null) {
  if (!d) return "-";
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(d: Date | null) {
  if (!d) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OrdersContent() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();
  const { showPrinting, hidePrinting } = usePrinting();

  const isOwner = ["zeta", "owner", "developer"].includes((role || "").toString().toLowerCase());
  const canUse = ["zeta", "omega", "delta", "owner", "admin", "developer"].includes((role || "").toString().toLowerCase());

  const [orders, setOrders] = useState<Order[]>([]);
  const [refundLogs, setRefundLogs] = useState<RefundLog[]>([]);
  const [tab, setTab] = useState<"PAID" | "OPEN">("PAID");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [dateFilter, setDateFilter] = useState<string>(""); // YYYY-MM-DD
  const [quickDatePreset, setQuickDatePreset] = useState<"ALL" | "TODAY" | "YESTERDAY" | "THIS_WEEK" | "CUSTOM">("ALL");
  const [calendarPickerDate, setCalendarPickerDate] = useState<Date>(new Date());
  const [showDatePickerPopup, setShowDatePickerPopup] = useState(false);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<"ALL" | "CASH" | "QRIS">("ALL");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  const [viewMode, setViewMode] = useState<"FLOORMAP" | "TIMELINE" | "SPLIT" | "KANBAN" | "TABLE">("FLOORMAP");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Pagination
  const ITEMS_PER_PAGE = 20;
  const [currentPage, setCurrentPage] = useState(1);

  const [payOpen, setPayOpen] = useState(false);
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS">("CASH");
  const [paySuccessDialog, setPaySuccessDialog] = useState<{ orderNo: string; change: number; html: string; text: string; btData: any } | null>(null);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [shiftPromptOpen, setShiftPromptOpen] = useState(false);
  const [shiftAccessBlocked, setShiftAccessBlocked] = useState(false);
  const [filterQR, setFilterQR] = useState(false);

  // Sound notification for new QR orders
  const prevQrOrderIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [refundPinInput, setRefundPinInput] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);

  // Void/Cancel state
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidOrder, setVoidOrder] = useState<Order | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);

  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    storeName: "RuniX",
    address: "",
    footer: "Terima kasih.",
    cashierName: "Kasir RuniX",
  });
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/main`));
        if (snap.exists()) {
          const d = snap.data() as any;
          setReceiptSettings({
            storeName: (d.storeName || "RuniX").toString(),
            address: (d.address || "").toString(),
            footer: (d.footer || "Terima kasih.").toString(),
            cashierName: (d.cashierName || "Kasir RuniX").toString(),
            logoBase64: d.receiptLogoBase64 || "",
            qrText: d.receiptQrText || "",
            showLogo: d.receiptShowLogo ?? false,
            showQR: d.receiptShowQR ?? false,
          });
        }
      } catch { }
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/orders`);
    const qy = query(ref, orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(
      qy,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            orderNo: x.orderNo || d.id,
            status: x.status || "OPEN",
            mode: x.mode || "PAY_LATER",
            tableNo: x.tableNo ?? null,
            paymentMethod: x.paymentMethod ?? null,
            paidAmount: x.paidAmount ?? null,
            subtotal: Number(x.subtotal || 0),
            discount: Number(x.discount || 0),
            total: Number(x.total || 0),
            items: Array.isArray(x.items) ? x.items : [],
            createdAt: x.createdAt,
            updatedAt: x.updatedAt,
            paidAt: x.paidAt,
            source: x.source ?? null,
            customerName: x.customerName ?? null,
            customerNote: x.customerNote ?? null,
            staffName: x.staffName ?? null,
            orderType: x.orderType ?? null,
          } as Order;
        });
        setOrders(arr);
        if (arr.length > 0) {
          setSelectedOrderId((prev) => prev || arr[0].id);
        }
      },
      (e) => setErr(e.message)
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/refunds`);
    const qy = query(ref, orderBy("refundedAt", "desc"), limit(200));
    return onSnapshot(
      qy,
      (snap) => {
        const arr = snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            orderNo: x.orderNo || d.id,
            tableNo: x.tableNo ?? null,
            total: Number(x.total || 0),
            paymentMethod: x.paymentMethod ?? null,
            refundedByEmail: x.refundedByEmail || "",
            refundedAt: x.refundedAt,
            items: Array.isArray(x.items) ? x.items : [],
          } as RefundLog;
        });
        setRefundLogs(arr);
      },
      (e) => setErr(e.message)
    );
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const qy = query(collection(db, `tenants/${tenantId}/shifts`), orderBy("openedAt", "desc"), limit(5));
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
        } else {
          setErr(e.message);
        }
      }
    );
  }, [tenantId]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => o.status === tab);
    if (filterQR) {
      list = list.filter((o) => o.source === "customer_qr");
    }
    if (paymentMethodFilter !== "ALL") {
      list = list.filter((o) => (o.paymentMethod || "CASH") === paymentMethodFilter);
    }
    if (minAmount.trim() && !isNaN(Number(minAmount))) {
      list = list.filter((o) => o.total >= Number(minAmount));
    }
    if (maxAmount.trim() && !isNaN(Number(maxAmount))) {
      list = list.filter((o) => o.total <= Number(maxAmount));
    }

    // Quick Date Preset & Custom Date Filter
    if (quickDatePreset !== "ALL") {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      if (quickDatePreset === "TODAY") {
        list = list.filter((o) => {
          const raw = o.paidAt || o.createdAt;
          if (!raw) return false;
          const d = new Date(raw.seconds ? raw.seconds * 1000 : raw);
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return dStr === todayStr;
        });
      } else if (quickDatePreset === "YESTERDAY") {
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
        list = list.filter((o) => {
          const raw = o.paidAt || o.createdAt;
          if (!raw) return false;
          const d = new Date(raw.seconds ? raw.seconds * 1000 : raw);
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return dStr === yestStr;
        });
      } else if (quickDatePreset === "THIS_WEEK") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        list = list.filter((o) => {
          const raw = o.paidAt || o.createdAt;
          if (!raw) return false;
          const d = new Date(raw.seconds ? raw.seconds * 1000 : raw);
          return d >= sevenDaysAgo && d <= now;
        });
      } else if (quickDatePreset === "CUSTOM" && dateFilter) {
        list = list.filter((o) => {
          const rawDate = o.paidAt || o.createdAt;
          if (!rawDate) return false;
          const d = new Date(rawDate.seconds ? rawDate.seconds * 1000 : rawDate);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const formattedDate = `${yyyy}-${mm}-${dd}`;
          return formattedDate === dateFilter;
        });
      }
    } else if (dateFilter) {
      list = list.filter((o) => {
        const rawDate = o.paidAt || o.createdAt;
        if (!rawDate) return false;
        const d = new Date(rawDate.seconds ? rawDate.seconds * 1000 : rawDate);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        return formattedDate === dateFilter;
      });
    }

    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNo.toLowerCase().includes(q) ||
          (o.tableNo || "").toLowerCase().includes(q) ||
          (o.customerName || "").toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, tab, filterQR, paymentMethodFilter, minAmount, maxAmount, quickDatePreset, dateFilter, searchKeyword]);

  useEffect(() => {
    if (filteredOrders.length > 0) {
      setSelectedOrderId(filteredOrders[0].id);
    } else {
      setSelectedOrderId(null);
    }
  }, [filteredOrders]);

  const qrOpenCount = useMemo(() => {
    return orders.filter((o) => o.status === "OPEN" && o.source === "customer_qr").length;
  }, [orders]);

  useEffect(() => {
    if (orders.length === 0) return;
    const currentQrOpenIds = new Set(
      orders
        .filter((o) => o.status === "OPEN" && o.source === "customer_qr")
        .map((o) => o.id)
    );

    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      prevQrOrderIdsRef.current = currentQrOpenIds;
      return;
    }

    let hasNew = false;
    currentQrOpenIds.forEach((id) => {
      if (!prevQrOrderIdsRef.current.has(id)) {
        hasNew = true;
      }
    });

    if (hasNew) {
      playOrderNotificationRepeat(2);
      toast.info("Ada pesanan QR Order baru masuk!");
    }

    prevQrOrderIdsRef.current = currentQrOpenIds;
  }, [orders, toast]);

  const groupedOrders = useMemo(() => {
    const groups: { key: string; label: string; dateObj: Date | null; items: Order[] }[] = [];
    const map = new Map<string, Order[]>();

    filteredOrders.forEach((o) => {
      const shownDate =
        tab === "PAID"
          ? toDateSafe(o.paidAt) || toDateSafe(o.updatedAt) || toDateSafe(o.createdAt)
          : toDateSafe(o.createdAt) || toDateSafe(o.updatedAt);

      const key = shownDate ? shownDate.toISOString().slice(0, 10) : "NO_DATE";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });

    map.forEach((items, key) => {
      const firstDate = items[0]
        ? tab === "PAID"
          ? toDateSafe(items[0].paidAt) || toDateSafe(items[0].updatedAt) || toDateSafe(items[0].createdAt)
          : toDateSafe(items[0].createdAt) || toDateSafe(items[0].updatedAt)
        : null;

      const label = key === "NO_DATE" ? "Tanpa Tanggal" : formatDateFull(firstDate);
      groups.push({ key, label, dateObj: firstDate, items });
    });

    groups.sort((a, b) => {
      const ta = a.dateObj ? a.dateObj.getTime() : 0;
      const tb = b.dateObj ? b.dateObj.getTime() : 0;
      return tb - ta;
    });

    return groups;
  }, [filteredOrders, tab]);

  const groupedRefundLogs = useMemo(() => {
    const groups: { key: string; label: string; dateObj: Date | null; items: RefundLog[] }[] = [];
    const map = new Map<string, RefundLog[]>();

    refundLogs.forEach((rLog) => {
      const d = toDateSafe(rLog.refundedAt);
      const key = d ? d.toISOString().slice(0, 10) : "NO_DATE";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rLog);
    });

    map.forEach((items, key) => {
      const firstDate = items[0] ? toDateSafe(items[0].refundedAt) : null;
      const label = key === "NO_DATE" ? "Tanpa Tanggal" : formatDateFull(firstDate);
      groups.push({ key, label, dateObj: firstDate, items });
    });

    groups.sort((a, b) => {
      const ta = a.dateObj ? a.dateObj.getTime() : 0;
      const tb = b.dateObj ? b.dateObj.getTime() : 0;
      return tb - ta;
    });

    return groups;
  }, [refundLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [tab, filterQR]);

  const totalItems = useMemo(() => {
    return filteredOrders.length;
  }, [filteredOrders]);

  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));

  const paginatedGrouped = useMemo(() => {

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    let count = 0;
    const result: { key: string; label: string; dateObj: Date | null; items: Order[] }[] = [];

    for (const group of groupedOrders) {
      const groupItems: Order[] = [];
      for (const item of group.items) {
        if (count >= startIndex && count < endIndex) {
          groupItems.push(item);
        }
        count++;
      }
      if (groupItems.length > 0) {
        result.push({ ...group, items: groupItems });
      }
      if (count >= endIndex) break;
    }

    return result;
  }, [groupedOrders, tab, currentPage]);

  const paginatedRefundGrouped = useMemo(() => {
    return [];
  }, []);

  function openPay(o: Order) {
    if (shiftAccessBlocked) {
      toast.error("Akses shift dibatasi untuk role Anda.");
      return;
    }
    if (!activeShift) {
      setShiftPromptOpen(true);
      return;
    }

    setPayOrder(o);
    setPaymentMethod(o.paymentMethod || "CASH");
    setPaidAmount(o.paidAmount || 0);
    setPayOpen(true);
  }

  async function generateAndPrint(opts: {
    title: ReceiptTitle;
    orderNo: string;
    items: { name: string; qty: number; price: number; notes?: string }[];
    subtotal: number;
    discount: number;
    total: number;
    tableNo?: string | null;
    paymentMethod?: ReceiptPaymentMethod;
    paidAmount?: number | null;
    changeAmount?: number | null;
    createdAt?: any;
    cashierName?: string;
  }) {
    if (!tenantId) return;

    showPrinting("Mencetak struk...");
    try {
      const mode = getPrintMode();

      if (mode === "rawbt") {
        const btData = buildPlainReceipt({
          storeName: receiptSettings.storeName,
          address: receiptSettings.address,
          footer: receiptSettings.footer,
          title: opts.title,
          orderNo: opts.orderNo,
          dateText: formatDateTime(opts.createdAt ? new Date(opts.createdAt) : new Date()),
          items: opts.items,
          subtotal: opts.subtotal,
          discount: opts.discount,
          total: opts.total,
          tableNo: opts.tableNo,
          paymentMethod: opts.paymentMethod,
          paidAmount: opts.paidAmount,
          qrText: receiptSettings.qrText,
          showQR: receiptSettings.showQR,
        });

        sendToRawBT(btData);
        toast.info("Membuka printer RawBT...");
        return;
      }

      const html = receiptHTML({
        storeName: receiptSettings.storeName,
        address: receiptSettings.address,
        footer: receiptSettings.footer,
        cashierEmail: opts.cashierName || receiptSettings.cashierName,
        title: opts.title,
        orderNo: opts.orderNo,
        dateText: formatDateTime(opts.createdAt ? new Date(opts.createdAt) : new Date()),
        items: opts.items,
        subtotal: opts.subtotal,
        discount: opts.discount,
        total: opts.total,
        tableNo: opts.tableNo,
        paymentMethod: opts.paymentMethod,
        paidAmount: opts.paidAmount,
        showLogo: receiptSettings.showLogo,
        logoBase64: receiptSettings.logoBase64,
        showQR: receiptSettings.showQR,
        qrText: receiptSettings.qrText,
      });

      const w = window.open("", "_blank");
      if (!w) {
        toast.error("Pop-up terblokir browser. Izinkan pop-up untuk cetak.");
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 300);
    } finally {
      hidePrinting();
    }
  }

  async function printOpenBill(o: Order) {
    await generateAndPrint({
      title: "BILL",
      orderNo: o.orderNo,
      items: o.items,
      subtotal: o.subtotal,
      discount: o.discount,
      total: o.total,
      tableNo: o.tableNo,
      paymentMethod: null,
      paidAmount: null,
      changeAmount: null,
      createdAt: o.createdAt,
    });
  }

  async function reprintOrder(o: Order) {
    const paid = o.paidAmount ?? o.total;
    const change = Math.max(0, paid - o.total);

    await generateAndPrint({
      title: "STRUK",
      orderNo: o.orderNo,
      items: o.items,
      subtotal: o.subtotal,
      discount: o.discount,
      total: o.total,
      tableNo: o.tableNo,
      paymentMethod: o.paymentMethod || "CASH",
      paidAmount: paid,
      changeAmount: change,
      createdAt: o.paidAt || o.updatedAt || o.createdAt,
    });
  }

  function addItemToOpenBill(o: Order) {
    r.push(`/pos?editOrderId=${o.id}`);
  }

  async function confirmPay() {
    if (!tenantId || !payOrder) return;
    if (shiftAccessBlocked) {
      toast.error("Akses shift dibatasi untuk role Anda.");
      return;
    }
    if (!activeShift) {
      setShiftPromptOpen(true);
      return;
    }

    if (paymentMethod === "CASH" && paidAmount < payOrder.total) {
      toast.error(`Uang dibayar kurang dari total Rp ${rupiah(payOrder.total)}`);
      return;
    }

    setErr(null);
    try {
      const change = paymentMethod === "CASH" ? Math.max(0, paidAmount - payOrder.total) : 0;
      const finalPaid = paymentMethod === "CASH" ? paidAmount : payOrder.total;

      const ref = doc(db, `tenants/${tenantId}/orders/${payOrder.id}`);
      await updateDoc(ref, {
        status: "PAID",
        paymentMethod,
        paidAmount: finalPaid,
        paidAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        shiftId: activeShift.id,
      });

      const html = receiptHTML({
        storeName: receiptSettings.storeName,
        address: receiptSettings.address,
        footer: receiptSettings.footer,
        cashierEmail: receiptSettings.cashierName,
        title: "STRUK",
        orderNo: payOrder.orderNo,
        dateText: formatDateTime(new Date()),
        items: payOrder.items,
        subtotal: payOrder.subtotal,
        discount: payOrder.discount,
        total: payOrder.total,
        tableNo: payOrder.tableNo,
        paymentMethod,
        paidAmount: finalPaid,
        showLogo: receiptSettings.showLogo,
        logoBase64: receiptSettings.logoBase64,
        showQR: receiptSettings.showQR,
        qrText: receiptSettings.qrText,
      });

      const plainText = buildPlainReceipt({
        storeName: receiptSettings.storeName,
        address: receiptSettings.address,
        footer: receiptSettings.footer,
        title: "STRUK",
        orderNo: payOrder.orderNo,
        dateText: formatDateTime(new Date()),
        items: payOrder.items,
        subtotal: payOrder.subtotal,
        discount: payOrder.discount,
        total: payOrder.total,
        tableNo: payOrder.tableNo,
        paymentMethod,
        paidAmount: finalPaid,
        qrText: receiptSettings.qrText,
        showQR: receiptSettings.showQR,
      });

      setPaySuccessDialog({
        orderNo: payOrder.orderNo,
        change,
        html,
        text: plainText,
        btData: plainText,
      });

      setPayOpen(false);
      setPayOrder(null);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handlePaySuccessPrint() {
    if (!paySuccessDialog) return;
    const mode = getPrintMode();

    if (mode === "rawbt" && paySuccessDialog.btData) {
      sendToRawBT(paySuccessDialog.btData);
      toast.info("Membuka RawBT...");
      setPaySuccessDialog(null);
      return;
    }

    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Pop-up terblokir. Izinkan pop-up.");
      return;
    }
    w.document.write(paySuccessDialog.html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    setPaySuccessDialog(null);
  }

  function handlePaySuccessSkip() {
    setPaySuccessDialog(null);
  }

  function openRefund(o: Order) {
    setRefundOrder(o);
    setRefundPinInput("");
    setRefundReason("");
    setErr(null);
    setRefundOpen(true);
  }

  async function confirmRefund() {
    if (!tenantId || !refundOrder) return;
    setErr(null);

    const enteredPin = refundPinInput.trim();
    if (!enteredPin) {
      setErr("Masukkan PIN refund.");
      return;
    }

    setRefundLoading(true);
    try {
      const pinSnap = await getDoc(doc(db, `tenants/${tenantId}/settings/refundPin`));
      if (!pinSnap.exists()) {
        setErr("PIN refund belum diatur oleh Owner di /settings.");
        setRefundLoading(false);
        return;
      }
      const correctPin = (pinSnap.data()?.pin || "").toString().trim();
      if (enteredPin !== correctPin) {
        setErr("PIN refund salah.");
        setRefundLoading(false);
        return;
      }

      await addDoc(collection(db, `tenants/${tenantId}/refunds`), {
        orderId: refundOrder.id,
        orderNo: refundOrder.orderNo,
        tableNo: refundOrder.tableNo || null,
        total: refundOrder.total,
        paymentMethod: refundOrder.paymentMethod || null,
        items: refundOrder.items,
        reason: refundReason.trim() || "Tidak ada alasan",
        refundedByEmail: email || "unknown",
        refundedAt: serverTimestamp(),
      });

      await logAudit(tenantId, {
        action: "ORDER_REFUND",
        userEmail: email || "unknown",
        description: `Refund Order #${refundOrder.orderNo} (Total Rp ${rupiah(refundOrder.total)}) - Alasan: ${refundReason.trim() || "Tidak ada"}`,
      });

      await deleteDoc(doc(db, `tenants/${tenantId}/orders/${refundOrder.id}`));

      toast.success(`Order #${refundOrder.orderNo} berhasil di-refund.`);
      setRefundOpen(false);
      setRefundOrder(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRefundLoading(false);
    }
  }

  function openVoid(o: Order) {
    setVoidOrder(o);
    setVoidReason("");
    setErr(null);
    setVoidOpen(true);
  }

  async function confirmVoid() {
    if (!tenantId || !voidOrder) return;
    setVoidLoading(true);
    setErr(null);

    try {
      await updateDoc(doc(db, `tenants/${tenantId}/orders/${voidOrder.id}`), {
        status: "CANCELLED",
        voidReason: voidReason.trim() || "Dibatalkan kasir",
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await logAudit(tenantId, {
        action: "ORDER_CANCEL",
        userEmail: email || "unknown",
        description: `Batalkan Order #${voidOrder.orderNo} - Alasan: ${voidReason.trim() || "Tanpa alasan"}`,
      });

      toast.success(`Order #${voidOrder.orderNo} berhasil dibatalkan.`);
      setVoidOpen(false);
      setVoidOrder(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setVoidLoading(false);
    }
  }

  if (loading || loadingRole) {
    return <PageSkeleton />;
  }

  if (!canUse) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h2>Akses Ditolak</h2>
        <p>Anda tidak memiliki izin untuk mengakses halaman Orders.</p>
        <button className="btn btn-primary" onClick={() => r.push("/pos")} style={{ marginTop: 12 }}>
          Kembali ke POS
        </button>
      </div>
    );
  }

  return (
    <div>
      <SkeletonStyles />
      <style>{`
        /* ===== RADICAL MASTER-DETAIL SPLIT INSPECTOR LAYOUT ===== */
        .orders-adv-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 4px;
        }

        /* 1. Stat Summary Cards Header */
        .orders-stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 900px) {
          .orders-stats-row { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 540px) {
          .orders-stats-row { grid-template-columns: 1fr; }
        }
        .orders-stat-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 14px 18px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.02);
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .orders-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
        }
        .orders-stat-val {
          font-size: 22px;
          font-weight: 900;
          font-family: var(--font-mono);
          color: var(--text);
          margin-top: 2px;
        }
        .orders-stat-lbl {
          font-size: 12px;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* 2. Prominent Filter Bar Header for Orders */
        .orders-control-bar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.06);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        @media (max-width: 840px) {
          .orders-control-bar { flex-direction: column; align-items: stretch; }
        }
        .orders-segmented-group {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--brandSoft);
          padding: 6px;
          border-radius: 20px;
          border: 1px solid var(--border);
          overflow-x: auto;
        }
        .orders-tab-pill {
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
          white-space: nowrap;
        }
        .orders-tab-pill:hover {
          color: var(--text);
        }
        .orders-tab-pill.active {
          background: var(--panel);
          color: var(--brand);
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        }
        .orders-tab-badge {
          background: var(--brandSoft);
          color: var(--brand);
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 900;
        }
        .orders-tab-pill.active .orders-tab-badge {
          background: var(--brand);
          color: #ffffff;
        }

        /* Search & Actions Group */
        .orders-actions-group {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          justify-content: flex-end;
        }
        .orders-search-wrap {
          position: relative;
          width: 100%;
          max-width: 360px;
        }
        .orders-search-input {
          width: 100%;
          border-radius: 18px;
          padding: 12px 16px 12px 42px;
          font-size: 13px;
          font-weight: 700;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          transition: all 0.2s ease;
        }
        .orders-search-input:focus {
          outline: none;
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 0 0 3px rgba(154, 0, 2, 0.12);
        }
        .orders-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 15px;
          height: 15px;
          color: var(--muted);
        }

        /* 3. MASTER-DETAIL SPLIT INSPECTOR LAYOUT */
        .orders-split-layout {
          display: flex;
          gap: 16px;
          height: 72vh;
          min-height: 520px;
        }
        @media (max-width: 900px) {
          .orders-split-layout { flex-direction: column; height: auto; }
        }

        .orders-split-master {
          width: 380px;
          flex-shrink: 0;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }
        @media (max-width: 900px) {
          .orders-split-master { width: 100%; height: 350px; }
        }

        .master-list-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .master-item-card {
          padding: 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--panel);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .master-item-card:hover {
          border-color: var(--brand);
          background: var(--brandSoft);
        }
        .master-item-card.selected {
          border-color: var(--brand);
          background: var(--brandSoft);
          box-shadow: 0 4px 14px rgba(154, 0, 2, 0.12);
        }

        .orders-split-detail {
          flex: 1;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0,0,0,0.02);
        }

        /* 4. KANBAN PIPELINE VIEW */
        .orders-kanban-board {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          min-height: 520px;
        }
        @media (max-width: 900px) {
          .orders-kanban-board { grid-template-columns: 1fr; }
        }
        .kanban-col {
          background: var(--brandSoft);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .kanban-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 800;
          font-size: 14px;
          padding-bottom: 8px;
          border-bottom: 1.5px solid var(--border);
        }

        /* Payment popup: desktop modal vs mobile bottom sheet */
        .order-pay-desktop{ display:grid; }
        .order-pay-mobile-overlay{ display:none; }
        .order-pay-mobile{ display:none !important; }
        @keyframes orderFadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes orderSlideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}

        /* Refund modal: desktop vs mobile */
        .refund-desktop{ display:grid; }
        .refund-mobile-overlay{ display:none; }
        .refund-mobile{ display:none !important; }

        /* Void modal: desktop vs mobile */
        .void-desktop{ display:grid; }
        .void-mobile-overlay{ display:none; }
        .void-mobile{ display:none !important; }

        /* Shift prompt modal: desktop vs mobile */
        .shift-prompt-desktop{ display:grid; }
        .shift-prompt-mobile-overlay{ display:none; }
        .shift-prompt-mobile{ display:none !important; }

        /* Pay success modal: desktop vs mobile */
        .pay-success-desktop{ display:grid; }
        .pay-success-mobile-overlay{ display:none; }
        .pay-success-mobile{ display:none !important; }

        @media (max-width: 980px){
          .order-pay-desktop{ display:none !important; }
          .order-pay-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:50;
            background:rgba(0,0,0,0.5);
            animation:orderFadeIn 0.2s ease;
          }
          .order-pay-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:51;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 32px;
            animation:orderSlideUp 0.25s ease;
            box-shadow:0 -8px 30px rgba(0,0,0,0.2);
          }
          .order-pay-mobile .pay-method-btn{
            flex:1;min-height:50px;justify-content:center;
            font-size:16px;font-weight:800;letter-spacing:0.3px;
          }
          .order-pay-mobile .pay-nom-grid{
            display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;
          }
          .order-pay-mobile .pay-nom-grid .btn{
            padding:8px 10px;font-size:12px;font-weight:500;
            font-family:var(--font-mono);letter-spacing:-0.3px;
          }

          /* Refund mobile bottom sheet */
          .refund-desktop{ display:none !important; }
          .refund-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:60;
            background:rgba(0,0,0,0.5);
            animation:orderFadeIn 0.2s ease;
          }
          .refund-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:61;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 32px;
            animation:orderSlideUp 0.25s ease;
            box-shadow:0 -8px 30px rgba(0,0,0,0.2);
          }

          /* Void mobile bottom sheet */
          .void-desktop{ display:none !important; }
          .void-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:55;
            background:rgba(0,0,0,0.5);
            animation:orderFadeIn 0.2s ease;
          }
          .void-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:56;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 32px;
            animation:orderSlideUp 0.25s ease;
            box-shadow:0 -8px 30px rgba(0,0,0,0.2);
          }

          /* Shift prompt mobile bottom sheet */
          .shift-prompt-desktop{ display:none !important; }
          .shift-prompt-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:70;
            background:rgba(0,0,0,0.55);
            animation:orderFadeIn 0.2s ease;
          }
          .shift-prompt-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:71;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 40px;
            animation:orderSlideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }

          /* Pay success mobile bottom sheet */
          .pay-success-desktop{ display:none !important; }
          .pay-success-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:90;
            background:rgba(0,0,0,0.6);
            animation:orderFadeIn 0.2s ease;
          }
          .pay-success-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:91;
            background:var(--panel);
            border-radius:24px 24px 0 0;
            padding:20px 20px 40px;
            animation:orderSlideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }
        }
      `}</style>

      <div className="orders-adv-container">
        {/* PROMINENT CONTROL DOCK FILTER BAR */}
        <div className="orders-control-bar">
          <div className="orders-segmented-group">
            <button
              className={`orders-tab-pill ${tab === "PAID" ? "active" : ""}`}
              onClick={() => setTab("PAID")}
            >
              Paid
              <span className="orders-tab-badge">{orders.filter((o) => o.status === "PAID").length}</span>
            </button>

            <button
              className={`orders-tab-pill ${tab === "OPEN" ? "active" : ""}`}
              onClick={() => setTab("OPEN")}
            >
              Open Bill
              <span className="orders-tab-badge">{orders.filter((o) => o.status === "OPEN").length}</span>
            </button>
          </div>

          <div className="orders-actions-group">
            {/* Realtime Search Input */}
            <div className="orders-search-wrap">
              <svg className="orders-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className="orders-search-input"
                placeholder="Cari No. Order, Meja, Menu..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>

            {/* QR Filter Button */}
            <button
              className={`btn ${filterQR ? "btn-primary" : ""}`}
              style={{ padding: "10px 18px", borderRadius: 16, fontSize: 13, fontWeight: 800, gap: 8, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}
              onClick={() => setFilterQR(!filterQR)}
            >
              <span>QR Order</span>
              {qrOpenCount > 0 && (
                <span style={{ background: filterQR ? "rgba(255,255,255,0.3)" : "var(--danger)", color: "#fff", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900 }}>
                  {qrOpenCount}
                </span>
              )}
            </button>

            {/* Advanced Filter Modal Trigger */}
            <button
              className={`btn ${(dateFilter || quickDatePreset !== "ALL" || paymentMethodFilter !== "ALL" || minAmount || maxAmount) ? "btn-primary" : ""}`}
              style={{ padding: "10px 20px", borderRadius: 16, fontSize: 13, fontWeight: 800, gap: 8, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}
              onClick={() => setShowAdvancedModal(true)}
            >
              <span>Filter Lanjutan</span>
              {(dateFilter || quickDatePreset !== "ALL" || paymentMethodFilter !== "ALL" || minAmount || maxAmount) && (
                <span style={{ background: "rgba(255,255,255,0.3)", color: "#fff", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 900 }}>
                  {[
                    dateFilter || quickDatePreset !== "ALL" ? 1 : 0,
                    paymentMethodFilter !== "ALL" ? 1 : 0,
                    minAmount || maxAmount ? 1 : 0,
                  ].reduce((a, b) => a + b, 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* EXCLUSIVE MASTER-DETAIL SPLIT INSPECTOR LAYOUT */}
        {filteredOrders.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>Tidak ada data pesanan yang cocok.</div>
          </div>
        ) : (
          <div className="orders-split-layout">
            {/* Master Item List */}
            <div className="orders-split-master">
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 800, fontSize: 13, background: "var(--brandSoft)", color: "var(--text)" }}>
                Daftar Transaksi ({filteredOrders.length})
              </div>
              <div className="master-list-scroll">
                {filteredOrders.map((o) => (
                  <div
                    key={o.id}
                    className={`master-item-card ${selectedOrderId === o.id ? "selected" : ""}`}
                    onClick={() => setSelectedOrderId(o.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <b style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>{o.orderNo}</b>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 8, background: o.orderType === "TAKEAWAY" ? "rgba(217, 119, 6, 0.15)" : "var(--brandSoft)", color: o.orderType === "TAKEAWAY" ? "#d97706" : "var(--brand)", border: o.orderType === "TAKEAWAY" ? "1px solid rgba(217, 119, 6, 0.3)" : "1px solid var(--border)" }}>
                          {o.orderType === "TAKEAWAY" ? "🥡 TAKEAWAY" : "🍽️ DINE IN"}
                        </span>
                        <span className={`adv-status-badge adv-status-${o.status}`}>{o.status}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {formatDateTime(toDateSafe(o.paidAt) || toDateSafe(o.createdAt))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                      <span>Meja: <b>{o.tableNo || "-"}</b></span>
                      <b style={{ color: "var(--brand)", fontSize: 14, fontFamily: "var(--font-mono)" }}>Rp {rupiah(o.total)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail Inspector Pane */}
            <div className="orders-split-detail">
              {(() => {
                const target = orders.find((x) => x.id === selectedOrderId) || filteredOrders[0];
                if (!target) return <div style={{ color: "var(--muted)" }}>Pilih pesanan di sebelah kiri untuk melihat rincian detail.</div>;

                return (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1.5px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                          Order #{target.orderNo}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>Status: <b style={{ color: "var(--brand)" }}>{target.status}</b></span>
                          <span>•</span>
                          <span>Tipe: <b style={{ color: target.orderType === "TAKEAWAY" ? "#d97706" : "var(--brand)" }}>{target.orderType === "TAKEAWAY" ? "🥡 Takeaway (Bungkus)" : "🍽️ Dine In (Makan di Tempat)"}</b></span>
                          <span>•</span>
                          <span>Meja: <b>{target.tableNo || "-"}</b></span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        {target.status === "OPEN" ? (
                          <>
                            <button className="btn btn-primary" style={{ padding: "10px 18px", fontWeight: 800 }} onClick={() => openPay(target)}>Proses Bayar</button>
                            <button className="btn" style={{ padding: "10px 14px" }} onClick={() => addItemToOpenBill(target)}>+ Tambah Item</button>
                            <button className="btn" style={{ padding: "10px 14px" }} onClick={() => printOpenBill(target)}>Cetak Bill</button>
                            <button className="btn btn-danger" style={{ padding: "10px 14px" }} onClick={() => openVoid(target)}>Batalkan</button>
                          </>
                        ) : (
                          <>
                            <button className="btn" style={{ padding: "10px 18px", fontWeight: 800 }} onClick={() => reprintOrder(target)}>Cetak Struk</button>
                            <button className="btn btn-danger" style={{ padding: "10px 14px" }} onClick={() => openRefund(target)}>Refund</button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Detail Items Grid */}
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>Rincian Item Menu</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {target.items.map((it, idx) => (
                          <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 14, background: "var(--brandSoft)", border: "1px solid var(--border)" }}>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 14 }}>{it.name} <span style={{ color: "var(--brand)" }}>x{it.qty}</span></div>
                              {it.notes ? <div className="small" style={{ color: "var(--muted)", marginTop: 2 }}>Catatan: {it.notes}</div> : null}
                            </div>
                            <b style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>Rp {rupiah(it.price * it.qty)}</b>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer Summary */}
                    <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1.5px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div className="small">Waktu Transaksi</div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{formatDateTime(toDateSafe(target.paidAt) || toDateSafe(target.createdAt))}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="small">Total Tagihan Final</div>
                        <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)" }}>Rp {rupiah(target.total)}</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ opacity: currentPage <= 1 ? 0.4 : 1 }}
          >
            &larr; Sebelumnya
          </button>

          <span style={{ fontSize: 13, fontWeight: 700, padding: "0 12px" }}>
            Hal {currentPage} / {totalPages}
            <span style={{ marginLeft: 8, color: "var(--muted)", fontWeight: 400 }}>
              ({totalItems} order)
            </span>
          </span>

          <button
            className="btn"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            style={{ opacity: currentPage >= totalPages ? 0.4 : 1 }}
          >
            Berikutnya &rarr;
          </button>
        </div>
      )}

      {/* DIALOG PEMBAYARAN OPEN BILL (WIDE FORMAT 2-KOLOM SEPERTI POS) */}
      {payOpen && payOrder && (
        <div
          className="order-pay-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 99999,
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 680,
              borderRadius: 28,
              padding: 30,
              background: "var(--panel)",
              border: "1.5px solid var(--border)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.3)",
              animation: "slideUp 0.25s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1.5px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Pelunasan Order (Open Bill)</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                  Order No: <b>{payOrder.orderNo}</b> {payOrder.tableNo ? `• (Meja: ${payOrder.tableNo})` : ""}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPayOpen(false);
                  setPayOrder(null);
                }}
                style={{ fontSize: 13, fontWeight: 800, padding: "8px 16px", borderRadius: 12 }}
              >
                Tutup Modal
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 20 }}>
              {/* Kolom Kiri: Detail Order & Ringkasan Tagihan */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Detail Transaksi
                  </div>
                  <div style={{ background: "var(--input-bg)", padding: 14, borderRadius: 16, border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 700 }}>Mode Order:</span>
                      <b style={{ fontWeight: 800, color: payOrder.orderType === "TAKEAWAY" ? "#d97706" : "var(--brand)" }}>
                        {payOrder.orderType === "TAKEAWAY" ? "🥡 Takeaway" : "🍽️ Dine In"}
                      </b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 700 }}>Nomor Meja:</span>
                      <b style={{ fontWeight: 900, fontFamily: "var(--font-mono)" }}>{payOrder.tableNo || "Tanpa Meja"}</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 700 }}>Total Item:</span>
                      <b style={{ fontWeight: 800 }}>{(payOrder.items || []).reduce((a: number, i: any) => a + Number(i.qty || 1), 0)} Item</b>
                    </div>
                    {payOrder.staffName && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text)" }}>
                        <span style={{ color: "var(--muted)", fontWeight: 700 }}>Kasir/Staff:</span>
                        <b style={{ fontWeight: 800 }}>{payOrder.staffName}</b>
                      </div>
                    )}
                  </div>
                </div>

                {/* Box Ringkasan Bill Tagihan */}
                <div style={{ background: "var(--brandSoft)", border: "1px solid var(--brand2)", borderRadius: 20, padding: 18, marginTop: "auto" }}>
                  <div style={{ fontSize: 11, color: "var(--brand)", textTransform: "uppercase", fontWeight: 900, letterSpacing: 0.5 }}>Total Tagihan Pelunasan</div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)", marginTop: 4, letterSpacing: -0.5 }}>
                    Rp {rupiah(payOrder.total)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>
                    Status: Order Belum Dibayar (OPEN)
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Metode Pembayaran & Nominal Dibayar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    Metode Pembayaran
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                      className={"btn " + (paymentMethod === "CASH" ? "btn-primary" : "")}
                      style={{ padding: "12px", borderRadius: 14, fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => setPaymentMethod("CASH")}
                    >
                      CASH (TUNAI)
                    </button>
                    <button
                      className={"btn " + (paymentMethod === "QRIS" ? "btn-primary" : "")}
                      style={{ padding: "12px", borderRadius: 14, fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => setPaymentMethod("QRIS")}
                    >
                      QRIS (DIGITAL)
                    </button>
                  </div>
                </div>

                {paymentMethod === "CASH" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>Nominal Dibayar (Rp)</div>
                      <input
                        className="input"
                        type="number"
                        style={{ fontSize: 20, fontWeight: 900, fontFamily: "var(--font-mono)", padding: "12px 16px", borderRadius: 14 }}
                        value={paidAmount || ""}
                        onChange={(e) => setPaidAmount(Number(e.target.value || 0))}
                        placeholder="0"
                      />
                    </div>

                    {/* Quick Nominal Chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map((nom) => (
                        <button
                          key={nom}
                          className="btn"
                          style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", borderRadius: 10 }}
                          onClick={() => setPaidAmount((prev) => prev + nom)}
                        >
                          +{rupiah(nom)}
                        </button>
                      ))}
                      <button
                        className="btn btn-primary"
                        style={{ padding: "6px 10px", fontSize: 11, fontWeight: 800, borderRadius: 10 }}
                        onClick={() => setPaidAmount(payOrder.total)}
                      >
                        Uang Pas
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--danger)", borderRadius: 10 }}
                        onClick={() => setPaidAmount(0)}
                      >
                        Reset
                      </button>
                    </div>

                    {/* Display Kembalian */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 14, background: "var(--input-bg)", border: "1px solid var(--border)", marginTop: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>Kembalian</span>
                      <b style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)", color: paidAmount >= payOrder.total ? "#10B981" : "var(--text)" }}>
                        Rp {rupiah(Math.max(0, paidAmount - payOrder.total))}
                      </b>
                    </div>
                  </div>
                )}

                {err && <div style={{ marginTop: 4, color: "var(--danger)", fontWeight: 800, fontSize: 13 }}>{err}</div>}

                <button
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: "auto", padding: "14px 0", fontSize: 15, fontWeight: 900, borderRadius: 16 }}
                  onClick={confirmPay}
                >
                  Konfirmasi Lunas & Cetak Struk
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT POPUP - MOBILE (bottom sheet) */}
      {payOpen && payOrder && (
        <>
          <div className="order-pay-mobile-overlay" onClick={() => { setPayOpen(false); setPayOrder(null); }} />
          <div className="order-pay-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="h1">Bayar Order</div>
              <div className="spacer" />
              <button className="btn" onClick={() => { setPayOpen(false); setPayOrder(null); }}>Tutup</button>
            </div>
            <div className="small">
              Order: <b>{payOrder.orderNo}</b> {payOrder.tableNo ? `(Meja: ${payOrder.tableNo})` : ""}
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background: "var(--brandSoft)",
                border: "1px solid var(--brand2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div className="small" style={{ fontWeight: 700 }}>Total Tagihan</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)" }}>
                Rp {rupiah(payOrder.total)}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Metode Pembayaran</div>
              <div className="row2">
                <button
                  className={"btn pay-method-btn " + (paymentMethod === "CASH" ? "btn-primary" : "")}
                  onClick={() => setPaymentMethod("CASH")}
                >
                  CASH
                </button>
                <button
                  className={"btn pay-method-btn " + (paymentMethod === "QRIS" ? "btn-primary" : "")}
                  onClick={() => setPaymentMethod("QRIS")}
                >
                  QRIS
                </button>
              </div>
            </div>

            {paymentMethod === "CASH" && (
              <>
                <div style={{ marginTop: 14 }}>
                  <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Uang Dibayar (Rp)</div>
                  <input
                    className="input"
                    type="number"
                    style={{ fontSize: 20, fontWeight: 900, fontFamily: "var(--font-mono)", padding: "12px 14px" }}
                    value={paidAmount || ""}
                    onChange={(e) => setPaidAmount(Number(e.target.value || 0))}
                    placeholder="0"
                  />
                </div>

                <div className="pay-nom-grid">
                  {[1000, 2000, 5000, 10000, 20000, 50000, 100000].map((nom) => (
                    <button
                      key={nom}
                      className="btn"
                      onClick={() => setPaidAmount((prev) => prev + nom)}
                    >
                      +{rupiah(nom)}
                    </button>
                  ))}
                  <button
                    className="btn btn-primary"
                    style={{ padding: "8px 12px", fontSize: 12 }}
                    onClick={() => setPaidAmount(payOrder.total)}
                  >
                    Uang Pas
                  </button>
                  <button
                    className="btn"
                    style={{ padding: "8px 12px", fontSize: 12, color: "var(--danger)" }}
                    onClick={() => setPaidAmount(0)}
                  >
                    Reset
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 14,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--input-bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span className="small" style={{ fontSize: 14 }}>Kembalian:</span>
                  <b style={{ fontSize: 18, fontFamily: "var(--font-mono)", color: paidAmount >= payOrder.total ? "var(--success)" : "var(--text)" }}>
                    Rp {rupiah(Math.max(0, paidAmount - payOrder.total))}
                  </b>
                </div>
              </>
            )}

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 800 }}
              onClick={confirmPay}
            >
              Konfirmasi Lunas & Cetak Struk
            </button>
          </div>
        </>
      )}

      {/* REFUND MODAL - DESKTOP (centered modal) */}
      {refundOpen && refundOrder && (
        <div
          className="refund-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            placeItems: "center",
            padding: 16,
            zIndex: 60,
          }}
        >
          <div className="card" style={{ width: 460, maxWidth: "100%" }}>
            <div className="row">
              <div className="h1" style={{ color: "var(--danger)" }}>Refund Order</div>
              <div className="spacer" />
              <button
                className="btn"
                onClick={() => {
                  setRefundOpen(false);
                  setRefundOrder(null);
                }}
              >
                Tutup
              </button>
            </div>

            <div className="small" style={{ marginTop: 6 }}>
              Order: <b>{refundOrder.orderNo}</b> {refundOrder.tableNo ? `(Meja: ${refundOrder.tableNo})` : ""}
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background: "var(--brandSoft)",
                border: "1px solid var(--brand2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div className="small" style={{ fontWeight: 700 }}>Total Refund</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--danger)" }}>
                Rp {rupiah(refundOrder.total)}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>PIN Refund (Owner)</div>
              <input
                className="input"
                type="password"
                maxLength={8}
                style={{ fontSize: 18, fontWeight: 900, textAlign: "center", letterSpacing: 4 }}
                value={refundPinInput}
                onChange={(e) => setRefundPinInput(e.target.value)}
                placeholder="****"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>Alasan Refund (opsional)</div>
              <textarea
                className="input"
                style={{ minHeight: 70, fontSize: 13, padding: "8px 12px" }}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Contoh: salah input, dibatalkan customer"
              />
            </div>

            <div className="small" style={{ marginTop: 10, lineHeight: 1.5, color: "var(--muted)" }}>
              Jika refund berhasil, order dihapus dari penjualan utama dan masuk ke <b>refund log</b>.
            </div>

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 14, padding: "12px 0", fontSize: 15, fontWeight: 800 }}
              onClick={confirmRefund}
              disabled={refundLoading}
            >
              {refundLoading ? "Memproses Refund..." : "Konfirmasi Refund"}
            </button>
          </div>
        </div>
      )}

      {/* REFUND MODAL - MOBILE (bottom sheet) */}
      {refundOpen && refundOrder && (
        <>
          <div className="refund-mobile-overlay" onClick={() => { setRefundOpen(false); setRefundOrder(null); }} />
          <div className="refund-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="h1" style={{ color: "var(--danger)" }}>Refund Order</div>
              <div className="spacer" />
              <button className="btn" onClick={() => { setRefundOpen(false); setRefundOrder(null); }}>Tutup</button>
            </div>
            <div className="small">
              Order: <b>{refundOrder.orderNo}</b> {refundOrder.tableNo ? `(Meja: ${refundOrder.tableNo})` : ""}
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "12px 14px",
                borderRadius: 14,
                background: "var(--brandSoft)",
                border: "1px solid var(--brand2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div className="small" style={{ fontWeight: 700 }}>Total Refund</div>
              <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--danger)" }}>
                Rp {rupiah(refundOrder.total)}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="small" style={{ fontWeight: 700 }}>PIN Refund (Owner)</div>
              <input
                className="input"
                type="password"
                maxLength={8}
                style={{ fontSize: 20, fontWeight: 900, textAlign: "center", letterSpacing: 4, padding: "12px 14px" }}
                value={refundPinInput}
                onChange={(e) => setRefundPinInput(e.target.value)}
                placeholder="****"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="small" style={{ fontWeight: 700 }}>Alasan Refund (opsional)</div>
              <textarea
                className="input"
                style={{ minHeight: 90, fontSize: 15, padding: "12px 14px" }}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Contoh: salah input, dibatalkan customer"
              />
            </div>

            <div className="small" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Jika refund berhasil, order dihapus dari penjualan utama tetapi tetap masuk ke <b>refund log</b>.
            </div>

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 15, fontWeight: 800 }}
              onClick={confirmRefund}
              disabled={refundLoading}
            >
              {refundLoading ? "Memproses Refund..." : "Konfirmasi Refund"}
            </button>
          </div>
        </>
      )}

      {/* VOID MODAL - DESKTOP (centered modal) */}
      {voidOpen && voidOrder && (
        <div
          className="void-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            placeItems: "center",
            padding: 16,
            zIndex: 55,
          }}
        >
          <div className="card" style={{ width: 520, maxWidth: "100%" }}>
            <div className="row">
              <div className="h1">Batalkan Order</div>
              <div className="spacer" />
              <button
                className="btn"
                onClick={() => {
                  setVoidOpen(false);
                  setVoidOrder(null);
                  setVoidReason("");
                }}
              >
                Tutup
              </button>
            </div>

            <div className="small" style={{ marginTop: 8 }}>
              Order: <b>{voidOrder.orderNo}</b> {voidOrder.tableNo ? `(Meja: ${voidOrder.tableNo})` : ""}
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small">Alasan Pembatalan (opsional)</div>
              <textarea
                className="input"
                style={{ minHeight: 80 }}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Contoh: salah input, customer batal pesan"
              />
            </div>

            <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Order yang dibatalkan akan berubah status menjadi <b>CANCELLED</b> dan tidak masuk ke laporan penjualan.
            </div>

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 12 }}
              onClick={confirmVoid}
              disabled={voidLoading}
            >
              {voidLoading ? "Membatalkan..." : "Konfirmasi Batalkan"}
            </button>
          </div>
        </div>
      )}

      {/* VOID MODAL - MOBILE (bottom sheet) */}
      {voidOpen && voidOrder && (
        <>
          <div className="void-mobile-overlay" onClick={() => { setVoidOpen(false); setVoidOrder(null); setVoidReason(""); }} />
          <div className="void-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="h1">Batalkan Order</div>
              <div className="spacer" />
              <button
                className="btn"
                onClick={() => {
                  setVoidOpen(false);
                  setVoidOrder(null);
                  setVoidReason("");
                }}
              >
                Tutup
              </button>
            </div>

            <div className="small">
              Order: <b>{voidOrder.orderNo}</b> {voidOrder.tableNo ? `(Meja: ${voidOrder.tableNo})` : ""}
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="small">Alasan Pembatalan (opsional)</div>
              <textarea
                className="input"
                style={{ minHeight: 90, fontSize: 15, padding: "12px 14px" }}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Contoh: salah input, customer batal pesan"
              />
            </div>

            <div className="small" style={{ marginTop: 12, lineHeight: 1.6 }}>
              Order yang dibatalkan akan berubah status menjadi <b>CANCELLED</b>.
            </div>

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button
              className="btn btn-danger"
              style={{ width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15, fontWeight: 800 }}
              onClick={confirmVoid}
              disabled={voidLoading}
            >
              {voidLoading ? "Membatalkan..." : "Konfirmasi Batalkan"}
            </button>
          </div>
        </>
      )}

      {/* SHIFT PROMPT - DESKTOP (centered modal) */}
      {shiftPromptOpen && !activeShift && (
        <div
          className="shift-prompt-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            placeItems: "center",
            padding: 16,
            zIndex: 70,
          }}
        >
          <div className="card" style={{ width: 440, maxWidth: "100%" }}>
            <div className="h1" style={{ fontSize: 20 }}>Shift Belum Dibuka</div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Open bill belum bisa dibayar karena belum ada shift aktif. Shift perlu dibuka dulu supaya pembayaran masuk ke sesi kasir yang benar.
            </div>

            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--brandSoft)",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Buka shift di halaman <b>Shift</b>, lalu kembali ke Orders untuk melanjutkan pembayaran.
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setShiftPromptOpen(false)}>
                Tutup
              </button>
              <button className="btn btn-primary" onClick={() => r.push("/shifts")}>
                Buka Halaman Shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT PROMPT - MOBILE (bottom sheet) */}
      {shiftPromptOpen && !activeShift && (
        <>
          <div className="shift-prompt-mobile-overlay" onClick={() => setShiftPromptOpen(false)} />
          <div className="shift-prompt-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div className="h1" style={{ fontSize: 20 }}>Shift Belum Dibuka</div>
            <div className="small" style={{ marginTop: 12, lineHeight: 1.7, fontSize: 14 }}>
              Open bill belum bisa dibayar karena belum ada shift aktif. Shift perlu dibuka dulu supaya pembayaran masuk ke sesi kasir yang benar.
            </div>

            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--brandSoft)",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              Buka shift di halaman <b>Shift</b>, lalu kembali ke Orders untuk melanjutkan pembayaran.
            </div>

            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              <button className="btn btn-primary" style={{ width: "100%", padding: "14px 0", fontSize: 15, fontWeight: 800 }} onClick={() => r.push("/shifts")}>
                Buka Halaman Shift
              </button>
              <button className="btn" style={{ width: "100%", padding: "12px 0", fontSize: 14 }} onClick={() => setShiftPromptOpen(false)}>
                Tutup
              </button>
            </div>
          </div>
        </>
      )}

      {/* PAY SUCCESS - DESKTOP */}
      {paySuccessDialog && (
        <div className="pay-success-desktop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", placeItems: "center", padding: 16, zIndex: 90 }}>
          <div className="card" style={{ width: 440, maxWidth: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 4 }}>&#10003;</div>
            <div className="h1" style={{ color: "var(--brand)" }}>Pembayaran Berhasil</div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Order <b>{paySuccessDialog.orderNo}</b> telah lunas.
            </div>

            {paySuccessDialog.change > 0 && (
              <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                <div className="small" style={{ fontWeight: 700 }}>Kembalian</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                  Rp {rupiah(paySuccessDialog.change)}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
              Cetak struk untuk pelanggan?
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: "center", gap: 10 }}>
              <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 14, fontWeight: 800 }} onClick={handlePaySuccessPrint}>
                Cetak Struk
              </button>
              <button className="btn" style={{ padding: "12px 24px", fontSize: 14 }} onClick={handlePaySuccessSkip}>
                Lewati
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAY SUCCESS - MOBILE (bottom sheet) */}
      {paySuccessDialog && (
        <>
          <div className="pay-success-mobile-overlay" />
          <div className="pay-success-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>&#10003;</div>
              <div className="h1" style={{ color: "var(--brand)", fontSize: 22 }}>Pembayaran Berhasil</div>
              <div className="small" style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14 }}>
                Order <b>{paySuccessDialog.orderNo}</b> telah lunas.
              </div>

              {paySuccessDialog.change > 0 && (
                <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                  <div className="small" style={{ fontWeight: 700 }}>Kembalian</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                    Rp {rupiah(paySuccessDialog.change)}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 20, fontSize: 14, color: "var(--muted)" }}>
                Cetak struk untuk pelanggan?
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <button className="btn btn-primary" style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800 }} onClick={handlePaySuccessPrint}>
                  Cetak Struk
                </button>
                <button className="btn" style={{ width: "100%", padding: "14px 0", fontSize: 15 }} onClick={handlePaySuccessSkip}>
                  Lewati
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL ADVANCED FILTER (RUNIX GLASSMORPHISM EDITION) */}
      {showAdvancedModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center", padding: 16, zIndex: 9999, backdropFilter: "blur(4px)" }}>
          <div className="card" style={{ maxWidth: 520, width: "100%", borderRadius: 28, padding: 28, boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
            {/* Header Dialog */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Filter Lanjutan Pesanan</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Sesuaikan kriteria pencarian transaksi dengan presisi</div>
              </div>
              <button
                className="btn"
                style={{ padding: "6px 12px", fontSize: 12, fontWeight: 800, borderRadius: 12, color: "#ef4444" }}
                onClick={() => {
                  setQuickDatePreset("ALL");
                  setDateFilter("");
                  setPaymentMethodFilter("ALL");
                  setMinAmount("");
                  setMaxAmount("");
                }}
              >
                Reset Semua
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* 1. SELEKSI TANGGAL: TABEL PRESET & CALENDAR INPUT */}
              <div style={{ background: "var(--brandSoft)", border: "1.5px solid var(--border)", borderRadius: 20, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)", marginBottom: 10 }}>Periode Tanggal</div>
                
                {/* Tabel Preset Tanggal */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 12 }}>
                  <button
                    className={`btn ${quickDatePreset === "ALL" && !dateFilter ? "btn-primary" : ""}`}
                    style={{ padding: "8px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "1px solid var(--border)" }}
                    onClick={() => { setQuickDatePreset("ALL"); setDateFilter(""); }}
                  >
                    Semua
                  </button>
                  <button
                    className={`btn ${quickDatePreset === "TODAY" ? "btn-primary" : ""}`}
                    style={{ padding: "8px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "1px solid var(--border)" }}
                    onClick={() => { setQuickDatePreset("TODAY"); setDateFilter(""); }}
                  >
                    Hari Ini
                  </button>
                  <button
                    className={`btn ${quickDatePreset === "YESTERDAY" ? "btn-primary" : ""}`}
                    style={{ padding: "8px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "1px solid var(--border)" }}
                    onClick={() => { setQuickDatePreset("YESTERDAY"); setDateFilter(""); }}
                  >
                    Kemarin
                  </button>
                  <button
                    className={`btn ${quickDatePreset === "THIS_WEEK" ? "btn-primary" : ""}`}
                    style={{ padding: "8px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, border: "1px solid var(--border)" }}
                    onClick={() => { setQuickDatePreset("THIS_WEEK"); setDateFilter(""); }}
                  >
                    7 Hari
                  </button>
                </div>

                {/* Input Tanggal Kustom Spesifik Gaya RuniX */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase" }}>Pilih Tanggal Spesifik:</div>
                  <button
                    className="btn"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 16,
                      fontSize: 14,
                      fontWeight: 800,
                      border: dateFilter ? "1.5px solid var(--brand)" : "1px solid var(--border)",
                      background: dateFilter ? "var(--panel)" : "var(--panel)",
                      color: dateFilter ? "var(--brand)" : "var(--text)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      boxShadow: dateFilter ? "0 4px 14px rgba(154,0,2,0.1)" : "none",
                    }}
                    onClick={() => setShowDatePickerPopup(true)}
                  >
                    <span>
                      {dateFilter ? (() => {
                        const [y, m, d] = dateFilter.split("-");
                        return `${d} ${["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"][Number(m) - 1]} ${y}`;
                      })() : "Pilih Tanggal Kalender..."}
                    </span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>Buka Kalender</span>
                  </button>
                </div>
              </div>

              {/* 2. METODE PEMBAYARAN */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)", marginBottom: 8 }}>Metode Pembayaran</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <button
                    className={`btn ${paymentMethodFilter === "ALL" ? "btn-primary" : ""}`}
                    style={{ padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 14 }}
                    onClick={() => setPaymentMethodFilter("ALL")}
                  >
                    Semua
                  </button>
                  <button
                    className={`btn ${paymentMethodFilter === "CASH" ? "btn-primary" : ""}`}
                    style={{ padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 14 }}
                    onClick={() => setPaymentMethodFilter("CASH")}
                  >
                    Cash
                  </button>
                  <button
                    className={`btn ${paymentMethodFilter === "QRIS" ? "btn-primary" : ""}`}
                    style={{ padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 14 }}
                    onClick={() => setPaymentMethodFilter("QRIS")}
                  >
                    QRIS
                  </button>
                </div>
              </div>

              {/* 3. RENTANG TOTAL NOMINAL TRANSAKSI */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)", marginBottom: 8 }}>Rentang Nominal Transaksi (Rp)</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="Nominal Min (Rp)"
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid var(--border)",
                      background: "var(--brandSoft)",
                      color: "var(--text)",
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)" }}>s/d</span>
                  <input
                    type="number"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="Nominal Maks (Rp)"
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontSize: 13,
                      fontWeight: 700,
                      border: "1px solid var(--border)",
                      background: "var(--brandSoft)",
                      color: "var(--text)",
                      outline: "none",
                      fontFamily: "var(--font-mono)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Footer Modal Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, padding: "14px 0", fontWeight: 900, borderRadius: 16, fontSize: 14 }}
                onClick={() => setShowAdvancedModal(false)}
              >
                Terapkan Filter
              </button>
              <button
                className="btn"
                style={{ flex: 1, padding: "14px 0", borderRadius: 16, fontSize: 14 }}
                onClick={() => setShowAdvancedModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP KALENDER REMAJA RUNIX (CUSTOM DATEPICKER TABLE) */}
      {showDatePickerPopup && (
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
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginTop: 2 }}>Pilih Tanggal RuniX</div>
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

                    const isSelected = dateFilter === dateStr;
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
                          setDateFilter(dateStr);
                          setQuickDatePreset("CUSTOM");
                          setShowDatePickerPopup(false);
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
                  setDateFilter(`${yyyy}-${mm}-${dd}`);
                  setCalendarPickerDate(now);
                  setQuickDatePreset("TODAY");
                  setShowDatePickerPopup(false);
                }}
              >
                Hari Ini
              </button>
              <button
                className="btn"
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, borderRadius: 12, color: "#ef4444" }}
                onClick={() => {
                  setDateFilter("");
                  setQuickDatePreset("ALL");
                  setShowDatePickerPopup(false);
                }}
              >
                Reset Tanggal
              </button>
              <button
                className="btn"
                style={{ padding: "10px 14px", fontSize: 12, fontWeight: 800, borderRadius: 12 }}
                onClick={() => setShowDatePickerPopup(false)}
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
