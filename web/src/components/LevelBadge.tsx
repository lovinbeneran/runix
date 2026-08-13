"use client";

import { useLevel, UserLevel } from "@/hooks/useLevel";

const LEVEL_CONFIG: Record<UserLevel, { label: string; symbol: string; color: string; bg: string }> = {
  free: { label: "Free Trial", symbol: "⏳", color: "#6b7280", bg: "#f3f4f6" },
  delta: { label: "Delta", symbol: "Δ", color: "#16a34a", bg: "#f0fdf4" },
  omega: { label: "Omega", symbol: "Ω", color: "#2563eb", bg: "#eff6ff" },
  zeta: { label: "Zeta", symbol: "ζ", color: "#9333ea", bg: "#faf5ff" },
};

export function LevelBadge({ size = "normal" }: { size?: "small" | "normal" }) {
  const { level } = useLevel();
  const config = LEVEL_CONFIG[level];

  const isSmall = size === "small";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isSmall ? 4 : 6,
        padding: isSmall ? "4px 8px" : "6px 12px",
        borderRadius: 999,
        background: config.bg,
        border: `1.5px solid ${config.color}20`,
        fontSize: isSmall ? 11 : 12,
        fontWeight: 700,
        color: config.color,
        letterSpacing: 0.3,
      }}
    >
      <span style={{ fontSize: isSmall ? 12 : 14 }}>{config.symbol}</span>
      <span>{config.label}</span>
    </div>
  );
}
