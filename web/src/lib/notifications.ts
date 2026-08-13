/**
 * ============================================================
 * RuniX Advanced In-App Notifications v2
 * ============================================================
 *
 * Sistem notifikasi lengkap berbasis Firestore (tanpa Cloud Functions).
 *
 * FITUR:
 * - 6 tipe: info, warning, success, promo, update, system
 * - 3 level prioritas: low, normal, high (high = banner + sound)
 * - Targeting: all | tenant:{id} | user:{uid}
 * - Action/CTA: link ke halaman, URL eksternal, atau dismiss
 * - Display mode: bell (default), toast, banner, popup
 * - Auto-expire (TTL) + auto-cleanup
 * - Read/dismiss tracking di Firestore (persist cross-device)
 * - Rich content: custom icon, action buttons
 *
 * Firestore structure:
 *   notifications/{notifId}
 *     - title: string
 *     - message: string
 *     - type: NotificationType
 *     - priority: "low" | "normal" | "high"
 *     - display: "bell" | "toast" | "banner" | "popup"
 *     - target: "all" | "tenant:{tenantId}" | "user:{uid}"
 *     - action: { type: "link"|"external"|"dismiss", url?: string, label?: string } | null
 *     - icon: string (emoji or null for default)
 *     - createdAt: Timestamp
 *     - createdBy: string
 *     - expiresAt: Timestamp | null
 *     - pinned: boolean (pinned notifications stay at top)
 *
 *   users/{uid}/notifStatus/{notifId}
 *     - read: boolean
 *     - readAt: Timestamp
 *     - dismissed: boolean
 *     - dismissedAt: Timestamp
 * ============================================================
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

// ============ TYPES ============

export type NotificationType = "info" | "warning" | "success" | "promo" | "update" | "system";
export type NotificationPriority = "low" | "normal" | "high";
export type NotificationDisplay = "bell" | "toast" | "banner" | "popup";
export type NotificationActionType = "link" | "external" | "dismiss";

export type NotificationAction = {
  type: NotificationActionType;
  url?: string;
  label?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: NotificationPriority;
  display: NotificationDisplay;
  target: string;
  action: NotificationAction | null;
  icon: string | null;
  createdAt: Date | null;
  createdBy: string;
  expiresAt: Date | null;
  pinned: boolean;
};

export type NotifReadStatus = {
  read: boolean;
  dismissed: boolean;
};

// ============ CONSTANTS ============

const NOTIF_COLLECTION = "notifications";
const MAX_NOTIFICATIONS = 50;

// Legacy localStorage key prefix (for backward compat)
const NOTIF_READ_KEY_PREFIX = "runix_notif_read_";

// ============ READ/DISMISS STATUS (Firestore-backed) ============

/**
 * Get read/dismiss status for notifications (from Firestore)
 */
export async function getNotifStatuses(uid: string): Promise<Record<string, NotifReadStatus>> {
  if (!uid) return {};
  try {
    const ref = collection(db, `users/${uid}/notifStatus`);
    const snap = await getDocs(ref);
    const result: Record<string, NotifReadStatus> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      result[d.id] = {
        read: data.read ?? false,
        dismissed: data.dismissed ?? false,
      };
    });
    return result;
  } catch {
    return {};
  }
}

/**
 * Subscribe to notification statuses (realtime)
 */
export function subscribeNotifStatuses(
  uid: string,
  callback: (statuses: Record<string, NotifReadStatus>) => void
): () => void {
  if (!uid) { callback({}); return () => {}; }
  const ref = collection(db, `users/${uid}/notifStatus`);
  return onSnapshot(ref, (snap) => {
    const result: Record<string, NotifReadStatus> = {};
    snap.docs.forEach((d) => {
      const data = d.data() as any;
      result[d.id] = { read: data.read ?? false, dismissed: data.dismissed ?? false };
    });
    callback(result);
  }, () => callback({}));
}

/**
 * Mark notification as read (persists in Firestore)
 */
export async function markNotifAsRead(uid: string, notifId: string): Promise<void> {
  if (!uid || !notifId) return;
  await setDoc(doc(db, `users/${uid}/notifStatus/${notifId}`), {
    read: true,
    readAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Mark all notifications as read
 */
export async function markAllNotifsAsRead(uid: string, notifIds: string[]): Promise<void> {
  if (!uid || notifIds.length === 0) return;
  const promises = notifIds.map((id) =>
    setDoc(doc(db, `users/${uid}/notifStatus/${id}`), {
      read: true,
      readAt: serverTimestamp(),
    }, { merge: true })
  );
  await Promise.all(promises);
}

/**
 * Dismiss notification (hides permanently for this user)
 */
export async function dismissNotif(uid: string, notifId: string): Promise<void> {
  if (!uid || !notifId) return;
  await setDoc(doc(db, `users/${uid}/notifStatus/${notifId}`), {
    read: true,
    readAt: serverTimestamp(),
    dismissed: true,
    dismissedAt: serverTimestamp(),
  }, { merge: true });
}

// Legacy localStorage functions (backward compat)
export function getReadNotifIds(uid: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY_PREFIX + uid);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch { return []; }
}

// ============ SUBSCRIBE NOTIFICATIONS ============

/**
 * Subscribe to notifications (realtime)
 */
export function subscribeNotifications(
  callback: (notifications: NotificationItem[]) => void
): () => void {
  const ref = collection(db, NOTIF_COLLECTION);
  const q = query(ref, orderBy("createdAt", "desc"), limit(MAX_NOTIFICATIONS));

  return onSnapshot(q, (snap) => {
    const now = new Date();
    const items: NotificationItem[] = [];

    for (const d of snap.docs) {
      const data = d.data() as any;
      const createdAt: Date | null = data.createdAt?.toDate?.() ?? null;
      const expiresAt: Date | null = data.expiresAt?.toDate?.() ?? null;

      // Skip expired
      if (expiresAt && expiresAt < now) continue;

      items.push({
        id: d.id,
        title: (data.title || "").toString(),
        message: (data.message || "").toString(),
        type: (data.type || "info") as NotificationType,
        priority: (data.priority || "normal") as NotificationPriority,
        display: (data.display || "bell") as NotificationDisplay,
        target: (data.target || "all").toString(),
        action: data.action || null,
        icon: data.icon || null,
        createdAt,
        createdBy: (data.createdBy || "").toString(),
        expiresAt,
        pinned: data.pinned ?? false,
      });
    }

    // Sort: pinned first, then by priority (high→normal→low), then by date
    items.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const pMap = { high: 3, normal: 2, low: 1 };
      if (pMap[a.priority] !== pMap[b.priority]) return pMap[b.priority] - pMap[a.priority];
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    });

    callback(items);
  }, () => callback([]));
}

/**
 * Filter notifications for user
 */
export function filterNotificationsForUser(
  notifications: NotificationItem[],
  tenantId: string,
  uid?: string
): NotificationItem[] {
  return notifications.filter((n) => {
    if (n.target === "all") return true;
    if (n.target === `tenant:${tenantId}`) return true;
    if (uid && n.target === `user:${uid}`) return true;
    return false;
  });
}

// ============ SEND NOTIFICATION ============

export type SendNotificationPayload = {
  title: string;
  message: string;
  type: NotificationType;
  priority?: NotificationPriority;
  display?: NotificationDisplay;
  target: string;
  action?: NotificationAction | null;
  icon?: string | null;
  expiresInHours?: number;
  createdBy: string;
  pinned?: boolean;
};

/**
 * Send notification (developer only - protected by Firestore rules)
 */
export async function sendNotification(payload: SendNotificationPayload): Promise<string> {
  const ref = collection(db, NOTIF_COLLECTION);

  const docData: any = {
    title: payload.title.trim(),
    message: payload.message.trim(),
    type: payload.type,
    priority: payload.priority || "normal",
    display: payload.display || "bell",
    target: payload.target,
    action: payload.action || null,
    icon: payload.icon || null,
    createdBy: payload.createdBy,
    createdAt: serverTimestamp(),
    expiresAt: null,
    pinned: payload.pinned ?? false,
  };

  if (payload.expiresInHours && payload.expiresInHours > 0) {
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + payload.expiresInHours);
    docData.expiresAt = Timestamp.fromDate(expiryDate);
  }

  const docRef = await addDoc(ref, docData);
  return docRef.id;
}

/**
 * Delete notification (developer only)
 */
export async function deleteNotification(notifId: string): Promise<void> {
  await deleteDoc(doc(db, NOTIF_COLLECTION, notifId));
}

// ============ HELPERS ============

export function getNotifTypeLabel(type: NotificationType): string {
  switch (type) {
    case "info": return "Info";
    case "warning": return "Peringatan";
    case "success": return "Sukses";
    case "promo": return "Promo";
    case "update": return "Update";
    case "system": return "Sistem";
    default: return "Info";
  }
}

export function getNotifTypeColor(type: NotificationType): string {
  switch (type) {
    case "info": return "var(--brand, #d59567)";
    case "warning": return "var(--warning, #f59e0b)";
    case "success": return "var(--success, #10b981)";
    case "promo": return "#8b5cf6";
    case "update": return "#3b82f6";
    case "system": return "#6366f1";
    default: return "var(--brand, #d59567)";
  }
}

export function getNotifTypeIcon(type: NotificationType): string {
  switch (type) {
    case "info": return "ℹ️";
    case "warning": return "⚠️";
    case "success": return "✅";
    case "promo": return "🎉";
    case "update": return "🚀";
    case "system": return "⚙️";
    default: return "ℹ️";
  }
}

export function getPriorityLabel(p: NotificationPriority): string {
  switch (p) {
    case "high": return "Tinggi";
    case "normal": return "Normal";
    case "low": return "Rendah";
    default: return "Normal";
  }
}

export function getPriorityColor(p: NotificationPriority): string {
  switch (p) {
    case "high": return "var(--danger, #ef4444)";
    case "normal": return "var(--brand, #d59567)";
    case "low": return "var(--muted, #6b7280)";
    default: return "var(--brand, #d59567)";
  }
}

export function getDisplayLabel(d: NotificationDisplay): string {
  switch (d) {
    case "bell": return "Bell Only";
    case "toast": return "Toast Popup";
    case "banner": return "Banner Atas";
    case "popup": return "Popup Dialog";
    default: return "Bell Only";
  }
}

export function formatTimeAgo(date: Date | null): string {
  if (!date) return "";
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}
