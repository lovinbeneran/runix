"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type UserLevel = "free" | "delta" | "omega" | "zeta";

const LEVEL_FEATURES: Record<UserLevel, string[]> = {
  free: ["pos", "orders", "shifts", "products", "reports", "settings/receipt", "printer", "refund-pin"],
  delta: ["pos", "orders", "shifts", "products", "reports", "settings/receipt", "printer", "refund-pin", "staff"],
  omega: ["pos", "orders", "shifts", "products", "reports", "settings/receipt", "printer", "refund-pin", "qr", "staff", "promos", "audit"],
  zeta: ["pos", "orders", "shifts", "products", "reports", "settings/receipt", "printer", "refund-pin", "qr", "staff", "promos", "audit", "members", "kitchen", "product-images"],
};

/**
 * Staff account limits per plan level:
 * - free: 0 (no staff accounts)
 * - delta: 1 staff account
 * - omega: 5 staff accounts
 * - zeta: unlimited
 */
const STAFF_LIMITS: Record<UserLevel, number> = {
  free: 0,
  delta: 1,
  omega: 5,
  zeta: 999, // effectively unlimited
};

export function useLevel() {
  const [level, setLevel] = useState<UserLevel>("free");
  const [loadingLevel, setLoadingLevel] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setLevel("free"); setLoadingLevel(false); return; }
      try {
        const snap = await getDoc(doc(db, `users/${u.uid}`));
        if (snap.exists()) {
          const data = snap.data() as any;
          const lvl = (data.level || "free").toString().toLowerCase();
          if (["free", "delta", "omega", "zeta"].includes(lvl)) {
            setLevel(lvl as UserLevel);
          } else {
            // Map old plan levels (seed, core, orbit, etc.) to new (delta, omega, zeta)
            if (lvl === "seed" || lvl === "basic") setLevel("delta");
            else if (lvl === "core" || lvl === "premium") setLevel("omega");
            else if (lvl === "orbit" || lvl === "owner") setLevel("zeta");
            else setLevel("free");
          }
        }
      } catch {}
      setLoadingLevel(false);
    });
    return () => unsub();
  }, []);

  function canAccess(feature: string): boolean {
    return LEVEL_FEATURES[level].includes(feature);
  }

  function canDisableWatermark(): boolean {
    return level !== "free";
  }

  /** Get max staff accounts allowed for current level */
  function getStaffLimit(): number {
    return STAFF_LIMITS[level];
  }

  /** Check if user can use promos/discounts (Omega+ only) */
  function canUsePromos(): boolean {
    return level === "omega" || level === "zeta";
  }

  /** Check if user can access advanced reports (Omega+ only) */
  function canAdvancedReports(): boolean {
    return level === "omega" || level === "zeta";
  }

  return { level, loadingLevel, canAccess, canDisableWatermark, getStaffLimit, canUsePromos, canAdvancedReports };
}
