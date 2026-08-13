export type ShiftStatus = "OPEN" | "CLOSED";

export type CashMovement = {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  reason: string;
  createdByEmail: string;
  createdAt: any;
};

export type ShiftRecord = {
  id: string;
  status: ShiftStatus;
  openedByUid?: string;
  openedByEmail?: string;
  closedByUid?: string;
  closedByEmail?: string;
  openingCash: number;
  closingCashExpected?: number;
  closingCashActual?: number;
  variance?: number;
  cashSales?: number;
  qrisSales?: number;
  transferSales?: number;
  cardSales?: number;
  totalSales?: number;
  orderCount?: number;
  totalCashIn?: number;
  totalCashOut?: number;
  totalDiscounts?: number;
  totalRefunds?: number;
  noteOpen?: string;
  noteClose?: string;
  openedAt?: any;
  closedAt?: any;
  updatedAt?: any;
};

export type ShiftOrderLike = {
  status?: string;
  total?: number;
  discountAmount?: number;
  paymentMethod?: string | null;
  shiftId?: string | null;
  items?: { name: string; qty: number; price: number }[];
};

export function normalizeShift(id: string, data: any): ShiftRecord {
  return {
    id,
    status: (data?.status || "OPEN") as ShiftStatus,
    openedByUid: data?.openedByUid || "",
    openedByEmail: data?.openedByEmail || "",
    closedByUid: data?.closedByUid || "",
    closedByEmail: data?.closedByEmail || "",
    openingCash: Number(data?.openingCash || 0),
    closingCashExpected: Number(data?.closingCashExpected || 0),
    closingCashActual: Number(data?.closingCashActual || 0),
    variance: Number(data?.variance || 0),
    cashSales: Number(data?.cashSales || 0),
    qrisSales: Number(data?.qrisSales || 0),
    transferSales: Number(data?.transferSales || 0),
    cardSales: Number(data?.cardSales || 0),
    totalSales: Number(data?.totalSales || 0),
    orderCount: Number(data?.orderCount || 0),
    totalCashIn: Number(data?.totalCashIn || 0),
    totalCashOut: Number(data?.totalCashOut || 0),
    totalDiscounts: Number(data?.totalDiscounts || 0),
    totalRefunds: Number(data?.totalRefunds || 0),
    noteOpen: (data?.noteOpen || "").toString(),
    noteClose: (data?.noteClose || "").toString(),
    openedAt: data?.openedAt,
    closedAt: data?.closedAt,
    updatedAt: data?.updatedAt,
  };
}

export function calculateShiftTotals(
  orders: ShiftOrderLike[],
  shiftId: string,
  movements: CashMovement[] = []
) {
  let cashSales = 0;
  let qrisSales = 0;
  let transferSales = 0;
  let cardSales = 0;
  let totalSales = 0;
  let orderCount = 0;
  let totalDiscounts = 0;
  let totalRefunds = 0;

  for (const order of orders) {
    if ((order.shiftId || "") !== shiftId) continue;
    const statusUpper = (order.status || "").toUpperCase();

    if (statusUpper === "REFUND" || statusUpper === "REFUNDED") {
      totalRefunds += Number(order.total || 0);
      continue;
    }

    if (statusUpper !== "PAID") continue;

    const total = Number(order.total || 0);
    totalSales += total;
    orderCount += 1;

    if (order.discountAmount) {
      totalDiscounts += Number(order.discountAmount);
    }

    const pm = (order.paymentMethod || "").toUpperCase();
    if (pm === "CASH") cashSales += total;
    else if (pm === "QRIS") qrisSales += total;
    else if (pm === "TRANSFER") transferSales += total;
    else if (pm === "CARD" || pm === "DEBIT" || pm === "CREDIT") cardSales += total;
    else cashSales += total; // Default fallback to cash
  }

  let totalCashIn = 0;
  let totalCashOut = 0;
  for (const m of movements) {
    if (m.type === "IN") totalCashIn += Number(m.amount || 0);
    if (m.type === "OUT") totalCashOut += Number(m.amount || 0);
  }

  return {
    cashSales,
    qrisSales,
    transferSales,
    cardSales,
    totalSales,
    orderCount,
    totalCashIn,
    totalCashOut,
    totalDiscounts,
    totalRefunds,
  };
}

export function toDateSafe(v: any): Date | null {
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

export function isShiftPermissionError(error: any) {
  const code = (error?.code || "").toString().toLowerCase();
  const message = (error?.message || "").toString().toLowerCase();

  return (
    code.includes("permission-denied") ||
    message.includes("missing or insufficient permissions")
  );
}
