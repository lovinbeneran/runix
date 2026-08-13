"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function TermsPage() {
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
        .legal-content p, .legal-content li {
          font-size: 14px; line-height: 1.8; color: #555;
          margin: 0 0 12px;
        }
        .legal-content ul, .legal-content ol {
          padding-left: 20px; margin: 0 0 16px;
        }
        .legal-content li { margin-bottom: 6px; }
        .legal-content a { color: var(--brand, #d59567); text-decoration: underline; }
        .legal-footer {
          padding: 24px; text-align: center;
          color: #aaa; font-size: 12px; border-top: 1px solid #f5f5f5;
        }
        @media (max-width: 640px) {
          .legal-content { padding: 32px 16px 60px; }
          .legal-content h1 { font-size: 24px; }
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
          <h1>Syarat & Ketentuan Layanan</h1>
          <p className="legal-updated">Terakhir diperbarui: 28 Mei 2025</p>

          <p>
            Selamat datang di RuniX. Dengan mengakses atau menggunakan layanan kami,
            Anda menyetujui syarat dan ketentuan berikut. Harap baca dengan seksama.
          </p>

          <h2>1. Definisi</h2>
          <ul>
            <li><b>"Layanan"</b> — Platform Point of Sale (POS) berbasis web yang disediakan oleh RuniX, termasuk aplikasi web, fitur QR ordering, dan semua fitur terkait.</li>
            <li><b>"Pengguna"</b> — Setiap individu atau entitas bisnis yang mendaftar dan menggunakan Layanan.</li>
            <li><b>"Tenant"</b> — Akun bisnis/outlet yang dibuat dalam platform RuniX.</li>
            <li><b>"Customer"</b> — Pelanggan akhir yang menggunakan fitur publik (seperti QR menu ordering).</li>
          </ul>

          <h2>2. Pendaftaran Akun</h2>
          <ul>
            <li>Anda wajib memberikan informasi yang akurat dan lengkap saat mendaftar.</li>
            <li>Anda bertanggung jawab menjaga kerahasiaan kredensial akun Anda.</li>
            <li>Satu email hanya dapat digunakan untuk satu akun utama.</li>
            <li>Anda wajib berusia minimal 17 tahun atau memiliki izin dari orang tua/wali.</li>
          </ul>

          <h2>3. Penggunaan Layanan</h2>
          <p>Anda setuju untuk:</p>
          <ul>
            <li>Menggunakan Layanan hanya untuk tujuan bisnis yang sah dan legal.</li>
            <li>Tidak menggunakan Layanan untuk kegiatan penipuan, ilegal, atau merugikan pihak lain.</li>
            <li>Tidak mencoba mengakses sistem, data, atau akun milik Pengguna lain tanpa izin.</li>
            <li>Tidak melakukan reverse engineering, scraping, atau eksploitasi teknis terhadap Layanan.</li>
            <li>Mematuhi semua peraturan perundang-undangan yang berlaku di Indonesia.</li>
          </ul>

          <h2>4. Paket Layanan & Pembayaran</h2>
          <ul>
            <li>RuniX menyediakan berbagai paket layanan (gratis dan berbayar).</li>
            <li>Harga dapat berubah sewaktu-waktu dengan pemberitahuan minimal 30 hari sebelumnya.</li>
            <li>Pembayaran paket berbayar bersifat non-refundable kecuali ditentukan lain.</li>
            <li>Jika pembayaran gagal atau terlambat, akses ke fitur premium dapat dibatasi.</li>
          </ul>

          <h2>5. Data & Kepemilikan Konten</h2>
          <ul>
            <li>Semua data bisnis (produk, order, laporan) yang Anda masukkan tetap menjadi milik Anda.</li>
            <li>RuniX tidak akan menjual atau membagikan data bisnis Anda kepada pihak ketiga.</li>
            <li>Anda memberikan RuniX lisensi terbatas untuk memproses data Anda guna menyediakan Layanan.</li>
            <li>Anda bertanggung jawab atas backup data Anda sendiri (kami menyediakan fitur export).</li>
          </ul>

          <h2>6. Ketersediaan Layanan (SLA)</h2>
          <ul>
            <li>Kami berusaha menjaga uptime Layanan minimal 99% per bulan.</li>
            <li>Maintenance terjadwal akan diinformasikan minimal 24 jam sebelumnya.</li>
            <li>RuniX tidak bertanggung jawab atas kerugian akibat downtime yang disebabkan force majeure, serangan siber, atau gangguan pihak ketiga (termasuk Google/Firebase).</li>
          </ul>

          <h2>7. Batasan Tanggung Jawab</h2>
          <ul>
            <li>RuniX disediakan "sebagaimana adanya" (as-is) tanpa jaminan tersurat maupun tersirat.</li>
            <li>Kami tidak bertanggung jawab atas kerugian langsung maupun tidak langsung yang timbul dari penggunaan Layanan.</li>
            <li>Total tanggung jawab kami terbatas pada jumlah yang telah Anda bayarkan dalam 3 bulan terakhir.</li>
          </ul>

          <h2>8. Penghentian Layanan</h2>
          <ul>
            <li>Anda dapat menghentikan penggunaan Layanan kapan saja dengan menghapus akun.</li>
            <li>Kami berhak menangguhkan atau menghentikan akun yang melanggar Syarat & Ketentuan ini.</li>
            <li>Setelah penghentian, data Anda akan disimpan selama 30 hari sebelum dihapus permanen.</li>
          </ul>

          <h2>9. Perubahan Syarat & Ketentuan</h2>
          <p>
            Kami dapat mengubah Syarat & Ketentuan ini dari waktu ke waktu. Perubahan material
            akan diberitahukan melalui email atau notifikasi dalam aplikasi minimal 14 hari sebelum berlaku.
            Penggunaan berkelanjutan setelah perubahan berarti Anda menyetujui syarat yang diperbarui.
          </p>

          <h2>10. Hukum yang Berlaku</h2>
          <p>
            Syarat & Ketentuan ini diatur oleh dan ditafsirkan sesuai dengan hukum Republik Indonesia.
            Setiap sengketa yang timbul akan diselesaikan melalui musyawarah mufakat terlebih dahulu,
            dan jika tidak tercapai kesepakatan, akan diselesaikan melalui Badan Arbitrase Nasional Indonesia (BANI).
          </p>

          <h2>11. Kontak</h2>
          <p>
            Untuk pertanyaan mengenai Syarat & Ketentuan ini, hubungi kami di:<br />
            Email: <a href="mailto:support@runix.id">support@runix.id</a>
          </p>
        </div>

        <footer className="legal-footer">
          <a href="/privacy" style={{ color: "#888", marginRight: 16 }}>Kebijakan Privasi</a>
          <span>&copy; {new Date().getFullYear()} RuniX</span>
        </footer>
      </div>
    </main>
  );
}
