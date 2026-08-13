/**
 * Staff Session Management
 * 
 * Sistem staff account berbasis PIN untuk RuniX.
 * - Owner tetap login via Firebase Auth (persistent)
 * - Staff (kasir, barista, dll) login dengan PIN 4-6 digit
 * - Staff data disimpan di Firestore: tenants/{tenantId}/staffAccounts/{id}
 * - Active staff disimpan di sessionStorage (hilang saat tab/app ditutup)
 *   → Staff HARUS login PIN lagi setiap kali buka app / tab baru
 * - Owner tetap persistent via Firebase Auth (tidak terpengaruh)
 * 
 * Flow:
 * 1. Owner login Firebase (persistent, tidak logout saat app kill)
 * 2. Staff pilih nama mereka → masukkan PIN → aktif
 * 3. Saat ganti shift / keluar, staff "lock" (kembali ke PIN screen)
 * 4. Saat tab/app ditutup, staff session otomatis hilang (sessionStorage)
 * 5. Owner account TIDAK pernah logout dari Firebase
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Delta (Tier 1 - Akses Dasar Kasir/Staff), Omega (Tier 2 - Akses Admin/Supervisor), Zeta (Tier 3 - Akses Tertinggi Owner/Manager)
export type StaffRole = "delta" | "omega" | "zeta";

export type StaffAccount = {
  id: string;
  name: string;
  pin: string; // hashed
  role: StaffRole;
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
};

export type ActiveStaffSession = {
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  loginAt: number; // timestamp ms
};

// ============ CONSTANTS ============

const ACTIVE_STAFF_KEY = "runix_active_staff";
const STAFF_COLLECTION = "staffAccounts";

// ============ PIN HASHING ============

/**
 * Simple hash untuk PIN (SHA-256 via Web Crypto API)
 * Cukup untuk PIN 4-6 digit karena ini bukan password utama
 */
export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`runix_staff_pin_${pin}_salt2024`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify PIN: hash input lalu bandingkan dengan stored hash
 */
export async function verifyPin(inputPin: string, storedHash: string): Promise<boolean> {
  const inputHash = await hashPin(inputPin);
  return inputHash === storedHash;
}

// ============ FIRESTORE CRUD ============

/**
 * Get all staff accounts untuk tenant
 */
export function getStaffCollectionPath(tenantId: string) {
  return `tenants/${tenantId}/${STAFF_COLLECTION}`;
}

/**
 * Subscribe realtime ke staff accounts
 */
export function subscribeStaffAccounts(
  tenantId: string,
  callback: (staff: StaffAccount[]) => void
): () => void {
  const q = query(
    collection(db, getStaffCollectionPath(tenantId)),
    orderBy("name", "asc")
  );

  return onSnapshot(q, (snap) => {
    const arr: StaffAccount[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<StaffAccount, "id">),
    }));
    callback(arr);
  }, () => {
    callback([]);
  });
}

/**
 * Fetch staff accounts sekali (non-realtime)
 */
export async function fetchStaffAccounts(tenantId: string): Promise<StaffAccount[]> {
  const q = query(
    collection(db, getStaffCollectionPath(tenantId)),
    orderBy("name", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<StaffAccount, "id">),
  }));
}

/**
 * Tambah staff account baru
 */
export async function addStaffAccount(
  tenantId: string,
  data: { name: string; pin: string; role: StaffRole }
): Promise<string> {
  const hashedPin = await hashPin(data.pin);
  const colPath = getStaffCollectionPath(tenantId);
  const newRef = doc(collection(db, colPath));

  await setDoc(newRef, {
    name: data.name.trim(),
    pin: hashedPin,
    role: data.role,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return newRef.id;
}

/**
 * Update staff account
 */
export async function updateStaffAccount(
  tenantId: string,
  staffId: string,
  data: Partial<{ name: string; pin: string; role: StaffRole; isActive: boolean }>
): Promise<void> {
  const updates: any = { updatedAt: serverTimestamp() };

  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.role !== undefined) updates.role = data.role;
  if (data.isActive !== undefined) updates.isActive = data.isActive;
  if (data.pin !== undefined) updates.pin = await hashPin(data.pin);

  await updateDoc(
    doc(db, getStaffCollectionPath(tenantId), staffId),
    updates
  );
}

/**
 * Hapus staff account
 */
export async function deleteStaffAccount(
  tenantId: string,
  staffId: string
): Promise<void> {
  await deleteDoc(doc(db, getStaffCollectionPath(tenantId), staffId));
}

/**
 * Verify staff PIN dan return staff data jika cocok
 */
export async function verifyStaffPin(
  tenantId: string,
  staffId: string,
  pin: string
): Promise<StaffAccount | null> {
  const snap = await getDoc(doc(db, getStaffCollectionPath(tenantId), staffId));
  if (!snap.exists()) return null;

  const staff = { id: snap.id, ...(snap.data() as Omit<StaffAccount, "id">) };

  if (!staff.isActive) return null;

  const valid = await verifyPin(pin, staff.pin);
  if (!valid) return null;

  return staff;
}

// ============ LOCAL SESSION (sessionStorage) ============
// Staff session pakai sessionStorage → hilang saat tab/app ditutup
// Ini memaksa staff login PIN lagi setiap buka app/tab baru
// Owner tetap persistent karena pakai Firebase Auth (bukan di sini)

/**
 * Set active staff session (setelah PIN verified)
 * Disimpan di sessionStorage agar tidak persist lintas tab/app restart
 */
export function setActiveStaffSession(session: ActiveStaffSession): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(ACTIVE_STAFF_KEY, JSON.stringify(session));
}

/**
 * Get active staff session dari sessionStorage
 * Return null jika tab baru / app baru dibuka (staff harus login PIN lagi)
 */
export function getActiveStaffSession(): ActiveStaffSession | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(ACTIVE_STAFF_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveStaffSession;
  } catch {
    return null;
  }
}

/**
 * Clear active staff session (lock screen / logout staff)
 */
export function clearActiveStaffSession(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(ACTIVE_STAFF_KEY);
  // Bersihkan juga dari localStorage (migrasi dari versi lama)
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACTIVE_STAFF_KEY);
  }
}

/**
 * Check apakah ada staff yang sedang aktif
 */
export function hasActiveStaff(): boolean {
  return getActiveStaffSession() !== null;
}

/**
 * Migrasi: hapus staff session dari localStorage (versi lama)
 * Panggil saat app init untuk bersihkan data lama
 */
export function migrateStaffSessionStorage(): void {
  if (typeof localStorage === "undefined") return;
  // Hapus dari localStorage supaya tidak ada sisa dari versi sebelumnya
  localStorage.removeItem(ACTIVE_STAFF_KEY);
}
