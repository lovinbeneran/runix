"use client";

import React from "react";
import { usePathname } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import PageSlideTransition from "@/components/PageSlideTransition";

// Explicit list of Admin routes where persistent Header & Dock Navigation must appear
const ADMIN_ROUTES = [
  "/dashboard",
  "/products",
  "/staff-accounts",
  "/promos",
  "/reports",
  "/settings",
  "/printer",
  "/dev",
];

export default function TerraPage({
  children,
  maxWidth = 1440,
  noPadding = false,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  noPadding?: boolean;
}) {
  const pathname = usePathname();
  
  // Check if current route matches any designated Admin routes
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (!isAdminRoute) {
    return <PageSlideTransition>{children}</PageSlideTransition>;
  }

  return (
    <AdminShell>
      <PageSlideTransition>{children}</PageSlideTransition>
    </AdminShell>
  );
}
