/**
 * ============================================================
 * RuniX - Client-Side Rate Limiter
 * ============================================================
 * 
 * Rate limiting untuk public endpoints (QR customer ordering).
 * Menggunakan in-memory sliding window di browser client.
 * 
 * Ini mencegah:
 * - Spam order dari 1 device
 * - Bot abuse
 * - Accidental double-submit
 * 
 * Untuk server-side rate limiting (lebih kuat), gunakan
 * middleware Next.js di middleware.ts
 * ============================================================
 */

interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

const STORAGE_KEY = "runix_rl";

/**
 * Get rate limit data from localStorage
 */
function getRateLimitData(): Record<string, RateLimitEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Save rate limit data
 */
function setRateLimitData(data: Record<string, RateLimitEntry>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Check if action is rate limited
 * @param action - identifier (e.g. "order_submit", "menu_load")
 * @param maxRequests - max requests allowed in window
 * @param windowMs - time window in milliseconds
 * @returns { allowed: boolean, remainingMs?: number, remaining?: number }
 */
export function checkRateLimit(
  action: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remainingMs?: number; remaining?: number } {
  const now = Date.now();
  const data = getRateLimitData();
  const entry = data[action];

  // No previous requests
  if (!entry) {
    data[action] = { count: 1, firstRequest: now, lastRequest: now };
    setRateLimitData(data);
    return { allowed: true, remaining: maxRequests - 1 };
  }

  // Window expired, reset
  if (now - entry.firstRequest > windowMs) {
    data[action] = { count: 1, firstRequest: now, lastRequest: now };
    setRateLimitData(data);
    return { allowed: true, remaining: maxRequests - 1 };
  }

  // Within window, check count
  if (entry.count >= maxRequests) {
    const remainingMs = windowMs - (now - entry.firstRequest);
    return { allowed: false, remainingMs, remaining: 0 };
  }

  // Allowed, increment
  data[action] = { ...entry, count: entry.count + 1, lastRequest: now };
  setRateLimitData(data);
  return { allowed: true, remaining: maxRequests - entry.count - 1 };
}

/**
 * Rate limit presets for RuniX
 */
export const RATE_LIMITS = {
  // Customer: max 5 orders per 10 minutes per device
  ORDER_SUBMIT: { maxRequests: 5, windowMs: 10 * 60 * 1000 },
  
  // Customer: max 30 menu loads per 5 minutes (prevent scraping)
  MENU_LOAD: { maxRequests: 30, windowMs: 5 * 60 * 1000 },
  
  // Customer: max 3 order submissions per minute (anti double-click)
  ORDER_BURST: { maxRequests: 3, windowMs: 60 * 1000 },
} as const;

/**
 * Convenience: check order submit rate limit
 */
export function canSubmitOrder(): { allowed: boolean; waitSeconds?: number } {
  // Check burst limit first (stricter)
  const burst = checkRateLimit("order_burst", RATE_LIMITS.ORDER_BURST.maxRequests, RATE_LIMITS.ORDER_BURST.windowMs);
  if (!burst.allowed) {
    return { allowed: false, waitSeconds: Math.ceil((burst.remainingMs || 60000) / 1000) };
  }

  // Check rolling window
  const rolling = checkRateLimit("order_submit", RATE_LIMITS.ORDER_SUBMIT.maxRequests, RATE_LIMITS.ORDER_SUBMIT.windowMs);
  if (!rolling.allowed) {
    return { allowed: false, waitSeconds: Math.ceil((rolling.remainingMs || 600000) / 1000) };
  }

  return { allowed: true };
}
