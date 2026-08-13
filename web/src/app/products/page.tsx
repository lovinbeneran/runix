"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import TerraPage from "@/components/TerraPage";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc, writeBatch
} from "firebase/firestore";

type ModifierOption = {
  name: string;
  priceDelta: number;
};

type ModifierGroup = {
  id: string;
  name: string; // e.g. "Ukuran", "Level Gula", "Topping"
  required: boolean;
  options: ModifierOption[];
};

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  cost?: number; // Modal HPP
  sku?: string; // Kode Barcode/SKU
  stock?: number; // Stok saat ini
  minStock?: number; // Batas minimal stok
  trackStock?: boolean;
  isActive: boolean;
  imageUrl?: string;
  modifiers?: ModifierGroup[];
};

function rupiah(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}


// ===== ICONS (inline SVG) =====
function IconGrid() {
  return <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
}
function IconList() {
  return <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>;
}
function IconSearch() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IconPlus() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IconCheck() {
  return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IconTrash() {
  return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
}
function IconEdit() {
  return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function IconX() {
  return <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}


export default function ProductsPage() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const { canAccess: canAccessLevel } = useLevel();

  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Minuman");
  const [price, setPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  // Firestore real-time listener
  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/products`);
    const qy = query(ref, orderBy("category", "asc"), orderBy("name", "asc"));
    return onSnapshot(qy, (snap) => {
      const arr: Product[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name || "",
          category: data.category || "Lainnya",
          price: Number(data.price || 0),
          cost: Number(data.cost || 0),
          sku: data.sku || "",
          stock: Number(data.stock || 0),
          minStock: Number(data.minStock || 0),
          trackStock: Boolean(data.trackStock),
          isActive: data.isActive ?? true,
          imageUrl: data.imageUrl || "",
          modifiers: Array.isArray(data.modifiers) ? data.modifiers : [],
        };
      });
      setProducts(arr);
    }, (e) => setErr(e.message));
  }, [tenantId]);

  // Derived: unique categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ["all", ...Array.from(cats).sort()];
  }, [products]);

  // Filtered products
  const filtered = useMemo(() => {
    let result = products;
    if (selectedCategory !== "all") {
      result = result.filter((p) => p.category === selectedCategory);
    }
    const s = searchQuery.trim().toLowerCase();
    if (s) {
      result = result.filter(
        (p) => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)
      );
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  // Stats
  const stats = useMemo(() => ({
    total: products.length,
    active: products.filter((p) => p.isActive).length,
    inactive: products.filter((p) => !p.isActive).length,
    categories: new Set(products.map((p) => p.category)).size,
  }), [products]);


  // Selection handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  }, [filtered, selectedIds]);

  // CRUD handlers
  async function addProduct() {
    if (!tenantId) return;
    setErr(null);
    const n = name.trim();
    if (!n) return setErr("Nama wajib diisi.");
    if (Number(price) <= 0) return setErr("Harga harus > 0.");
    setBusy(true);
    try {
      await addDoc(collection(db, `tenants/${tenantId}/products`), {
        name: n,
        category: category.trim() || "Lainnya",
        price: Number(price),
        imageUrl: imageUrl.trim() || "",
        isActive: true,
        createdAt: serverTimestamp(),
      });
      setName(""); setPrice(0); setImageUrl(""); setShowAddForm(false);
    } catch (e: any) {
      setErr(e?.message || "Gagal tambah produk");
    } finally {
      setBusy(false);
    }
  }

  // Multi-tab Edit State
  const [editTab, setEditTab] = useState<"GENERAL" | "PRICING" | "MODIFIERS" | "STOCK">("GENERAL");
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editCost, setEditCost] = useState<number>(0);
  const [editSku, setEditSku] = useState("");
  const [editStock, setEditStock] = useState<number>(0);
  const [editMinStock, setEditMinStock] = useState<number>(5);
  const [editTrackStock, setEditTrackStock] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editModifiers, setEditModifiers] = useState<ModifierGroup[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Bulk action state
  const [bulkBusy, setBulkBusy] = useState(false);

  function openEdit(p: Product) {
    setEditProduct(p);
    setEditTab("GENERAL");
    setEditName(p.name);
    setEditCategory(p.category);
    setEditPrice(p.price);
    setEditCost(p.cost || 0);
    setEditSku(p.sku || "");
    setEditStock(p.stock || 0);
    setEditMinStock(p.minStock || 5);
    setEditTrackStock(Boolean(p.trackStock));
    setEditImageUrl(p.imageUrl || "");
    setEditModifiers(p.modifiers || []);
    setEditErr(null);
  }

  function closeEdit() {
    setEditProduct(null);
    setEditErr(null);
  }

  // Modifier Helpers
  function addModifierGroup() {
    const newGroup: ModifierGroup = {
      id: "mod_" + Date.now(),
      name: "Varian Baru",
      required: false,
      options: [{ name: "Opsi 1", priceDelta: 0 }],
    };
    setEditModifiers((prev) => [...prev, newGroup]);
  }

  function removeModifierGroup(index: number) {
    setEditModifiers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateModifierGroup(index: number, updated: ModifierGroup) {
    setEditModifiers((prev) => {
      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  }

  function addModifierOption(groupIndex: number) {
    setEditModifiers((prev) => {
      const copy = [...prev];
      const grp = { ...copy[groupIndex] };
      grp.options = [...grp.options, { name: "Opsi Baru", priceDelta: 0 }];
      copy[groupIndex] = grp;
      return copy;
    });
  }

  function removeModifierOption(groupIndex: number, optionIndex: number) {
    setEditModifiers((prev) => {
      const copy = [...prev];
      const grp = { ...copy[groupIndex] };
      grp.options = grp.options.filter((_, i) => i !== optionIndex);
      copy[groupIndex] = grp;
      return copy;
    });
  }

  async function saveEdit() {
    if (!tenantId || !editProduct) return;
    setEditErr(null);
    const n = editName.trim();
    if (!n) return setEditErr("Nama produk wajib diisi.");
    if (Number(editPrice) <= 0) return setEditErr("Harga jual harus > 0.");
    setEditBusy(true);
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/products/${editProduct.id}`), {
        name: n,
        category: editCategory.trim() || "Lainnya",
        price: Number(editPrice),
        cost: Number(editCost || 0),
        sku: editSku.trim(),
        stock: Number(editStock || 0),
        minStock: Number(editMinStock || 0),
        trackStock: editTrackStock,
        imageUrl: editImageUrl.trim() || "",
        modifiers: editModifiers,
        updatedAt: serverTimestamp(),
      });
      closeEdit();
    } catch (e: any) {
      setEditErr(e?.message || "Gagal update produk");
    } finally {
      setEditBusy(false);
    }
  }

  async function toggleActive(p: Product) {
    if (!tenantId) return;
    await updateDoc(doc(db, `tenants/${tenantId}/products/${p.id}`), {
      isActive: !p.isActive, updatedAt: serverTimestamp(),
    });
  }

  async function removeProduct(p: Product) {
    if (!tenantId) return;
    if (!confirm(`Hapus "${p.name}"?`)) return;
    await deleteDoc(doc(db, `tenants/${tenantId}/products/${p.id}`));
  }

  // Bulk actions
  async function bulkToggleActive(active: boolean) {
    if (!tenantId || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.update(doc(db, `tenants/${tenantId}/products/${id}`), {
          isActive: active, updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setSelectedIds(new Set());
    } catch (e: any) {
      setErr(e?.message || "Gagal bulk update");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!tenantId || selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} produk yang dipilih?`)) return;
    setBulkBusy(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => {
        batch.delete(doc(db, `tenants/${tenantId}/products/${id}`));
      });
      await batch.commit();
      setSelectedIds(new Set());
    } catch (e: any) {
      setErr(e?.message || "Gagal bulk delete");
    } finally {
      setBulkBusy(false);
    }
  }


  // Direct render for seamless page transition

  if (role !== "owner" && role !== "admin" && role !== "developer") {
    return (
      <TerraPage>
        <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
          <div className="h1">Akses Ditolak</div>
          <div className="small" style={{marginTop:8}}>Halaman Products hanya untuk admin/owner.</div>
          <button className="btn" style={{marginTop:16}} onClick={() => r.push("/dashboard")}>Kembali ke Dashboard</button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage>
      <style>{productsStyles}</style>

      {/* Split 2-Column Master-Detail Layout */}
      <div className="prod-split-shell">
        {/* Left Column: Category Sidebar Panel (Locked when editing a product) */}
        <aside className={`prod-sidebar-panel ${editProduct ? "locked" : ""}`}>
          {/* Overlay Lock Visual: Padlock in Center with Chains */}
          {editProduct && (
            <div className="prod-sidebar-lock-overlay">
              {/* Chain left-top to center padlock */}
              <svg className="prod-chain-svg left-top" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
                <path d="M 10 10 Q 30 40 50 50" strokeDasharray="8 6" />
              </svg>
              {/* Chain right-top to center padlock */}
              <svg className="prod-chain-svg right-top" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
                <path d="M 90 10 Q 70 40 50 50" strokeDasharray="8 6" />
              </svg>
              {/* Chain left-bottom to center padlock */}
              <svg className="prod-chain-svg left-bottom" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
                <path d="M 10 90 Q 30 60 50 50" strokeDasharray="8 6" />
              </svg>
              {/* Chain right-bottom to center padlock */}
              <svg className="prod-chain-svg right-bottom" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
                <path d="M 90 90 Q 70 60 50 50" strokeDasharray="8 6" />
              </svg>

              {/* Center Padlock Badge */}
              <div className="prod-lock-badge">
                <div className="prod-lock-icon-glow">
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="2.5" ry="2.5" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)", marginTop: 8 }}>Kategori Terkunci</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Selesaikan edit produk untuk membuka</div>
              </div>
            </div>
          )}

          <div className="prod-sidebar-header">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="prod-sidebar-title">📁 Kategori Menu</span>
            </div>
            <button className="prod-add-btn" disabled={Boolean(editProduct)} onClick={() => setShowAddForm(true)} title="Tambah Produk Baru">
              <IconPlus /> <span>Tambah</span>
            </button>
          </div>

          <div className="prod-category-list">
            {categories.map((cat) => {
              const count = cat === "all" ? products.length : products.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  disabled={Boolean(editProduct)}
                  className={`prod-cat-item ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{ cursor: editProduct ? "not-allowed" : "pointer" }}
                >
                  <div className="prod-cat-info">
                    <span className="prod-cat-name">{cat === "all" ? "Semua Makanan & Minuman" : cat}</span>
                    <span className="prod-cat-badge">{count} produk</span>
                  </div>
                  <svg className="prod-cat-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Dynamic View (Product Listing vs Inline Edit Canvas) */}
        <section className="prod-main-panel">
          {editProduct ? (
            /* Inline Edit Canvas inside product listing container */
            <div className="prod-edit-canvas">
              {/* Canvas Header Bar */}
              <div className="prod-canvas-header">
                <button className="btn btn-ghost" onClick={closeEdit} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  <span>Selesai & Kembali ke Daftar Produk</span>
                </button>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" onClick={closeEdit} style={{ minWidth: 90 }}>Batal</button>
                  <button className="btn btn-primary" disabled={editBusy} onClick={saveEdit} style={{ minWidth: 150 }}>
                    {editBusy ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </div>

              <div className="prod-canvas-body">
                {/* Title & Product Banner */}
                <div className="prod-canvas-banner">
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)" }}>
                      Edit Produk: <span style={{ color: "var(--brand)" }}>{editProduct.name}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      Ubah informasi umum, kalkulasi HPP profit margin, varian rasa/topping, dan stok inventaris.
                    </div>
                  </div>
                  <span className={`prod-card-status ${editProduct.isActive ? "active" : ""}`} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999 }}>
                    {editProduct.isActive ? "● Produk Aktif" : "○ Nonaktif"}
                  </span>
                </div>

                {/* Navigation Tabs Header */}
                <div className="prod-tab-nav" style={{ marginTop: 18 }}>
                  <button className={`prod-tab-item ${editTab === "GENERAL" ? "active" : ""}`} onClick={() => setEditTab("GENERAL")}>
                    📌 Umum & Foto
                  </button>
                  <button className={`prod-tab-item ${editTab === "PRICING" ? "active" : ""}`} onClick={() => setEditTab("PRICING")}>
                    💰 Harga Jual & HPP
                  </button>
                  <button className={`prod-tab-item ${editTab === "MODIFIERS" ? "active" : ""}`} onClick={() => setEditTab("MODIFIERS")}>
                    🎨 Varian Rasa ({editModifiers.length})
                  </button>
                  <button className={`prod-tab-item ${editTab === "STOCK" ? "active" : ""}`} onClick={() => setEditTab("STOCK")}>
                    📦 Stok Inventaris
                  </button>
                </div>

                {/* Tab 1: General Info */}
                {editTab === "GENERAL" && (
                  <div className="prod-tab-content" style={{ marginTop: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div className="prod-form-group">
                        <label className="prod-label">Nama Produk</label>
                        <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Contoh: Es Kopi Susu Aren" />
                      </div>
                      <div className="prod-form-group">
                        <label className="prod-label">Kategori Produk</label>
                        <input className="input" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Contoh: Minuman" />
                      </div>
                    </div>

                    <div className="prod-form-group" style={{ marginTop: 10 }}>
                      <label className="prod-label">Kode SKU / Barcode</label>
                      <input className="input" value={editSku} onChange={(e) => setEditSku(e.target.value)} placeholder="Contoh: KPS-001" />
                    </div>

                    <div className="prod-form-group" style={{ marginTop: 10 }}>
                      <label className="prod-label">URL Foto Produk (opsional)</label>
                      {canAccessLevel("product-images") ? (
                        <>
                          <input className="input" value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} placeholder="https://example.com/foto.jpg" />
                          {editImageUrl.trim() && (
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, background: "var(--brandSoft)", border: "1px solid var(--border)" }}>
                              <img src={editImageUrl.trim()} alt="Preview" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 900, color: "var(--text)" }}>Pratinjau Foto Aktif</div>
                                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Foto ini akan ditampilkan di katalog POS dan menu digital.</div>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: 10, background: "var(--input-bg)", borderRadius: 10, fontSize: 12, color: "var(--muted)" }}>
                          🔒 Fitur foto produk tersedia untuk paket <b>Orbit</b>.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Pricing & HPP */}
                {editTab === "PRICING" && (
                  <div className="prod-tab-content" style={{ marginTop: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div className="prod-form-group">
                        <label className="prod-label">Harga Jual Konsumen (Rp)</label>
                        <input className="input" type="number" value={editPrice} onChange={(e) => setEditPrice(Number(e.target.value || 0))} placeholder="0" />
                      </div>
                      <div className="prod-form-group">
                        <label className="prod-label">Modal Produk / HPP (Rp)</label>
                        <input className="input" type="number" value={editCost} onChange={(e) => setEditCost(Number(e.target.value || 0))} placeholder="0" />
                      </div>
                    </div>

                    <div style={{ padding: 16, borderRadius: 16, background: "var(--brandSoft)", border: "1.5px solid var(--brand)", marginTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Proyeksi Profit Margin Per Item</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: editPrice - editCost >= 0 ? "var(--brand)" : "var(--danger)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                        Rp {rupiah(Math.max(0, editPrice - editCost))} <span style={{ fontSize: 15, fontWeight: 800 }}>({editPrice > 0 ? Math.round(((editPrice - editCost) / editPrice) * 100) : 0}% Margin)</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, lineHeight: 1.5 }}>
                        Laporan keuangan akan otomatis menghitung laba bersih berdasarkan HPP ini tiap kali transaksi dilakukan di POS.
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Modifiers / Variant Builder */}
                {editTab === "MODIFIERS" && (
                  <div className="prod-tab-content" style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>Kelompok Varian & Opsi Tambahan</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Buat pilihan rasa, topping, atau ukuran untuk produk ini</div>
                      </div>
                      <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={addModifierGroup}>
                        + Kelompok Baru
                      </button>
                    </div>

                    {editModifiers.length === 0 ? (
                      <div style={{ padding: 30, textAlign: "center", background: "var(--input-bg)", borderRadius: 18, border: "1px dashed var(--border)", color: "var(--muted)", fontSize: 12 }}>
                        <div style={{ fontSize: 28, marginBottom: 6 }}>🎨</div>
                        <b>Belum Ada Varian Produk</b>
                        <div style={{ marginTop: 4 }}>Contoh: Ukuran Cup (Small/Medium/Large), Level Gula (Normal/Less), atau Topping (Boba/Jelly).</div>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 14 }}>
                        {editModifiers.map((grp, gIdx) => (
                          <div key={grp.id || gIdx} style={{ border: "1.5px solid var(--border)", borderRadius: 16, padding: 16, background: "var(--panel)" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                              <input
                                className="input"
                                style={{ flex: 1, fontWeight: 900 }}
                                value={grp.name}
                                onChange={(e) => updateModifierGroup(gIdx, { ...grp, name: e.target.value })}
                                placeholder="Nama Kelompok (Contoh: Level Gula)"
                              />
                              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, cursor: "pointer", userSelect: "none" }}>
                                <input type="checkbox" checked={grp.required} onChange={(e) => updateModifierGroup(gIdx, { ...grp, required: e.target.checked })} />
                                Wajib Dipilih
                              </label>
                              <button className="btn btn-danger" style={{ padding: "6px 10px", fontSize: 11 }} onClick={() => removeModifierGroup(gIdx)}>
                                <IconTrash /> Hapus
                              </button>
                            </div>

                            {/* Options List */}
                            <div style={{ display: "grid", gap: 8, paddingLeft: 12, borderLeft: "3px solid var(--brand)", marginTop: 10 }}>
                              {grp.options.map((opt, oIdx) => (
                                <div key={oIdx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <input
                                    className="input"
                                    style={{ flex: 1, fontSize: 12 }}
                                    value={opt.name}
                                    onChange={(e) => {
                                      const opts = [...grp.options];
                                      opts[oIdx] = { ...opt, name: e.target.value };
                                      updateModifierGroup(gIdx, { ...grp, options: opts });
                                    }}
                                    placeholder="Nama Opsi (Contoh: Less Sugar)"
                                  />
                                  <input
                                    className="input"
                                    type="number"
                                    style={{ width: 120, fontSize: 12, fontFamily: "var(--font-mono)" }}
                                    value={opt.priceDelta}
                                    onChange={(e) => {
                                      const opts = [...grp.options];
                                      opts[oIdx] = { ...opt, priceDelta: Number(e.target.value || 0) };
                                      updateModifierGroup(gIdx, { ...grp, options: opts });
                                    }}
                                    placeholder="+Harga (Rp)"
                                  />
                                  <button className="btn btn-ghost" style={{ padding: 4 }} onClick={() => removeModifierOption(gIdx, oIdx)}>
                                    <IconX />
                                  </button>
                                </div>
                              ))}
                              <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: "flex-start", marginTop: 4, color: "var(--brand)", fontWeight: 800 }} onClick={() => addModifierOption(gIdx)}>
                                + Tambah Opsi Varian
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 4: Stock & Inventory */}
                {editTab === "STOCK" && (
                  <div className="prod-tab-content" style={{ marginTop: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 900, cursor: "pointer", marginBottom: 16, padding: 12, borderRadius: 14, background: "var(--input-bg)", border: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={editTrackStock} onChange={(e) => setEditTrackStock(e.target.checked)} style={{ width: 16, height: 16 }} />
                      <span>Aktifkan Manajemen Stok Bahan / Produk</span>
                    </label>

                    {editTrackStock ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                        <div className="prod-form-group">
                          <label className="prod-label">Jumlah Stok Saat Ini</label>
                          <input className="input" type="number" value={editStock} onChange={(e) => setEditStock(Number(e.target.value || 0))} placeholder="0" />
                        </div>
                        <div className="prod-form-group">
                          <label className="prod-label">Batas Minimal Peringatan Stok (Min Stock Alert)</label>
                          <input className="input" type="number" value={editMinStock} onChange={(e) => setEditMinStock(Number(e.target.value || 0))} placeholder="5" />
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: 16, background: "var(--input-bg)", borderRadius: 14, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                        ℹ️ Stok tidak dilacak untuk produk ini. Produk akan selalu tersedia di mesin POS tanpa ada batasan kuantitas habis.
                      </div>
                    )}
                  </div>
                )}

                {editErr && <div className="prod-error" style={{ marginTop: 14 }}>{editErr}</div>}
              </div>
            </div>
          ) : (
            /* Normal Catalog Product View (Stats + Toolbar + Grid/List) */
            <>
              {/* Top Bar: Stats Summary Bar */}
              <div className="prod-stats-bar">
                <div className="prod-stat-pill">
                  <span className="label">Total Produk</span>
                  <span className="val">{stats.total}</span>
                </div>
                <div className="prod-stat-pill success">
                  <span className="label">Menu Aktif</span>
                  <span className="val">{stats.active}</span>
                </div>
                <div className="prod-stat-pill danger">
                  <span className="label">Nonaktif</span>
                  <span className="val">{stats.inactive}</span>
                </div>
                <div className="prod-stat-pill brand">
                  <span className="label">Total Kategori</span>
                  <span className="val">{stats.categories}</span>
                </div>
              </div>

              {/* Search, Filter & Bulk Toolbar */}
              <div className="prod-toolbar">
                <div className="prod-search-wrap">
                  <IconSearch />
                  <input
                    className="prod-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama produk, harga, atau kategori..."
                  />
                  {searchQuery && (
                    <button className="prod-search-clear" onClick={() => setSearchQuery("")}><IconX /></button>
                  )}
                </div>

                <div className="prod-toolbar-actions">
                  {filtered.length > 0 && (
                    <button className="prod-select-all-btn" onClick={selectAll}>
                      <div className={`prod-checkbox ${selectedIds.size === filtered.length ? "checked" : ""}`}>
                        {selectedIds.size === filtered.length && <IconCheck />}
                      </div>
                      <span>{selectedIds.size === filtered.length ? "Batal Semua" : "Pilih Semua"}</span>
                    </button>
                  )}

                  <div className="prod-view-toggle">
                    <button className={`prod-view-btn ${viewMode === "grid" ? "active" : ""}`} onClick={() => setViewMode("grid")} title="Tampilan Card Grid">
                      <IconGrid />
                    </button>
                    <button className={`prod-view-btn ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")} title="Tampilan Tabel List">
                      <IconList />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk Action Floating Bar */}
              {selectedIds.size > 0 && (
                <div className="prod-bulk-bar">
                  <span className="prod-bulk-count"><b>{selectedIds.size}</b> produk dipilih</span>
                  <div className="prod-bulk-actions">
                    <button className="btn" disabled={bulkBusy} onClick={() => bulkToggleActive(true)}>Aktifkan</button>
                    <button className="btn" disabled={bulkBusy} onClick={() => bulkToggleActive(false)}>Nonaktifkan</button>
                    <button className="btn btn-danger" disabled={bulkBusy} onClick={bulkDelete}>
                      <IconTrash /> Hapus
                    </button>
                  </div>
                </div>
              )}

              {/* Products List / Grid Container */}
              {filtered.length === 0 ? (
                <div className="prod-empty">
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Tidak ada produk ditemukan</div>
                  <div className="small" style={{ marginTop: 6, color: "var(--muted)" }}>
                    Coba sesuaikan kata kunci pencarian atau ganti kategori.
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddForm(true)}>
                    <IconPlus /> Tambah Produk Pertama
                  </button>
                </div>
              ) : viewMode === "grid" ? (
                <div className="prod-grid">
                  {filtered.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`prod-card ${isSelected ? "selected" : ""} ${!p.isActive ? "inactive" : ""}`}
                      >
                        <div className="prod-card-top-row">
                          <span className="prod-card-cat">{p.category}</span>
                          <div
                            className="prod-card-select"
                            onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                          >
                            <div className={`prod-checkbox ${isSelected ? "checked" : ""}`}>
                              {isSelected && <IconCheck />}
                            </div>
                          </div>
                        </div>

                        <div className="prod-card-img-wrap">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="prod-card-img"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                                const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                if (fallback) (fallback as HTMLElement).style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="prod-no-img-box"
                            style={{ display: p.imageUrl ? "none" : "flex" }}
                          >
                            <svg style={{ width: 22, height: 22, opacity: 0.5 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>No Image</span>
                          </div>
                        </div>

                        <div className="prod-card-name">{p.name}</div>
                        <div className="prod-card-price">Rp {rupiah(p.price)}</div>

                        <div style={{ marginTop: 8 }}>
                          <span className={`prod-card-status ${p.isActive ? "active" : ""}`}>
                            {p.isActive ? "● Aktif" : "○ Nonaktif"}
                          </span>
                        </div>

                        <div className="prod-card-actions">
                          <button
                            className={`prod-action-btn ${p.isActive ? "" : "active-toggle"}`}
                            onClick={() => toggleActive(p)}
                            title={p.isActive ? "Nonaktifkan Produk" : "Aktifkan Produk"}
                          >
                            {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button className="prod-action-btn" onClick={() => openEdit(p)} title="Edit Produk">
                            <IconEdit />
                          </button>
                          <button className="prod-action-btn danger" onClick={() => removeProduct(p)} title="Hapus Produk">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="prod-list">
                  {filtered.map((p) => {
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={`prod-list-item ${isSelected ? "selected" : ""} ${!p.isActive ? "inactive" : ""}`}
                      >
                        <div className="prod-list-select" onClick={() => toggleSelect(p.id)}>
                          <div className={`prod-checkbox ${isSelected ? "checked" : ""}`}>
                            {isSelected && <IconCheck />}
                          </div>
                        </div>

                        <div className="prod-list-img-box">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="prod-list-img"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                                const fallback = (e.target as HTMLImageElement).nextElementSibling;
                                if (fallback) (fallback as HTMLElement).style.display = "flex";
                              }}
                            />
                          ) : null}
                          <div
                            className="prod-no-img-box small"
                            style={{ display: p.imageUrl ? "none" : "flex" }}
                          >
                            <span>No Image</span>
                          </div>
                        </div>

                        <div className="prod-list-info">
                          <div className="prod-list-name">{p.name}</div>
                          <div className="prod-list-meta">
                            <span className="prod-list-cat">{p.category}</span>
                            <span className={`prod-list-status ${p.isActive ? "active" : ""}`}>
                              {p.isActive ? "● Aktif" : "○ Nonaktif"}
                            </span>
                          </div>
                        </div>

                        <div className="prod-list-price">Rp {rupiah(p.price)}</div>

                        <div className="prod-list-actions">
                          <button
                            className="prod-action-btn"
                            onClick={() => toggleActive(p)}
                            title={p.isActive ? "Nonaktifkan" : "Aktifkan"}
                          >
                            {p.isActive ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button className="prod-action-btn" onClick={() => openEdit(p)} title="Edit">
                            <IconEdit />
                          </button>
                          <button className="prod-action-btn danger" onClick={() => removeProduct(p)} title="Hapus">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Add Product Modal */}
      {showAddForm && (
        <div className="prod-modal-overlay" onClick={() => setShowAddForm(false)}>
          <div className="prod-modal" onClick={(e) => e.stopPropagation()}>
            <div className="prod-modal-header">
              <div className="h1">Tambah Produk Baru</div>
              <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}><IconX /></button>
            </div>
            <div className="prod-form-group">
              <label className="prod-label">Nama Produk</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Es Teh Manis" />
            </div>
            <div className="prod-form-group">
              <label className="prod-label">Kategori</label>
              <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Minuman" />
            </div>
            <div className="prod-form-group">
              <label className="prod-label">Harga (Rp)</label>
              <input className="input" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value || 0))} placeholder="0" />
            </div>
            <div className="prod-form-group">
              <label className="prod-label">URL Foto Produk (opsional)</label>
              {canAccessLevel("product-images") ? (
                <>
                  <input className="input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/foto.jpg" />
                  {imageUrl.trim() && (
                    <img src={imageUrl.trim()} alt="Preview" style={{ marginTop: 8, width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  )}
                </>
              ) : (
                <div style={{ padding: 10, background: "var(--input-bg)", borderRadius: 8, fontSize: 12, color: "var(--muted)" }}>
                  🔒 Fitur foto produk tersedia untuk paket <b>Orbit</b>.
                </div>
              )}
            </div>
            {err && <div className="prod-error">{err}</div>}
            <button className="btn btn-primary" style={{width:"100%",marginTop:16}} disabled={busy} onClick={addProduct}>
              {busy ? "Menyimpan..." : "Tambah Produk"}
            </button>
          </div>
        </div>
      )}
    </TerraPage>
  );
}


// ===== REFINED CSS STYLES FOR MASTER-DETAIL SPLIT LAYOUT =====
const productsStyles = `
  .prod-split-shell {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 1024px) {
    .prod-split-shell {
      grid-template-columns: 1fr;
    }
  }

  /* Left Sidebar Category Panel */
  .prod-sidebar-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.02);
  }
  .prod-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 14px;
  }
  .prod-sidebar-title {
    font-size: 15px;
    font-weight: 900;
    color: var(--text);
  }
  .prod-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--brand);
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(154, 0, 2, 0.25);
    transition: transform 0.2s ease;
  }
  .prod-add-btn:hover {
    transform: translateY(-1px);
    background: #780002;
  }

  .prod-category-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .prod-cat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }
  .prod-cat-item:hover {
    background: var(--brandSoft);
    border-color: var(--border);
  }
  .prod-cat-item.active {
    background: var(--brandSoft);
    border-color: var(--brand);
    color: var(--brand);
    font-weight: 900;
  }
  .prod-cat-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .prod-cat-name {
    font-size: 13.5px;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prod-cat-badge {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
  }
  .prod-cat-arrow {
    width: 14px;
    height: 14px;
    opacity: 0.4;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .prod-cat-item.active .prod-cat-arrow {
    opacity: 1;
    color: var(--brand);
    transform: translateX(2px);
  }

  /* Right Main Panel */
  .prod-main-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Stats Bar */
  .prod-stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .prod-stats-bar { grid-template-columns: repeat(2, 1fr); }
  }
  .prod-stat-pill {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.02);
  }
  .prod-stat-pill .label { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; }
  .prod-stat-pill .val { font-size: 20px; font-weight: 900; font-family: var(--font-mono); color: var(--text); }
  .prod-stat-pill.success .val { color: #10B981; }
  .prod-stat-pill.danger .val { color: var(--danger); }
  .prod-stat-pill.brand .val { color: var(--brand); }

  /* Toolbar */
  .prod-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 12px 16px;
  }
  .prod-search-wrap {
    flex: 1;
    min-width: 240px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 8px 14px;
    color: var(--muted);
  }
  .prod-search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-weight: 600;
  }
  .prod-search-clear {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    display: flex;
  }

  .prod-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .prod-select-all-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    font-size: 12px;
    font-weight: 800;
    color: var(--text);
    cursor: pointer;
  }
  .prod-checkbox {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: all 0.15s ease;
  }
  .prod-checkbox.checked {
    background: var(--brand);
    border-color: var(--brand);
  }

  .prod-view-toggle {
    display: flex;
    gap: 4px;
    display: grid;
    place-items: center;
    z-index: 120;
    font-size: 15px;
    font-weight: 900;
    color: var(--text);
  }
  .prod-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    background: var(--brand);
    color: #ffffff;
    font-size: 12px;
    font-weight: 900;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(154, 0, 2, 0.25);
    transition: transform 0.2s ease;
  }
  .prod-add-btn:hover {
    transform: translateY(-1px);
    background: #780002;
  }

  .prod-category-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .prod-cat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }
  .prod-cat-item:hover {
    background: var(--brandSoft);
    border-color: var(--border);
  }
  .prod-cat-item.active {
    background: var(--brandSoft);
    border-color: var(--brand);
    color: var(--brand);
    font-weight: 900;
  }
  .prod-cat-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .prod-cat-name {
    font-size: 13.5px;
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prod-cat-badge {
    font-size: 11px;
    color: var(--muted);
    font-weight: 600;
  }
  .prod-cat-arrow {
    width: 14px;
    height: 14px;
    opacity: 0.4;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }
  .prod-cat-item.active .prod-cat-arrow {
    opacity: 1;
    color: var(--brand);
    transform: translateX(2px);
  }

  /* Right Main Panel */
  .prod-main-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Stats Bar */
  .prod-stats-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .prod-stats-bar { grid-template-columns: repeat(2, 1fr); }
  }
  .prod-stat-pill {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.02);
  }
  .prod-stat-pill .label { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; }
  .prod-stat-pill .val { font-size: 20px; font-weight: 900; font-family: var(--font-mono); color: var(--text); }
  .prod-stat-pill.success .val { color: #10B981; }
  .prod-stat-pill.danger .val { color: var(--danger); }
  .prod-stat-pill.brand .val { color: var(--brand); }

  /* Toolbar */
  .prod-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 12px 16px;
  }
  .prod-search-wrap {
    flex: 1;
    min-width: 240px;
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 8px 14px;
    color: var(--muted);
  }
  .prod-search-input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    outline: none;
    font-weight: 600;
  }
  .prod-search-clear {
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    padding: 0;
    display: flex;
  }

  .prod-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .prod-select-all-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    font-size: 12px;
    font-weight: 800;
    color: var(--text);
    cursor: pointer;
  }
  .prod-checkbox {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: all 0.15s ease;
  }
  .prod-checkbox.checked {
    background: var(--brand);
    border-color: var(--brand);
  }

  .prod-view-toggle {
    display: flex;
    gap: 4px;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 3px;
  }
  .prod-view-btn {
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    transition: all 0.15s ease;
  }
  .prod-view-btn.active {
    background: var(--panel);
    color: var(--brand);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  /* Bulk Bar */
  .prod-bulk-bar {
    background: var(--brandSoft);
    border: 1.5px solid var(--brand);
    border-radius: 18px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    animation: fadeIn 0.2s ease-out;
  }
  .prod-bulk-count { font-size: 13px; color: var(--text); }
  .prod-bulk-actions { display: flex; gap: 8px; }

  /* Product Cards Grid */
  .prod-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .prod-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 16px;
    position: relative;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .prod-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.05);
    border-color: var(--brand);
  }
  .prod-card.selected { border-color: var(--brand); background: var(--brandSoft); }
  .prod-card.inactive { opacity: 0.65; }

  .prod-card-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .prod-card-cat {
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--brand);
    letter-spacing: 0.4px;
  }
  .prod-card-img-wrap {
    width: 100%;
    height: 130px;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 10px;
    background: var(--input-bg);
    position: relative;
  }
  .prod-card-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .prod-no-img-box {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--input-bg);
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .prod-list-img-box {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
  }
  .prod-list-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .prod-no-img-box.small {
    font-size: 8px;
    border-radius: 10px;
    padding: 2px;
    text-align: center;
    border-style: solid;
  }
  .prod-card-name {
    font-size: 15px;
    font-weight: 900;
    color: var(--text);
    line-height: 1.3;
    margin-bottom: 4px;
  }
  .prod-card-price {
    font-size: 16px;
    font-weight: 900;
    font-family: var(--font-mono);
    color: var(--text);
  }
  .prod-card-status {
    font-size: 11px;
    font-weight: 800;
    color: var(--danger);
  }
  .prod-card-status.active { color: #10B981; }

  .prod-card-actions {
    display: flex;
    gap: 6px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .prod-action-btn {
    flex: 1;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 7px 10px;
    cursor: pointer;
    color: var(--text);
    font-size: 11.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .prod-action-btn:hover { background: var(--brandSoft); color: var(--brand); border-color: var(--brand); }
  .prod-action-btn.danger:hover { background: rgba(239, 68, 68, 0.12); color: var(--danger); border-color: var(--danger); }

  /* Product List Items */
  .prod-list { display: flex; flex-direction: column; gap: 8px; }
  .prod-list-item {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 14px 18px;
    transition: all 0.15s ease;
  }
  .prod-list-item:hover { border-color: var(--brand); transform: translateY(-1px); }
  .prod-list-item.selected { border-color: var(--brand); background: var(--brandSoft); }
  .prod-list-item.inactive { opacity: 0.65; }
  .prod-list-select { cursor: pointer; flex-shrink: 0; }
  .prod-list-info { flex: 1; min-width: 0; }
  .prod-list-name { font-weight: 900; font-size: 14.5px; color: var(--text); }
  .prod-list-meta { display: flex; gap: 10px; align-items: center; margin-top: 3px; }
  .prod-list-cat { font-size: 11.5px; color: var(--brand); font-weight: 700; }
  .prod-list-status { font-size: 11px; font-weight: 800; color: var(--danger); }
  .prod-list-status.active { color: #10B981; }
  .prod-list-price { font-weight: 900; font-family: var(--font-mono); font-size: 15px; color: var(--text); }
  .prod-list-actions { display: flex; gap: 6px; flex-shrink: 0; }

  .prod-empty {
    text-align: center;
    padding: 60px 20px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 24px;
  }

  /* Modals */
  .prod-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(8px);
    display: grid;
    place-items: center;
    z-index: 120;
    padding: 16px;
  }
  /* Left Sidebar Locked State & Chain Lock Overlay Styling */
  .prod-sidebar-panel {
    position: relative;
  }
  .prod-sidebar-panel.locked {
    border-color: var(--brand);
  }
  .prod-sidebar-lock-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(5px);
    border-radius: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: fadeIn 0.2s ease-out;
    pointer-events: all;
  }
  .prod-chain-svg {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    color: rgba(255, 255, 255, 0.7);
    pointer-events: none;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  }
  .prod-lock-badge {
    position: relative;
    z-index: 2;
    background: var(--panel);
    border: 2px solid var(--brand);
    border-radius: 20px;
    padding: 18px 16px;
    text-align: center;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    max-width: 220px;
    animation: scaleUp 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .prod-lock-icon-glow {
    width: 54px;
    height: 54px;
    border-radius: 999px;
    background: var(--brandSoft);
    color: var(--brand);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 20px rgba(154, 0, 2, 0.3);
    border: 1px solid var(--brand);
  }

  /* In-Page Container Edit Canvas Styling */
  .prod-edit-canvas {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 28px;
    padding: 24px 28px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.03);
    animation: fadeIn 0.2s ease-out;
  }
  .prod-canvas-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .prod-canvas-banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  /* Advanced Multi-Tab Navigation Styling */
  .prod-modal-advanced {
    max-width: 600px;
  }
  .prod-tab-nav {
    display: flex;
    gap: 6px;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 4px;
    margin-bottom: 18px;
    overflow-x: auto;
  }
  .prod-tab-item {
    flex: 1;
    white-space: nowrap;
    border: none;
    background: transparent;
    color: var(--muted);
    padding: 10px 16px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .prod-tab-item.active {
    background: var(--panel);
    color: var(--brand);
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  }
  .prod-tab-content {
    animation: fadeIn 0.15s ease-out;
  }
`;
