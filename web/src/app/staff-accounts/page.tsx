"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TerraPage from "@/components/TerraPage";
import PageHeader from "@/components/PageHeader";
import { useTenant } from "@/hooks/useTenant";
import { useRole } from "@/hooks/useRole";
import { useLevel } from "@/hooks/useLevel";
import {
  StaffAccount,
  StaffRole,
  subscribeStaffAccounts,
  addStaffAccount,
  updateStaffAccount,
  deleteStaffAccount,
} from "@/lib/staff-session";

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "delta", label: "Delta (Level 1 - Staff & Kasir)" },
  { value: "omega", label: "Omega (Level 2 - Supervisor & Admin)" },
  { value: "zeta", label: "Zeta (Level 3 - Manager & Akses Tertinggi)" },
];

export default function StaffAccountsPage() {
  const r = useRouter();
  const { tenantId, loading } = useTenant();
  const { role, loadingRole } = useRole();
  const { canAccess, getStaffLimit, level } = useLevel();

  const isOwner = ["owner", "developer", "zeta"].includes((role || "").toLowerCase());
  const staffLimit = getStaffLimit();
  const isUnlimited = staffLimit >= 999;

  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formRole, setFormRole] = useState<StaffRole>("delta");
  const [formMsg, setFormMsg] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    return subscribeStaffAccounts(tenantId, setStaff);
  }, [tenantId]);

  function resetForm() {
    setFormName("");
    setFormPin("");
    setFormRole("delta");
    setFormMsg("");
    setEditId(null);
    setShowForm(false);
  }

  function openAdd() {
    // Check staff limit
    if (!isUnlimited && staff.length >= staffLimit) {
      setFormMsg(`Limit tercapai! Paket ${level.charAt(0).toUpperCase() + level.slice(1)} maksimal ${staffLimit} staff. Upgrade untuk menambah lebih banyak.`);
      setShowForm(true);
      return;
    }
    resetForm();
    setShowForm(true);
  }

  function openEdit(s: StaffAccount) {
    setEditId(s.id);
    setFormName(s.name);
    setFormPin(""); // PIN tidak ditampilkan, kosong = tidak ubah
    setFormRole(s.role);
    setFormMsg("");
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!tenantId) return;
    setFormMsg("");

    if (!formName.trim()) {
      setFormMsg("Nama wajib diisi.");
      return;
    }

    if (!editId && !formPin.trim()) {
      setFormMsg("PIN wajib diisi.");
      return;
    }

    if (formPin && (formPin.length < 4 || formPin.length > 6)) {
      setFormMsg("PIN harus 4-6 digit angka.");
      return;
    }

    if (formPin && !/^\d+$/.test(formPin)) {
      setFormMsg("PIN hanya boleh angka.");
      return;
    }

    setFormLoading(true);

    try {
      if (editId) {
        // Update
        const updates: Partial<{ name: string; pin: string; role: StaffRole }> = {
          name: formName.trim(),
          role: formRole,
        };
        if (formPin.trim()) {
          updates.pin = formPin.trim();
        }
        await updateStaffAccount(tenantId, editId, updates);
        setFormMsg("Staff berhasil diupdate!");
      } else {
        // Check limit before adding
        if (!isUnlimited && staff.length >= staffLimit) {
          setFormMsg(`Limit tercapai! Paket ${level.charAt(0).toUpperCase() + level.slice(1)} maksimal ${staffLimit} staff.`);
          setFormLoading(false);
          return;
        }
        // Add new
        await addStaffAccount(tenantId, {
          name: formName.trim(),
          pin: formPin.trim(),
          role: formRole,
        });
        setFormMsg("Staff berhasil ditambahkan!");
      }

      setTimeout(resetForm, 800);
    } catch (e: any) {
      setFormMsg(e?.message || "Gagal menyimpan.");
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(staffId: string) {
    if (!tenantId) return;
    try {
      await deleteStaffAccount(tenantId, staffId);
      setDeleteConfirm(null);
    } catch (e: any) {
      alert(e?.message || "Gagal menghapus.");
    }
  }

  async function handleToggleActive(s: StaffAccount) {
    if (!tenantId) return;
    await updateStaffAccount(tenantId, s.id, { isActive: !s.isActive });
  }

  // Direct render for seamless page transition

  if (!canAccess("staff")) {
    return (
      <TerraPage>
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>&#128274;</div>
          <div className="h1">Fitur Premium</div>
          <div className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>
            Fitur Staff Account tersedia untuk paket <b>Delta</b> atau lebih tinggi.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => r.push("/dashboard")}>
            Kembali ke Dashboard
          </button>
        </div>
      </TerraPage>
    );
  }

  if (!isOwner) {
    return (
      <TerraPage>
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>&#128683;</div>
          <div className="h1">Akses Ditolak</div>
          <div className="small" style={{ marginTop: 10 }}>
            Halaman ini hanya untuk Owner.
          </div>
          <button className="btn" style={{ marginTop: 16 }} onClick={() => r.push("/dashboard")}>
            Kembali
          </button>
        </div>
      </TerraPage>
    );
  }

  return (
    <TerraPage>
      <style>{`
        .staff-grid{
          display:grid;
          gap:12px;
          margin-top:14px;
        }
        .staff-card{
          border:1px solid var(--border);
          border-radius:14px;
          padding:16px;
          background:var(--panel);
          display:flex;
          align-items:center;
          gap:14px;
          transition: border-color 0.2s;
        }
        .staff-card:hover{
          border-color:var(--brand);
        }
        .staff-avatar{
          width:44px;
          height:44px;
          border-radius:50%;
          background:var(--brand);
          color:#fff;
          display:grid;
          place-items:center;
          font-weight:900;
          font-size:18px;
          flex-shrink:0;
        }
        .staff-info{
          flex:1;
          min-width:0;
        }
        .staff-name{
          font-weight:900;
          font-size:15px;
        }
        .staff-role{
          font-size:12px;
          color:var(--muted);
          margin-top:2px;
          text-transform:capitalize;
        }
        .staff-badge{
          display:inline-block;
          padding:3px 10px;
          border-radius:20px;
          font-size:11px;
          font-weight:800;
        }
        .staff-badge-active{
          background:rgba(34,197,94,0.15);
          color:#16a34a;
        }
        .staff-badge-inactive{
          background:rgba(239,68,68,0.15);
          color:#dc2626;
        }
        .staff-actions{
          display:flex;
          gap:8px;
          flex-shrink:0;
        }
        .pin-input{
          letter-spacing:8px;
          font-size:24px;
          font-weight:900;
          text-align:center;
          padding:12px;
        }
        @media(max-width:640px){
          .staff-card{
            flex-wrap:wrap;
          }
          .staff-actions{
            width:100%;
            margin-top:8px;
          }
          .staff-actions .btn{
            flex:1;
          }
        }
      `}</style>

      {/* Add Button */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="row">
          <div className="small" style={{ fontWeight: 700 }}>
            Total: {staff.length} staff
            {!isUnlimited && <span style={{ color: "var(--muted)" }}> / {staffLimit} (paket {level})</span>}
          </div>
          <div className="spacer" />
          <button
            className="btn btn-primary"
            onClick={openAdd}
            disabled={!isUnlimited && staff.length >= staffLimit}
          >
            + Tambah Staff
          </button>
        </div>
        {!isUnlimited && staff.length >= staffLimit && (
          <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: "rgba(213,149,103,0.1)", border: "1px solid var(--brand)", fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>
            Limit staff tercapai ({staffLimit}/{staffLimit}). Upgrade ke {level === "delta" ? "Omega" : "Zeta"} untuk menambah lebih banyak staff.
          </div>
        )}
      </div>

      {/* Form (Add/Edit) */}
      {showForm && (
        <div className="card" style={{ marginTop: 14, border: "2px solid var(--brand)" }}>
          <div className="h1" style={{ fontSize: 16 }}>
            {editId ? "Edit Staff" : "Tambah Staff Baru"}
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ marginBottom: 6, fontWeight: 700 }}>Nama Staff</div>
            <input
              className="input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Contoh: Budi, Sari, dll"
              autoFocus
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ marginBottom: 6, fontWeight: 700 }}>
              PIN (4-6 digit) {editId && <span style={{ color: "var(--muted)" }}>— kosongkan jika tidak mau ubah</span>}
            </div>
            <input
              className="input pin-input"
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={formPin}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setFormPin(v);
              }}
              placeholder="••••"
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="small" style={{ marginBottom: 6, fontWeight: 700 }}>Role</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ROLES.map((rl) => (
                <button
                  key={rl.value}
                  className={"btn " + (formRole === rl.value ? "btn-primary" : "")}
                  style={{ padding: "8px 16px", fontSize: 13 }}
                  onClick={() => setFormRole(rl.value)}
                >
                  {rl.label}
                </button>
              ))}
            </div>
          </div>

          {formMsg && (
            <div style={{ marginTop: 12, fontWeight: 800, color: formMsg.includes("berhasil") ? "var(--brand)" : "var(--danger)" }}>
              {formMsg}
            </div>
          )}

          <div className="row" style={{ marginTop: 16, gap: 10 }}>
            <button className="btn" onClick={resetForm} disabled={formLoading}>
              Batal
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={formLoading}>
              {formLoading ? "Menyimpan..." : editId ? "Update" : "Simpan"}
            </button>
          </div>
        </div>
      )}

      {/* Staff List */}
      <div className="staff-grid">
        {staff.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>&#128100;</div>
            <div className="small">Belum ada staff account. Tambahkan staff pertama!</div>
          </div>
        )}

        {staff.map((s) => (
          <div key={s.id} className="staff-card">
            <div className="staff-avatar">
              {s.name.charAt(0).toUpperCase()}
            </div>
            <div className="staff-info">
              <div className="staff-name">{s.name}</div>
              <div className="staff-role">
                {s.role}{" "}
                <span className={`staff-badge ${s.isActive ? "staff-badge-active" : "staff-badge-inactive"}`}>
                  {s.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </div>
            </div>
            <div className="staff-actions">
              <button className="btn" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => openEdit(s)}>
                Edit
              </button>
              <button
                className="btn"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => handleToggleActive(s)}
              >
                {s.isActive ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                className="btn btn-danger"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => setDeleteConfirm(s.id)}
              >
                Hapus
              </button>
            </div>

            {/* Delete Confirmation Inline */}
            {deleteConfirm === s.id && (
              <div style={{ width: "100%", marginTop: 10, padding: 12, background: "rgba(239,68,68,0.08)", borderRadius: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Yakin hapus "{s.name}"?</div>
                <div className="row" style={{ marginTop: 8, gap: 8 }}>
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => setDeleteConfirm(null)}>
                    Batal
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => handleDelete(s.id)}>
                    Ya, Hapus
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Info Card */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="small" style={{ lineHeight: 1.7 }}>
          <b>Cara Kerja Staff Account:</b><br />
          1. Tambahkan staff dengan nama dan PIN (4-6 digit)<br />
          2. Saat buka POS, staff pilih nama mereka lalu masukkan PIN<br />
          3. Transaksi akan tercatat atas nama staff yang aktif<br />
          4. Owner tetap login — staff hanya perlu PIN untuk identifikasi<br />
          <br />
          <b>Batas Staff per Paket:</b><br />
          Seed: 1 staff &bull; Core: 5 staff &bull; Orbit: Unlimited<br />
          <br />
          <span style={{ color: "var(--muted)" }}>
            Tip: Gunakan PIN berbeda untuk setiap staff. PIN bisa diubah kapan saja.
          </span>
        </div>
      </div>
    </TerraPage>
  );
}
