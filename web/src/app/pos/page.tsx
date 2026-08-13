"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import TerraPage from "@/components/TerraPage";
import { OrdersContent } from "@/components/OrdersContent";
import { ShiftsContent } from "@/components/ShiftsContent";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { receiptHTML } from "@/lib/receipt";
import { buildPlainReceipt, getPrintMode, sendToRawBT } from "@/lib/rawbt";
import { isShiftPermissionError, normalizeShift, ShiftRecord } from "@/lib/shifts";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { usePrinting } from "@/components/PrintingOverlay";
import { logAudit } from "@/lib/audit";
import { LevelBadge } from "@/components/LevelBadge";
import { useLevel } from "@/hooks/useLevel";
import { useStaff } from "@/hooks/useStaff";
import StaffPinLock from "@/components/StaffPinLock";

type Product = { id: string; name: string; category: string; price: number; isActive?: boolean; imageUrl?: string };
type CartItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  qty: number;
  notes?: string;
};
type ReceiptSettings = { storeName: string; address: string; footer: string; cashierName: string; logoBase64?: string; qrText?: string; showLogo?: boolean; showQR?: boolean };
type OrderStatus = "OPEN" | "PAID" | "CANCELLED";
type OrderMode = "PAY_NOW" | "PAY_LATER";

type ActivePromo = {
  id: string;
  name: string;
  type: "percent" | "nominal";
  value: number;
  minSubtotal: number;
  startTime: string;
  endTime: string;
  days: number[];
  code: string;
};

const paymentMethodButtonStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 68,
  justifyContent: "center",
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: 0.4,
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export default function POSPage() {
  const r = useRouter();
  const sp = useSearchParams();
  const editOrderId = (sp.get("editOrderId") || "").trim();

  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();
  const { showPrinting, hidePrinting } = usePrinting();

  const isOwner = ["zeta", "owner", "developer"].includes((role || "").toString().toLowerCase());
  const canUse = ["zeta", "omega", "delta", "owner", "admin", "developer"].includes((role || "").toString().toLowerCase());
  const isDev = (role || "").toString().toLowerCase() === "developer";

  const { staffAccounts, activeStaff, isLocked, staffEnabled, loginStaff, logoutStaff, switchStaff, error: staffError } = useStaff();
  const { canUsePromos } = useLevel();

  const [mode, setMode] = useState<OrderMode>("PAY_NOW");
  const [orderType, setOrderType] = useState<"DINE_IN" | "TAKEAWAY">("DINE_IN");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("Semua");
  const [tableNo, setTableNo] = useState("");
  const [discount, setDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"nominal" | "persen">("nominal");
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS">("CASH");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [shiftPromptOpen, setShiftPromptOpen] = useState(false);
  const [shiftAccessBlocked, setShiftAccessBlocked] = useState(false);

  const [showTableWarning, setShowTableWarning] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ orderNo: string; change: number; html: string; text: string; btData: any } | null>(null);
  const [billSuccessDialog, setBillSuccessDialog] = useState<{ orderNo: string; html: string; text: string; btData: any; wasEditing: boolean } | null>(null);

  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingOrderNo, setEditingOrderNo] = useState<string | null>(null);

  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>({
    storeName: "RuniX",
    address: "",
    footer: "Terima kasih.",
    cashierName: "Kasir RuniX",
  });
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null);
  const [promos, setPromos] = useState<ActivePromo[]>([]);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [redeemedCode, setRedeemedCode] = useState("");

  const searchRef = useRef<HTMLInputElement | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"POS" | "ORDERS" | "SHIFTS">("POS");

  useEffect(() => {
    const t = sp.get("table");
    if (t) setTableNo(t);
  }, [sp]);

  useEffect(() => {
    if (activeTab !== "POS") {
      resetCart();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!tenantId || !editOrderId) {
      if (!editOrderId) {
        setEditingOrderId(null);
        setEditingOrderNo(null);
      }
      return;
    }
    if (editingOrderId === editOrderId) return;

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, `tenants/${tenantId}/orders/${editOrderId}`));
        if (!snap.exists()) {
          if (!cancelled) setErr("Open bill tidak ditemukan.");
          return;
        }

        const data = snap.data() as any;
        if ((data.status || "OPEN") !== "OPEN") {
          if (!cancelled) setErr("Order ini sudah tidak OPEN.");
          return;
        }

        if (cancelled) return;

        setMode("PAY_LATER");
        setTableNo((data.tableNo || "").toString());
        setDiscount(Number(data.discount || 0));
        setCart(
          Array.isArray(data.items)
            ? data.items.map((item: any) => ({
                id: (item.id || item.name || "").toString(),
                name: (item.name || "").toString(),
                category: (item.category || "Lainnya").toString(),
                price: Number(item.price || 0),
                qty: Number(item.qty || 0),
                notes: (item.notes || "").toString(),
              }))
            : []
        );
        setPaymentMethod("CASH");
        setPaidAmount(0);
        setNoteOpenId(null);
        setNoteDraft("");
        setActiveTab("POS");
        setEditingOrderId(editOrderId);
        setEditingOrderNo((data.orderNo || editOrderId).toString());
        setErr(null);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Gagal memuat open bill.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantId, editOrderId, editingOrderId]);

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
      } catch {}
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/products`);
    const qy = query(ref, orderBy("category", "asc"), orderBy("name", "asc"));
    return onSnapshot(
      qy,
      (snap) => {
        const arr: Product[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            category: data.category || "Lainnya",
            price: Number(data.price || 0),
            isActive: data.isActive ?? true,
            imageUrl: data.imageUrl || "",
          };
        });
        setProducts(arr.filter((p) => p.isActive));
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
          return;
        }
        setErr(e.message);
      }
    );
  }, [tenantId]);

  useEffect(() => {
    if (!loading && !loadingRole && canUse) {
      setShiftPromptOpen(!activeShift && !shiftAccessBlocked);
    }
  }, [activeShift, canUse, loading, loadingRole, shiftAccessBlocked]);

  // Fetch active promos
  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/promos`);
    const qy = query(ref, where("isActive", "==", true), orderBy("createdAt", "desc"), limit(20));
    return onSnapshot(qy, (snap) => {
      const arr: ActivePromo[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            type: data.type || "percent",
            value: Number(data.value || 0),
            minSubtotal: Number(data.minSubtotal || 0),
            startTime: data.startTime || "00:00",
            endTime: data.endTime || "23:59",
            days: Array.isArray(data.days) ? data.days : [0, 1, 2, 3, 4, 5, 6],
            code: data.code || "",
            isActive: data.isActive ?? true,
          };
        })
        .filter((p: any) => p.isActive);
      setPromos(arr);
    });
  }, [tenantId]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category || "Lainnya"));
    return ["Semua", ...Array.from(set)];
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== "Semua") list = list.filter((p) => (p.category || "Lainnya") === activeCat);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, search, activeCat]);

  const subtotal = useMemo(() => cart.reduce((a, i) => a + i.price * i.qty, 0), [cart]);

  // Auto-apply promo: cari promo terbaik yang berlaku saat ini
  const appliedPromo = useMemo(() => {
    if (promos.length === 0 || subtotal === 0) return null;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const eligible = promos.filter((p) => {
      if (!p.days.includes(currentDay)) return false;
      if (currentTime < p.startTime || currentTime > p.endTime) return false;
      if (p.minSubtotal > 0 && subtotal < p.minSubtotal) return false;
      // Promo dengan kode hanya berlaku jika kode di-redeem
      if (p.code && p.code !== redeemedCode) return false;
      // Promo tanpa kode = auto-apply
      return true;
    });

    if (eligible.length === 0) return null;

    // Pilih promo dengan diskon terbesar
    let best: ActivePromo | null = null;
    let bestAmount = 0;
    for (const p of eligible) {
      const amt = p.type === "percent" ? Math.round((subtotal * p.value) / 100) : p.value;
      if (amt > bestAmount) {
        bestAmount = amt;
        best = p;
      }
    }
    return best;
  }, [promos, subtotal, redeemedCode]);

  const promoDiscountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    return appliedPromo.type === "percent"
      ? Math.round((subtotal * appliedPromo.value) / 100)
      : appliedPromo.value;
  }, [appliedPromo, subtotal]);

  const discountAmount = useMemo(() => {
    if (discountType === "persen") {
      return Math.round((subtotal * Number(discount || 0)) / 100);
    }
    return Number(discount || 0);
  }, [subtotal, discount, discountType]);
  const totalDiscount = useMemo(() => discountAmount + promoDiscountAmount, [discountAmount, promoDiscountAmount]);
  const total = useMemo(() => Math.max(0, subtotal - totalDiscount), [subtotal, totalDiscount]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const found = prev.find((i) => i.id === p.id && !(i.notes || "").trim());
      if (found) {
        return prev.map((i) => (i.id === p.id && !(i.notes || "").trim() ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: p.id, name: p.name, category: p.category, price: p.price, qty: 1, notes: "" }];
    });
  }

  function inc(index: number) {
    setCart((prev) => prev.map((i, idx) => (idx === index ? { ...i, qty: i.qty + 1 } : i)));
  }

  function dec(index: number) {
    setCart((prev) =>
      prev.map((i, idx) => (idx === index ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0)
    );
  }

  function updateQty(index: number, newQty: number) {
    if (isNaN(newQty) || newQty <= 0) {
      setCart((prev) => prev.filter((_, idx) => idx !== index));
    } else {
      setCart((prev) =>
        prev.map((i, idx) => (idx === index ? { ...i, qty: newQty } : i))
      );
    }
  }

  function openNoteEditor(index: number) {
    setNoteOpenId(String(index));
    setNoteDraft(cart[index]?.notes || "");
  }

  function saveNote(index: number) {
    setCart((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, notes: noteDraft.trim() } : item
      )
    );
    setNoteOpenId(null);
    setNoteDraft("");
  }

  function clearNote(index: number) {
    setCart((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, notes: "" } : item
      )
    );
    setNoteOpenId(null);
    setNoteDraft("");
  }

  function resetCart() {
    setCart([]);
    setTableNo("");
    setDiscount(0);
    setDiscountType("nominal");
    setPayOpen(false);
    setPaidAmount(0);
    setPaymentMethod("CASH");
    setErr(null);
    setNoteOpenId(null);
    setNoteDraft("");
    setEditingOrderId(null);
    setEditingOrderNo(null);
    setPromoCodeInput("");
    setRedeemedCode("");
  }

  function buildReceiptHtml(orderNo: string, title: "STRUK" | "BILL") {
    const receiptPaymentMethod = title === "STRUK" ? paymentMethod : null;
    return receiptHTML({
      title,
      storeName: receiptSettings.storeName || "RuniX",
      address: receiptSettings.address || "",
      footer: receiptSettings.footer || "Terima kasih.",
      orderNo,
      dateText: new Date().toLocaleString("id-ID"),
      tableNo: tableNo.trim() || null,
      orderType,
      cashierEmail: receiptSettings.cashierName || email || "",
      paymentMethod: receiptPaymentMethod,
      subtotal,
      discount: totalDiscount,
      total,
      paidAmount: receiptPaymentMethod === "CASH" ? paidAmount : null,
      items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price, notes: c.notes || "" })),
      logoBase64: receiptSettings.logoBase64 || "",
      qrText: receiptSettings.qrText || "",
      showLogo: receiptSettings.showLogo ?? false,
      showQR: receiptSettings.showQR ?? false,
    });
  }

  function buildReceiptText(orderNo: string, title: "STRUK" | "BILL") {
    const receiptPaymentMethod = title === "STRUK" ? paymentMethod : null;
    return buildPlainReceipt({
      title,
      storeName: receiptSettings.storeName || "RuniX",
      address: receiptSettings.address || "",
      footer: receiptSettings.footer || "Terima kasih.",
      orderNo,
      dateText: new Date().toLocaleString("id-ID"),
      tableNo: tableNo.trim() || null,
      cashierEmail: receiptSettings.cashierName || email || "",
      paymentMethod: receiptPaymentMethod,
      subtotal,
      discount: totalDiscount,
      total,
      paidAmount: receiptPaymentMethod === "CASH" ? paidAmount : null,
      items: cart.map((c) => ({
        name: c.notes?.trim() ? `${c.name} (${c.notes})` : c.name,
        qty: c.qty,
        price: c.price,
      })),
      qrText: receiptSettings.qrText || "",
      showQR: receiptSettings.showQR ?? false,
    });
  }

  async function printBySelectedMode(html: string, text: string, receiptDataForBT?: { title?: string; orderNo?: string; payMethod?: string | null; paid?: number | null }) {
    const mode = getPrintMode();

    if (mode === "bluetooth") {
      try {
        showPrinting("Mencetak via Bluetooth...");
        const btData = {
          storeName: receiptSettings.storeName || "RuniX",
          address: receiptSettings.address || "",
          footer: receiptSettings.footer || "Terima kasih.",
          title: receiptDataForBT?.title || "STRUK",
          orderNo: receiptDataForBT?.orderNo || "",
          dateText: new Date().toLocaleString("id-ID"),
          tableNo: tableNo.trim() || null,
          cashierName: receiptSettings.cashierName || email || "",
          paymentMethod: receiptDataForBT?.payMethod ?? paymentMethod,
          subtotal,
          discount: totalDiscount,
          total,
          paidAmount: receiptDataForBT?.paid ?? (paymentMethod === "CASH" ? paidAmount : null),
          items: cart.map((c) => ({ name: c.name, qty: c.qty, price: c.price, notes: c.notes || "" })),
          qrText: receiptSettings.qrText || "",
          showQR: receiptSettings.showQR ?? false,
        };
        const NativePrinter = await import("@/lib/native-printer");
        if (NativePrinter.isNative()) {
          const status = await NativePrinter.isConnected();
          if (!status.connected) { await NativePrinter.autoReconnect(); }
          await NativePrinter.printReceipt(btData);
          toast.success("Struk berhasil dicetak!");
        } else {
          const WebBT = await import("@/lib/bluetooth-printer");
          if (!WebBT.isPrinterConnected()) { toast.error("Printer belum terkonek. Buka halaman Printer dulu."); hidePrinting(); return; }
          await WebBT.printReceipt(btData);
          toast.success("Struk berhasil dicetak!");
        }
      } catch (e: any) { toast.error("Gagal print: " + (e?.message || "")); } finally { hidePrinting(); }
      return;
    }

    // RawBT mode (default fallback)
    sendToRawBT(text);
    toast.success("Dikirim ke RawBT.");
  }

  async function findOpenOrderIdForTable(tNo: string) {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    const qy = query(
      ref,
      where("status", "==", "OPEN"),
      where("tableNo", "==", tNo),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    return snap.docs[0].id;
  }

  async function savePayLater() {
    setErr(null);

    try {
      if (!tenantId) return;
      if (cart.length === 0) return;

      const tNo = tableNo.trim();
      if (!tNo) {
        setShowTableWarning(true);
        return;
      }

      await doSavePayLater();
    } catch (e: any) {
      setErr(e?.message ?? "Gagal simpan order bayar nanti");
    }
  }

  async function doSavePayLater() {
    try {
      if (!tenantId) return;

      const tNo = tableNo.trim();

      let receiptOrderNo = editingOrderNo || "";

      if (editingOrderId) {
        await updateDoc(doc(db, `tenants/${tenantId}/orders/${editingOrderId}`), {
          tableNo: tNo,
          orderType,
          items: cart,
          subtotal,
          discount: totalDiscount,
          total,
          updatedAt: serverTimestamp(),
        });
      } else {
        const openId = await findOpenOrderIdForTable(tNo);

        if (!openId) {
          const orderNo = `OPEN-${Date.now()}`;
          receiptOrderNo = orderNo;
          await addDoc(collection(db, `tenants/${tenantId}/orders`), {
            orderNo,
            status: "OPEN" as OrderStatus,
            mode: "PAY_LATER" as OrderMode,
            orderType,
            tableNo: tNo,
            discount: totalDiscount,
            subtotal,
            total,
            items: cart,
            paymentMethod: null,
            paidAmount: null,
            staffName: activeStaff?.staffName || null,
            staffId: activeStaff?.staffId || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const refDoc = doc(db, `tenants/${tenantId}/orders/${openId}`);
          const snap = await getDoc(refDoc);
          const old = snap.exists() ? (snap.data() as any) : {};
          const oldItems: CartItem[] = Array.isArray(old.items) ? old.items : [];

          receiptOrderNo = (old.orderNo || openId).toString();

          const merged = [...oldItems, ...cart];
          const newSubtotal = merged.reduce((a, i) => a + i.price * i.qty, 0);
          const newDiscount = Number(old.discount || 0) + totalDiscount;
          const newTotal = Math.max(0, newSubtotal - newDiscount);

          await updateDoc(refDoc, {
            orderType,
            items: merged,
            subtotal: newSubtotal,
            discount: newDiscount,
            total: newTotal,
            updatedAt: serverTimestamp(),
          });
        }
      }

      const billNo = receiptOrderNo || `BILL-${Date.now()}`;
      const html = buildReceiptHtml(billNo, "BILL");
      localStorage.setItem("runix_last_receipt_html", html);

      const text = buildReceiptText(billNo, "BILL");

      setBillSuccessDialog({
        orderNo: billNo,
        html,
        text,
        btData: { title: "BILL", orderNo: billNo, payMethod: null, paid: null },
        wasEditing: !!editingOrderId,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Gagal simpan order bayar nanti");
    }
  }

  async function checkoutPayNow() {
    setErr(null);

    try {
      if (!tenantId) return;
      if (cart.length === 0) return;

      if (paymentMethod === "CASH" && paidAmount < total) {
        setErr("Uang dibayar kurang.");
        return;
      }

      if (!activeShift && !shiftAccessBlocked) {
        setErr("Buka shift dulu sebelum transaksi bayar sekarang.");
        return;
      }

      const orderNo = `TRX-${Date.now()}`;

      await addDoc(collection(db, `tenants/${tenantId}/orders`), {
        orderNo,
        status: "PAID" as OrderStatus,
        mode: "PAY_NOW" as OrderMode,
        orderType,
        tableNo: tableNo.trim() || null,
        paymentMethod,
        paidAmount: paymentMethod === "CASH" ? paidAmount : total,
        discount: totalDiscount,
        subtotal,
        total,
        items: cart,
        shiftId: activeShift?.id || null,
        shiftOpenedByEmail: activeShift?.openedByEmail || email || "",
        staffName: activeStaff?.staffName || null,
        staffId: activeStaff?.staffId || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paidAt: serverTimestamp(),
      });

      const html = buildReceiptHtml(orderNo, "STRUK");
      localStorage.setItem("runix_last_receipt_html", html);

      const text = buildReceiptText(orderNo, "STRUK");

      const change = paymentMethod === "CASH" ? Math.max(0, paidAmount - total) : 0;

      const btData = {
        title: "STRUK",
        orderNo,
        payMethod: paymentMethod,
        paid: paymentMethod === "CASH" ? paidAmount : total,
      };

      logAudit(tenantId!, {
        action: "ORDER_PAID",
        userEmail: email || "",
        description: `Order ${orderNo} dibayar ${paymentMethod} (Rp ${total.toLocaleString("id-ID")})${activeStaff ? ` oleh ${activeStaff.staffName}` : ""}`,
        metadata: { orderNo, paymentMethod, total, itemCount: cart.length, staffName: activeStaff?.staffName || null },
      });

      setSuccessDialog({ orderNo, change, html, text, btData });
      setPayOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? "Gagal checkout");
    }
  }

  function handleSuccessPrint() {
    if (!successDialog) return;
    void printBySelectedMode(successDialog.html, successDialog.text, successDialog.btData);
    setSuccessDialog(null);
    resetCart();
  }

  function handleSuccessSkip() {
    setSuccessDialog(null);
    resetCart();
  }

  function handleBillPrint() {
    if (!billSuccessDialog) return;
    const wasEditing = billSuccessDialog.wasEditing;
    void printBySelectedMode(billSuccessDialog.html, billSuccessDialog.text, billSuccessDialog.btData);
    setBillSuccessDialog(null);
    resetCart();
    if (wasEditing) {
      r.replace("/pos");
      setActiveTab("ORDERS");
    }
  }

  function handleBillSkip() {
    if (!billSuccessDialog) return;
    const wasEditing = billSuccessDialog.wasEditing;
    setBillSuccessDialog(null);
    resetCart();
    if (wasEditing) {
      r.replace("/pos");
      setActiveTab("ORDERS");
    }
  }

  if (loading || loadingRole) {
    return (
      <TerraPage>
        <SkeletonStyles />
        <PageSkeleton cards={3} />
      </TerraPage>
    );
  }

  if (!canUse) {
    return (
      <TerraPage>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">POS hanya untuk owner/admin.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/dashboard")}>
            Kembali
          </button>
        </div>
      </TerraPage>
    );
  }

  // Staff PIN Lock Screen - tampil jika staff system aktif tapi belum ada yang login
  if (isLocked) {
    return (
      <StaffPinLock
        staffAccounts={staffAccounts}
        onLogin={loginStaff}
        error={staffError}
      />
    );
  }

  return (
    <TerraPage maxWidth={10000} noPadding={true}>
      <style>{`
        .pos-grid{
          display:grid;
          grid-template-columns: 1fr 380px;
          gap:18px;
          align-items:start;
          max-width:100%;
        }
        @media (max-width: 1080px){ .pos-grid{ grid-template-columns: 1fr 340px; } }
        @media (max-width: 980px){
          .pos-grid{ grid-template-columns: 1fr !important; padding-bottom:90px; }
          .pos-grid > .card{ min-width:0; overflow:hidden; }
        }
        .product-grid{
          margin-top:16px;
          display:grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap:14px;
        }
        @media (max-width: 640px){
          .product-grid{ grid-template-columns: repeat(2, 1fr); gap:10px; }
          .product-btn{ padding:12px; }
          .product-name{ font-size:13px; }
          .product-meta{ font-size:11px; margin-top:2px; }
          .product-price{ margin-top:6px; font-size:13px; }
        }
        .product-btn{
          position:relative;
          text-align:left;
          padding:16px;
          border-radius:18px;
          border:1px solid var(--border);
          background: linear-gradient(145deg, var(--panel), var(--input-bg));
          cursor:pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          touch-action: manipulation;
          overflow:hidden;
          word-break:break-word;
          box-shadow: 0 2px 8px rgba(0,0,0,0.03);
        }
        .product-btn:hover{
          transform: translateY(-4px);
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 12px 28px rgba(154, 0, 2, 0.12);
        }
        .product-btn:active{
          transform: scale(0.96);
        }
        .product-name{ font-weight:800; font-size:15px; line-height:1.3; color: var(--text); letter-spacing:-0.2px; }
        .product-meta{ font-size:12px; color: var(--muted); margin-top:4px; font-weight:500; }
        .product-price{ margin-top:12px; font-weight:900; color: var(--brand); font-size:16px; font-family: var(--font-mono); display:flex; align-items:center; justify-content:space-between; }
        .product-price::after{ content:'+'; display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--brandSoft); color:var(--brand); font-size:14px; font-weight:900; }
        .cart-item{
          padding:14px 0;
          border-bottom:1px solid var(--border);
          transition: background 0.15s ease;
        }
        .cart-item:last-child{ border-bottom:none; }
        .topnav{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          align-items:center;
        }
        @media (max-width: 768px){
          .topnav{ gap:6px; }
          .topnav .btn{ padding:8px 10px; font-size:12px; }
        }
        .modebar{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:12px;
        }
        .note-box{
          margin-top:8px;
          padding:12px;
          border:1px dashed var(--border);
          border-radius: var(--radius-sm);
          background: var(--brandSoft);
        }
        .pos-categories{
          display:flex;
          gap:8px;
          margin-top:14px;
          overflow-x:auto;
          padding-bottom:6px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .pos-categories::-webkit-scrollbar{ display:none; }
        .pos-categories .btn{
          flex-shrink:0;
          border-radius:999px;
          padding:8px 18px;
          font-weight:700;
          transition: all 0.2s ease;
        }
        .cart-summary{
          margin-top:14px;
          padding-top:14px;
          border-top:1px solid var(--border);
          display:grid;
          gap:8px;
        }
        .cart-total-row{
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        .cart-total-value{
          font-size:20px;
          font-weight:900;
          color:var(--brand);
          font-family: var(--font-mono);
        }
        @media (max-width: 980px){
          .pos-cart-mobile{
            position:sticky;
            bottom:0;
            z-index:10;
          }
          .pos-cart-desktop{ display:none !important; }
        }
        @media (min-width: 981px){
          .pos-mobile-bar{ display:none !important; }
          .pos-mobile-sheet{ display:none !important; }
        }
        .pos-mobile-bar{
          position:fixed;bottom:16px;left:16px;right:16px;z-index:40;
          padding:14px 18px;
          background:var(--brand,#d59567);
          color:#fff;
          display:flex;align-items:center;gap:12px;
          cursor:pointer;
          border-radius:16px;
          box-shadow:0 4px 24px rgba(0,0,0,0.2);
          transition:transform 0.2s ease;
          touch-action:manipulation;
        }
        .pos-mobile-bar:active{transform:scale(0.98);}
        .pos-mobile-bar-badge{
          width:28px;height:28px;border-radius:50%;
          background:rgba(255,255,255,0.25);
          display:grid;place-items:center;
          font-weight:900;font-size:14px;
        }
        .pos-mobile-bar-text{flex:1;font-weight:700;font-size:14px;}
        .pos-mobile-bar-total{font-weight:900;font-size:16px;font-family:var(--font-mono);}
        .pos-mobile-sheet-overlay{
          position:fixed;inset:0;z-index:45;
          background:rgba(0,0,0,0.5);
          animation:fadeIn 0.2s ease;
        }
        @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
        @keyframes slideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
        .pos-mobile-sheet{
          position:fixed;bottom:0;left:0;right:0;z-index:46;
          background:var(--panel);
          border-radius:20px 20px 0 0;
          max-height:85vh;
          overflow-y:auto;
          padding:20px 16px 32px;
          animation:slideUp 0.25s ease;
          box-shadow:0 -8px 30px rgba(0,0,0,0.2);
        }
        .pos-mobile-sheet-handle{
          width:40px;height:4px;border-radius:2px;
          background:var(--border);margin:0 auto 16px;
        }
        .pos-mobile-sheet .cart-item{
          padding:12px 0;border-bottom:1px solid var(--border);
        }
        .pos-mobile-sheet .cart-item:last-child{border-bottom:none;}

        /* Payment popup: desktop modal vs mobile bottom sheet */
        .pos-pay-desktop{ display:grid; }
        .pos-pay-mobile-overlay{ display:none; }
        .pos-pay-mobile{ display:none !important; }
        @media (max-width: 980px){
          .pos-pay-desktop{ display:none !important; }
          .pos-pay-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:50;
            background:rgba(0,0,0,0.5);
            animation:fadeIn 0.2s ease;
          }
          .pos-pay-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:51;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 32px;
            animation:slideUp 0.25s ease;
            box-shadow:0 -8px 30px rgba(0,0,0,0.2);
          }
          .pos-pay-mobile .pay-method-btn{
            flex:1;min-height:50px;justify-content:center;
            font-size:16px;font-weight:800;letter-spacing:0.3px;
          }
          .pos-pay-mobile .pay-nom-grid{
            display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;
          }
          .pos-pay-mobile .pay-nom-grid .btn{
            padding:8px 10px;font-size:12px;font-weight:500;
            font-family:var(--font-mono);letter-spacing:-0.3px;
          }
        }

        /* Bill success popup: desktop modal vs mobile bottom sheet */
        .bill-success-desktop{ display:grid; }
        .bill-success-mobile-overlay{ display:none; }
        .bill-success-mobile{ display:none !important; }

        /* Table warning modal: desktop vs mobile */
        .table-warn-desktop{ display:grid; }
        .table-warn-mobile-overlay{ display:none; }
        .table-warn-mobile{ display:none !important; }

        /* Shift prompt modal (POS): desktop vs mobile */
        .pos-shift-desktop{ display:grid; }
        .pos-shift-mobile-overlay{ display:none; }
        .pos-shift-mobile{ display:none !important; }

        /* Success dialog (Pay Now): desktop vs mobile */
        .pos-success-desktop{ display:grid; }
        .pos-success-mobile-overlay{ display:none; }
        .pos-success-mobile{ display:none !important; }

        @media (max-width: 980px){
          .bill-success-desktop{ display:none !important; }
          .bill-success-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:90;
            background:rgba(0,0,0,0.6);
            animation:fadeIn 0.2s ease;
          }
          .bill-success-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:91;
            background:var(--panel);
            border-radius:24px 24px 0 0;
            padding:20px 20px 40px;
            animation:slideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }

          /* Table warning mobile bottom sheet */
          .table-warn-desktop{ display:none !important; }
          .table-warn-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:80;
            background:rgba(0,0,0,0.55);
            animation:fadeIn 0.2s ease;
          }
          .table-warn-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:81;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            padding:20px 16px 40px;
            animation:slideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }

          /* Shift prompt (POS) mobile bottom sheet */
          .pos-shift-desktop{ display:none !important; }
          .pos-shift-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:70;
            background:rgba(0,0,0,0.55);
            animation:fadeIn 0.2s ease;
          }
          .pos-shift-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:71;
            background:var(--panel);
            border-radius:20px 20px 0 0;
            max-height:85vh;
            overflow-y:auto;
            padding:20px 16px 40px;
            animation:slideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }

          /* Success dialog (Pay Now) mobile bottom sheet */
          .pos-success-desktop{ display:none !important; }
          .pos-success-mobile-overlay{
            display:block;
            position:fixed;inset:0;z-index:90;
            background:rgba(0,0,0,0.6);
            animation:fadeIn 0.2s ease;
          }
          .pos-success-mobile{
            display:block !important;
            position:fixed;bottom:0;left:0;right:0;z-index:91;
            background:var(--panel);
            border-radius:24px 24px 0 0;
            padding:20px 20px 40px;
            animation:slideUp 0.25s ease;
            box-shadow:0 -12px 40px rgba(0,0,0,0.25);
          }
        }
      `}</style>

      <style>{`
        /* ===== 100% FULL WIDTH POS SIDEBAR LAYOUT ===== */
        .pos-root-container {
          display: flex;
          gap: 16px;
          height: 100vh;
          width: 100vw;
          max-width: 100%;
          overflow: hidden;
          padding: 12px;
          box-sizing: border-box;
        }

        /* 1. Left Vertical Dock (Expandable / Collapsible via Logo Click with Smooth Animations) */
        .pos-sidebar-dock {
          width: 220px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          padding: 20px 14px;
          gap: 8px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.03);
          flex-shrink: 0;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pos-sidebar-dock.collapsed {
          width: 72px;
          padding: 20px 10px;
          align-items: center;
        }
        .pos-sidebar-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          padding-bottom: 12px;
          margin-bottom: 4px;
          border-bottom: 1px solid var(--border);
          width: 100%;
          cursor: pointer;
          user-select: none;
          position: relative;
          height: 38px;
          border-radius: 12px;
          transition: background 0.2s ease;
        }
        .pos-sidebar-brand:hover {
          background: var(--brandSoft);
        }
        .pos-sidebar-logo-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }
        .pos-sidebar-logo-img {
          position: absolute;
          object-fit: contain;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pos-sidebar-logo-img.full {
          height: 26px;
          width: auto;
          opacity: 1;
          transform: scale(1) rotate(0deg);
        }
        .pos-sidebar-dock.collapsed .pos-sidebar-logo-img.full {
          opacity: 0;
          transform: scale(0.6) rotate(-10deg);
          pointer-events: none;
        }
        .pos-sidebar-logo-img.favicon {
          height: 28px;
          width: 28px;
          opacity: 0;
          transform: scale(0.6) rotate(10deg);
          pointer-events: none;
        }
        .pos-sidebar-dock.collapsed .pos-sidebar-logo-img.favicon {
          opacity: 1;
          transform: scale(1) rotate(0deg);
          pointer-events: auto;
        }
        .pos-dock-btn-full {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text);
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          white-space: nowrap;
          overflow: hidden;
          position: relative;
        }
        .pos-sidebar-dock.collapsed .pos-dock-btn-full {
          padding: 12px;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: 14px;
        }
        .pos-dock-btn-label {
          display: inline-block;
        }
        .pos-sidebar-dock.collapsed .pos-dock-btn-label {
          display: none;
        }
        .pos-dock-btn-full:hover {
          background: var(--brandSoft);
          color: var(--brand);
        }
        .pos-dock-btn-full.active {
          background: var(--brand);
          color: #fff;
          border-color: var(--brand);
          box-shadow: 0 6px 18px rgba(154, 0, 2, 0.22);
        }
        .pos-dock-svg-icon {
          width: 20px;
          height: 20px;
          flex-shrink: 0;
        }

        /* 2. Middle Main Catalog Section & Modern Segmented Filter Dock */
        .pos-catalog-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
          overflow-y: auto;
          padding-right: 4px;
        }
        .pos-top-searchbar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .pos-search-wrap-v2 {
          position: relative;
          width: 100%;
          display: flex;
          align-items: center;
        }
        .pos-search-input-v2 {
          width: 100%;
          border-radius: 18px;
          padding: 10px 16px 10px 42px;
          font-size: 13px;
          font-weight: 600;
          border: 1px solid var(--border);
          background: var(--brandSoft);
          color: var(--text);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pos-search-input-v2:focus {
          outline: none;
          background: var(--panel);
          border-color: var(--brand);
          box-shadow: 0 0 0 3.5px rgba(154, 0, 2, 0.12);
        }
        .pos-search-icon-v2 {
          position: absolute;
          left: 14px;
          width: 16px;
          height: 16px;
          color: var(--muted);
          pointer-events: none;
        }
        .pos-cat-pill-container {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--brandSoft);
          padding: 5px;
          border-radius: 20px;
          border: 1px solid var(--border);
          overflow-x: auto;
          scrollbar-width: none;
        }
        .pos-cat-pill-container::-webkit-scrollbar { display: none; }
        .pos-cat-pill {
          padding: 8px 18px;
          border-radius: 15px;
          border: none;
          background: transparent;
          color: var(--muted);
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .pos-cat-pill:hover {
          color: var(--text);
        }
        .pos-cat-pill.active {
          background: var(--panel);
          color: var(--brand);
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        .pos-product-grid-v3 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        @media (max-width: 1200px) {
          .pos-product-grid-v3 {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (max-width: 768px) {
          .pos-product-grid-v3 {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .pos-card-v3 {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
          box-shadow: 0 2px 10px rgba(0,0,0,0.02);
          position: relative;
          overflow: hidden;
        }
        .pos-card-v3:hover {
          transform: translateY(-5px);
          border-color: var(--brand);
          box-shadow: 0 12px 30px rgba(154, 0, 2, 0.12);
        }
        .pos-card-v3:active { transform: scale(0.97); }
        .pos-card-img-wrap {
          position: relative;
          width: 100%;
          height: 140px;
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 12px;
          background: var(--input-bg);
        }
        .pos-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }
        .pos-card-v3:hover .pos-card-img {
          transform: scale(1.05);
        }
        .pos-card-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(0,0,0,0.65);
          backdrop-filter: blur(8px);
          color: #fff;
          font-size: 10px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          letter-spacing: 0.3px;
        }
        .pos-card-add-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--brand);
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 16px;
          font-weight: 900;
          box-shadow: 0 4px 12px rgba(154, 0, 2, 0.3);
          transition: transform 0.2s ease, background 0.2s ease;
        }
        .pos-card-v3:hover .pos-card-add-btn {
          transform: scale(1.12);
        }

        /* 3. Right Floating Receipt Panel (Gaya Minimalist Floating Receipt Glass) */
        .pos-receipt-panel {
          width: 410px;
          background: var(--panel);
          color: var(--text);
          border: 1.5px solid var(--border);
          border-radius: 28px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 16px 50px rgba(0,0,0,0.06);
          flex-shrink: 0;
          height: 100%;
        }
        .pos-receipt-list {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .pos-cart-card {
          background: var(--panel);
          border: 1.5px solid var(--border);
          border-radius: 20px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.02);
          transition: all 0.2s ease;
        }
        .pos-cart-card:hover {
          border-color: var(--brand);
          box-shadow: 0 6px 20px rgba(154, 0, 2, 0.08);
          transform: translateY(-2px);
        }
        .pos-cart-total-banner {
          background: linear-gradient(135deg, var(--brand), #780002);
          color: #FFFFFF;
          border-radius: 24px;
          padding: 22px;
          margin-top: 16px;
          box-shadow: 0 12px 35px rgba(154, 0, 2, 0.3);
        }

        @media (max-width: 1024px) {
          .pos-root-container { flex-direction: column; height: auto; overflow: visible; }
          .pos-sidebar-dock { width: 100%; height: auto; flex-direction: row; justify-content: space-between; border-radius: 20px; flex-wrap: wrap; }
          .pos-receipt-panel { width: 100%; height: auto; }
        }
      `}</style>

      <div className="pos-root-container">
        {/* 1. EXPANDABLE / COLLAPSIBLE SIDEBAR DOCK (CLICK LOGO TO TOGGLE) */}
        <div className={`pos-sidebar-dock ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div
            className="pos-sidebar-brand"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? "Klik logo untuk memperbesar sidebar" : "Klik logo untuk memperkecil sidebar"}
          >
            <div className="pos-sidebar-logo-wrap">
              <img src="/logo-header.png" alt="RuniX POS" className="pos-sidebar-logo-img full" />
              <img src="/favicon.png" alt="RuniX POS" className="pos-sidebar-logo-img favicon" />
            </div>
          </div>

          {/* Nav 1: Kasir POS */}
          <button
            className={`pos-dock-btn-full ${activeTab === "POS" ? "active" : ""}`}
            onClick={() => setActiveTab("POS")}
            title="Kasir POS"
          >
            <svg className="pos-dock-svg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="pos-dock-btn-label">Kasir POS</span>
          </button>

          <div style={{ width: sidebarCollapsed ? "80%" : "100%", height: 1, background: "var(--border)", opacity: 0.7, margin: "1px 0", transition: "width 0.3s ease" }} />

          {/* Nav 2: Daftar Pesanan */}
          <button
            className={`pos-dock-btn-full ${activeTab === "ORDERS" ? "active" : ""}`}
            onClick={() => setActiveTab("ORDERS")}
            title="Daftar Pesanan"
          >
            <svg className="pos-dock-svg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <span className="pos-dock-btn-label">Daftar Pesanan</span>
          </button>

          <div style={{ width: sidebarCollapsed ? "80%" : "100%", height: 1, background: "var(--border)", opacity: 0.7, margin: "1px 0", transition: "width 0.3s ease" }} />

          {/* Nav 3: Shift Kasir */}
          <button
            className={`pos-dock-btn-full ${activeTab === "SHIFTS" ? "active" : ""}`}
            onClick={() => setActiveTab("SHIFTS")}
            title="Shift Kasir"
          >
            <svg className="pos-dock-svg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="pos-dock-btn-label">Shift Kasir</span>
          </button>

          <div style={{ flex: 1 }} />

          <button
            className="pos-dock-btn-full"
            onClick={() => r.push("/dashboard")}
            title="Dashboard"
            style={{
              background: "rgba(59, 130, 246, 0.12)",
              color: "#2563EB",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            <svg className="pos-dock-svg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="pos-dock-btn-label">Dashboard</span>
          </button>

          {isDev && (
            <button
              className="pos-dock-btn-full"
              onClick={() => r.push("/dev")}
              title="Dev Console"
              style={{
                background: "rgba(168, 85, 247, 0.12)",
                color: "#9333EA",
                border: "1px solid rgba(168, 85, 247, 0.25)",
                fontWeight: 800,
                marginBottom: 4,
              }}
            >
              <svg className="pos-dock-svg-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="pos-dock-btn-label">Dev Console</span>
            </button>
          )}

          {/* End of sidebar bottom dock */}
        </div>

        {/* 2. TAB CONTENT VIEW (POS vs ORDERS vs SHIFTS) */}
        {activeTab === "POS" ? (
          <>
            {/* KATALOG UTAMA */}
            <div className="pos-catalog-section">
              {/* Header Bar: Search */}
              <div className="pos-top-searchbar">
                <div className="pos-search-wrap-v2">
                  <svg className="pos-search-icon-v2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    ref={searchRef}
                    className="pos-search-input-v2"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama menu / makanan / minuman..."
                  />
                </div>
              </div>

              {/* Kategori Filter Pills */}
              <div className="pos-cat-pill-container">
                {categories.map((c) => (
                  <button
                    key={c}
                    className={"pos-cat-pill " + (activeCat === c ? "active" : "")}
                    onClick={() => setActiveCat(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Produk Grid 4 Kolom (atau Card Terkunci jika Shift Belum Dibuka) */}
              {!activeShift && !shiftAccessBlocked ? (
                <div
                  style={{
                    background: "var(--brandSoft)",
                    border: "2px dashed var(--border)",
                    borderRadius: 24,
                    padding: "60px 24px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 16,
                    margin: "20px 0",
                  }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 999,
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#d97706",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 32,
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                    }}
                  >
                    🔒
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>Shift Belum Dibuka</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, maxWidth: 400, lineHeight: 1.6 }}>
                      Katalog menu kasir terkunci. Buka shift kasir terlebih dahulu pada tab <b>Shift Kasir</b> agar pencatatan transaksi tercatat secara akurat.
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "12px 24px", fontSize: 14, fontWeight: 800, borderRadius: 14 }}
                    onClick={() => setActiveTab("SHIFTS")}
                  >
                    ⚡ Buka Shift Kasir Sekarang
                  </button>
                </div>
              ) : (
                <>
                  <div className="pos-product-grid-v3">
                    {filtered.map((p) => (
                      <div
                        key={p.id}
                        className="pos-card-v3"
                        onClick={() => addToCart(p)}
                      >
                        <div className="pos-card-img-wrap">
                          <img
                            src={p.imageUrl || "/favicon.png"}
                            alt={p.name}
                            className="pos-card-img"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/favicon.png";
                            }}
                          />
                          <span className="pos-card-badge">{p.category}</span>
                        </div>

                        <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)", lineHeight: 1.3, marginBottom: 8 }}>
                          {p.name}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                          <span style={{ fontWeight: 900, color: "var(--brand)", fontSize: 16, fontFamily: "var(--font-mono)" }}>
                            Rp {rupiah(p.price)}
                          </span>
                          <div className="pos-card-add-btn">+</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {filtered.length === 0 && <div className="small" style={{ textAlign: "center", padding: 40 }}>Menu tidak ditemukan.</div>}
                </>
              )}
            </div>

            {/* 3. STRUK KASIR (GAYA MINIMALIST FLOATING RECEIPT GLASS) */}
            <div className="pos-receipt-panel pos-cart-desktop">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1.5px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)" }}>Struk Tagihan</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{cart.length} Jenis item dipilih</div>
                </div>
                <button className="btn btn-ghost" onClick={resetCart} style={{ color: "var(--danger)", fontSize: 12, fontWeight: 800, padding: "4px 8px" }}>Kosongkan</button>
              </div>

              <div className="pos-receipt-list">
                {cart.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "50px 10px", color: "var(--muted)" }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>Belum Ada Pesanan</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Klik pada menu makanan / minuman di katalog sebelah kiri</div>
                  </div>
                ) : (
                  cart.map((i, index) => (
                    <div key={`${i.id}-${index}`} className="pos-cart-card">
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--text)", lineHeight: 1.3 }}>{i.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Rp {rupiah(i.price)}</div>
                        </div>
                        <span style={{ fontWeight: 900, fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--text)" }}>
                          Rp {rupiah(i.price * i.qty)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                        <button className="btn btn-ghost" style={{ padding: 0, fontSize: 11, color: "var(--muted)", fontWeight: 700 }} onClick={() => openNoteEditor(index)}>
                          {(i.notes || "").trim() ? `Catatan: ${i.notes}` : "+ Tambah Catatan"}
                        </button>

                        {/* Quantity Controls */}
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--brandSoft)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 6px" }}>
                          <button
                            className="btn btn-ghost"
                            style={{ width: 26, height: 26, minHeight: 0, padding: 0, fontSize: 15, fontWeight: 900, borderRadius: "50%", background: "var(--panel)", color: "var(--brand)" }}
                            onClick={() => dec(index)}
                            title="Kurangi"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            className="input"
                            style={{ width: 38, height: 26, textAlign: "center", padding: "0 2px", fontSize: 13, fontWeight: 800, fontFamily: "var(--font-mono)", border: "none", background: "transparent" }}
                            value={i.qty}
                            min={1}
                            onChange={(e) => updateQty(index, parseInt(e.target.value) || 0)}
                          />
                          <button
                            className="btn btn-ghost"
                            style={{ width: 26, height: 26, minHeight: 0, padding: 0, fontSize: 15, fontWeight: 900, borderRadius: "50%", background: "var(--brand)", color: "#fff" }}
                            onClick={() => inc(index)}
                            title="Tambah"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {noteOpenId === String(index) && (
                        <div className="note-box" style={{ width: "100%", marginTop: 6, padding: 10 }}>
                          <textarea
                            className="input"
                            style={{ minHeight: 50, fontSize: 12, padding: 8, borderRadius: 10 }}
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Contoh: Tanpa gula, pedas sedang..."
                          />
                          <div className="row" style={{ marginTop: 6, gap: 6 }}>
                            <button className="btn btn-primary" onClick={() => saveNote(index)} style={{ fontSize: 11, padding: "4px 10px" }}>Simpan</button>
                            <button className="btn" onClick={() => clearNote(index)} style={{ fontSize: 11, padding: "4px 10px" }}>Hapus</button>
                            <button className="btn" onClick={() => { setNoteOpenId(null); setNoteDraft(""); }} style={{ fontSize: 11, padding: "4px 10px" }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>Subtotal</span>
                  <b style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>Rp {rupiah(subtotal)}</b>
                </div>

                <div className="row" style={{ justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
                  <span style={{ color: "var(--muted)", fontWeight: 600 }}>Diskon</span>
                  {canUsePromos() ? (
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className={"btn " + (discountType === "nominal" ? "btn-primary" : "")}
                        style={{ padding: "2px 8px", fontSize: 11, borderRadius: 8 }}
                        onClick={() => setDiscountType("nominal")}
                      >
                        Rp
                      </button>
                      <button
                        className={"btn " + (discountType === "persen" ? "btn-primary" : "")}
                        style={{ padding: "2px 8px", fontSize: 11, borderRadius: 8 }}
                        onClick={() => setDiscountType("persen")}
                      >
                        %
                      </button>
                      <input
                        className="input"
                        style={{ width: 80, textAlign: "right", padding: "4px 8px", fontSize: 12, borderRadius: 8 }}
                        type="number"
                        value={discount}
                        onChange={(e) => setDiscount(Number(e.target.value || 0))}
                      />
                    </div>
                  ) : (
                    <span className="small" style={{ color: "var(--muted)" }}>Core+</span>
                  )}
                </div>

                {canUsePromos() && appliedPromo && promoDiscountAmount > 0 && (
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--brand)", fontWeight: 700 }}>
                    <span>Promo ({appliedPromo.name})</span>
                    <b style={{ fontFamily: "var(--font-mono)" }}>- Rp {rupiah(promoDiscountAmount)}</b>
                  </div>
                )}

                <div className="pos-cart-total-banner">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", fontWeight: 800, letterSpacing: 0.5 }}>Total Final</div>
                      <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "var(--font-mono)", color: "#FFFFFF", marginTop: 2, letterSpacing: -0.5 }}>
                        Rp {rupiah(total)}
                      </div>
                    </div>
                    <div style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.2)", color: "#FFFFFF", fontSize: 12, fontWeight: 900, backdropFilter: "blur(4px)" }}>
                      {cart.reduce((a, b) => a + b.qty, 0)} Items
                    </div>
                  </div>

                  <button
                    className="btn"
                    style={{ width: "100%", marginTop: 16, padding: "14px 20px", borderRadius: 16, fontSize: 15, fontWeight: 900, background: "#FFFFFF", color: "#9A0002", border: "none", boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }}
                    disabled={cart.length === 0}
                    onClick={() => { setPayOpen(true); setPaidAmount(0); setPaymentMethod("CASH"); }}
                  >
                    PROSES TRANSAKSI
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === "ORDERS" ? (
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0, paddingRight: 4 }}>
            <OrdersContent />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0, paddingRight: 4 }}>
            <ShiftsContent />
          </div>
        )}
      </div>
      {cart.length > 0 && !mobileCartOpen && !payOpen && !successDialog && !billSuccessDialog && (
        <div className="pos-mobile-bar" onClick={() => setMobileCartOpen(true)}>
          <div className="pos-mobile-bar-badge">{cart.reduce((a, i) => a + i.qty, 0)}</div>
          <div className="pos-mobile-bar-text">Lihat Keranjang</div>
          <div className="pos-mobile-bar-total">Rp {rupiah(total)}</div>
        </div>
      )}

      {/* MOBILE CART BOTTOM SHEET */}
      {mobileCartOpen && (
        <>
          <div className="pos-mobile-sheet-overlay" onClick={() => setMobileCartOpen(false)} />
          <div className="pos-mobile-sheet">
            <div className="pos-mobile-sheet-handle" />
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="h1">Keranjang</div>
              <div className="spacer" />
              <button className="btn" onClick={resetCart}>Reset</button>
              <button className="btn" onClick={() => setMobileCartOpen(false)} style={{ marginLeft: 6 }}>Tutup</button>
            </div>

            {cart.length === 0 ? (
              <div className="small">Keranjang kosong.</div>
            ) : (
              cart.map((i, index) => (
                <div key={`m-${i.id}-${index}`} className="cart-item">
                  <div className="row" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>{i.name}</div>
                      <div className="small">{i.category} • Rp {rupiah(i.price)}</div>
                      {(i.notes || "").trim() && (
                        <div className="small" style={{ marginTop: 4 }}>Catatan: <b>{i.notes}</b></div>
                      )}
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => dec(index)}>-</button>
                      <b style={{ minWidth: 24, textAlign: "center" }}>{i.qty}</b>
                      <button className="btn" style={{ padding: "6px 10px" }} onClick={() => inc(index)}>+</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <button className="btn" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => openNoteEditor(index)}>
                      {(i.notes || "").trim() ? "Edit Catatan" : "+ Catatan"}
                    </button>
                  </div>
                  {noteOpenId === String(index) && (
                    <div className="note-box">
                      <textarea
                        className="input"
                        style={{ minHeight: 60 }}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Catatan pesanan..."
                      />
                      <div className="row" style={{ marginTop: 8, gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => saveNote(index)}>Simpan</button>
                        <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => clearNote(index)}>Hapus</button>
                        <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => { setNoteOpenId(null); setNoteDraft(""); }}>Batal</button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {cart.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="small">Subtotal</span>
                  <b>Rp {rupiah(subtotal)}</b>
                </div>

                <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                  <span className="small">Diskon</span>
                  {canUsePromos() ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button className={"btn " + (discountType === "nominal" ? "btn-primary" : "")} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setDiscountType("nominal")}>Rp</button>
                    <button className={"btn " + (discountType === "persen" ? "btn-primary" : "")} style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => setDiscountType("persen")}>%</button>
                    <input className="input" style={{ width: 80, textAlign: "right" }} type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value || 0))} />
                  </div>
                  ) : (
                  <span className="small" style={{ color: "var(--muted)" }}>Core+</span>
                  )}
                </div>

                {canUsePromos() && appliedPromo && promoDiscountAmount > 0 && (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand)" }}>Promo: {appliedPromo.name}</span>
                      <b style={{ fontSize: 13, color: "var(--brand)" }}>- Rp {rupiah(promoDiscountAmount)}</b>
                    </div>
                  </div>
                )}

                {canUsePromos() && !redeemedCode && (
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    <input className="input" style={{ flex: 1, textTransform: "uppercase" }} value={promoCodeInput} onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())} placeholder="Kode promo..." />
                    <button className="btn btn-primary" style={{ padding: "10px 14px", fontSize: 12 }} onClick={() => { const code = promoCodeInput.trim().toUpperCase(); if (!code) return; const found = promos.find((p) => p.code === code); if (!found) { toast.error("Kode promo tidak ditemukan"); return; } setRedeemedCode(code); toast.success(`Kode "${code}" berhasil dipakai!`); }}>Pakai</button>
                  </div>
                )}

                <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
                  <b>Total</b>
                  <b style={{ color: "var(--brand)", fontSize: 18, fontFamily: "var(--font-mono)" }}>Rp {rupiah(total)}</b>
                </div>

                {mode === "PAY_NOW" ? (
                  <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 15, fontWeight: 800 }} disabled={cart.length === 0} onClick={() => { setMobileCartOpen(false); setPayOpen(true); setPaidAmount(0); setPaymentMethod("CASH"); }}>
                    Bayar Sekarang
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 15, fontWeight: 800 }} disabled={cart.length === 0} onClick={() => { setMobileCartOpen(false); savePayLater(); }}>
                    Simpan Order (Bayar Nanti)
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* DIALOG PEMBAYARAN PREMIUM (WIDE FORMAT 2-KOLOM) */}
      {payOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 20, zIndex: 99999 }}>
          <div className="card" style={{ width: "100%", maxWidth: 680, borderRadius: 28, padding: 30, background: "var(--panel)", border: "1.5px solid var(--border)", boxShadow: "0 30px 80px rgba(0,0,0,0.3)", animation: "slideUp 0.25s ease-out" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1.5px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "var(--text)" }}>Proses Transaksi Kasir</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>Lengkapi detail tipe transaksi, meja, dan metode pembayaran</div>
              </div>
              <button className="btn btn-ghost" onClick={() => setPayOpen(false)} style={{ fontSize: 13, fontWeight: 800, padding: "8px 16px", borderRadius: 12 }}>Tutup Modal</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 20 }}>
              {/* Kolom Kiri: Tipe Order & Detail Meja */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>1. Tipe Pembayaran</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "var(--input-bg)", padding: 5, borderRadius: 16, border: "1px solid var(--border)" }}>
                    <button
                      className={"btn " + (mode === "PAY_NOW" ? "btn-primary" : "btn-ghost")}
                      style={{ borderRadius: 12, padding: "10px", fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => { setMode("PAY_NOW"); setErr(null); }}
                    >
                      Direct Pay
                    </button>
                    <button
                      className={"btn " + (mode === "PAY_LATER" ? "btn-primary" : "btn-ghost")}
                      style={{ borderRadius: 12, padding: "10px", fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => { setMode("PAY_LATER"); setErr(null); }}
                    >
                      Open Bill
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>2. Mode Order</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "var(--input-bg)", padding: 5, borderRadius: 16, border: "1px solid var(--border)" }}>
                    <button
                      className={"btn " + (orderType === "DINE_IN" ? "btn-primary" : "btn-ghost")}
                      style={{ borderRadius: 12, padding: "10px", fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => setOrderType("DINE_IN")}
                    >
                      🍽️ Dine In
                    </button>
                    <button
                      className={"btn " + (orderType === "TAKEAWAY" ? "btn-primary" : "btn-ghost")}
                      style={{ borderRadius: 12, padding: "10px", fontWeight: 900, fontSize: 13, justifyContent: "center" }}
                      onClick={() => setOrderType("TAKEAWAY")}
                    >
                      🥡 Takeaway
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    3. Nomor Meja {mode === "PAY_LATER" ? "(Wajib)" : "(Opsional)"}
                  </div>
                  <input
                    className="input"
                    style={{ borderRadius: 14, padding: "10px 14px", fontSize: 14, fontWeight: 800, fontFamily: "var(--font-mono)" }}
                    value={tableNo}
                    onChange={(e) => setTableNo(e.target.value)}
                    placeholder="Contoh: Meja 05"
                  />
                </div>

                {/* Box Ringkasan Bill */}
                <div style={{ background: "var(--brandSoft)", border: "1px solid var(--brand2)", borderRadius: 20, padding: 18, marginTop: "auto" }}>
                  <div style={{ fontSize: 11, color: "var(--brand)", textTransform: "uppercase", fontWeight: 900, letterSpacing: 0.5 }}>Total Tagihan Pesanan</div>
                  <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)", marginTop: 4, letterSpacing: -0.5 }}>
                    Rp {rupiah(total)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>
                    {cart.reduce((a, i) => a + i.qty, 0)} Item menu di dalam keranjang
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Pembayaran & Nominal Uang */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {mode === "PAY_NOW" ? (
                  <>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>3. Metode Pembayaran</div>
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
                            onClick={() => setPaidAmount(total)}
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
                          <b style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)", color: paidAmount >= total ? "#10B981" : "var(--text)" }}>
                            Rp {rupiah(Math.max(0, paidAmount - total))}
                          </b>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding: 20, borderRadius: 18, background: "var(--input-bg)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8, height: "100%", justifyContent: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>Mode Open Bill (Simpan Meja)</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                      Order ini akan disimpan atas nomor meja yang dipilih. Pelanggan dapat melakukan pembayaran di kemudian hari setelah selesai makan/minum.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {err && <div style={{ marginTop: 14, color: "var(--danger)", fontWeight: 800, fontSize: 13 }}>{err}</div>}

            {mode === "PAY_NOW" ? (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 22, padding: "16px 24px", borderRadius: 18, fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }}
                onClick={checkoutPayNow}
              >
                SELESAIKAN TRANSAKSI & PRINT STRUK
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: "100%", marginTop: 22, padding: "16px 24px", borderRadius: 18, fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }}
                onClick={async () => {
                  await savePayLater();
                  setPayOpen(false);
                }}
              >
                SIMPAN ORDER MEJA (OPEN BILL)
              </button>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT POPUP - MOBILE (bottom sheet) */}
      {payOpen && mode === "PAY_NOW" && (
        <>
          <div className="pos-pay-mobile-overlay" onClick={() => setPayOpen(false)} />
          <div className="pos-pay-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="h1">Pembayaran</div>
              <div className="spacer" />
              <button className="btn" onClick={() => setPayOpen(false)}>Tutup</button>
            </div>

            <div className="row" style={{ marginTop: 8, gap: 10 }}>
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

            <div className="row" style={{ justifyContent: "space-between", marginTop: 14 }}>
              <span className="small">Total</span>
              <b style={{ fontSize: 18 }}>Rp {rupiah(total)}</b>
            </div>

            {paymentMethod === "CASH" && (
              <>
                <div style={{ marginTop: 10 }}>
                  <div className="small">Uang dibayar</div>
                  <input className="input" style={{ fontSize: 16 }} type="number" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value || 0))} />
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
                    className="btn"
                    onClick={() => setPaidAmount(total)}
                  >
                    Uang Pas
                  </button>
                  <button
                    className="btn"
                    style={{ color: "var(--danger)" }}
                    onClick={() => setPaidAmount(0)}
                  >
                    Reset
                  </button>
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
                  <span className="small">Kembalian</span>
                  <b style={{ fontSize: 16 }}>Rp {rupiah(Math.max(0, paidAmount - total))}</b>
                </div>
              </>
            )}

            {err && <div style={{ marginTop: 10, color: "var(--danger)", fontWeight: 800 }}>{err}</div>}

            <button className="btn btn-primary" style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 15 }} onClick={checkoutPayNow}>
              Selesaikan & Print Struk
            </button>
          </div>
        </>
      )}

      {/* TABLE WARNING - DESKTOP */}
      {showTableWarning && (
        <div
          className="table-warn-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            placeItems: "center",
            padding: 16,
            zIndex: 80,
          }}
        >
          <div className="card" style={{ width: 420, maxWidth: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>&#9888;&#65039;</div>
            <div className="h1">No. Meja Belum Diisi</div>
            <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
              Mode Bayar Nanti wajib mengisi No. Meja atau nama pelanggan agar order bisa diidentifikasi.
            </div>

            <div className="row" style={{ marginTop: 16, justifyContent: "center", gap: 10 }}>
              <button className="btn btn-primary" onClick={() => { setShowTableWarning(false); }}>
                OK, Isi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE WARNING - MOBILE (bottom sheet) */}
      {showTableWarning && (
        <>
          <div className="table-warn-mobile-overlay" onClick={() => setShowTableWarning(false)} />
          <div className="table-warn-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 16px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>&#9888;&#65039;</div>
              <div className="h1" style={{ fontSize: 20 }}>No. Meja Belum Diisi</div>
              <div className="small" style={{ marginTop: 12, lineHeight: 1.7, fontSize: 14 }}>
                Mode Bayar Nanti wajib mengisi No. Meja atau nama pelanggan agar order bisa diidentifikasi.
              </div>

              <button className="btn btn-primary" style={{ width: "100%", marginTop: 18, padding: "14px 0", fontSize: 15, fontWeight: 800 }} onClick={() => { setShowTableWarning(false); }}>
                OK, Isi Sekarang
              </button>
            </div>
          </div>
        </>
      )}

      {/* End of table warning */}

      {/* SUCCESS DIALOG (PAY NOW) - DESKTOP */}
      {successDialog && (
        <div
          className="pos-success-desktop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            placeItems: "center",
            padding: 16,
            zIndex: 90,
          }}
        >
          <div className="card" style={{ width: 440, maxWidth: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 4 }}>&#10003;</div>
            <div className="h1" style={{ color: "var(--brand)" }}>Transaksi Berhasil</div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Pembayaran telah tercatat. Order <b>{successDialog.orderNo}</b> selesai.
            </div>

            {successDialog.change > 0 && (
              <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 12, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                <div className="small" style={{ fontWeight: 700 }}>Kembalian</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
                  Rp {rupiah(successDialog.change)}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
              Cetak struk untuk pelanggan?
            </div>

            <div className="row" style={{ marginTop: 12, justifyContent: "center", gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ padding: "12px 24px", fontSize: 14, fontWeight: 800 }}
                onClick={handleSuccessPrint}
              >
                Cetak Struk
              </button>
              <button
                className="btn"
                style={{ padding: "12px 24px", fontSize: 14 }}
                onClick={handleSuccessSkip}
              >
                Lewati
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS DIALOG (PAY NOW) - MOBILE (bottom sheet) */}
      {successDialog && (
        <>
          <div className="pos-success-mobile-overlay" />
          <div className="pos-success-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>&#10003;</div>
              <div className="h1" style={{ color: "var(--brand)", fontSize: 22 }}>Transaksi Berhasil</div>
              <div className="small" style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14 }}>
                Pembayaran telah tercatat. Order <b>{successDialog.orderNo}</b> selesai.
              </div>

              {successDialog.change > 0 && (
                <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "var(--brandSoft)", border: "1px solid var(--brand2)" }}>
                  <div className="small" style={{ fontWeight: 700 }}>Kembalian</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                    Rp {rupiah(successDialog.change)}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 20, fontSize: 14, color: "var(--muted)" }}>
                Cetak struk untuk pelanggan?
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <button className="btn btn-primary" style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800 }} onClick={handleSuccessPrint}>
                  Cetak Struk
                </button>
                <button className="btn" style={{ width: "100%", padding: "14px 0", fontSize: 15 }} onClick={handleSuccessSkip}>
                  Lewati
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* BILL SUCCESS - DESKTOP (centered modal) */}
      {billSuccessDialog && (
        <div className="bill-success-desktop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16, zIndex: 90 }}>
          <div className="card" style={{ width: 440, maxWidth: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 4 }}>&#10003;</div>
            <div className="h1" style={{ color: "var(--brand)" }}>Order Tersimpan</div>
            <div className="small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Order <b>{billSuccessDialog.orderNo}</b> berhasil disimpan sebagai open bill.
            </div>
            <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)" }}>
              Cetak bill untuk pelanggan?
            </div>
            <div className="row" style={{ marginTop: 12, justifyContent: "center", gap: 10 }}>
              <button className="btn btn-primary" style={{ padding: "12px 24px", fontSize: 14, fontWeight: 800 }} onClick={handleBillPrint}>
                Cetak Bill
              </button>
              <button className="btn" style={{ padding: "12px 24px", fontSize: 14 }} onClick={handleBillSkip}>
                Lewati
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BILL SUCCESS - MOBILE (bottom sheet) */}
      {billSuccessDialog && (
        <>
          <div className="bill-success-mobile-overlay" />
          <div className="bill-success-mobile">
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--border)", margin: "0 auto 20px" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>&#10003;</div>
              <div className="h1" style={{ color: "var(--brand)", fontSize: 22 }}>Order Tersimpan</div>
              <div className="small" style={{ marginTop: 10, lineHeight: 1.7, fontSize: 14 }}>
                Order <b>{billSuccessDialog.orderNo}</b> berhasil disimpan sebagai open bill.
              </div>
              <div style={{ marginTop: 20, fontSize: 14, color: "var(--muted)" }}>
                Cetak bill untuk pelanggan?
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                <button className="btn btn-primary" style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800 }} onClick={handleBillPrint}>
                  Cetak Bill
                </button>
                <button className="btn" style={{ width: "100%", padding: "14px 0", fontSize: 15 }} onClick={handleBillSkip}>
                  Lewati
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </TerraPage>
  );
}
