"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { db } from "@/lib/firebase";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { useToast } from "@/components/Toast";
import {
  TableData, TableStatus, generateTableQrUrl,
  getStatusColor, getStatusLabel,
} from "@/lib/tables";
import { printQRBatchHTML } from "@/lib/qr-pdf";
import dynamic from "next/dynamic";

const QRCodeCanvas = dynamic(
  () => import("qrcode.react").then((mod) => mod.QRCodeCanvas),
  { ssr: false, loading: () => <div style={{ width: 160, height: 160, background: "var(--input-bg)", borderRadius: 12 }} /> }
);


export default function TablesPage() {
  const router = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const toast = useToast();

  const roleLower = (role || "").toString().toLowerCase();
  const canView = ["owner", "admin", "developer"].includes(roleLower);

  const [tables, setTables] = useState<TableData[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showQR, setShowQR] = useState<TableData | null>(null);
  const [editTable, setEditTable] = useState<TableData | null>(null);

  // Add form state
  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");

  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

  // Load tables
  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/tables`);
    const q = query(ref, orderBy("number"));
    return onSnapshot(q, (snap) => {
      const arr: TableData[] = snap.docs.map((d) => ({
        id: d.id,
        number: d.data().number || "",
        name: d.data().name || "",
        capacity: Number(d.data().capacity || 4),
        status: (d.data().status || "available") as TableStatus,
        currentOrderId: d.data().currentOrderId || null,
        qrUrl: d.data().qrUrl || "",
        createdAt: d.data().createdAt,
        updatedAt: d.data().updatedAt,
      }));
      setTables(arr);
    });
  }, [tenantId]);


  // Add table
  const handleAdd = async () => {
    if (!newNumber.trim()) { toast.error("Nomor meja wajib diisi"); return; }
    const exists = tables.find((t) => t.number === newNumber.trim());
    if (exists) { toast.error("Nomor meja sudah ada"); return; }

    const qrUrl = generateTableQrUrl(origin, tenantId, newNumber.trim());
    try {
      await addDoc(collection(db, `tenants/${tenantId}/tables`), {
        number: newNumber.trim(),
        name: newName.trim(),
        capacity: Number(newCapacity) || 4,
        status: "available",
        currentOrderId: null,
        qrUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Meja berhasil ditambahkan!");
      setShowAdd(false);
      setNewNumber("");
      setNewName("");
      setNewCapacity("4");
    } catch (e: any) {
      toast.error("Gagal menambah meja: " + (e?.message || ""));
    }
  };

  // Delete table
  const handleDelete = async (t: TableData) => {
    if (!confirm(`Hapus meja ${t.number}?`)) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/tables`, t.id));
      toast.success("Meja dihapus.");
    } catch (e: any) {
      toast.error("Gagal menghapus: " + (e?.message || ""));
    }
  };

  // Toggle status
  const toggleStatus = async (t: TableData) => {
    const nextStatus: TableStatus = t.status === "available" ? "occupied"
      : t.status === "occupied" ? "available"
      : "available";
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/tables`, t.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      toast.error("Gagal update status");
    }
  };


  // Bulk add
  const handleBulkAdd = async (count: number) => {
    const startNum = tables.length > 0
      ? Math.max(...tables.map((t) => Number(t.number) || 0)) + 1
      : 1;
    try {
      for (let i = 0; i < count; i++) {
        const num = String(startNum + i);
        const qrUrl = generateTableQrUrl(origin, tenantId, num);
        await addDoc(collection(db, `tenants/${tenantId}/tables`), {
          number: num,
          name: "",
          capacity: 4,
          status: "available",
          currentOrderId: null,
          qrUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      toast.success(`${count} meja berhasil ditambahkan!`);
    } catch (e: any) {
      toast.error("Gagal bulk add: " + (e?.message || ""));
    }
  };

  if (loading || loadingRole) {
    return <TerraPage><div className="card">Loading...</div></TerraPage>;
  }
  if (!canView) {
    return (
      <TerraPage>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">Halaman ini hanya untuk owner/admin.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => router.push("/dashboard")}>
            Kembali ke Dashboard
          </button>
        </div>
      </TerraPage>
    );
  }


  return (
    <TerraPage>
      <style>{tablePageStyles}</style>

      <div className="card">
        <div className="row">
          <div>
            <div className="h1">Manajemen Meja</div>
            <div className="small">{tables.length} meja terdaftar</div>
          </div>
          <div className="spacer" />
          <button className="btn" onClick={() => router.push("/dashboard")}>Dashboard</button>
        </div>
      </div>

      {/* Actions */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            + Tambah Meja
          </button>
          <button className="btn" onClick={() => handleBulkAdd(5)}>
            + Bulk 5 Meja
          </button>
          <button className="btn" onClick={() => handleBulkAdd(10)}>
            + Bulk 10 Meja
          </button>
          <button className="btn" disabled={tables.length === 0} onClick={() => {
            printQRBatchHTML(
              tables.map((t) => ({ tableNumber: t.number, tableName: t.name })),
              tenantId, origin, "RuniX"
            );
          }}>
            🖨️ Print Semua QR
          </button>
        </div>
      </div>

      {/* Add Dialog */}
      {showAdd && (
        <div className="tbl-overlay" onClick={() => setShowAdd(false)}>
          <div className="tbl-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontWeight: 800 }}>Tambah Meja</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input className="input" placeholder="Nomor Meja (wajib)" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
              <input className="input" placeholder="Nama/Label (opsional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input className="input" type="number" placeholder="Kapasitas" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
            </div>
            <div className="row" style={{ marginTop: 16, gap: 8 }}>
              <button className="btn" onClick={() => setShowAdd(false)}>Batal</button>
              <button className="btn btn-primary" onClick={handleAdd}>Simpan</button>
            </div>
          </div>
        </div>
      )}


      {/* QR Modal */}
      {showQR && (
        <div className="tbl-overlay" onClick={() => setShowQR(null)}>
          <div className="tbl-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <h3 style={{ margin: "0 0 12px", fontWeight: 800 }}>QR Meja {showQR.number}</h3>
            <div style={{ display: "grid", placeItems: "center", margin: "16px 0" }}>
              <QRCodeCanvas
                value={generateTableQrUrl(origin, tenantId, showQR.number)}
                size={200}
              />
            </div>
            <div className="small" style={{ wordBreak: "break-all", marginBottom: 12 }}>
              {generateTableQrUrl(origin, tenantId, showQR.number)}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => {
                navigator.clipboard.writeText(generateTableQrUrl(origin, tenantId, showQR.number));
                toast.success("Link disalin!");
              }}>
                Copy Link
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => {
                window.open(generateTableQrUrl(origin, tenantId, showQR.number), "_blank");
              }}>
                Test
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowQR(null)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Table Grid */}
      <div className="tbl-grid">
        {tables.map((t) => (
          <div key={t.id} className="tbl-card">
            <div className="tbl-card-header">
              <div className="tbl-number">Meja {t.number}</div>
              <div
                className="tbl-status-dot"
                style={{ background: getStatusColor(t.status) }}
                title={getStatusLabel(t.status)}
              />
            </div>
            {t.name && <div className="small">{t.name}</div>}
            <div className="small">Kapasitas: {t.capacity} orang</div>
            <div className="tbl-status-label" style={{ color: getStatusColor(t.status) }}>
              {getStatusLabel(t.status)}
            </div>
            <div className="tbl-actions">
              <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setShowQR(t)}>
                QR
              </button>
              <button className="btn" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => toggleStatus(t)}>
                Toggle
              </button>
              <button className="btn btn-danger" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => handleDelete(t)}>
                Hapus
              </button>
            </div>
          </div>
        ))}
        {tables.length === 0 && (
          <div className="card" style={{ gridColumn: "1/-1", textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>&#127869;</div>
            <div className="h1">Belum ada meja</div>
            <div className="small">Tambah meja pertama Anda untuk mulai menggunakan QR ordering.</div>
          </div>
        )}
      </div>
    </TerraPage>
  );
}


const tablePageStyles = `
  .tbl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  @media (max-width: 640px) {
    .tbl-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  }
  .tbl-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 10px);
    padding: 14px;
    transition: box-shadow 0.2s;
  }
  .tbl-card:hover { box-shadow: var(--shadow); }
  .tbl-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .tbl-number { font-size: 15px; font-weight: 800; }
  .tbl-status-dot {
    width: 10px; height: 10px; border-radius: 50%;
  }
  .tbl-status-label {
    font-size: 11px; font-weight: 700; margin-top: 4px;
  }
  .tbl-actions {
    display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap;
  }
  .tbl-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: fadeIn 0.15s;
  }
  .tbl-modal {
    background: var(--panel);
    border-radius: var(--radius, 14px);
    padding: 24px;
    width: 100%;
    max-width: 400px;
    box-shadow: var(--shadow-lg);
    animation: scaleIn 0.2s ease-out;
  }
`;
