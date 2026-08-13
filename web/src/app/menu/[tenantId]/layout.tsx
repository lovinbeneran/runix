import { Suspense } from "react";

/**
 * Layout khusus untuk halaman customer menu (public, tanpa auth).
 * Tidak wrap dengan provider yang memerlukan auth.
 */
export const metadata = {
  title: "Menu - RuniX",
  description: "Pesan makanan dari meja Anda",
};

export default function CustomerMenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Memuat...</div>}>{children}</Suspense>;
}
