import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Audit Log Helper
 * Catat semua aktivitas penting ke Firestore subcollection: tenants/{tenantId}/auditLogs
 */

export type AuditAction =
  | "SHIFT_OPEN"
  | "SHIFT_CLOSE"
  | "SHIFT_CASH_IN"
  | "SHIFT_CASH_OUT"
  | "ORDER_CREATE"
  | "ORDER_PAID"
  | "ORDER_CANCEL"
  | "ORDER_REFUND"
  | "ORDER_UPDATE"
  | "PRODUCT_CREATE"
  | "PRODUCT_UPDATE"
  | "PRODUCT_DELETE"
  | "PROMO_CREATE"
  | "PROMO_UPDATE"
  | "PROMO_DELETE"
  | "SETTINGS_UPDATE"
  | "STAFF_ADD"
  | "STAFF_REMOVE"
  | "LOGIN"
  | "LOGOUT";

export interface AuditEntry {
  action: AuditAction;
  userEmail: string;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Log aktivitas ke Firestore
 * @param tenantId - ID tenant
 * @param entry - Detail audit
 */
export async function logAudit(tenantId: string, entry: AuditEntry) {
  if (!tenantId) return;

  try {
    await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
      action: entry.action,
      userEmail: entry.userEmail || "unknown",
      description: entry.description,
      metadata: entry.metadata || {},
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Jangan crash app kalau audit gagal
    console.warn("[Audit] Failed to log:", e);
  }
}
