/**
 * Saved Credentials - "Ingat Saya" feature
 * 
 * Menyimpan email & password di localStorage supaya auto-fill saat login ulang.
 * Password di-obfuscate (base64 + XOR) agar tidak plain-text di localStorage.
 * 
 * ⚠️ CATATAN KEAMANAN:
 * - Ini BUKAN enkripsi kuat. Hanya obfuscation supaya tidak langsung terbaca.
 * - Cocok untuk APK / device pribadi (seperti Majoo, iReap, dll).
 * - Di browser shared/publik, user sebaiknya tidak centang "Ingat Saya".
 */

const STORAGE_KEY_EMAIL = "runix_saved_email";
const STORAGE_KEY_PASS = "runix_saved_pass";
const STORAGE_KEY_REMEMBER = "runix_remember_me";
const XOR_KEY = "RuniX2024!"; // obfuscation key

/**
 * Simple XOR obfuscation (bukan enkripsi, hanya supaya tidak plain-text)
 */
function xorObfuscate(text: string, key: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

/**
 * Encode password sebelum simpan
 */
function encodePassword(password: string): string {
  const obfuscated = xorObfuscate(password, XOR_KEY);
  // Base64 encode
  if (typeof btoa !== "undefined") {
    return btoa(unescape(encodeURIComponent(obfuscated)));
  }
  return Buffer.from(obfuscated, "utf-8").toString("base64");
}

/**
 * Decode password saat load
 */
function decodePassword(encoded: string): string {
  let obfuscated: string;
  if (typeof atob !== "undefined") {
    obfuscated = decodeURIComponent(escape(atob(encoded)));
  } else {
    obfuscated = Buffer.from(encoded, "base64").toString("utf-8");
  }
  return xorObfuscate(obfuscated, XOR_KEY); // XOR lagi = balik ke aslinya
}

/**
 * Cek apakah "Ingat Saya" aktif
 */
export function isRememberMeEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY_REMEMBER) === "1";
}

/**
 * Simpan credentials (dipanggil setelah login berhasil)
 */
export function saveCredentials(email: string, password: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY_REMEMBER, "1");
  localStorage.setItem(STORAGE_KEY_EMAIL, email.trim());
  localStorage.setItem(STORAGE_KEY_PASS, encodePassword(password));
}

/**
 * Load credentials yang tersimpan
 * Return null jika tidak ada / "Ingat Saya" tidak aktif
 */
export function loadCredentials(): { email: string; password: string } | null {
  if (typeof localStorage === "undefined") return null;
  if (localStorage.getItem(STORAGE_KEY_REMEMBER) !== "1") return null;

  const email = localStorage.getItem(STORAGE_KEY_EMAIL);
  const encodedPass = localStorage.getItem(STORAGE_KEY_PASS);

  if (!email || !encodedPass) return null;

  try {
    const password = decodePassword(encodedPass);
    return { email, password };
  } catch {
    // Jika decode gagal, hapus data corrupt
    clearCredentials();
    return null;
  }
}

/**
 * Hapus semua credentials tersimpan
 */
export function clearCredentials(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY_REMEMBER);
  localStorage.removeItem(STORAGE_KEY_EMAIL);
  localStorage.removeItem(STORAGE_KEY_PASS);
}
