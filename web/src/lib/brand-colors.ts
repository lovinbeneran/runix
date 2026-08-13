/**
 * RuniX Brand Colors - Developer Customization
 *
 * Warna bisa diubah oleh developer dari /dev console.
 * Disimpan di Firestore: system/brandColors
 * Cache di localStorage untuk instant load (no FOUC).
 * Semua client auto-sync via onSnapshot.
 */

import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// ============ TYPES ============

export type BrandColorConfig = {
  // Primary brand
  brand: string;
  brand2: string;
  brandSoft: string;
  brandHover: string;

  // Backgrounds
  bgLight: string;
  panelLight: string;
  bgDark: string;
  panelDark: string;

  // Borders
  borderLight: string;
  borderDark: string;

  // Text
  textLight: string;
  mutedLight: string;
  textDark: string;
  mutedDark: string;

  // Semantic
  danger: string;
  success: string;
  warning: string;

  // Input
  inputBgLight: string;
  inputBgDark: string;

  // Metadata
  updatedAt?: any;
  updatedBy?: string;
};

// ============ DEFAULTS ============

export const DEFAULT_BRAND_COLORS: BrandColorConfig = {
  // Primary brand (#9A0002 & #EFE6DE)
  brand: "#9A0002",
  brand2: "#EFE6DE",
  brandSoft: "#F9F4F0",
  brandHover: "#780002",

  // Light mode backgrounds
  bgLight: "#FAF8F6",
  panelLight: "#FFFFFF",

  // Dark mode backgrounds
  bgDark: "#110E0B",
  panelDark: "#1C1814",

  // Light borders
  borderLight: "#EFE6DE",

  // Dark borders
  borderDark: "#302820",

  // Light text
  textLight: "#1F1710",
  mutedLight: "#7A6B5E",

  // Dark text
  textDark: "#F5F0EB",
  mutedDark: "#A89888",

  // Semantic colors
  danger: "#DC4444",
  success: "#2D9B6A",
  warning: "#D4880A",

  // Input backgrounds
  inputBgLight: "#FAF7F4",
  inputBgDark: "#221E19",
};

// ============ COLOR PRESETS / TEMPLATES ============

export type ColorPreset = {
  id: string;
  name: string;
  description: string;
  colors: BrandColorConfig;
};

export const COLOR_PRESETS: ColorPreset[] = [
  {
    id: "terra-brown",
    name: "Terra Brown / Coffee (Default)",
    description: "Nuansa cokelat hangat untuk cafe & coffee shop",
    colors: { ...DEFAULT_BRAND_COLORS },
  },
  {
    id: "terra-pink",
    name: "Terra Pink",
    description: "Warna pink klasik RuniX",
    colors: {
      brand: "#e6739d",
      brand2: "#f0a0be",
      brandSoft: "#fdf0f4",
      brandHover: "#d4607e",
      bgLight: "#f8f9fb",
      panelLight: "#ffffff",
      bgDark: "#0c0e14",
      panelDark: "#161920",
      borderLight: "#e5e7eb",
      borderDark: "#252836",
      textLight: "#111827",
      mutedLight: "#6b7280",
      textDark: "#f1f3f5",
      mutedDark: "#8b92a5",
      danger: "#ef4444",
      success: "#10b981",
      warning: "#f59e0b",
      inputBgLight: "#f9fafb",
      inputBgDark: "#1c1f2a",
    },
  },
  {
    id: "terra-blue",
    name: "Terra Blue / Ocean",
    description: "Biru profesional untuk restoran modern",
    colors: {
      brand: "#3b82f6",
      brand2: "#93c5fd",
      brandSoft: "#eff6ff",
      brandHover: "#2563eb",
      bgLight: "#f8fafc",
      panelLight: "#ffffff",
      bgDark: "#0b1120",
      panelDark: "#131b2e",
      borderLight: "#dbeafe",
      borderDark: "#1e3a5f",
      textLight: "#0f172a",
      mutedLight: "#64748b",
      textDark: "#f1f5f9",
      mutedDark: "#94a3b8",
      danger: "#ef4444",
      success: "#10b981",
      warning: "#f59e0b",
      inputBgLight: "#f8fafc",
      inputBgDark: "#162032",
    },
  },
  {
    id: "terra-green",
    name: "Terra Green / Nature",
    description: "Hijau segar untuk vegan cafe & healthy food",
    colors: {
      brand: "#16a34a",
      brand2: "#86efac",
      brandSoft: "#f0fdf4",
      brandHover: "#15803d",
      bgLight: "#f7fdf9",
      panelLight: "#ffffff",
      bgDark: "#071210",
      panelDark: "#0f1f1a",
      borderLight: "#dcfce7",
      borderDark: "#1a3b2e",
      textLight: "#052e16",
      mutedLight: "#4d7c5e",
      textDark: "#ecfdf5",
      mutedDark: "#86b89a",
      danger: "#ef4444",
      success: "#22c55e",
      warning: "#eab308",
      inputBgLight: "#f7fdf9",
      inputBgDark: "#132a22",
    },
  },
  {
    id: "terra-purple",
    name: "Terra Purple / Elegant",
    description: "Ungu elegan untuk fine dining & premium outlet",
    colors: {
      brand: "#8b5cf6",
      brand2: "#c4b5fd",
      brandSoft: "#f5f3ff",
      brandHover: "#7c3aed",
      bgLight: "#faf8ff",
      panelLight: "#ffffff",
      bgDark: "#0d0a18",
      panelDark: "#161226",
      borderLight: "#e9e2f9",
      borderDark: "#2d2248",
      textLight: "#1e1037",
      mutedLight: "#6b5b8a",
      textDark: "#f3f0ff",
      mutedDark: "#a294c2",
      danger: "#ef4444",
      success: "#10b981",
      warning: "#f59e0b",
      inputBgLight: "#faf8ff",
      inputBgDark: "#1a1530",
    },
  },
  {
    id: "terra-orange",
    name: "Terra Orange / Warm",
    description: "Oranye hangat untuk street food & warmindo",
    colors: {
      brand: "#ea580c",
      brand2: "#fdba74",
      brandSoft: "#fff7ed",
      brandHover: "#c2410c",
      bgLight: "#fffbf7",
      panelLight: "#ffffff",
      bgDark: "#140a04",
      panelDark: "#1f1308",
      borderLight: "#fed7aa",
      borderDark: "#3b2010",
      textLight: "#1c0f04",
      mutedLight: "#78594a",
      textDark: "#fff5eb",
      mutedDark: "#b08a6e",
      danger: "#dc2626",
      success: "#16a34a",
      warning: "#ca8a04",
      inputBgLight: "#fffcf8",
      inputBgDark: "#241a0c",
    },
  },
  {
    id: "terra-dark",
    name: "Terra Dark / Midnight",
    description: "Minimalis gelap untuk bar & nightclub",
    colors: {
      brand: "#a78bfa",
      brand2: "#c4b5fd",
      brandSoft: "#1e1836",
      brandHover: "#8b5cf6",
      bgLight: "#18181b",
      panelLight: "#27272a",
      bgDark: "#09090b",
      panelDark: "#18181b",
      borderLight: "#3f3f46",
      borderDark: "#27272a",
      textLight: "#fafafa",
      mutedLight: "#a1a1aa",
      textDark: "#fafafa",
      mutedDark: "#71717a",
      danger: "#f87171",
      success: "#4ade80",
      warning: "#fbbf24",
      inputBgLight: "#3f3f46",
      inputBgDark: "#27272a",
    },
  },
  {
    id: "terra-teal",
    name: "Terra Teal / Tropical",
    description: "Teal tropical untuk beach cafe & resort",
    colors: {
      brand: "#0d9488",
      brand2: "#5eead4",
      brandSoft: "#f0fdfa",
      brandHover: "#0f766e",
      bgLight: "#f7fdfb",
      panelLight: "#ffffff",
      bgDark: "#041412",
      panelDark: "#0c1f1c",
      borderLight: "#ccfbf1",
      borderDark: "#1a3a35",
      textLight: "#042f2e",
      mutedLight: "#4a7c76",
      textDark: "#f0fdfa",
      mutedDark: "#7dc4bc",
      danger: "#ef4444",
      success: "#10b981",
      warning: "#f59e0b",
      inputBgLight: "#f7fdfb",
      inputBgDark: "#112824",
    },
  },
];

// ============ LOCAL STORAGE ============

const STORAGE_KEY = "runix_brand_colors";

export function getCachedBrandColors(): BrandColorConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrandColorConfig;
  } catch {
    return null;
  }
}

export function setCachedBrandColors(colors: BrandColorConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
  } catch {}
}

export function clearCachedBrandColors() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

// ============ FIRESTORE ============

const FIRESTORE_DOC = "system/brandColors";

/**
 * Subscribe ke brand colors (realtime)
 */
export function subscribeBrandColors(
  callback: (colors: BrandColorConfig) => void
): () => void {
  return onSnapshot(
    doc(db, FIRESTORE_DOC),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_BRAND_COLORS);
        return;
      }
      const data = snap.data() as any;
      const merged: BrandColorConfig = { ...DEFAULT_BRAND_COLORS };

      // Override hanya field yang ada di Firestore
      for (const key of Object.keys(DEFAULT_BRAND_COLORS) as (keyof BrandColorConfig)[]) {
        if (data[key] && typeof data[key] === "string") {
          (merged as any)[key] = data[key];
        }
      }

      setCachedBrandColors(merged);
      callback(merged);
    },
    () => {
      // Fallback ke cache atau default
      const cached = getCachedBrandColors();
      callback(cached || DEFAULT_BRAND_COLORS);
    }
  );
}

/**
 * Get brand colors sekali (non-realtime)
 */
export async function getBrandColors(): Promise<BrandColorConfig> {
  try {
    const snap = await getDoc(doc(db, FIRESTORE_DOC));
    if (!snap.exists()) return DEFAULT_BRAND_COLORS;

    const data = snap.data() as any;
    const merged: BrandColorConfig = { ...DEFAULT_BRAND_COLORS };
    for (const key of Object.keys(DEFAULT_BRAND_COLORS) as (keyof BrandColorConfig)[]) {
      if (data[key] && typeof data[key] === "string") {
        (merged as any)[key] = data[key];
      }
    }
    return merged;
  } catch {
    return getCachedBrandColors() || DEFAULT_BRAND_COLORS;
  }
}

/**
 * Save brand colors ke Firestore (developer only)
 */
export async function saveBrandColors(colors: Partial<BrandColorConfig>, email: string): Promise<void> {
  const payload: any = {};

  for (const [key, value] of Object.entries(colors)) {
    if (value && typeof value === "string" && value.startsWith("#")) {
      payload[key] = value;
    }
  }

  payload.updatedAt = serverTimestamp();
  payload.updatedBy = email;

  await setDoc(doc(db, FIRESTORE_DOC), payload, { merge: true });
}

/**
 * Reset brand colors ke default
 */
export async function resetBrandColors(email: string): Promise<void> {
  const payload: any = { ...DEFAULT_BRAND_COLORS };
  payload.updatedAt = serverTimestamp();
  payload.updatedBy = email;

  await setDoc(doc(db, FIRESTORE_DOC), payload);
  clearCachedBrandColors();
}

// ============ CSS VARIABLE MAPPING ============

/**
 * Apply brand colors ke CSS variables (document root)
 */
export function applyBrandColorsToCSS(colors: BrandColorConfig) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  // Brand colors (both modes)
  root.style.setProperty("--brand", colors.brand);
  root.style.setProperty("--brand2", colors.brand2);
  root.style.setProperty("--brandSoft", colors.brandSoft);
  root.style.setProperty("--brandHover", colors.brandHover);

  // Semantic
  root.style.setProperty("--danger", colors.danger);
  root.style.setProperty("--success", colors.success);
  root.style.setProperty("--warning", colors.warning);

  // Mode-specific: always light mode
  root.style.setProperty("--bg", colors.bgLight);
  root.style.setProperty("--panel", colors.panelLight);
  root.style.setProperty("--border", colors.borderLight);
  root.style.setProperty("--text", colors.textLight);
  root.style.setProperty("--muted", colors.mutedLight);
  root.style.setProperty("--input-bg", colors.inputBgLight);
}

// ============ PER-TENANT BRAND COLORS ============

/**
 * Subscribe ke brand colors KHUSUS tenant tertentu.
 * Stored di: tenants/{tenantId}/settings/brandColors
 * Jika tidak ada, return null (fallback ke global).
 */
export function subscribeTenantBrandColors(
  tenantId: string,
  callback: (colors: BrandColorConfig | null) => void
): () => void {
  if (!tenantId) { callback(null); return () => {}; }
  return onSnapshot(
    doc(db, `tenants/${tenantId}/settings/brandColors`),
    (snap) => {
      if (!snap.exists()) { callback(null); return; }
      const data = snap.data() as any;
      const merged: BrandColorConfig = { ...DEFAULT_BRAND_COLORS };
      for (const key of Object.keys(DEFAULT_BRAND_COLORS) as (keyof BrandColorConfig)[]) {
        if (data[key] && typeof data[key] === "string") {
          (merged as any)[key] = data[key];
        }
      }
      callback(merged);
    },
    () => { callback(null); }
  );
}

/**
 * Get brand colors untuk tenant tertentu (non-realtime)
 */
export async function getTenantBrandColors(tenantId: string): Promise<BrandColorConfig | null> {
  if (!tenantId) return null;
  try {
    const snap = await getDoc(doc(db, `tenants/${tenantId}/settings/brandColors`));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const merged: BrandColorConfig = { ...DEFAULT_BRAND_COLORS };
    for (const key of Object.keys(DEFAULT_BRAND_COLORS) as (keyof BrandColorConfig)[]) {
      if (data[key] && typeof data[key] === "string") {
        (merged as any)[key] = data[key];
      }
    }
    return merged;
  } catch { return null; }
}

/**
 * Save brand colors untuk tenant tertentu (developer only)
 */
export async function saveTenantBrandColors(tenantId: string, colors: Partial<BrandColorConfig>, email: string): Promise<void> {
  if (!tenantId) throw new Error("Tenant ID required");
  const payload: any = {};
  for (const [key, value] of Object.entries(colors)) {
    if (value && typeof value === "string" && value.startsWith("#")) {
      payload[key] = value;
    }
  }
  payload.updatedAt = serverTimestamp();
  payload.updatedBy = email;
  await setDoc(doc(db, `tenants/${tenantId}/settings/brandColors`), payload, { merge: true });
}

/**
 * Reset (hapus) brand colors tenant → fallback ke global
 */
export async function resetTenantBrandColors(tenantId: string): Promise<void> {
  if (!tenantId) return;
  const { deleteDoc: delDoc } = await import("firebase/firestore");
  await delDoc(doc(db, `tenants/${tenantId}/settings/brandColors`));
}

/**
 * Apply brand colors ke semua tenant sekaligus (batch)
 */
export async function saveBrandColorsToAllTenants(colors: Partial<BrandColorConfig>, email: string): Promise<number> {
  const { collection: colFn, getDocs: getDocsFn } = await import("firebase/firestore");
  const snap = await getDocsFn(colFn(db, "tenants"));
  let count = 0;
  for (const tenantDoc of snap.docs) {
    try {
      await saveTenantBrandColors(tenantDoc.id, colors, email);
      count++;
    } catch {}
  }
  return count;
}

// ============ FORCE RELOAD ============

const RELOAD_DOC = "system/forceReload";

/**
 * Trigger force reload untuk semua client
 */
export async function triggerForceReload(email: string): Promise<void> {
  await setDoc(doc(db, RELOAD_DOC), {
    triggeredAt: serverTimestamp(),
    triggeredBy: email,
    timestamp: Date.now(),
  });
}

/**
 * Subscribe ke force reload signal
 */
export function subscribeForceReload(callback: (timestamp: number) => void): () => void {
  return onSnapshot(
    doc(db, RELOAD_DOC),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as any;
      if (data.timestamp) {
        callback(Number(data.timestamp));
      }
    },
    () => {} // ignore errors
  );
}
