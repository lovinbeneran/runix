/**
 * Auth Guard - Mencegah premature redirect ke /login di Android Capacitor
 * 
 * Masalah: Di Capacitor/Android, saat app di-kill lalu dibuka lagi,
 * onAuthStateChanged bisa fire `null` terlebih dahulu sebelum auth restore dari IndexedDB.
 * Ini menyebabkan semua page langsung redirect ke /login padahal user masih valid.
 * 
 * Solusi: Tunggu beberapa saat + cek saved credentials sebelum redirect.
 * Jika ada saved credentials, autoReLogin di firebase.ts akan handle re-login.
 */

/**
 * Cek apakah ada saved credentials di localStorage.
 * Kalau ada, berarti user pernah login dan autoReLogin sedang berjalan.
 */
export function hasSavedCredentials(): boolean {
  if (typeof localStorage === "undefined") return false;
  const email = localStorage.getItem("runix_saved_email");
  const pass = localStorage.getItem("runix_saved_pass");
  return !!(email && pass);
}

/**
 * Cek apakah kita harus redirect ke /login atau tunggu autoReLogin.
 * 
 * Return true = boleh redirect ke /login (tidak ada credentials tersimpan)
 * Return false = JANGAN redirect, tunggu autoReLogin selesai
 */
export function shouldRedirectToLogin(): boolean {
  return !hasSavedCredentials();
}

/**
 * Menunggu sampai auth state stabil.
 * Di Android Capacitor, auth bisa butuh 2-3 detik untuk restore.
 * 
 * @param auth - Firebase Auth instance
 * @param maxWaitMs - Maximum time to wait (default: 4000ms)
 * @returns Promise<User | null>
 */
export function waitForAuthReady(auth: any, maxWaitMs: number = 4000): Promise<any> {
  return new Promise((resolve) => {
    // Jika sudah ada currentUser, langsung resolve
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    // Jika tidak ada saved credentials, langsung resolve null (benar-benar tidak login)
    if (!hasSavedCredentials()) {
      resolve(null);
      return;
    }

    // Ada saved credentials → tunggu autoReLogin atau auth restore
    let resolved = false;
    
    const unsub = auth.onAuthStateChanged((user: any) => {
      if (user && !resolved) {
        resolved = true;
        unsub();
        resolve(user);
      }
    });

    // Timeout: jika setelah maxWaitMs masih null, resolve null
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(auth.currentUser || null);
      }
    }, maxWaitMs);
  });
}
