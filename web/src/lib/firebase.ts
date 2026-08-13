import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

/**
 * ✅ PEMULA FRIENDLY
 * - Bisa pakai .env.local (disarankan)
 * - Kalau env kosong, kasih error yang jelas
 * - Offline persistence (cache) ON
 */

function must(v: string | undefined, name: string) {
  if (v && v.trim()) return v.trim();
  // Saat build/prerender, env mungkin belum tersedia - jangan crash
  if (typeof window === "undefined") return "PLACEHOLDER";
  // Di browser, kalau env kosong kasih error yang jelas
  throw new Error(
    `Firebase config missing: ${name}. Cek file .env.local di folder web (RuniX/web).`
  );
}

// Ambil dari .env.local
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
};

// Validasi biar jelas kalau ada yang kosong
const safeConfig = {
  apiKey: must(firebaseConfig.apiKey, "NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: must(firebaseConfig.authDomain, "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: must(firebaseConfig.projectId, "NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: must(firebaseConfig.storageBucket, "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: must(firebaseConfig.messagingSenderId, "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: must(firebaseConfig.appId, "NEXT_PUBLIC_FIREBASE_APP_ID"),
};

export const app = getApps().length ? getApps()[0] : initializeApp(safeConfig);

export const auth = getAuth(app);

/**
 * Promise yang resolve ketika auth state benar-benar ready.
 * Di Android Capacitor, ini bisa butuh 1-3 detik setelah app di-kill.
 * Semua halaman HARUS await ini sebelum memutuskan redirect ke /login.
 */
export let authReadyPromise: Promise<void> = Promise.resolve();

// Paksa auth persist di IndexedDB/localStorage supaya tidak logout saat keluar app
if (typeof window !== "undefined") {
  // Untuk Capacitor WebView: browserLocalPersistence (localStorage) lebih stabil
  const isCapacitor = typeof (window as any).Capacitor !== "undefined";
  const primaryPersistence = isCapacitor ? browserLocalPersistence : indexedDBLocalPersistence;
  const fallbackPersistence = isCapacitor ? indexedDBLocalPersistence : browserLocalPersistence;
  
  setPersistence(auth, primaryPersistence).catch(() => {
    setPersistence(auth, fallbackPersistence).catch(() => {});
  });

  // authReadyPromise: resolve saat auth punya user ATAU autoReLogin selesai
  authReadyPromise = new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => { if (!resolved) { resolved = true; resolve(); } };

    // 1) Jika onAuthStateChanged langsung kasih user → done
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        localStorage.setItem("runix_uid", user.uid);
        localStorage.setItem("runix_email", user.email || "");
        done();
        unsub();
      }
    });

    // 2) Jalankan autoReLogin segera
    autoReLogin().then(() => {
      // Setelah autoReLogin selesai (berhasil atau gagal), tunggu 500ms lalu resolve
      setTimeout(done, 500);
    });

    // 3) Maximum wait: 4 detik (jika network sangat lambat / offline)
    setTimeout(done, 4000);
  });
}

/**
 * Auto re-login dari saved credentials.
 * Dipanggil saat auth state null tapi credentials tersimpan.
 * Credentials SELALU disimpan setelah login berhasil (force save).
 * Ini menjamin user TIDAK pernah logout meskipun app di-force-close / kill.
 */
async function autoReLogin() {
  if (typeof localStorage === "undefined") return;

  const savedEmail = localStorage.getItem("runix_saved_email");
  const savedPass = localStorage.getItem("runix_saved_pass");

  if (!savedEmail || !savedPass) return;

  // Jangan re-login kalau sudah ada user (race condition guard)
  if (auth.currentUser) return;

  try {
    // Decode password (XOR + base64 obfuscation dari saved-credentials.ts)
    const XOR_KEY = "RuniX2024!";
    let obfuscated: string;
    if (typeof atob !== "undefined") {
      obfuscated = decodeURIComponent(escape(atob(savedPass)));
    } else {
      obfuscated = Buffer.from(savedPass, "base64").toString("utf-8");
    }
    let password = "";
    for (let i = 0; i < obfuscated.length; i++) {
      password += String.fromCharCode(
        obfuscated.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length)
      );
    }

    // Silent re-login
    await signInWithEmailAndPassword(auth, savedEmail, password);
  } catch {
    // Gagal re-login (password berubah, akun dihapus, dll) - biarkan redirect ke login page
  }
}

export const functions = getFunctions(app);

// Firestore init (client/server aman)
// Menggunakan persistentLocalCache (pengganti enableIndexedDbPersistence yang deprecated)
export const db =
  typeof window === "undefined"
    ? getFirestore(app)
    : initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });

// Emulator (client only)
if (typeof window !== "undefined") {
  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalhost && !(window as any).__runixFunctionsEmulatorConnected) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    (window as any).__runixFunctionsEmulatorConnected = true;
  }
}
