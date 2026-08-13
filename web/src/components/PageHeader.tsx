"use client";

import React from "react";
import { LevelBadge } from "@/components/LevelBadge";
import { useTenant } from "@/hooks/useTenant";
import { useStaff } from "@/hooks/useStaff";

/**
 * PageHeader - Shared header component untuk semua halaman RuniX
 * 
 * Desain sama dengan POS page:
 * - Brand title "RuniX" (atau custom page title)
 * - LevelBadge
 * - Staff badge (jika aktif)
 * - Email badge
 * - Shortcut buttons (passed as children)
 * 
 * Mobile optimized: responsive layout, compact badges
 */

type Props = {
  /** Optional page title override (default: shows "RuniX") */
  title?: string;
  /** Optional subtitle below badges */
  subtitle?: string;
  /** Custom size preset: 'normal' for regular pages, 'large' for Orders & Shift pages */
  size?: "normal" | "large";
  /** Navigation/action buttons - rendered on the right side */
  children?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, size = "large", children }: Props) {
  const { email } = useTenant();
  const { activeStaff, switchStaff, staffEnabled } = useStaff();

  return (
    <>
      <style>{`
        /* ===== ULTRA-PREMIUM MODERN GLASSMORPHISM PAGE HEADER ===== */
        .page-header-card {
          position: relative;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 16px 24px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.04), 0 2px 6px rgba(0, 0, 0, 0.02);
          transition: all 0.25s ease;
          overflow: hidden;
        }
        .page-header-card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--brand, #9a0002), #ff4d4f, var(--brand, #9a0002));
          opacity: 0.85;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .page-header-left {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .page-header-brand-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .page-header-brand-logo {
          height: 32px;
          width: auto;
          object-fit: contain;
          transition: transform 0.2s ease;
        }
        .page-header-brand-logo:hover {
          transform: scale(1.04);
        }
        .page-header-title {
          font-size: 20px;
          font-weight: 900;
          line-height: 1.2;
          color: var(--text);
          letter-spacing: -0.3px;
        }
        .page-header-subtitle {
          font-size: 12px;
          color: var(--muted);
          margin-top: 3px;
          font-weight: 600;
        }
        .page-header-divider {
          width: 1px;
          height: 24px;
          background: var(--border);
        }

        .page-header-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .page-header-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--input-bg);
          border: 1px solid var(--border);
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
        }
        .page-header-badge-staff {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--brandSoft, rgba(154, 0, 2, 0.08));
          border: 1.5px solid var(--brand, #9a0002);
          font-size: 11.5px;
          font-weight: 900;
          color: var(--brand, #9a0002);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .page-header-badge-staff:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(154, 0, 2, 0.18);
        }
        .page-header-badge-staff:active {
          transform: scale(0.96);
        }

        /* LARGE PRESET FOR ORDERS & SHIFTS PAGE */
        .page-header-card-large {
          padding: 24px 30px !important;
          border-radius: 28px !important;
        }
        .page-header-card-large .page-header-brand-logo {
          height: 44px !important;
        }
        .page-header-card-large .page-header-title {
          font-size: 25px !important;
          font-weight: 900 !important;
        }
        .page-header-card-large .page-header-badge {
          padding: 8px 18px !important;
          font-size: 12.5px !important;
        }
        .page-header-card-large .page-header-badge-staff {
          padding: 8px 20px !important;
          font-size: 12.5px !important;
        }

        .page-header-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        @media (max-width: 768px) {
          .page-header-card {
            padding: 14px 16px;
            border-radius: 20px;
          }
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .page-header-left {
            gap: 10px;
          }
          .page-header-divider {
            display: none;
          }
          .page-header-title {
            font-size: 17px;
          }
          .page-header-nav {
            width: 100%;
          }
          .page-header-nav .btn {
            flex: 1;
            justify-content: center;
            font-size: 12px !important;
            padding: 9px 10px !important;
          }
        }
      `}</style>

      <div className={`page-header-card ${size === "large" ? "page-header-card-large" : ""}`}>
        <div className="page-header">
          <div className="page-header-left">
            {/* Brand Logo & Title */}
            <div className="page-header-brand-group">
              <img className="page-header-brand-logo" src="/logo-header.png" alt="RuniX" />
              {title && (
                <>
                  <div className="page-header-divider" />
                  <div>
                    <div className="page-header-title">{title}</div>
                    {subtitle && <div className="page-header-subtitle">{subtitle}</div>}
                  </div>
                </>
              )}
            </div>

            {/* Badges row */}
            <div className="page-header-badges">
              <LevelBadge size="small" />
              {activeStaff && (
                <button
                  type="button"
                  className="page-header-badge-staff"
                  onClick={switchStaff}
                  title="Klik untuk ganti staff"
                >
                  <svg style={{ width: 14, height: 14 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>{activeStaff.staffName}</span>
                </button>
              )}
              {email && (
                <span className="page-header-badge">
                  <svg style={{ width: 13, height: 13, opacity: 0.7 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span>{email}</span>
                </span>
              )}
            </div>
          </div>

          {/* Navigation/Action buttons */}
          {children && (
            <div className="page-header-nav">
              {children}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
