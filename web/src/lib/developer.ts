/**
 * RuniX Developer Mode
 *
 * Developer adalah super-user yang bisa:
 * - Akses semua tenant tanpa perlu jadi owner/admin
 * - Toggle maintenance mode (block akses user biasa)
 * - Lihat system diagnostics & info
 * - Switch tenant bebas untuk testing
 * - Trigger test build marker
 *
 * Developer diidentifikasi dari field `isDeveloper: true` di Firestore `users/{uid}`
 * Hanya bisa di-set melalui Cloud Function `setDeveloper` (butuh secret key)
 */

import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ============ TYPES ============

export type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  enabledAt: Date | null;
  enabledBy: string;
};

export type DevSystemInfo = {
  appVersion: string;
  buildTime: string;
  environment: "production" | "development" | "staging";
  firebaseProject: string;
};

// ============ CONSTANTS ============

export const DEV_CONSOLE_PATH = "/dev";
export const APP_VERSION = "1.0.0";
export const BUILD_ENV: DevSystemInfo["environment"] =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "development"
    : "production";

/**
 * Email developer yang di-hardcode.
 * Akun ini otomatis jadi developer tanpa perlu setup apapun di Firestore.
 */
export const DEVELOPER_EMAILS: string[] = [
  "lovinbeneran@gmail.com",
];

// ============ DEVELOPER CHECK ============

/**
 * Cek apakah user adalah developer.
 * 1. Cek hardcoded email dulu (paling prioritas)
 * 2. Fallback ke Firestore field isDeveloper: true
 */
export async function checkIsDeveloper(uid: string, email?: string): Promise<boolean> {
  // 1. Cek hardcoded email
  if (email && DEVELOPER_EMAILS.includes(email.toLowerCase())) {
    return true;
  }

  // 2. Fallback: cek Firestore field
  try {
    const snap = await getDoc(doc(db, `users/${uid}`));
    if (!snap.exists()) return false;
    const data = snap.data() as any;

    // Cek email dari Firestore juga
    if (data.email && DEVELOPER_EMAILS.includes(data.email.toLowerCase())) {
      return true;
    }

    return data.isDeveloper === true;
  } catch {
    return false;
  }
}

/**
 * Subscribe ke developer status (realtime)
 */
export function subscribeDeveloperStatus(
  uid: string,
  callback: (isDev: boolean) => void
): () => void {
  return onSnapshot(
    doc(db, `users/${uid}`),
    (snap) => {
      if (!snap.exists()) {
        callback(false);
        return;
      }
      const data = snap.data() as any;
      callback(data.isDeveloper === true);
    },
    () => callback(false)
  );
}

// ============ MAINTENANCE MODE ============

/**
 * Subscribe ke maintenance status (realtime)
 * Stored di: system/maintenance
 */
export function subscribeMaintenanceStatus(
  callback: (status: MaintenanceStatus) => void
): () => void {
  return onSnapshot(
    doc(db, "system/maintenance"),
    (snap) => {
      if (!snap.exists()) {
        callback({ enabled: false, message: "", enabledAt: null, enabledBy: "" });
        return;
      }
      const data = snap.data() as any;
      callback({
        enabled: data.enabled === true,
        message: (data.message || "").toString(),
        enabledAt: data.enabledAt?.toDate?.() || null,
        enabledBy: (data.enabledBy || "").toString(),
      });
    },
    () => {
      callback({ enabled: false, message: "", enabledAt: null, enabledBy: "" });
    }
  );
}

/**
 * Cek maintenance status sekali (non-realtime)
 */
export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const snap = await getDoc(doc(db, "system/maintenance"));
    if (!snap.exists()) return { enabled: false, message: "", enabledAt: null, enabledBy: "" };
    const data = snap.data() as any;
    return {
      enabled: data.enabled === true,
      message: (data.message || "").toString(),
      enabledAt: data.enabledAt?.toDate?.() || null,
      enabledBy: (data.enabledBy || "").toString(),
    };
  } catch {
    return { enabled: false, message: "", enabledAt: null, enabledBy: "" };
  }
}

// ============ SYSTEM INFO ============

export function getSystemInfo(): DevSystemInfo {
  return {
    appVersion: APP_VERSION,
    buildTime: new Date().toISOString(),
    environment: BUILD_ENV,
    firebaseProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "unknown",
  };
}

// ============ LOCAL DEV FLAG ============

const DEV_MODE_KEY = "runix_dev_mode";

export function isDevModeActive(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEV_MODE_KEY) === "true";
}

export function setDevModeLocal(active: boolean) {
  if (typeof window === "undefined") return;
  if (active) {
    localStorage.setItem(DEV_MODE_KEY, "true");
  } else {
    localStorage.removeItem(DEV_MODE_KEY);
  }
}
