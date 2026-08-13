import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const TENANT_STORAGE_KEY = "runix_tenant_id";

export function getStoredTenantId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TENANT_STORAGE_KEY) || "";
}

export function setStoredTenantId(tenantId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TENANT_STORAGE_KEY, tenantId);
}

export async function getActiveTenantId(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, `users/${uid}`));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return data.currentTenantId || data.activeTenantId || null;
}

export async function setActiveTenantId(uid: string, tenantId: string) {
  await setDoc(
    doc(db, `users/${uid}`),
    {
      currentTenantId: tenantId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  setStoredTenantId(tenantId);
}

