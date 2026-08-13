"use client";

import { useEffect, useRef } from "react";
import {
  applyBrandColorsToCSS,
  getCachedBrandColors,
  DEFAULT_BRAND_COLORS,
  subscribeBrandColors,
  subscribeTenantBrandColors,
  subscribeForceReload,
} from "@/lib/brand-colors";
import { getStoredTenantId } from "@/lib/tenant";

/**
 * BrandColorProvider
 *
 * Priority order untuk warna:
 * 1. Per-tenant colors (tenants/{id}/settings/brandColors) — jika ada
 * 2. Global colors (system/brandColors) — fallback
 * 3. DEFAULT_BRAND_COLORS — ultimate fallback
 *
 * Landing page TIDAK pakai provider ini (langsung pakai default).
 */
export default function BrandColorProvider() {
  const lastReloadTimestamp = useRef<number>(0);
  const initializedRef = useRef(false);
  const mountTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    mountTimeRef.current = Date.now();

    // 1. Instant apply dari cache ATAU default (prevent FOUC / blank page)
    try {
      const cached = getCachedBrandColors();
      applyBrandColorsToCSS(cached || DEFAULT_BRAND_COLORS);
    } catch {
      applyBrandColorsToCSS(DEFAULT_BRAND_COLORS);
    }

    // 2. Subscribe ke tenant-specific colors DULU, lalu fallback ke global
    const tenantId = getStoredTenantId() || "";
    let unsubTenant: (() => void) | null = null;
    let unsubGlobal: (() => void) | null = null;
    let usingTenantColors = false;

    if (tenantId) {
      // Subscribe per-tenant colors
      unsubTenant = subscribeTenantBrandColors(tenantId, (tenantColors) => {
        if (tenantColors) {
          // Tenant punya custom branding → pakai itu
          usingTenantColors = true;
          applyBrandColorsToCSS(tenantColors);
        } else {
          // Tenant tidak punya custom → fallback ke global
          usingTenantColors = false;
        }
      });
    }

    // Subscribe global colors (sebagai fallback)
    unsubGlobal = subscribeBrandColors((colors) => {
      // Hanya apply global kalau tenant tidak punya custom
      if (!usingTenantColors) {
        applyBrandColorsToCSS(colors);
      }
    });

    // 3. Subscribe ke force reload signal
    const unsubReload = subscribeForceReload((timestamp) => {
      if (!initializedRef.current) {
        lastReloadTimestamp.current = timestamp;
        initializedRef.current = true;
        return;
      }

      if (timestamp > lastReloadTimestamp.current) {
        lastReloadTimestamp.current = timestamp;

        const timeSinceMount = Date.now() - mountTimeRef.current;
        if (timeSinceMount < 5000) return;

        const RELOAD_KEY = "runix_force_reload";
        const lastForceReload = sessionStorage.getItem(RELOAD_KEY);
        const now = Date.now();
        if (lastForceReload && now - Number(lastForceReload) < 15000) return;
        sessionStorage.setItem(RELOAD_KEY, String(now));

        setTimeout(() => { window.location.reload(); }, 800);
      }
    });

    return () => {
      if (unsubTenant) unsubTenant();
      if (unsubGlobal) unsubGlobal();
      unsubReload();
    };
  }, []);

  return null;
}
