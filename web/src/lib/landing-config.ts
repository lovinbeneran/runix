/**
 * Landing Page Configuration
 * 
 * Data landing page (hero, features, pricing) disimpan di Firestore: system/landingPage
 * Developer bisa edit via /dev/landing
 * Fallback ke default jika belum ada config di Firestore
 */

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// ============ TYPES ============

export type HeroConfig = {
  badge: string;
  headline: string;
  headlineHighlight: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
};

export type FeatureItem = {
  icon: string;
  title: string;
  description: string;
};

export type PricingPlan = {
  name: string;
  price: string;
  period: string;
  yearlyPrice: string;
  yearlyPeriod: string;
  description: string;
  features: string[];
  highlighted: boolean;
  ctaText: string;
  ctaLink: string;
};

export type LandingConfig = {
  hero: HeroConfig;
  features: FeatureItem[];
  featuresTitle: string;
  pricing: PricingPlan[];
  pricingTitle: string;
  pricingSubtitle: string;
  ctaTitle: string;
  ctaSubtitle: string;
  footerText: string;
  updatedAt?: any;
  updatedBy?: string;
};

// ============ DEFAULTS ============

export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  hero: {
    badge: "POS Modern untuk Cafe & Resto",
    headline: "Kasir cepat,",
    headlineHighlight: "laporan rapi.",
    subtitle: "Kelola order, cetak struk, pantau omzet, dan atur meja — semua dari satu dashboard. Gratis untuk mulai.",
    ctaPrimary: "Mulai Gratis",
    ctaSecondary: "Login",
  },
  featuresTitle: "Semua yang kamu butuhkan",
  features: [
    { icon: "⚡", title: "POS Dual Mode", description: "Bayar langsung atau simpan per meja, bayar nanti di kasir." },
    { icon: "🖨️", title: "Cetak Struk", description: "Browser, RawBT, atau Bluetooth ESC/POS langsung ke thermal printer." },
    { icon: "📊", title: "Dashboard Realtime", description: "Omzet harian, grafik 7 hari, top produk, dan breakdown pembayaran." },
    { icon: "📱", title: "QR Meja", description: "Generate QR per meja untuk alur order yang lebih cepat." },
    { icon: "📈", title: "Laporan & Export", description: "Rekap penjualan lengkap, export ke Excel satu klik." },
    { icon: "🌐", title: "Multi Outlet", description: "Satu akun kelola banyak tenant. Cocok untuk ekspansi bisnis." },
  ],
  pricingTitle: "Pilih paket yang cocok",
  pricingSubtitle: "Mulai gratis, upgrade kapan saja sesuai kebutuhan outlet kamu.",
  pricing: [
    {
      name: "Seed",
      price: "Segera Hadir",
      period: "",
      yearlyPrice: "Segera Hadir",
      yearlyPeriod: "",
      description: "Untuk memulai bisnis kecil",
      features: ["Point of Sales", "Management Product", "Laporan Penjualan", "Shift System", "Single Outlet", "1 User"],
      highlighted: false,
      ctaText: "Hubungi Kami",
      ctaLink: "/setup",
    },
    {
      name: "Core",
      price: "Segera Hadir",
      period: "",
      yearlyPrice: "Segera Hadir",
      yearlyPeriod: "",
      description: "Untuk bisnis yang berkembang",
      features: ["Semua fitur Seed", "Promo & Discount", "Staff Management (3-5 user)", "Audit Log", "QR Meja"],
      highlighted: true,
      ctaText: "Hubungi Kami",
      ctaLink: "/setup",
    },
    {
      name: "Orbit",
      price: "Segera Hadir",
      period: "",
      yearlyPrice: "Segera Hadir",
      yearlyPeriod: "",
      description: "Untuk enterprise & multi-outlet",
      features: ["Semua fitur Core", "Multi-outlet management", "Unlimited user", "Priority support", "Custom branding", "API access", "Dedicated account manager"],
      highlighted: false,
      ctaText: "Hubungi Kami",
      ctaLink: "/setup",
    },
  ],
  ctaTitle: "Siap digitalisasi outlet kamu?",
  ctaSubtitle: "Buat akun gratis, setup tenant, dan langsung terima order hari ini.",
  footerText: "RuniX — POS modern untuk cafe & resto.",
};

// ============ FIRESTORE ============

const FIRESTORE_DOC = "system/landingPage";
const STORAGE_KEY = "runix_landing_config";

/**
 * Get cached landing config from localStorage
 */
export function getCachedLandingConfig(): LandingConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LandingConfig;
  } catch {
    return null;
  }
}

function setCachedLandingConfig(config: LandingConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

/**
 * Get landing config (once)
 */
export async function getLandingConfig(): Promise<LandingConfig> {
  try {
    const snap = await getDoc(doc(db, FIRESTORE_DOC));
    if (!snap.exists()) return DEFAULT_LANDING_CONFIG;
    const data = snap.data() as any;
    const merged = mergeLandingConfig(data);
    setCachedLandingConfig(merged);
    return merged;
  } catch {
    return getCachedLandingConfig() || DEFAULT_LANDING_CONFIG;
  }
}

/**
 * Subscribe to landing config (realtime)
 */
export function subscribeLandingConfig(callback: (config: LandingConfig) => void): () => void {
  return onSnapshot(
    doc(db, FIRESTORE_DOC),
    (snap) => {
      if (!snap.exists()) {
        callback(DEFAULT_LANDING_CONFIG);
        return;
      }
      const data = snap.data() as any;
      const merged = mergeLandingConfig(data);
      setCachedLandingConfig(merged);
      callback(merged);
    },
    () => {
      callback(getCachedLandingConfig() || DEFAULT_LANDING_CONFIG);
    }
  );
}

/**
 * Save landing config (developer only)
 */
export async function saveLandingConfig(config: Partial<LandingConfig>, email: string): Promise<void> {
  const payload: any = { ...config };
  payload.updatedAt = serverTimestamp();
  payload.updatedBy = email;
  await setDoc(doc(db, FIRESTORE_DOC), payload, { merge: true });
}

/**
 * Merge Firestore data with defaults (fill missing fields)
 */
function mergeLandingConfig(data: any): LandingConfig {
  return {
    hero: {
      badge: data?.hero?.badge || DEFAULT_LANDING_CONFIG.hero.badge,
      headline: data?.hero?.headline || DEFAULT_LANDING_CONFIG.hero.headline,
      headlineHighlight: data?.hero?.headlineHighlight || DEFAULT_LANDING_CONFIG.hero.headlineHighlight,
      subtitle: data?.hero?.subtitle || DEFAULT_LANDING_CONFIG.hero.subtitle,
      ctaPrimary: data?.hero?.ctaPrimary || DEFAULT_LANDING_CONFIG.hero.ctaPrimary,
      ctaSecondary: data?.hero?.ctaSecondary || DEFAULT_LANDING_CONFIG.hero.ctaSecondary,
    },
    featuresTitle: data?.featuresTitle || DEFAULT_LANDING_CONFIG.featuresTitle,
    features: Array.isArray(data?.features) && data.features.length > 0
      ? data.features
      : DEFAULT_LANDING_CONFIG.features,
    pricingTitle: data?.pricingTitle || DEFAULT_LANDING_CONFIG.pricingTitle,
    pricingSubtitle: data?.pricingSubtitle || DEFAULT_LANDING_CONFIG.pricingSubtitle,
    pricing: Array.isArray(data?.pricing) && data.pricing.length > 0
      ? data.pricing
      : DEFAULT_LANDING_CONFIG.pricing,
    ctaTitle: data?.ctaTitle || DEFAULT_LANDING_CONFIG.ctaTitle,
    ctaSubtitle: data?.ctaSubtitle || DEFAULT_LANDING_CONFIG.ctaSubtitle,
    footerText: data?.footerText || DEFAULT_LANDING_CONFIG.footerText,
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
  };
}
