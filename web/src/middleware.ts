import { NextRequest, NextResponse } from "next/server";

/**
 * ============================================================
 * RuniX - Next.js Middleware (Server-Side Rate Limiting)
 * ============================================================
 * 
 * Rate limiting berbasis IP untuk public endpoints.
 * Menggunakan in-memory Map (per-instance, reset saat restart).
 * 
 * Untuk production besar (100+ tenant), pertimbangkan Redis.
 * Untuk MVP dengan PM2 cluster (4 instances), ini sudah cukup.
 * ============================================================
 */

// In-memory rate limit store
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Cleanup expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, val] of rateLimitMap.entries()) {
    if (now > val.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Check rate limit for an IP + path combination
 */
function isRateLimited(
  ip: string,
  path: string,
  maxRequests: number,
  windowMs: number
): boolean {
  cleanup();

  const key = `${ip}:${path}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return true;
  }

  return false;
}

/**
 * Get client IP from request
 */
function getClientIP(request: NextRequest): string {
  // Check forwarded headers (behind reverse proxy / CDN)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIP(request);

  // === RATE LIMIT: /menu/* pages (customer menu) ===
  // 60 requests per minute per IP (generous for normal browsing)
  if (pathname.startsWith("/menu/")) {
    if (isRateLimited(ip, "/menu", 60, 60 * 1000)) {
      return new NextResponse(
        JSON.stringify({
          error: "Terlalu banyak permintaan. Silakan tunggu beberapa saat.",
          code: "RATE_LIMITED",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
  }

  // === RATE LIMIT: /api/* endpoints (if any future API routes) ===
  if (pathname.startsWith("/api/")) {
    if (isRateLimited(ip, "/api", 30, 60 * 1000)) {
      return new NextResponse(
        JSON.stringify({ error: "Rate limited", code: "RATE_LIMITED" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }
  }

  // === SECURITY HEADERS for all responses ===
  const response = NextResponse.next();

  // Prevent clickjacking
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  // Prevent MIME sniffing
  response.headers.set("X-Content-Type-Options", "nosniff");
  // XSS protection
  response.headers.set("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

// Only run middleware on these paths
export const config = {
  matcher: [
    "/menu/:path*",
    "/api/:path*",
    // Skip internal Next.js paths
    "/((?!_next/static|_next/image|favicon.ico|icon-|manifest).*)",
  ],
};
