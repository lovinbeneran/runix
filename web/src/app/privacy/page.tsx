"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main>
      <style>{`
        .legal-page {
          min-height: 100vh;
          background: #fff;
          font-family: var(--font-primary, system-ui, sans-serif);
          color: #1a1a1a;
        }
        .legal-nav {
          position: sticky; top: 0; z-index: 50;
          padding: 14px 24px;
          display: flex; align-items: center; justify-content: space-between;
          backdrop-filter: blur(16px);
          background: rgba(255,255,255,0.9);
          border-bottom: 1px solid #f0f0f0;
        }
        .legal-logo { font-size: 20px; font-weight: 900; cursor: pointer; }
        .legal-logo span { color: var(--brand, #d59567); }
        .legal-content {
          max-width: 720px;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }
        .legal-content h1 {
          font-size: 28px; font-weight: 900;
          letter-spacing: -0.02em; margin: 0 0 8px;
        }
        .legal-updated {
          font-size: 13px; color: #888; margin-bottom: 32px;
        }
        .legal-content h2 {
          font-size: 18px; font-weight: 800;
          margin: 32px 0 12px; color: #333;
        }
        .legal-content h3 {
          font-size: 15px; font-weight: 700;
          margin: 20px 0 8px; color: #444;
        }
        .legal-content p, .legal-content li {
          font-size: 14px; line-height: 1.8; color: #555;
          margin: 0 0 12px;
        }
        .legal-content ul, .legal-content ol {
          padding-left: 20px; margin: 0 0 16px;
        }
        .legal-content li { margin-bottom: 6px; }
        .legal-content a { color: var(--brand, #d59567); text-decoration: underline; }
        .legal-table {
          width: 100%; border-collapse: collapse; margin: 16px 0;
          font-size: 13px;
        }
        .legal-table th, .legal-table td {
          border: 1px solid #e5e5e5; padding: 10px 12px; text-align: left;
        }
        .legal-table th {
          background: #f9f9f9; font-weight: 700; color: #333;
        }
        .legal-table td { color: #555; }
        .legal-footer {
          padding: 24px; text-align: center;
          color: #aaa; font-size: 12px; border-top: 1px solid #f5f5f5;
        }
        @media (max-width: 640px) {
          .legal-content { padding: 32px 16px 60px; }
          .legal-content h1 { font-size: 24px; }
          .legal-table { font-size: 12px; }
          .legal-table th, .legal-table td { padding: 8px; }
        }
      `}</style>

      <div className="legal-page">
        <nav className="legal-nav">
          <div className="legal-logo" onClick={() => router.push("/")}>
            terra<span>POS</span>
          </div>
          <button
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e5e5",
              background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
            onClick={() => router.push("/")}
          >
            ← Kembali
          </button>
        </nav>

        <div className="legal-content">
          <h1>Kebijakan Privasi</h1>
          <p className="legal-updated">Terakhir diperbarui: 28 Mei 2025</p>

          <p>
            RuniX berkomitmen melindungi privasi Anda. Kebijakan Privasi ini menjelaskan
            bagaimana kami mengumpulkan, menggunakan, menyimpan, dan melindungi informasi Anda
            saat menggunakan layanan kami.
          </p>

          <h2>1. Informasi yang Kami Kumpulkan</h2>

          <h3>a. Informasi Akun (Pengguna Terdaftar)</h3>
          <ul>
            <li>Alamat email</li>
            <li>Nama bisnis/outlet</li>
            <li>Informasi yang Anda masukkan dalam profil tenant</li>
          </ul>

          <h3>b. Data Bisnis</h3>
          <ul>
            <li>Data produk (nama, harga, kategori)</li>
            <li>Data transaksi/order (item, total, metode pembayaran)</li>
            <li>Data shift dan laporan penjualan</li>
            <li>Data meja dan konfigurasi QR</li>
          </ul>

          <h3>c. Informasi Customer (Pengguna QR Menu)</h3>
          <ul>
            <li>Nama (jika diisi, bersifat opsional)</li>
            <li>Catatan pesanan</li>
            <li>Nomor meja</li>
          </ul>
          <p>
            <b>Catatan:</b> Customer yang memesan via QR <b>tidak perlu login</b> dan kami
            <b> tidak mengumpulkan</b> email, nomor telepon, atau data identitas customer.
          </p>

          <h3>d. Informasi Teknis (Otomatis)</h3>
          <ul>
            <li>Alamat IP (untuk keamanan dan rate limiting)</li>
            <li>User agent browser</li>
            <li>Timestamp akses</li>
          </ul>

          <h2>2. Bagaimana Kami Menggunakan Data</h2>
          <table className="legal-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tujuan Penggunaan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Email & akun</td>
                <td>Autentikasi, komunikasi layanan, notifikasi penting</td>
              </tr>
              <tr>
                <td>Data bisnis</td>
                <td>Menyediakan fitur POS, laporan, dan analitik untuk Anda</td>
              </tr>
              <tr>
                <td>Data customer QR</td>
                <td>Memproses pesanan dan menampilkan status ke customer</td>
              </tr>
              <tr>
                <td>IP address</td>
                <td>Keamanan, rate limiting, pencegahan abuse</td>
              </tr>
              <tr>
                <td>Data agregat (anonim)</td>
                <td>Peningkatan layanan dan analisis performa sistem</td>
              </tr>
            </tbody>
          </table>

          <h2>3. Penyimpanan Data</h2>
          <ul>
            <li>Data disimpan di <b>Google Cloud Platform (Firebase/Firestore)</b> dengan server di region Asia.</li>
            <li>Data dienkripsi saat transit (TLS/HTTPS) dan saat disimpan (encryption at rest).</li>
            <li>Kredensial akun disimpan menggunakan Firebase Authentication dengan standar industri.</li>
            <li>Kami melakukan backup harian dan menyimpan backup selama 30 hari.</li>
          </ul>

          <h2>4. Berbagi Data dengan Pihak Ketiga</h2>
          <p>Kami <b>TIDAK</b> menjual data Anda. Data hanya dibagikan dalam kondisi berikut:</p>
          <ul>
            <li><b>Penyedia infrastruktur</b> — Google Cloud/Firebase (sebagai data processor)</li>
            <li><b>Kewajiban hukum</b> — Jika diwajibkan oleh hukum, regulasi, atau perintah pengadilan</li>
            <li><b>Keamanan</b> — Untuk mencegah penipuan atau melindungi keselamatan pengguna</li>
          </ul>

          <h2>5. Hak Anda</h2>
          <p>Sesuai dengan peraturan perlindungan data yang berlaku, Anda berhak:</p>
          <ul>
            <li><b>Akses</b> — Meminta salinan data pribadi Anda yang kami simpan</li>
            <li><b>Koreksi</b> — Memperbaiki data yang tidak akurat</li>
            <li><b>Penghapusan</b> — Meminta penghapusan akun dan data Anda</li>
            <li><b>Portabilitas</b> — Mengekspor data bisnis Anda (fitur export tersedia)</li>
            <li><b>Pembatasan</b> — Meminta pembatasan pemrosesan data tertentu</li>
          </ul>
          <p>
            Untuk menggunakan hak-hak ini, hubungi kami di{" "}
            <a href="mailto:privacy@runix.id">privacy@runix.id</a>.
            Kami akan merespons dalam 14 hari kerja.
          </p>

          <h2>6. Keamanan</h2>
          <ul>
            <li>Enkripsi end-to-end untuk semua koneksi (HTTPS/TLS 1.3)</li>
            <li>Firebase Authentication dengan password hashing (bcrypt/scrypt)</li>
            <li>Rate limiting untuk mencegah brute-force dan abuse</li>
            <li>Security headers (X-Frame-Options, CSP, XSS Protection)</li>
            <li>Akses data dibatasi berdasarkan role (owner/admin/staff)</li>
            <li>Audit log untuk semua aksi sensitif</li>
          </ul>

          <h2>7. Cookies & Penyimpanan Lokal</h2>
          <ul>
            <li>Kami menggunakan <b>localStorage</b> untuk menyimpan preferensi dan session.</li>
            <li>Kami <b>tidak menggunakan</b> cookies pelacak pihak ketiga (no tracking cookies).</li>
            <li>Firebase menggunakan IndexedDB untuk offline cache (diperlukan agar app berjalan).</li>
          </ul>

          <h2>8. Retensi Data</h2>
          <ul>
            <li><b>Akun aktif:</b> Data disimpan selama akun aktif.</li>
            <li><b>Akun dihapus:</b> Data dihapus dalam 30 hari setelah permintaan penghapusan.</li>
            <li><b>Data order customer QR:</b> Mengikuti retensi tenant (pemilik outlet).</li>
            <li><b>Log teknis (IP, akses):</b> Disimpan maksimal 90 hari, lalu dihapus otomatis.</li>
          </ul>

          <h2>9. Perlindungan Anak</h2>
          <p>
            Layanan RuniX ditujukan untuk pengguna bisnis berusia minimal 17 tahun.
            Kami tidak dengan sengaja mengumpulkan data dari anak di bawah 17 tahun.
            Jika Anda mengetahui bahwa anak di bawah umur telah memberikan data kepada kami,
            hubungi kami untuk penghapusan.
          </p>

          <h2>10. Perubahan Kebijakan</h2>
          <p>
            Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu.
            Perubahan material akan diberitahukan melalui email atau notifikasi in-app
            minimal 14 hari sebelum berlaku. Versi terbaru selalu tersedia di halaman ini.
          </p>

          <h2>11. Kontak</h2>
          <p>
            Untuk pertanyaan tentang privasi atau permintaan terkait data Anda:
          </p>
          <ul>
            <li>Email: <a href="mailto:privacy@runix.id">privacy@runix.id</a></li>
            <li>Subjek: "Permintaan Privasi — [Nama Anda]"</li>
          </ul>
        </div>

        <footer className="legal-footer">
          <a href="/terms" style={{ color: "#888", marginRight: 16 }}>Syarat & Ketentuan</a>
          <span>&copy; {new Date().getFullYear()} RuniX</span>
        </footer>
      </div>
    </main>
  );
}
