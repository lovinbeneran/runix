"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Prevent infinite reload loop: only reload once per SW update
    const RELOAD_KEY = "runix_sw_reload";

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Cek update setiap kali halaman dibuka
      reg.update();

      // Pre-cache core pages in background after SW is active
      if (reg.active) {
        reg.active.postMessage({ type: "PRECACHE_PAGES" });
      }
      reg.addEventListener("controllerchange", () => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "PRECACHE_PAGES" });
        }
      });

      // Kalau ada update, langsung activate
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "activated" && navigator.serviceWorker.controller) {
            // Only reload if we haven't just reloaded for this update
            const lastReload = sessionStorage.getItem(RELOAD_KEY);
            const now = Date.now();
            if (lastReload && now - Number(lastReload) < 10000) {
              // Already reloaded within 10 seconds, skip to prevent loop
              return;
            }
            sessionStorage.setItem(RELOAD_KEY, String(now));
            window.location.reload();
          }
        });
      });
    }).catch(() => {});

    // Force check update setiap 5 menit
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update();
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null;
}
