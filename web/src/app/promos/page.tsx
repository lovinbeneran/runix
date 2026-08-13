"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import { db } from "@/lib/firebase";
import { logAudit } from "@/lib/audit";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { PageSkeleton, SkeletonStyles } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export type Promo = {
  id: string;
  name: string;
  type: "percent" | "nominal";
  value: number;
  minSubtotal: number;
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  days: number[];    // 0=Sun, 1=Mon, ... 6=Sat
  code: string;      // kode unik (opsional, kalau kosong = auto-apply)
  isActive: boolean;
  createdAt: any;
};

const DAY_NAMES = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function rupiah(n: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(n);
}

export default function PromosPage() {
  const r = useRouter();
  const { tenantId, loading, email } = useTenant();
  const { role, loadingRole } = useRole();
  const { canAccess: canAccessLevel } = useLevel();
  const toast = useToast();

  const canAccess = ["owner", "developer"].includes((role || "").toString().toLowerCase());

  const [promos, setPromos] = useState<Promo[]>([]);
  const [fetching, setFetching] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"percent" | "nominal">("percent");
  const [value, setValue] = useState<number>(0);
  const [minSubtotal, setMinSubtotal] = useState<number>(0);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [promoCode, setPromoCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const ref = collection(db, `tenants/${tenantId}/promos`);
    const qy = query(ref, orderBy("createdAt", "desc"));
    return onSnapshot(
      qy,
      (snap) => {
        const arr: Promo[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            type: data.type || "percent",
            value: Number(data.value || 0),
            minSubtotal: Number(data.minSubtotal || 0),
            startTime: data.startTime || "00:00",
            endTime: data.endTime || "23:59",
            days: Array.isArray(data.days) ? data.days : [0, 1, 2, 3, 4, 5, 6],
            code: data.code || "",
            isActive: data.isActive ?? true,
            createdAt: data.createdAt,
          };
        });
        setPromos(arr);
        setFetching(false);
      },
      () => setFetching(false)
    );
  }, [tenantId]);

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function resetForm() {
    setName("");
    setType("percent");
    setValue(0);
    setMinSubtotal(0);
    setStartTime("00:00");
    setEndTime("23:59");
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setPromoCode("");
    setEditId(null);
  }

  function startEdit(promo: Promo) {
    setEditId(promo.id);
    setName(promo.name);
    setType(promo.type);
    setValue(promo.value);
    setMinSubtotal(promo.minSubtotal);
    setStartTime(promo.startTime);
    setEndTime(promo.endTime);
    setDays(promo.days);
    setPromoCode(promo.code || "");
  }

  async function handleSave() {
    if (!tenantId) return;
    if (!name.trim()) { toast.error("Nama promo wajib diisi"); return; }
    if (value <= 0) { toast.error("Nilai diskon harus > 0"); return; }
    if (type === "percent" && value > 100) { toast.error("Persentase max 100%"); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        value,
        minSubtotal,
        startTime,
        endTime,
        days,
        code: promoCode.trim().toUpperCase(),
        isActive: true,
        updatedAt: serverTimestamp(),
      };

      if (editId) {
        await updateDoc(doc(db, `tenants/${tenantId}/promos/${editId}`), payload);
        toast.success("Promo diperbarui!");
        logAudit(tenantId, {
          action: "PROMO_UPDATE",
          userEmail: email || "",
          description: `Update promo "${name.trim()}"`,
          metadata: { promoId: editId, type, value },
        });
      } else {
        const docRef = await addDoc(collection(db, `tenants/${tenantId}/promos`), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Promo dibuat!");
        logAudit(tenantId, {
          action: "PROMO_CREATE",
          userEmail: email || "",
          description: `Buat promo "${name.trim()}" (${type === "percent" ? value + "%" : rupiah(value)})`,
          metadata: { promoId: docRef.id, type, value },
        });
      }

      resetForm();
    } catch (e: any) {
      toast.error("Gagal simpan: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo: Promo) {
    if (!tenantId) return;
    try {
      await updateDoc(doc(db, `tenants/${tenantId}/promos/${promo.id}`), {
        isActive: !promo.isActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(promo.isActive ? "Promo dinonaktifkan" : "Promo diaktifkan");
    } catch (e: any) {
      toast.error("Gagal update: " + (e?.message || ""));
    }
  }

  async function handleDelete(promo: Promo) {
    if (!tenantId) return;
    if (!confirm(`Hapus promo "${promo.name}"?`)) return;
    try {
      await deleteDoc(doc(db, `tenants/${tenantId}/promos/${promo.id}`));
      toast.success("Promo dihapus");
      logAudit(tenantId, {
        action: "PROMO_DELETE",
        userEmail: email || "",
        description: `Hapus promo "${promo.name}"`,
        metadata: { promoId: promo.id },
      });
    } catch (e: any) {
      toast.error("Gagal hapus: " + (e?.message || ""));
    }
  }

  // Direct render for seamless page transition

  if (!canAccessLevel("promos")) {
    return (
      <TerraPage>
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>&#128274;</div>
          <div className="h1">Fitur Premium</div>
          <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Fitur Diskon & Promo tersedia untuk paket <b>Core</b> atau lebih tinggi.<br />
            Paket Seed tidak bisa membuat promo atau memberikan diskon di POS.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => r.push("/dashboard")}>
            Kembali ke Dashboard
          </button>
        </div>
      </TerraPage>
    );
  }

  if (!canAccess) {
    return (
      <TerraPage>
        <div className="card">
          <div className="h1">Akses ditolak</div>
          <div className="small">Halaman promo hanya untuk owner.</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={() => r.push("/dashboard")}>Kembali ke Dashboard</button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage>
      <style>{`
        .promo-item{
          padding:14px;
          border:1px solid var(--border);
          border-radius:12px;
          margin-top:10px;
          background:var(--panel);
        }
        .promo-item.inactive{ opacity:0.5; }
        .day-btn{
          width:36px; height:36px;
          border-radius:8px;
          border:1px solid var(--border);
          background:white;
          cursor:pointer;
          font-weight:700;
          font-size:11px;
        }
        .day-btn.active{ background:var(--brand); color:white; border-color:var(--brand); }
      `}</style>

      <PageHeader title="Diskon & Promo" subtitle="Atur promo yang otomatis berlaku di POS berdasarkan jadwal">
        <button className="btn" onClick={() => r.push("/dashboard")}>Dashboard</button>
      </PageHeader>

      <div className="grid2" style={{ marginTop: 14 }}>
        {/* FORM */}
        <div className="card">
          <div className="h1">{editId ? "Edit Promo" : "Tambah Promo"}</div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Nama Promo</div>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Happy Hour 20%" />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Tipe Diskon</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className={"btn " + (type === "percent" ? "btn-primary" : "")} onClick={() => setType("percent")}>Persentase (%)</button>
              <button className={"btn " + (type === "nominal" ? "btn-primary" : "")} onClick={() => setType("nominal")}>Nominal (Rp)</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Nilai Diskon {type === "percent" ? "(%)" : "(Rp)"}</div>
            <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value || 0))} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Min. Subtotal (0 = tanpa minimum)</div>
            <input className="input" type="number" value={minSubtotal} onChange={(e) => setMinSubtotal(Number(e.target.value || 0))} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Kode Promo (opsional, kosongkan untuk auto-apply)</div>
            <input className="input" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Contoh: HEMAT20" style={{ textTransform: "uppercase" }} />
            <div className="small" style={{ marginTop: 4 }}>Jika diisi, promo hanya berlaku saat kasir memasukkan kode ini di POS.</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Jam Berlaku</div>
            <div className="row" style={{ marginTop: 6 }}>
              <input className="input" type="time" style={{ width: 130 }} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              <span>—</span>
              <input className="input" type="time" style={{ width: 130 }} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="small">Hari Berlaku</div>
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              {DAY_NAMES.map((d, i) => (
                <button
                  key={i}
                  className={"day-btn " + (days.includes(i) ? "active" : "")}
                  onClick={() => toggleDay(i)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : editId ? "Update Promo" : "Tambah Promo"}
            </button>
            {editId && <button className="btn" onClick={resetForm}>Batal Edit</button>}
          </div>
        </div>

        {/* LIST */}
        <div className="card">
          <div className="h1">Daftar Promo ({promos.length})</div>

          {fetching ? (
            <div><SkeletonStyles /><PageSkeleton cards={2} /></div>
          ) : promos.length === 0 ? (
            <div className="small" style={{ marginTop: 12 }}>Belum ada promo.</div>
          ) : (
            promos.map((p) => (
              <div key={p.id} className={"promo-item " + (!p.isActive ? "inactive" : "")}>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div className="small" style={{ marginTop: 4 }}>
                      Diskon: <b>{p.type === "percent" ? `${p.value}%` : rupiah(p.value)}</b>
                      {p.minSubtotal > 0 && <> &bull; Min. {rupiah(p.minSubtotal)}</>}
                      {p.code && <> &bull; Kode: <b>{p.code}</b></>}
                    </div>
                    <div className="small">
                      Jam: {p.startTime} — {p.endTime} &bull; Hari: {p.days.map((d) => DAY_NAMES[d]).join(", ")}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                    <button className="btn" onClick={() => toggleActive(p)}>
                      {p.isActive ? "Nonaktif" : "Aktifkan"}
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(p)}>Hapus</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </TerraPage>
  );
}
